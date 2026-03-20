/* ============================================================
 * Features.gs — 全投稿機能・mainDispatcher・占い・フォロー同期・自動削除
 * ============================================================ */

// --------------- メインエントリポイント ---------------

/**
 * タイマートリガーから呼ばれるメインディスパッチャー。
 * 投稿優先順位に従い、独立機能を実行する。
 */
function mainDispatcher() {
  var config = getConfig();
  if (String(config.BOT_ACTIVE).toUpperCase() !== 'TRUE') return;
  if (isNightTime(config)) return;

  // 投稿タイムスタンプのランダム化（0〜120秒）
  var jitter = Math.floor(Math.random() * 120000);
  Utilities.sleep(jitter);

  // === 優先順位付き投稿 ===
  processAutomatedPosts(config);

  // === 独立実行（優先順位に影響しない） ===
  if (isTimeSafe()) processPollPost(config);
  if (isTimeSafe()) processReaction(config);
  if (isTimeSafe()) processHoroscope(config);

  // === 日次メンテナンス（0時台のみ） ===
  if (isTimeSafe()) runDailyMaintenance(config);
}

/**
 * 優先順位付き投稿チェーン。上位が成功したら下位をスキップ。
 * @param {Object} config 設定オブジェクト
 */
function processAutomatedPosts(config) {
  // 1. イベント投稿（最優先）
  if (String(config.EVENT_POST_ENABLED).toUpperCase() === 'TRUE' && processEventPost(config)) return;

  // 2. 曜日別投稿
  if (String(config.WEEKDAY_POST_ENABLED).toUpperCase() === 'TRUE' && processWeekdayPost(config)) return;

  // 3. スケジュール投稿
  if (String(config.SCHEDULED_POST_ENABLED).toUpperCase() === 'TRUE' && processScheduledPost(config)) return;

  // 4. TL連動投稿（LLM使用。失敗/上限時→5に落ちる）
  if (String(config.TIMELINE_POST_ENABLED).toUpperCase() === 'TRUE' && processTimelinePost(config)) return;

  // 5. ランダム投稿（フォールバック先）
  if (String(config.RANDOM_POST_ENABLED).toUpperCase() === 'TRUE') processRandomPost(config);
}

// --------------- ヘルパー関数 ---------------

/**
 * 最終実行時刻を取得する。
 * @param {string} key PropertiesService のキー
 * @returns {number} タイムスタンプ（ミリ秒）。未設定なら 0
 * @private
 */
function getLastRunTime_(key) {
  var val = PropertiesService.getScriptProperties().getProperty('LAST_RUN_' + key);
  return val ? parseInt(val) : 0;
}

/**
 * 最終実行時刻を設定する。
 * @param {string} key PropertiesService のキー
 * @private
 */
function setLastRunTime_(key) {
  PropertiesService.getScriptProperties().setProperty('LAST_RUN_' + key, String(Date.now()));
}

/**
 * 指定間隔が経過しているか判定する。
 * @param {string} key 機能キー
 * @param {number} hours 間隔（時間）
 * @returns {boolean} 経過していれば true
 * @private
 */
function isIntervalElapsed_(key, hours) {
  var last = getLastRunTime_(key);
  return (Date.now() - last) >= hours * 3600000;
}

// --------------- イベント投稿 (F10) ---------------

/**
 * 本日のイベントがあれば投稿する。
 * @param {Object} config 設定オブジェクト
 * @returns {boolean} 投稿した場合 true
 */
function processEventPost(config) {
  if (!isTimeSafe()) return false;

  var sheet = SS.getSheetByName(SHEET.EVENT);
  if (!sheet || sheet.getLastRow() < 2) return false;

  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MM/dd');
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();

  for (var i = 0; i < data.length; i++) {
    var eventDate = String(data[i][0]).trim();
    var text = String(data[i][2]).trim();
    var posted = String(data[i][3]).trim().toUpperCase();

    if (eventDate === today && text && posted !== 'TRUE') {
      var note = postNote(config, text, { postType: 'event' });
      if (note) {
        // 投稿済みフラグを設定
        sheet.getRange(i + 2, 4).setValue('TRUE');
        return true;
      }
    }
  }

  return false;
}

// --------------- 曜日別投稿 (F11) ---------------

/**
 * 現在の曜日・時刻に該当する投稿があれば実行する。
 * @param {Object} config 設定オブジェクト
 * @returns {boolean} 投稿した場合 true
 */
