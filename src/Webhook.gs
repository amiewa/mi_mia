/* ============================================================
 * Webhook.gs — doPost・フォローバック・メンション返信
 * ============================================================ */

// ===== ニックネーム関連の定数 =====
// 区切り文字（スペース・句読点・感嘆符）の直後〜「って呼んで」を名前として抽出
var NICKNAME_REGISTER_RE = /([^\s　、。！？!?,.\n]+)って呼んで/;
var NICKNAME_RESET_KEYWORD = '呼び名リセット';

/**
 * Misskey Webhook のエントリポイント。
 * LockService で排他制御する。
 * @param {Object} e イベントオブジェクト
 * @returns {Object} ContentService のレスポンス
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'busy' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var body = JSON.parse(e.postData.contents);
    var config = getConfig();

    if (String(config.BOT_ACTIVE).toUpperCase() !== 'TRUE') {
      return ContentService.createTextOutput(JSON.stringify({ status: 'inactive' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var type = body.type;

    // Bot 自身のイベントを無視
    var ownUserId = config.OWN_USER_ID || '';
    if (body.body && body.body.user && body.body.user.id === ownUserId) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'self' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    switch (type) {
      case 'followed':
        handleFollowed(body, config);
        break;
      case 'mention':
        handleMention(body, config);
        break;
      default:
        break;
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    logError('doPost', e.message);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error' }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * フォローバック処理。
 * @param {Object} body Webhook body
 * @param {Object} config 設定オブジェクト
 */
function handleFollowed(body, config) {
  if (String(config.FOLLOW_AUTO_FOLLOW_BACK).toUpperCase() !== 'TRUE') return;

  var userId = body.body && body.body.user && body.body.user.id;
  if (!userId) return;

  try {
    // 既にフォロー済みかチェック
    var relation = normalizeRelation(callMisskeyApi('users/relation', { userId: userId }));
    if (relation.isFollowing) return;

    callMisskeyApi('following/create', { userId: userId });
    incrementCounter('FOLLOW_BACK');
  } catch (e) {
    logError('handleFollowed', e.message);
  }
}

/**
 * メンション返信処理。3層重複防止 + NGチェック + 好感度 + LLM。
 * @param {Object} body Webhook body
 * @param {Object} config 設定オブジェクト
 */