function processWeekdayPost(config) {
  if (!isTimeSafe()) return false;

  // 確率チェック
  var chance = parseInt(config.WEEKDAY_POST_CHANCE) || 30;
  if (Math.random() * 100 >= chance) return false;

  var sheet = SS.getSheetByName(SHEET.WEEKDAY);
  if (!sheet || sheet.getLastRow() < 2) return false;

  var now = new Date();
  var currentHour = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'H'));
  var dayIndex = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'u')); // 1=月〜7=日
  // GAS の 'u' は ISO (1=月, 7=日)
  var dayAbbr = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][dayIndex - 1];

  // 当日の間隔チェック
  if (!isIntervalElapsed_('WEEKDAY', 1)) return false;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  var candidates = [];

  for (var i = 0; i < data.length; i++) {
    var hour = parseInt(data[i][0]);
    var day = String(data[i][1]).trim().toUpperCase();
    var text = String(data[i][2]).trim();
    if (hour === currentHour && day === dayAbbr && text) {
      candidates.push(text);
    }
  }

  if (candidates.length === 0) return false;

  var selected = candidates[Math.floor(Math.random() * candidates.length)];
  var note = postNote(config, selected, { postType: 'weekday' });
  if (note) {
    setLastRunTime_('WEEKDAY');
    return true;
  }
  return false;
}

// --------------- スケジュール投稿 (F03) ---------------

/**
 * 現在の時間帯に該当するスケジュール投稿を実行する。
 * @param {Object} config 設定オブジェクト
 * @returns {boolean} 投稿した場合 true
 */
function processScheduledPost(config) {
  if (!isTimeSafe()) return false;

  // 確率チェック
  var chance = parseInt(config.SCHEDULED_POST_CHANCE) || 100;
  if (Math.random() * 100 >= chance) return false;

  var sheet = SS.getSheetByName(SHEET.SCHEDULED_POST);
  if (!sheet || sheet.getLastRow() < 2) return false;

  var currentHour = parseInt(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'));

  // 間隔チェック（重複防止: 同一時間帯で再投稿しない）
  if (!isIntervalElapsed_('SCHEDULED', 1)) return false;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();

  for (var i = 0; i < data.length; i++) {
    var hour = parseInt(data[i][0]);
    var text = String(data[i][1]).trim();

    if (hour === currentHour && text) {
      var note = postNote(config, text, { postType: 'schedule' });
      if (note) {
        setLastRunTime_('SCHEDULED');
        return true;
      }
    }
  }

  return false;
}

// --------------- TL連動投稿 (F05) ---------------

/**
 * タイムラインの話題に反応した投稿を生成する。
 * @param {Object} config 設定オブジェクト
 * @returns {boolean} 投稿した場合 true
 */
function processTimelinePost(config) {
  if (!isTimeSafe()) return false;

  // 間隔チェック
  var intervalHours = parseInt(config.TIMELINE_POST_INTERVAL_HOURS) || 6;
  if (!isIntervalElapsed_('TIMELINE', intervalHours)) return false;

  // 確率チェック
  var chance = parseInt(config.TIMELINE_POST_CHANCE) || 70;
  if (Math.random() * 100 >= chance) return false;

  // 日次LLM上限チェック
  if (isAIDailyLimitReached(config)) return false;

  // タイムライン取得
  var tlType = config.TIMELINE_POST_TYPE || 'local';
  var endpoint = 'notes/local-timeline';
  if (tlType === 'home') endpoint = 'notes/timeline';
  else if (tlType === 'hybrid') endpoint = 'notes/hybrid-timeline';
  else if (tlType === 'global') endpoint = 'notes/global-timeline';

  try {
    var notes = callMisskeyApi(endpoint, { limit: 20 });
    var filtered = filterTimelineNotes(notes, config);

    if (filtered.length === 0) return false;

    // フィルタ済みノートからTLの話題をまとめる
    var tlSummary = [];
    for (var i = 0; i < Math.min(filtered.length, 10); i++) {
      tlSummary.push(filtered[i].cleanedText);
    }

    // キャラクタープロンプト取得
    var systemPrompt = getCharacterPrompt_();

    // LLM呼び出し（1回で統合）
    var userPrompt = '以下はタイムラインの最近の話題です。これらの中から気になったことについて、短い雑談投稿を1つ書いてください（200文字以内）。\n\n' +
      tlSummary.join('\n---\n');

    var result = callLLM('timeline_post', userPrompt, systemPrompt);
    if (!result) return false;

    var note = postNote(config, result, { postType: 'timeline' });
    if (note) {
      setLastRunTime_('TIMELINE');
      return true;
    }
  } catch (e) {
    logError('processTimelinePost', e.message);
  }

  return false;
}

// --------------- ランダム投稿 (F04) ---------------

/**
 * ランダム投稿シートからランダムに選択して投稿する。
 * @param {Object} config 設定オブジェクト
 * @returns {boolean} 投稿した場合 true
 */
function processRandomPost(config) {
  if (!isTimeSafe()) return false;

  // 間隔チェック
  var intervalHours = parseInt(config.RANDOM_POST_INTERVAL_HOURS) || 4;
  if (!isIntervalElapsed_('RANDOM', intervalHours)) return false;

  // 確率チェック
  var chance = parseInt(config.RANDOM_POST_CHANCE) || 30;
  if (Math.random() * 100 >= chance) return false;

  var sheet = SS.getSheetByName(SHEET.RANDOM_POST);
  if (!sheet || sheet.getLastRow() < 2) return false;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var candidates = [];
  for (var i = 0; i < data.length; i++) {
    var text = String(data[i][0]).trim();
    if (text) candidates.push(text);
  }

  if (candidates.length === 0) return false;

  var selected = candidates[Math.floor(Math.random() * candidates.length)];
  var note = postNote(config, selected, { postType: 'random' });
  if (note) {
    setLastRunTime_('RANDOM');
    return true;
  }

  return false;
}

// --------------- 投票投稿 (F06) ---------------

/**
 * 投票質問文シートから選択して投票投稿する。
 * @param {Object} config 設定オブジェクト
 */
function processPollPost(config) {
  if (String(config.POLL_ENABLED).toUpperCase() !== 'TRUE') return;

  var intervalHours = parseInt(config.POLL_INTERVAL_HOURS) || 12;
  if (!isIntervalElapsed_('POLL', intervalHours)) return;

  // 確率チェック
  var chance = parseInt(config.POLL_CHANCE) || 50;
  if (Math.random() * 100 >= chance) return;

  var sheet = SS.getSheetByName(SHEET.POLL);
  if (!sheet || sheet.getLastRow() < 2) return;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  var candidates = [];
  for (var i = 0; i < data.length; i++) {
    var question = String(data[i][0]).trim();
    if (question) {
      candidates.push({
        question: question,
        prefix: String(data[i][1] || '').trim()
      });
    }
  }

  if (candidates.length === 0) return;

  // TLからキーワード抽出して選択肢を生成
  var choices = extractPollChoices_(config);
  if (choices.length < 2) return;

  var selected = candidates[Math.floor(Math.random() * candidates.length)];
  var text = selected.question;

  // prefix がある場合は各選択肢に付与する
  var pollChoices = choices.slice(0, 4);
  if (selected.prefix) {
    pollChoices = pollChoices.map(function(c) { return selected.prefix + c; });
  }

  var expireHours = parseFloat(config.POLL_EXPIRE_HOURS) || 3;
  var poll = {
    choices: pollChoices, // Misskey の上限は4選択肢
    expiredAfter: Math.round(expireHours * 3600000)
  };

  var note = postNote(config, text, { postType: 'poll', poll: poll });
  if (note) {
    setLastRunTime_('POLL');
  }
}

/**
 * TLからキーワードを抽出して投票の選択肢を生成する。
 * @param {Object} config 設定オブジェクト
 * @returns {string[]} 選択肢配列
 * @private
 */
function extractPollChoices_(config) {
  try {
    var tlType = config.POLL_TIMELINE_TYPE || 'local';
    var endpoint = 'notes/local-timeline';
    if (tlType === 'home') endpoint = 'notes/timeline';
    else if (tlType === 'hybrid') endpoint = 'notes/hybrid-timeline';
    else if (tlType === 'global') endpoint = 'notes/global-timeline';

    var notes = callMisskeyApi(endpoint, { limit: 30 });
    var filtered = filterTimelineNotes(notes, config);

    // 名詞的なキーワードを正規表現で抽出（簡易）
    var wordCounts = {};
    var ngWords = loadNGWords(config);

    for (var i = 0; i < filtered.length; i++) {
      var text = filtered[i].cleanedText;
      // カタカナ語（3文字以上）を抽出
      var katakana = text.match(/[\u30A0-\u30FF]{3,}/g) || [];
      // 英単語（4文字以上）を抽出
      var english = text.match(/[A-Za-z]{4,}/g) || [];
      var words = katakana.concat(english);

      for (var j = 0; j < words.length; j++) {
        var w = words[j];
        if (!containsNGWord(w, ngWords)) {
          wordCounts[w] = (wordCounts[w] || 0) + 1;
        }
      }
    }

    // 出現頻度順にソートして上位を選択肢にする
    var sorted = Object.keys(wordCounts).sort(function (a, b) {
      return wordCounts[b] - wordCounts[a];
    });

    return sorted.slice(0, 4);
  } catch (e) {
    logError('extractPollChoices_', e.message);
    return [];
  }
}

// --------------- リアクション (F08) ---------------

/**
 * TL のノートにキーワードマッチでリアクションする。
 * @param {Object} config 設定オブジェクト
 */
function processReaction(config) {
  if (String(config.REACTION_ENABLED).toUpperCase() !== 'TRUE') return;

  // 間隔チェック（毎回実行可能だが負荷軽減のため）
  if (!isIntervalElapsed_('REACTION', 1)) return;

  var sheet = SS.getSheetByName(SHEET.REACTION);
  if (!sheet || sheet.getLastRow() < 2) return;

  var rules = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  if (rules.length === 0) return;

  // 直近のTLを取得
  try {
    var notes = callMisskeyApi('notes/local-timeline', { limit: 10 });
    var recencyMinutes = parseInt(config.REACTION_RECENCY_MINUTES) || 30;
    var threshold = Date.now() - recencyMinutes * 60000;
    var ownUserId = config.OWN_USER_ID || '';
    var mutualOnly = String(config.REACTION_MUTUAL_ONLY).toUpperCase() === 'TRUE';

    for (var i = 0; i < notes.length; i++) {
      if (!isTimeSafe()) break;

      var note = notes[i];
      if (!note.text || !note.user) continue;
      if (note.user.id === ownUserId) continue;
      if (note.user.isBot) continue;

      // 新しさチェック
      var noteTime = new Date(note.createdAt).getTime();
      if (noteTime < threshold) continue;

      // 既にリアクション済みかチェック
      if (note.myReaction) continue;

      // 相互フォローチェック
      if (mutualOnly) {
        try {
          var relation = callMisskeyApi('users/relation', { userId: note.user.id });
          if (!relation.isFollowing || !relation.isFollowed) continue;
        } catch (e) {
          continue;
        }
      }

      var cleaned = cleanNoteText(note.text).toLowerCase();

      // キーワードマッチ
      for (var j = 0; j < rules.length; j++) {
        var keyword = String(rules[j][0]).trim().toLowerCase();
        if (!keyword) continue;

        if (cleaned.indexOf(keyword) !== -1) {
          // リアクション候補からランダム選択
          var candidates = [];
          if (rules[j][1]) candidates.push(String(rules[j][1]).trim());
          if (rules[j][2]) candidates.push(String(rules[j][2]).trim());
          if (candidates.length === 0) continue;

          var reaction = candidates[Math.floor(Math.random() * candidates.length)];
          try {
            callMisskeyApi('notes/reactions/create', {
              noteId: note.id,
              reaction: reaction
            });
            incrementCounter('REACTION');
          } catch (e) {
            // リアクション失敗は無視（既にリアクション済み等）
          }
          break; // 1ノートにつき1リアクションまで
        }
      }
    }

    setLastRunTime_('REACTION');
  } catch (e) {
    logError('processReaction', e.message);
  }
}

// --------------- 星座占い (F12) ---------------

/**
 * 星座占いを投稿する。
 * @param {Object} config 設定オブジェクト
 */
function processHoroscope(config) {
  if (String(config.HOROSCOPE_ENABLED).toUpperCase() !== 'TRUE') return;

  // 時刻チェック
  var targetHour = parseInt(config.HOROSCOPE_HOUR) || 7;
  var currentHour = parseInt(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'));
  if (currentHour !== targetHour) return;

  // 日次チェック（1日1回）
  if (!isIntervalElapsed_('HOROSCOPE', 20)) return;

  var text = null;

  // AI占いモード
  if (String(config.HOROSCOPE_USE_AI).toUpperCase() === 'TRUE') {
    text = generateAIHoroscope_(config);
  }

  // フォールバック: スコアベース
  if (!text) {
    text = generateScoreHoroscope_();
  }

  if (text) {
    var note = postNote(config, text, { postType: 'horoscope' });
    if (note) {
      setLastRunTime_('HOROSCOPE');
    }
  }
}

/**
 * AIで星座占いを生成する。
 * @param {Object} config 設定オブジェクト
 * @returns {string|null} 占いテキスト
 * @private
 */
function generateAIHoroscope_(config) {
  var systemPrompt = getCharacterPrompt_();
  var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');

  var userPrompt = '以下のシステムプロンプトのキャラクターになりきって、今日の12星座占いのランキングを作成してください。\n\n'
    + '【システムプロンプト】\n' + systemPrompt + '\n\n'
    + '【条件】\n'
    + '- 本日の日付: ' + todayStr + ' (この日付に基づいた運勢を生成してください)\n'
    + '- 以下の12星座すべてを含めてください。\n'
    + '  ♈おひつじ座, ♉おうし座, ♊ふたご座, ♋かに座, ♌しし座, ♍おとめ座, ♎てんびん座, ♏さそり座, ♐いて座, ♑やぎ座, ♒みずがめ座, ♓うお座\n'
    + '- 順位やスコアは毎日ランダムに入れ替えてください。特定の星座が常に上位にならないようにしてください。\n'
    + '- 順位が高い順に並べて、各星座の後に「⭐1〜⭐5」のレート（0.5刻みも可）と運勢コメントを付けてください。\n'
    + '- 各星座に今日の運勢について短いコメント（15文字程度）を付けてください。キャラクターの口調を守ってください。\n'
    + '- 1位は🥇、2位は🥈、3位は🥉の絵文字を順位の前に付けてください。4位以降は数字のみでOKです。\n'
    + '- 全体のタイトルとして「🌟 今日の12星座占いランキング 🌟」を最初に入れてください。\n\n'
    + '【表示例】\n'
    + '🌟 今日の12星座占いランキング 🌟\n\n'
    + '🥇位: [星座名] ⭐5 [運勢コメント]\n'
    + '🥈位: [星座名] ⭐4.5 [運勢コメント]\n'
    + '🥉位: [星座名] ⭐4.0 [運勢コメント]\n'
    + '4位: [星座名] ⭐3.5 [運勢コメント]\n'
    + '（...12位まで続く）\n\n'
    + '【出力ルール】\n'
    + '- MFM記法（**太字**、`コード`、> 引用、~~打消し~~ 等）は一切使用しないでください。\n'
    + '- 余計な解説文や挨拶（「承知しました」「生成します」など）は一切不要です。\n'
    + '- 投稿される文章のみをそのまま出力してください。';

  var result = callLLM('horoscope', userPrompt, systemPrompt);
  if (!result) return null;

  // バリデーション: 12星座のうち最低6つが含まれているか
  var signs = ['おひつじ', '牡羊', 'おうし', '牡牛', 'ふたご', '双子', 'かに', '蟹', 'しし', '獅子', 'おとめ', '乙女',
    'てんびん', '天秤', 'さそり', '蠍', 'いて', '射手', 'やぎ', '山羊', 'みずがめ', '水瓶', 'うお', '魚'];

  var matchCount = 0;
  var matched = {};
  for (var i = 0; i < signs.length; i++) {
    var signGroup = Math.floor(i / 2); // 2つずつグループ化
    if (!matched[signGroup] && result.indexOf(signs[i]) !== -1) {
      matched[signGroup] = true;
      matchCount++;
    }
  }

  if (matchCount < 6) {
    Logger.log('[generateAIHoroscope_] バリデーション失敗: ' + matchCount + '/12 星座検出');
    return null;
  }

  return result;
}

/**
 * スコアベースの星座占いを生成する。
 * @returns {string} 占いテキスト
 * @private
 */
function generateScoreHoroscope_() {
  var signs = [
    { name: '♈ おひつじ座' }, { name: '♉ おうし座' }, { name: '♊ ふたご座' },
    { name: '♋ かに座' }, { name: '♌ しし座' }, { name: '♍ おとめ座' },
    { name: '♎ てんびん座' }, { name: '♏ さそり座' }, { name: '♐ いて座' },
    { name: '♑ やぎ座' }, { name: '♒ みずがめ座' }, { name: '♓ うお座' }
  ];

  // 各星座にランダムスコアを生成
  for (var i = 0; i < signs.length; i++) {
    var luck = Math.floor(Math.random() * 3) + 1;
    var love = Math.floor(Math.random() * 3) + 1;
    var health = Math.floor(Math.random() * 3) + 1;
    signs[i].total = luck + love + health;
    signs[i].luck = luck;
    signs[i].love = love;
    signs[i].health = health;
  }

  // スコア降順ソート
  signs.sort(function (a, b) { return b.total - a.total; });

  var stars = function (n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '*';
    return s;
  };

  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d');
  var lines = ['今日 (' + today + ') の星座占い〜\n'];

  for (var j = 0; j < signs.length; j++) {
    var rank = j + 1;
    var s = signs[j];
    lines.push(rank + '位 ' + s.name + ' (金' + stars(s.luck) + ' 恋' + stars(s.love) + ' 健' + stars(s.health) + ')');
  }

  return lines.join('\n');
}

// --------------- 日次メンテナンス (F14) ---------------

/**
 * 日次メンテナンスを実行する（0時台のみ）。
 * @param {Object} config 設定オブジェクト
 */
function runDailyMaintenance(config) {
  if (String(config.MAINTENANCE_ENABLED).toUpperCase() !== 'TRUE') return;

  // 0時台チェック
  var currentHour = parseInt(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'));
  if (currentHour !== 0) return;

  // 本日既に実行済みかチェック
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_MAINTENANCE_DATE') === today) return;

  // --- ダッシュボード書き込み ---
  writeDashboard_(config, today);

  // --- PropertiesService の一時キー削除 ---
  cleanupProperties_(config);

  // --- イベント投稿済みフラグリセット ---
  resetEventFlags_();

  // --- 自動投稿削除 ---
  if (isTimeSafe(120000)) {
    executeAutoDelete(config);
  }

  // --- フォロー同期 ---
  if (isTimeSafe(120000)) {
    runFollowSync(config);
  }

  props.setProperty('LAST_MAINTENANCE_DATE', today);
}

/**
 * ダッシュボードシートに日次統計を書き込む。
 * @param {Object} config 設定オブジェクト
 * @param {string} today 日付文字列
 * @private
 */
function writeDashboard_(config, today) {
  try {
    var sheet = SS.getSheetByName(SHEET.DASHBOARD);
    if (!sheet) return;

    var props = PropertiesService.getScriptProperties();
    var counters = ['POST', 'REPLY', 'REACTION', 'FOLLOW_BACK', 'AI', 'ERROR', 'URL_FETCH', 'UNFOLLOW'];
    var row = [today];

    for (var i = 0; i < counters.length; i++) {
      var key = 'COUNT_' + counters[i] + '_' + today;
      row.push(parseInt(props.getProperty(key)) || 0);
    }

    sheet.appendRow(row);
  } catch (e) {
    logError('writeDashboard_', e.message);
  }
}

/**
 * PropertiesService の一時キー（古い日次カウンタ・重複防止フラグ）を削除する。
 * @param {Object} config 設定オブジェクト
 * @private
 */
function cleanupProperties_(config) {
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var cleanupDays = parseInt(config.MAINTENANCE_CLEANUP_DAYS) || 30;
    var threshold = new Date(Date.now() - cleanupDays * 86400000);
    var thresholdStr = Utilities.formatDate(threshold, 'Asia/Tokyo', 'yyyy-MM-dd');

    for (var key in all) {
      // 日次カウンタ: COUNT_*_YYYY-MM-DD
      if (key.indexOf('COUNT_') === 0) {
        var dateMatch = key.match(/\d{4}-\d{2}-\d{2}$/);
        if (dateMatch && dateMatch[0] < thresholdStr) {
          props.deleteProperty(key);
        }
      }
      // 重複防止: PM_*
      if (key.indexOf('PM_') === 0) {
        // 古いものは削除（日付判定が困難なため、全体サイズで管理）
        // ここでは簡易的に保持
      }
      // 返信上限: REPLY_COUNT_*_YYYY-MM-DD
      if (key.indexOf('REPLY_COUNT_') === 0) {
        var rcMatch = key.match(/\d{4}-\d{2}-\d{2}$/);
        if (rcMatch && rcMatch[0] < thresholdStr) {
          props.deleteProperty(key);
        }
      }
      // 会話履歴: CONV_{userId} — PropertiesService の容量圧迫を防ぐため
      // 全体サイズが大きい場合は別途削除対象とするが、通常は保持する（最新N件のみ保存設計のため）
    }
  } catch (e) {
    logError('cleanupProperties_', e.message);
  }
}

/**
 * イベントシートの投稿済みフラグをリセットする（年次対応）。
 * @private
 */
function resetEventFlags_() {
  try {
    var sheet = SS.getSheetByName(SHEET.EVENT);
    if (!sheet || sheet.getLastRow() < 2) return;

    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MM/dd');
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();

    for (var i = 0; i < data.length; i++) {
      var eventDate = String(data[i][0]).trim();
      // 今日でなければフラグをリセット（翌年の再投稿に備える）
      if (eventDate !== today && String(data[i][3]).trim().toUpperCase() === 'TRUE') {
        sheet.getRange(i + 2, 4).setValue('');
      }
    }
  } catch (e) {
    logError('resetEventFlags_', e.message);
  }
}

// --------------- 自己投稿の自動削除 (F15) ---------------

/**
 * 投稿履歴シートから古い投稿を削除する。
 * @param {Object} config 設定オブジェクト
 */
function executeAutoDelete(config) {
  if (String(config.MAINTENANCE_AUTO_DELETE_ENABLED).toUpperCase() !== 'TRUE') return;

  var sheet = SS.getSheetByName(SHEET.POST_HISTORY);
  if (!sheet || sheet.getLastRow() < 2) return;

  var days = parseInt(config.MAINTENANCE_CLEANUP_DAYS) || 30;
  var intervalMs = (parseInt(config.MAINTENANCE_DELETE_INTERVAL_SECONDS) || 2) * 1000;
  var maxRetries = parseInt(config.MAINTENANCE_DELETE_MAX_RETRIES) || 3;
  var threshold = new Date(Date.now() - days * 86400000);
  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var postedAt = new Date(data[i][1]);
    if (postedAt < threshold) {
      // リトライ付き削除
      var deleted = false;
      for (var attempt = 0; attempt < maxRetries; attempt++) {
        try {
          callMisskeyApi('notes/delete', { noteId: data[i][0] });
          deleted = true;
          break;
        } catch (e) {
          if (e.message && e.message.indexOf('NO_SUCH_NOTE') !== -1) {
            deleted = true; // 既に削除済み
            break;
          }
          if (attempt < maxRetries - 1) {
            Utilities.sleep(intervalMs);
          }
        }
      }

      if (deleted) {
        rowsToDelete.push(i + 1); // 1-indexed
      } else {
        logError('executeAutoDelete', 'リトライ' + maxRetries + '回失敗: noteId=' + data[i][0]);
      }

      // レートリミット対策
      Utilities.sleep(intervalMs);

      // 実行時間ガード
      if (!isTimeSafe(120000)) {
        Logger.log('[executeAutoDelete] 残り時間不足、次回に持ち越し');
        break;
      }
    }
  }

  // 下から順に削除（インデックスずれ防止）
  for (var r = 0; r < rowsToDelete.length; r++) {
    sheet.deleteRow(rowsToDelete[r]);
  }
}

// --------------- フォロー同期 (F18) ---------------

/**
 * フォロワーリストを同期し、自動アンフォローを実行する。
 * @param {Object} config 設定オブジェクト
 */
function runFollowSync(config) {
  if (String(config.FOLLOW_AUTO_UNFOLLOW_BACK).toUpperCase() !== 'TRUE') return;
  if (!isTimeSafe(120000)) return;

  var ownUserId = config.OWN_USER_ID;
  if (!ownUserId) {
    logError('runFollowSync', 'OWN_USER_ID が未設定です');
    return;
  }

  try {
    // API からフォロワー・フォロー一覧を取得
    var followerIds = {};
    var followers = fetchAllFollowers_(config, ownUserId);
    for (var i = 0; i < followers.length; i++) {
      followerIds[followers[i].id] = followers[i].username || '';
    }

    var followingIds = {};
    var following = fetchAllFollowing_(config, ownUserId);
    for (var j = 0; j < following.length; j++) {
      followingIds[following[j].id] = following[j].username || '';
    }

    // フォロー管理シート読み込み
    var sheet = SS.getSheetByName(SHEET.FOLLOW_MGMT);
    if (!sheet) return;

    var data = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues()
      : [];

    var sheetMap = {};
    for (var k = 0; k < data.length; k++) {
      sheetMap[String(data[k][0])] = {
        row: k,
        username: String(data[k][1]),
        isFollower: String(data[k][2]).toUpperCase() === 'TRUE',
        iAmFollowing: String(data[k][3]).toUpperCase() === 'TRUE',
        missingCount: parseInt(data[k][4]) || 0,
        updatedAt: String(data[k][5])
      };
    }

    var graceCycles = parseInt(config.FOLLOW_UNFOLLOW_GRACE_CYCLES) || 2;
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    var newData = [];
    // 全ユーザーを処理
    var allUserIds = {};
    for (var fid in followerIds) allUserIds[fid] = true;
    for (var sid in sheetMap) allUserIds[sid] = true;

    for (var uid in allUserIds) {
      var inFollowers = followerIds.hasOwnProperty(uid);
      var inSheet = sheetMap.hasOwnProperty(uid);
      var username = followerIds[uid] || (inSheet ? sheetMap[uid].username : '');
      var iAmFollowing = followingIds.hasOwnProperty(uid);

      if (inFollowers && !inSheet) {
        // 新規フォロワー
        newData.push([uid, username, 'TRUE', iAmFollowing ? 'TRUE' : 'FALSE', 0, now]);
      } else if (inFollowers && inSheet) {
        // 継続フォロワー
        newData.push([uid, username, 'TRUE', iAmFollowing ? 'TRUE' : 'FALSE', 0, now]);
      } else if (!inFollowers && inSheet) {
        // フォロワーから外れた
        var entry = sheetMap[uid];
        var newMissing = entry.missingCount + 1;

        if (newMissing >= graceCycles && iAmFollowing) {
          // grace_cycles 超過 → アンフォロー
          try {
            callMisskeyApi('following/delete', { userId: uid });
            incrementCounter('UNFOLLOW');
          } catch (e) {
            logError('runFollowSync', 'アンフォロー失敗: ' + uid + ' - ' + e.message);
          }
          // シートから削除
          continue;
        }

        newData.push([uid, username, 'FALSE', iAmFollowing ? 'TRUE' : 'FALSE', newMissing, now]);
      }
    }

    // シートを一括書き戻し
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).clearContent();
    }
    if (newData.length > 0) {
      sheet.getRange(2, 1, newData.length, 6).setValues(newData);
    }
  } catch (e) {
    logError('runFollowSync', e.message);
  }
}