function handleMention(body, config) {
  if (String(config.REPLY_ENABLED).toUpperCase() !== 'TRUE') return;

  var note = body.body && body.body.note;
  if (!note) return;

  var noteId = note.id;
  var userId = note.user && note.user.id;
  if (!noteId || !userId) return;

  // --- 重複防止 第1防衛: CacheService ---
  var cache = CacheService.getScriptCache();
  var cacheKey = 'm_' + noteId;
  if (cache.get(cacheKey)) return;

  // --- 重複防止 第2防衛: PropertiesService ---
  var props = PropertiesService.getScriptProperties();
  var propsKey = 'PM_' + noteId;
  if (props.getProperty(propsKey)) return;

  // 両方にフラグセット
  cache.put(cacheKey, '1', 21600); // 6時間
  props.setProperty(propsKey, '1');

  // テキストクリーニング
  var rawText = note.text || '';
  var cleanedText = cleanNoteText(rawText);
  if (!cleanedText) return;

  // ===== ニックネーム処理 =====
  if (String(config.NICKNAME_ENABLED).toUpperCase() === 'TRUE') {
    if (cleanedText.indexOf(NICKNAME_RESET_KEYWORD) !== -1) {
      handleNicknameReset_(config, userId, noteId);
      return;
    }
    var nickMatch = cleanedText.match(NICKNAME_REGISTER_RE);
    if (nickMatch) {
      handleNicknameRegister_(config, nickMatch[1], userId, noteId);
      return;
    }
  }

  // NGワードチェック
  var ngWords = loadNGWords(config);
  if (containsNGWord(cleanedText, ngWords)) {
    replyWithFallback_(config, noteId);
    incrementCounter('REPLY');
    return;
  }

  // キーワードフォローバック判定
  if (String(config.FOLLOW_KEYWORD_ENABLED).toUpperCase() === 'TRUE') {
    checkKeywordFollowBack_(config, cleanedText, userId);
  }

  // 相互フォロー確認
  if (String(config.REPLY_MUTUAL_ONLY).toUpperCase() === 'TRUE') {
    try {
      var relation = normalizeRelation(callMisskeyApi('users/relation', { userId: userId }));
      if (!relation.isFollowing || !relation.isFollowed) return;
    } catch (e) {
      logError('handleMention', '相互フォロー確認失敗: ' + e.message);
      return;
    }
  }

  // 当日返信上限チェック
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var replyCountKey = 'REPLY_COUNT_' + userId + '_' + today;
  var replyCount = parseInt(props.getProperty(replyCountKey)) || 0;
  var maxPerDay = parseInt(config.REPLY_MAX_PER_USER_PER_DAY) || 10;
  if (replyCount >= maxPerDay) return;

  // ユーザー管理シート参照（好感度）
  var userData = getUserData_(userId);
  var talkCount = userData ? userData.talkCount : 0;

  // ===== REPLY_MODE 分岐 =====

  var replyMode = String(config.REPLY_MODE || 'no_ai').toLowerCase();

  // 好感度ランク算出（キーワード応答の親愛度フィルタに使用）
  var affinityRank = 1;
  if (String(config.AFFINITY_ENABLED).toUpperCase() === 'TRUE') {
    var rank2Threshold = parseInt(config.AFFINITY_RANK2_THRESHOLD) || 5;
    var rank3Threshold = parseInt(config.AFFINITY_RANK3_THRESHOLD) || 20;
    if (talkCount >= rank3Threshold) {
      affinityRank = 3;
    } else if (talkCount >= rank2Threshold) {
      affinityRank = 2;
    }
  }

  var reply = null;
  var replySource = 'fallback'; // 'ai' | 'keyword' | 'fallback'
  var maxTurns = parseInt(config.CONV_MAX_TURNS) || 3;

  if (replyMode === 'ai') {
    // --- AI モード ---
    var systemPrompt = getCharacterPrompt_();

    var affinityPrompt = getAffinityRank_(config, talkCount);
    if (affinityPrompt) {
      systemPrompt += '\n\n' + affinityPrompt;
    }

    var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy年M月d日 H時');
    systemPrompt += '\n\n現在: ' + nowStr;

    var displayName = resolveDisplayName_(userData, note);
    if (displayName) {
      systemPrompt += '\n\n相手の呼び名は「' + displayName + '」。会話中は相手を「' + displayName + '」と呼ぶこと。';
    }

    var history = getConversationHistory_(userId, maxTurns);

    var userPrompt;
    if (history.length > 0) {
      userPrompt = '以下は直近の会話履歴です（古い順）:\n' + history.join('\n') +
        '\n\n上記の流れを踏まえて、以下のメッセージに短く返信してください（100文字以内）:\n\n' + cleanedText;
    } else {
      userPrompt = '以下のメッセージに短く返信してください（100文字以内）:\n\n' + cleanedText;
    }

    reply = callLLM('reply', userPrompt, systemPrompt);

    // LLM応答のNGワードチェック
    if (reply && containsNGWord(reply, ngWords)) {
      reply = null;
    }

    if (reply) {
      replySource = 'ai';
    }
  }

  // AI モードで失敗、または no_ai モード → キーワード応答を試行
  if (!reply) {
    reply = matchKeywordReply_(cleanedText, affinityRank, userData, note);
    if (reply) {
      replySource = 'keyword';
    }
  }

  // キーワード応答も該当なし → フォールバック定型文
  if (!reply) {
    replyWithFallback_(config, noteId);
    incrementCounter('REPLY');
    return;
  }

  // --- 重複防止 第3防衛: Misskey API で既返信チェック ---
  try {
    var existingReplies = callMisskeyApi('notes/replies', { noteId: noteId, limit: 5 });
    var ownUserId = config.OWN_USER_ID || '';
    for (var r = 0; r < existingReplies.length; r++) {
      if (existingReplies[r].user && existingReplies[r].user.id === ownUserId) {
        return;
      }
    }
  } catch (e) {
    // チェック失敗は無視して続行
  }

  // 返信投稿
  var postedNote = postNote(config, reply, {
    replyId: noteId,
    postType: 'reply'
  });

  if (postedNote) {
    incrementCounter('REPLY');

    // 好感度加算（AI応答・キーワード応答ともに加算する）
    if (String(config.AFFINITY_ENABLED).toUpperCase() === 'TRUE') {
      updateUserData_(userId, talkCount + 1);
    }

    // 返信カウント更新
    props.setProperty(replyCountKey, String(replyCount + 1));

    // 会話履歴保存は AI リプライ成功時のみ
    if (replySource === 'ai') {
      saveConversationTurn_(userId, cleanedText, reply, maxTurns);
    }
  }
}

/**
 * 好感度ランクに応じた追加プロンプトを返す。
 * @param {Object} config 設定オブジェクト
 * @param {number} talkCount 会話回数
 * @returns {string} 追加プロンプト
 * @private
 */
function getAffinityRank_(config, talkCount) {
  if (String(config.AFFINITY_ENABLED).toUpperCase() !== 'TRUE') return '';

  var rank2 = parseInt(config.AFFINITY_RANK2_THRESHOLD) || 5;
  var rank3 = parseInt(config.AFFINITY_RANK3_THRESHOLD) || 20;

  if (talkCount >= rank3) {
    return '相手とは親しく、信頼している。いつもより少しだけ素直に話す。';
  } else if (talkCount >= rank2) {
    return '相手とは何度か話したことがあり、少しだけ心を開いている。';
  }

  return '';
}

/**
 * フォールバック定型文で返信する。
 * @param {Object} config 設定オブジェクト
 * @param {string} noteId 返信先ノートID
 * @private
 */
function replyWithFallback_(config, noteId) {
  var text = getFallbackReply_();
  if (text) {
    postNote(config, text, { replyId: noteId, postType: 'reply' });
  }
}

/**
 * フォールバック定型文シートからランダムに取得する。
 * @returns {string} 定型文テキスト
 * @private
 */
function getFallbackReply_() {
  var sheet = SS.getSheetByName(SHEET.FALLBACK);
  if (!sheet || sheet.getLastRow() < 2) return 'ん〜？';

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var candidates = [];
  for (var i = 0; i < data.length; i++) {
    var text = String(data[i][0]).trim();
    if (text) candidates.push(text);
  }

  if (candidates.length === 0) return 'ん〜？';
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * キーワード応答シートからマッチする応答を検索する。
 *
 * マッチングロジック:
 *   1. cleanedText に対して各行のキーワードを部分一致検索
 *   2. ヒット全行を収集（キーワード違い・親愛度違い問わず全マージ）
 *   3. 親愛度 ≤ affinityRank でフィルタ
 *   4. 最高親愛度の行群だけを抽出
 *   5. ランダムに1件選択
 *   6. {name} プレースホルダーを呼び名で置換
 *
 * @param {string} cleanedText クリーニング済みメンションテキスト
 * @param {number} affinityRank ユーザーの好感度ランク (1-3)
 * @param {Object|null} userData getUserData_() の戻り値
 * @param {Object} note Webhook の note オブジェクト
 * @returns {string|null} マッチした応答テキスト。該当なしは null
 */
function matchKeywordReply_(cleanedText, affinityRank, userData, note) {
  if (!cleanedText) return null;

  // キーワード応答シート取得（CacheService でキャッシュ: 5分TTL）
  var cache = CacheService.getScriptCache();
  var cacheKey = 'keyword_reply_cache';
  var rows = null;
  var cached = cache.get(cacheKey);

  if (cached) {
    try {
      rows = JSON.parse(cached);
    } catch (e) {
      rows = null;
    }
  }

  if (!rows) {
    var sheet = SS.getSheetByName(SHEET.KEYWORD_REPLY);
    if (!sheet || sheet.getLastRow() < 2) return null;

    rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    try {
      cache.put(cacheKey, JSON.stringify(rows), 300);
    } catch (e) {
      // キャッシュ保存失敗は無視（データ量超過時）
    }
  }

  if (!rows || rows.length === 0) return null;

  var lowerText = cleanedText.toLowerCase();

  // 1-2. 全行スキャンしてヒットを収集
  var candidates = [];
  for (var i = 0; i < rows.length; i++) {
    var keyword = String(rows[i][0]).trim().toLowerCase();
    var rank = parseInt(rows[i][1]) || 1;
    var message = String(rows[i][2]).trim();

    if (!keyword || !message) continue;
    if (lowerText.indexOf(keyword) !== -1) {
      candidates.push({ rank: rank, message: message });
    }
  }

  if (candidates.length === 0) return null;

  // 3. 親愛度 ≤ affinityRank でフィルタ
  var eligible = [];
  for (var j = 0; j < candidates.length; j++) {
    if (candidates[j].rank <= affinityRank) {
      eligible.push(candidates[j]);
    }
  }

  if (eligible.length === 0) return null;

  // 4. 最高親愛度の行群だけを抽出
  var maxRank = 0;
  for (var k = 0; k < eligible.length; k++) {
    if (eligible[k].rank > maxRank) maxRank = eligible[k].rank;
  }

  var topCandidates = [];
  for (var l = 0; l < eligible.length; l++) {
    if (eligible[l].rank === maxRank) {
      topCandidates.push(eligible[l]);
    }
  }

  // 5. ランダム選択
  var selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];
  var result = selected.message;

  // 6. {name} プレースホルダーの置換
  var displayName = resolveDisplayName_(userData, note);
  if (displayName) {
    result = result.replace(/\{name\}/g, displayName);
  } else {
    result = result.replace(/\{name\}\s?/g, '');
  }

  return result;
}