/**
 * 全フォロワーをページネーション対応で取得する。
 * @param {Object} config 設定オブジェクト
 * @param {string} userId ユーザーID
 * @returns {Object[]} フォロワー配列
 * @private
 */
function fetchAllFollowers_(config, userId) {
  return fetchPaginated_('users/followers', userId);
}

/**
 * 全フォロー中ユーザーをページネーション対応で取得する。
 * @param {Object} config 設定オブジェクト
 * @param {string} userId ユーザーID
 * @returns {Object[]} フォロー中ユーザー配列
 * @private
 */
function fetchAllFollowing_(config, userId) {
  return fetchPaginated_('users/following', userId);
}

/**
 * ページネーション付きAPI取得の共通関数。
 * @param {string} endpoint APIエンドポイント
 * @param {string} userId ユーザーID
 * @returns {Object[]} ユーザー配列
 * @private
 */
function fetchPaginated_(endpoint, userId) {
  var all = [];
  var untilId = null;
  var limit = 100;

  for (var page = 0; page < 10; page++) { // 最大1000ユーザー
    if (!isTimeSafe(60000)) break;

    var params = { userId: userId, limit: limit };
    if (untilId) params.untilId = untilId;

    var result = callMisskeyApi(endpoint, params);
    if (!result || result.length === 0) break;

    for (var i = 0; i < result.length; i++) {
      // followers/following API はネストされたオブジェクトを返す場合がある
      var user = result[i].follower || result[i].followee || result[i];
      all.push(user);
    }

    if (result.length < limit) break;
    untilId = result[result.length - 1].id;
  }

  return all;
}

// --------------- キャラクタープロンプト取得 ---------------

/**
 * キャラクタープロンプトシートからSystem Promptを取得する。
 * @returns {string} System Prompt
 * @private
 */
function getCharacterPrompt_() {
  var sheet = SS.getSheetByName(SHEET.CHARACTER_PROMPT);
  if (!sheet || sheet.getLastRow() < 2) {
    return 'あなたは少女「みあ」一人称「あたし」マイペース,無頓着,好奇心はあるが浅い。敬語・句点・絵文字不使用。語尾は柔らかくゆるい。';
  }
  return String(sheet.getRange(2, 1).getValue()).trim();
}