/**
 * キーワードフォローバック判定。
 * @param {Object} config 設定オブジェクト
 * @param {string} text テキスト
 * @param {string} userId ユーザーID
 * @private
 */
function checkKeywordFollowBack_(config, text, userId) {
  var keywords = (config.FOLLOW_KEYWORDS || '').split(',');
  var lower = text.toLowerCase();

  for (var i = 0; i < keywords.length; i++) {
    var kw = keywords[i].trim().toLowerCase();
    if (kw && lower.indexOf(kw) !== -1) {
      try {
        var relation = normalizeRelation(callMisskeyApi('users/relation', { userId: userId }));
        if (!relation.isFollowing) {
          callMisskeyApi('following/create', { userId: userId });
          incrementCounter('FOLLOW_BACK');
        }
      } catch (e) {
        logError('checkKeywordFollowBack_', e.message);
      }
      break;
    }
  }
}

/**
 * ユーザー管理シートからユーザーデータを取得する。
 * @param {string} userId ユーザーID
 * @returns {Object|null} { talkCount: number, nickname: string|null, row: number } or null
 * @private
 */
function getUserData_(userId) {
  var sheet = SS.getSheetByName(SHEET.USER_MGMT);
  if (!sheet || sheet.getLastRow() < 2) return null;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      return {
        talkCount: parseInt(data[i][2]) || 0,
        nickname: String(data[i][3] || '').trim() || null,
        row: i + 2
      };
    }
  }
  return null;
}

/**
 * ユーザー管理シートのデータを更新する。
 * ニックネーム列（D列）は変更しない。
 * @param {string} userId ユーザーID
 * @param {number} newTalkCount 新しい会話回数
 * @private
 */
function updateUserData_(userId, newTalkCount) {
  var sheet = SS.getSheetByName(SHEET.USER_MGMT);
  if (!sheet) return;

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var data = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues()
    : [];

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      sheet.getRange(i + 2, 2).setValue(now);
      sheet.getRange(i + 2, 3).setValue(newTalkCount);
      // D列（ニックネーム）は触らない
      return;
    }
  }

  // 新規ユーザー（ニックネームは空）
  sheet.appendRow([userId, now, newTalkCount, '']);
}

// --------------- 会話履歴（マルチターン） ---------------

/**
 * PropertiesService からユーザーの会話履歴を取得する。
 * @param {string} userId ユーザーID
 * @param {number} maxTurns 取得する最大ターン数
 * @returns {string[]} 「ユーザー: ...」「みあ: ...」形式の文字列配列（古い順）
 * @private
 */
function getConversationHistory_(userId, maxTurns) {
  if (!userId || maxTurns <= 0) return [];

  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty('CONV_' + userId);
    if (!raw) return [];

    var turns = JSON.parse(raw);
    // 最新 maxTurns ターン分を返す
    var start = Math.max(0, turns.length - maxTurns);
    var lines = [];
    for (var i = start; i < turns.length; i++) {
      lines.push('ユーザー: ' + turns[i].user);
      lines.push('みあ: ' + turns[i].bot);
    }
    return lines;
  } catch (e) {
    Logger.log('[getConversationHistory_] 失敗: ' + e.message);
    return [];
  }
}

/**
 * 会話ターンを PropertiesService に保存する。
 * 最大 maxTurns ターンを保持し、古いターンは削除する。
 * @param {string} userId ユーザーID
 * @param {string} userMessage ユーザーの発言（クリーニング済み）
 * @param {string} botReply Botの返信
 * @param {number} maxTurns 保持する最大ターン数
 * @private
 */
function saveConversationTurn_(userId, userMessage, botReply, maxTurns) {
  if (!userId || !userMessage || !botReply) return;

  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'CONV_' + userId;
    var raw = props.getProperty(key);
    var turns = raw ? JSON.parse(raw) : [];

    turns.push({ user: userMessage, bot: botReply });

    // maxTurns を超えた分を削除（先頭から）
    if (turns.length > maxTurns) {
      turns = turns.slice(turns.length - maxTurns);
    }

    props.setProperty(key, JSON.stringify(turns));
  } catch (e) {
    Logger.log('[saveConversationTurn_] 失敗: ' + e.message);
  }
}

// --------------- ニックネーム処理 ---------------

/**
 * ニックネーム登録を処理する。
 * @param {Object} config 設定オブジェクト
 * @param {string} nickname 登録するニックネーム
 * @param {string} userId ユーザーID
 * @param {string} noteId 返信先ノートID
 * @private
 */
function handleNicknameRegister_(config, nickname, userId, noteId) {
  nickname = nickname.trim();
  if (!nickname) return;

  // 長さ制限
  var maxLen = parseInt(config.NICKNAME_MAX_LENGTH) || 20;
  if (nickname.length > maxLen) {
    nickname = nickname.substring(0, maxLen);
  }

  // NGワードチェック
  var ngWords = loadNGWords(config);
  if (containsNGWord(nickname, ngWords)) {
    var ngMsg = getCharacterSetting_('呼び名NG') || 'ん〜、その名前はちょっと… 別のにしてほしいな〜';
    postNote(config, ngMsg, {
      replyId: noteId,
      postType: 'reply'
    });
    return;
  }

  // ユーザー管理シートに保存
  upsertNickname_(userId, nickname);

  var regMsg = getCharacterSetting_('呼び名登録') || '{nickname}って呼べばいいんだね！ わかった〜';
  postNote(config, regMsg.replace('{nickname}', nickname), {
    replyId: noteId,
    postType: 'reply'
  });
  incrementCounter('REPLY');
}

/**
 * ニックネームリセットを処理する。
 * @param {Object} config 設定オブジェクト
 * @param {string} userId ユーザーID
 * @param {string} noteId 返信先ノートID
 * @private
 */
function handleNicknameReset_(config, userId, noteId) {
  deleteNickname_(userId);

  var resetMsg = getCharacterSetting_('呼び名リセット') || 'わかった、元の呼び方に戻すね〜';
  postNote(config, resetMsg, {
    replyId: noteId,
    postType: 'reply'
  });
  incrementCounter('REPLY');
}

/**
 * ユーザー管理シートにニックネームを保存（upsert）。
 * @param {string} userId ユーザーID
 * @param {string} nickname ニックネーム
 * @private
 */
function upsertNickname_(userId, nickname) {
  var sheet = SS.getSheetByName(SHEET.USER_MGMT);
  if (!sheet) return;

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  if (sheet.getLastRow() < 2) {
    sheet.appendRow([userId, now, 0, nickname]);
    return;
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      sheet.getRange(i + 2, 4).setValue(nickname);
      return;
    }
  }

  // 新規ユーザー
  sheet.appendRow([userId, now, 0, nickname]);
}

/**
 * ユーザー管理シートからニックネームを削除する。
 * @param {string} userId ユーザーID
 * @private
 */
function deleteNickname_(userId) {
  var sheet = SS.getSheetByName(SHEET.USER_MGMT);
  if (!sheet || sheet.getLastRow() < 2) return;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      sheet.getRange(i + 2, 4).setValue('');
      return;
    }
  }
}

/**
 * ニックネームまたは Misskey 表示名を解決する。
 * @param {Object|null} userData getUserData_() の戻り値
 * @param {Object} note Webhook の note オブジェクト
 * @returns {string|null} 呼び名（なければ null）
 * @private
 */
function resolveDisplayName_(userData, note) {
  // 1. ユーザー管理シートのニックネーム（D列）
  if (userData && userData.nickname) {
    return userData.nickname;
  }

  // 2. Misskey の表示名（user.name）にフォールバック
  var name = note && note.user && note.user.name;
  if (name && String(name).trim()) {
    return String(name).trim();
  }

  return null;
}
