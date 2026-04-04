/* ============================================================
 * Core.gs — 設定読込・LLM統合・Misskey API・ユーティリティ・NGフィルタ
 * ============================================================ */

// --------------- グローバル定数 ---------------

/** @type {Object<string, string>} シート名マップ */
var SHEET = {
  CONFIG: '設定',
  CHARACTER_SETTINGS: 'キャラクター設定',
  SCHEDULED_POST: 'スケジュール投稿',
  RANDOM_POST: 'ランダム投稿',
  WEEKDAY: '曜日別',
  EVENT: 'イベント',
  POLL: '投票質問文',
  REACTION: 'リアクション',
  FALLBACK: 'フォールバック定型文',
  NG_WORDS: 'NGワード',
  USER_MGMT: 'ユーザー管理',
  DASHBOARD: 'ダッシュボード',
  ERROR_LOG: 'エラーログ',
  POST_HISTORY: '投稿履歴',
  FOLLOW_MGMT: 'フォロー管理',
  KEYWORD_REPLY: 'キーワード応答'
};

var SS = SpreadsheetApp.getActiveSpreadsheet();
var SCRIPT_START = Date.now();

// --------------- ユーティリティ ---------------

/**
 * 実行時間ガード。GAS の6分制限に対するマージンチェック。
 * @param {number} [marginMs=60000] 残すべき余裕（ミリ秒）
 * @returns {boolean} まだ安全なら true
 */
function isTimeSafe(marginMs) {
  if (marginMs === undefined || marginMs === null) marginMs = 60000;
  return (Date.now() - SCRIPT_START) < (360000 - marginMs);
}

/**
 * 夜間判定。日付またぎ（例: 23時〜6時）に対応。
 * @param {Object} config 設定オブジェクト
 * @returns {boolean} 夜間なら true
 */
function isNightTime(config) {
  var start = parseInt(config.POSTING_NIGHT_START) || 23;
  var end = parseInt(config.POSTING_NIGHT_END) || 6;
  var now = new Date();
  var hour = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'H'));

  if (start > end) {
    // 日付またぎ: 23〜6 → 23,0,1,2,3,4,5
    return hour >= start || hour < end;
  }
  // 通常: start <= end
  return hour >= start && hour < end;
}

/**
 * エラーログシートに書き込み + メール通知（設定時）。
 * @param {string} functionName 関数名
 * @param {string} message エラー内容
 */
function logError(functionName, message) {
  try {
    var sheet = SS.getSheetByName(SHEET.ERROR_LOG);
    if (sheet) {
      var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
      sheet.appendRow([now, functionName, message]);
    }
    incrementCounter('ERROR');
  } catch (e) {
    Logger.log('[logError] シート書き込み失敗: ' + e.message);
  }

  // メール通知
  try {
    var config = getConfig();
    if (String(config.ERROR_NOTIFY_ENABLED).toUpperCase() === 'TRUE' && config.ERROR_NOTIFY_EMAIL) {
      if (MailApp.getRemainingDailyQuota() > 0) {
        MailApp.sendEmail(
          config.ERROR_NOTIFY_EMAIL,
          '[みあbot] エラー通知: ' + functionName,
          '日時: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') +
          '\n関数: ' + functionName +
          '\n内容: ' + message
        );
      }
    }
  } catch (e) {
    Logger.log('[logError] メール通知失敗: ' + e.message);
  }
}

/**
 * ダッシュボードの日次カウンタをインクリメント。
 * @param {string} type カウンタ種別 (POST/REPLY/REACTION/FOLLOW_BACK/AI/ERROR/URL_FETCH/UNFOLLOW)
 */
function incrementCounter(type) {
  try {
    var props = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var key = 'COUNT_' + type + '_' + today;
    var current = parseInt(props.getProperty(key)) || 0;
    props.setProperty(key, String(current + 1));
  } catch (e) {
    Logger.log('[incrementCounter] 失敗: ' + e.message);
  }
}

/**
 * LLM日次上限チェック。
 * @param {Object} config 設定オブジェクト
 * @returns {boolean} 上限到達なら true
 */
function isAIDailyLimitReached(config) {
  var limit = parseInt(config.AI_DAILY_LIMIT) || 50;
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var key = 'COUNT_AI_' + today;
  var current = parseInt(PropertiesService.getScriptProperties().getProperty(key)) || 0;
  return current >= limit;
}

// --------------- 設定読込 ---------------

/**
 * 設定シートから Key-Value を読み込み、CacheService でキャッシュする。
 * PropertiesService の機密キーもマージする。
 * @returns {Object} 設定オブジェクト
 */
function getConfig() {
  // キャッシュ確認
  var cache = CacheService.getScriptCache();
  var cached = cache.get('config_cache');
  if (cached) {
    return JSON.parse(cached);
  }

  var config = {};

  // デフォルト値
  var defaults = {
    BOT_ACTIVE: 'FALSE',
    AI_PROVIDER: 'none',
    AI_INPUT_MAX_CHARS: '2500',
    AI_DAILY_LIMIT: '50',
    AI_GEMINI_MODEL: 'gemini-2.5-flash-lite',
    AI_GEMINI_TEMPERATURE: '1.0',
    AI_GEMINI_MAX_TOKENS: '1024',
    AI_OLLAMA_MODEL: 'gemini-3-flash-preview:cloud',
    AI_OLLAMA_TEMPERATURE: '0.8',
    AI_OLLAMA_NUM_PREDICT: '1024',
    AI_OPENROUTER_MODEL: 'stepfun/step-3.5-flash:free',
    AI_OPENROUTER_TEMPERATURE: '1.0',
    AI_OPENROUTER_MAX_TOKENS: '1024',
    POSTING_VISIBILITY: 'home',
    POSTING_NIGHT_START: '23',
    POSTING_NIGHT_END: '6',
    RANDOM_POST_ENABLED: 'TRUE',
    RANDOM_POST_INTERVAL_HOURS: '4',
    RANDOM_POST_CHANCE: '30',
    SCHEDULED_POST_ENABLED: 'TRUE',
    SCHEDULED_POST_CHANCE: '100',
    WEEKDAY_POST_ENABLED: 'TRUE',
    WEEKDAY_POST_CHANCE: '30',
    TIMELINE_POST_ENABLED: 'TRUE',
    TIMELINE_POST_INTERVAL_HOURS: '6',
    TIMELINE_POST_TYPE: 'local',
    TIMELINE_POST_CHANCE: '70',
    HOROSCOPE_ENABLED: 'FALSE',
    HOROSCOPE_HOUR: '7',
    HOROSCOPE_USE_AI: 'FALSE',
    HOROSCOPE_MAX_CHARS: '500',
    POLL_ENABLED: 'TRUE',
    POLL_INTERVAL_HOURS: '12',
    POLL_CHANCE: '50',
    POLL_EXPIRE_HOURS: '3',
    POLL_TIMELINE_TYPE: 'local',
    EVENT_POST_ENABLED: 'TRUE',
    REACTION_ENABLED: 'TRUE',
    REACTION_MUTUAL_ONLY: 'TRUE',
    REACTION_RECENCY_MINUTES: '30',
    FOLLOW_AUTO_FOLLOW_BACK: 'TRUE',
    FOLLOW_AUTO_UNFOLLOW_BACK: 'FALSE',
    FOLLOW_UNFOLLOW_GRACE_CYCLES: '2',
    FOLLOW_KEYWORD_ENABLED: 'TRUE',
    FOLLOW_KEYWORDS: 'フォローして,followして,相互フォロー',
    REPLY_ENABLED: 'TRUE',
    REPLY_MUTUAL_ONLY: 'TRUE',
    REPLY_MAX_PER_USER_PER_DAY: '10',
    AFFINITY_ENABLED: 'TRUE',
    AFFINITY_RANK2_THRESHOLD: '5',
    AFFINITY_RANK3_THRESHOLD: '20',
    NG_WORDS_MATCH_MODE: 'substring',
    MAINTENANCE_ENABLED: 'TRUE',
    MAINTENANCE_CLEANUP_DAYS: '30',
    MAINTENANCE_AUTO_DELETE_ENABLED: 'FALSE',
    MAINTENANCE_DELETE_INTERVAL_SECONDS: '2',
    MAINTENANCE_DELETE_MAX_RETRIES: '3',
    ERROR_NOTIFY_ENABLED: 'FALSE',
    ERROR_NOTIFY_EMAIL: '',
    CONV_MAX_TURNS: '3',
    NICKNAME_ENABLED: 'TRUE',
    NICKNAME_MAX_LENGTH: '20'
  };

  // デフォルト値を先に適用
  for (var k in defaults) {
    config[k] = defaults[k];
  }

  // スプレッドシートから読み込み（上書き）
  var sheet = SS.getSheetByName(SHEET.CONFIG);
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      var key = String(data[i][0]).trim();
      var val = String(data[i][1]).trim();
      if (key) config[key] = val;
    }
  }

  // PropertiesService から機密キーをマージ
  var props = PropertiesService.getScriptProperties();
  var secretKeys = [
    'MISSKEY_TOKEN', 'GEMINI_API_KEY',
    'OLLAMA_BASE_URL', 'OLLAMA_API_KEY',
    'OPENROUTER_API_KEY', 'OWN_USER_ID',
    'YAHOO_CLIENT_ID'
  ];
  for (var j = 0; j < secretKeys.length; j++) {
    var secretVal = props.getProperty(secretKeys[j]);
    if (secretVal) config[secretKeys[j]] = secretVal;
  }

  // キャッシュに保存（5分 = 300秒）
  cache.put('config_cache', JSON.stringify(config), 300);

  return config;
}

// --------------- Misskey API ---------------

/**
 * Misskey API を呼び出す。
 * @param {string} endpoint APIエンドポイント (例: 'notes/create')
 * @param {Object} params リクエストパラメータ
 * @returns {Object} レスポンスオブジェクト
 */
function callMisskeyApi(endpoint, params) {
  var config = getConfig();
  var url = config.MISSKEY_INSTANCE;

  // URLの末尾スラッシュ正規化
  if (url && url.charAt(url.length - 1) !== '/') url += '/';
  url += 'api/' + endpoint;

  var payload = params || {};
  payload.i = config.MISSKEY_TOKEN;

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  incrementCounter('URL_FETCH');

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Misskey API エラー (' + endpoint + '): HTTP ' + code + ' - ' + body);
  }

  return body ? JSON.parse(body) : {};
}

/**
 * users/relation API の戻り値を正規化する。
 * Misskey バージョンにより配列/オブジェクト、isFollowing/following の差異を吸収。
 * @param {Object|Array} raw callMisskeyApi('users/relation', ...) の戻り値
 * @returns {{ isFollowing: boolean, isFollowed: boolean }}
 */
function normalizeRelation(raw) {
  var r = Array.isArray(raw) ? raw[0] : raw;
  if (!r) return { isFollowing: false, isFollowed: false };
  return {
    isFollowing: !!(r.isFollowing !== undefined ? r.isFollowing : r.following),
    isFollowed: !!(r.isFollowed !== undefined ? r.isFollowed : r.followed)
  };
}

/**
 * ノートを投稿し、投稿履歴シートに記録する。
 * @param {Object} config 設定オブジェクト
 * @param {string} text 投稿テキスト
 * @param {Object} [options={}] 追加オプション (visibility, replyId, poll 等)
 * @returns {Object|null} 作成されたノートオブジェクト、または null
 */
function postNote(config, text, options) {
  if (!text) return null;

  var params = {
    text: text,
    visibility: (options && options.visibility) || config.POSTING_VISIBILITY || 'home'
  };

  // オプションのマージ
  if (options) {
    if (options.replyId) params.replyId = options.replyId;
    if (options.poll) params.poll = options.poll;
    if (options.cw) params.cw = options.cw;
  }

  try {
    var result = callMisskeyApi('notes/create', params);
    var note = result.createdNote;

    // 投稿履歴シートに記録
    if (note && note.id) {
      var historySheet = SS.getSheetByName(SHEET.POST_HISTORY);
      if (historySheet) {
        var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        var postType = (options && options.postType) || 'other';
        historySheet.appendRow([note.id, now, postType]);
      }
      incrementCounter('POST');
    }

    return note || null;
  } catch (e) {
    logError('postNote', e.message);
    return null;
  }
}

// --------------- テキストクリーナー ---------------

/**
 * MFM・URL・コードブロック等を除去して平文にする。
 * @param {string} text 入力テキスト
 * @returns {string} クリーニング済みテキスト
 */
function cleanNoteText(text) {
  if (!text) return '';

  // URL除去
  text = text.replace(/https?:\/\/\S+/g, '');
  // メンション除去
  text = text.replace(/@\w+(@[\w.]+)?/g, '');
  // カスタム絵文字除去
  text = text.replace(/:[\w]+:/g, '');
  // ハッシュタグ除去
  text = text.replace(/#\S+/g, '');
  // コードブロック除去
  text = text.replace(/```[\s\S]*?```/g, '');
  // インラインコード除去
  text = text.replace(/`[^`]*`/g, '');

  // MFM $[tag content] → content のみ保持（入れ子対応: 最大5回ループ）
  for (var i = 0; i < 5; i++) {
    var prev = text;
    text = text.replace(/\$\[[^\s\]]+\s+([^\[\]]*?)\]/g, '$1');
    text = text.replace(/\$\[[^\s\]]+\]/g, '');
    if (text === prev) break;
  }

  return text.trim();
}

// --------------- NGフィルタ ---------------

/**
 * NGワードを3層統合で読み込む: シート + 外部URL + キャッシュ。
 * @param {Object} config 設定オブジェクト
 * @returns {string[]} NGワード配列（小文字化済み）
 */
function loadNGWords(config) {
  // キャッシュ確認（30分TTL）
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ng_words_combined');
  if (cached) {
    return JSON.parse(cached);
  }

  var ngWords = [];

  // 1. NGワードシートから取得
  var sheet = SS.getSheetByName(SHEET.NG_WORDS);
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      var word = String(data[i][0]).trim().toLowerCase();
      if (word) ngWords.push(word);
    }
  }

  // 2. 外部URLから取得
  if (config.NG_WORDS_EXTERNAL_URL) {
    try {
      var response = UrlFetchApp.fetch(config.NG_WORDS_EXTERNAL_URL, { muteHttpExceptions: true });
      incrementCounter('URL_FETCH');
      if (response.getResponseCode() === 200) {
        var externalText = response.getContentText();
        var externalWords = externalText.split('\n');
        for (var j = 0; j < externalWords.length; j++) {
          var w = externalWords[j].trim().toLowerCase();
          if (w) ngWords.push(w);
        }
        // PropertiesService に永続フォールバックとして保存
        PropertiesService.getScriptProperties().setProperty(
          'NG_EXTERNAL_CACHE', JSON.stringify(externalWords.filter(function (w) { return w.trim(); }))
        );
      }
    } catch (e) {
      // 外部取得失敗時は PropertiesService フォールバック
      Logger.log('[loadNGWords] 外部URL取得失敗、フォールバック使用: ' + e.message);
      var fallback = PropertiesService.getScriptProperties().getProperty('NG_EXTERNAL_CACHE');
      if (fallback) {
        var fbWords = JSON.parse(fallback);
        for (var k = 0; k < fbWords.length; k++) {
          var fw = fbWords[k].trim().toLowerCase();
          if (fw) ngWords.push(fw);
        }
      }
    }
  }

  // 重複除去
  ngWords = ngWords.filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });

  // キャッシュに保存（30分 = 1800秒）
  cache.put('ng_words_combined', JSON.stringify(ngWords), 1800);

  return ngWords;
}

/**
 * テキストがNGワードを含むか判定（部分一致・小文字化）。
 * @param {string} text 判定対象テキスト
 * @param {string[]} ngWords NGワード配列（小文字化済み）
 * @returns {boolean} NG語を含めば true
 */
function containsNGWord(text, ngWords) {
  if (!text || !ngWords || ngWords.length === 0) return false;
  var lower = text.toLowerCase();
  for (var i = 0; i < ngWords.length; i++) {
    if (ngWords[i] && lower.indexOf(ngWords[i]) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * タイムラインのノートをフィルタリングする。
 * Bot除外・自分除外・フォロワー限定除外・テキストクリーニング+NG判定。
 * @param {Object[]} notes ノート配列
 * @param {Object} config 設定オブジェクト
 * @returns {Object[]} フィルタ済みノート配列（cleanedText プロパティ付き）
 */
function filterTimelineNotes(notes, config) {
  if (!notes || notes.length === 0) return [];

  var ownUserId = config.OWN_USER_ID || '';
  var ngWords = loadNGWords(config);

  return notes.filter(function (note) {
    // Bot除外
    if (note.user && note.user.isBot) return false;
    // 自分除外
    if (note.user && note.user.id === ownUserId) return false;
    // フォロワー限定除外（public/home のみ通す）
    if (note.visibility && note.visibility !== 'public' && note.visibility !== 'home') return false;
    // テキストなし除外
    if (!note.text) return false;

    // テキストクリーニング + NG判定
    var cleaned = cleanNoteText(note.text);
    if (!cleaned) return false;
    if (containsNGWord(cleaned, ngWords)) return false;

    note.cleanedText = cleaned;
    return true;
  });
}

// --------------- LLMマルチプロバイダ ---------------

/**
 * 機能名に応じたプロバイダでLLMを呼び出す。
 * AI_PROVIDER=none またはプロバイダ未設定の場合は null を返す。
 * @param {string} functionName 'reply' | 'horoscope' | 'timeline_post' | 'poll'
 * @param {string} userPrompt ユーザープロンプト
 * @param {string} systemPrompt システムプロンプト
 * @returns {string|null} 生成テキスト。LLM無効/エラー時は null
 */
function callLLM(functionName, userPrompt, systemPrompt) {
  var config = getConfig();

  // プロバイダ解決: function_providers → デフォルト
  var fpKey = 'AI_FP_' + functionName.toUpperCase();
  var provider = config[fpKey] || config.AI_PROVIDER;

  if (!provider || provider === 'none') return null;

  // 日次制限チェック
  if (isAIDailyLimitReached(config)) return null;

  // 入力切り捨て
  var maxChars = parseInt(config.AI_INPUT_MAX_CHARS) || 2500;
  if (userPrompt && userPrompt.length > maxChars) {
    userPrompt = userPrompt.substring(0, maxChars);
  }

  try {
    var result;
    switch (provider) {
      case 'gemini':
        result = callGemini_(config, userPrompt, systemPrompt);
        break;
      case 'ollama':
        result = callOllama_(config, userPrompt, systemPrompt);
        break;
      case 'openrouter':
        result = callOpenRouter_(config, userPrompt, systemPrompt);
        break;
      default:
        return null;
    }
    incrementCounter('AI');
    return result;
  } catch (e) {
    logError('callLLM', provider + ': ' + e.message);
    return null;
  }
}

/**
 * Yahoo 日本語形態素解析 API V2 でテキストから名詞キーワードを抽出する。
 * ScriptProperties に YAHOO_CLIENT_ID が未設定の場合は null を返す。
 *
 * @param {string} text 解析対象テキスト
 * @returns {string[]|null} 名詞キーワード配列。失敗/未設定時は null
 */
function callYahooMA_(text) {
  var clientId = PropertiesService.getScriptProperties().getProperty('YAHOO_CLIENT_ID');
  if (!clientId) return null;

  // Yahoo API V2 の1リクエスト上限は 4KB。安全マージンを取り約1200文字で切る
  if (text.length > 1200) {
    text = text.substring(0, 1200);
  }

  var payload = {
    id: '1',
    jsonrpc: '2.0',
    method: 'jlp.maservice.parse',
    params: { q: text }
  };

  var url = 'https://jlp.yahooapis.jp/MAService/V2/parse?appid=' + encodeURIComponent(clientId);

  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    incrementCounter('URL_FETCH');

    var code = response.getResponseCode();
    if (code !== 200) {
      logError('callYahooMA_', 'HTTP ' + code + ': ' + response.getContentText().substring(0, 200));
      return null;
    }

    var result = JSON.parse(response.getContentText());
    if (result.error) {
      logError('callYahooMA_', 'API error: ' + JSON.stringify(result.error));
      return null;
    }

    // tokens: [表記, 読み, 基本形, 品詞, 品詞細分類, 活用型, 活用形]
    var keywords = [];
    var tokens = result.result.tokens;
    for (var i = 0; i < tokens.length; i++) {
      var surface = tokens[i][0]; // 表記
      var pos = tokens[i][3];     // 品詞
      var subPos = tokens[i][4];  // 品詞細分類

      if (pos === '名詞' && (subPos === '普通名詞' || subPos === '固有名詞')) {
        if (surface.length >= 2) {
          keywords.push(surface);
        }
      }
    }

    return keywords.length > 0 ? keywords : null;
  } catch (e) {
    logError('callYahooMA_', e.message);
    return null;
  }
}

/**
 * 正規表現ベースの簡易キーワード抽出（Yahoo API 不使用時/フォールバック）。
 * カタカナ語（2文字以上）と括弧内フレーズを抽出する。
 *
 * @param {string} text 解析対象テキスト（複数ノート結合済み）
 * @returns {string[]} キーワード配列（空配列の場合あり）
 */
function extractKeywordsSimple_(text) {
  if (!text) return [];

  var keywords = [];

  // カタカナ語（2文字以上、長音含む）
  var katakana = text.match(/[ァ-ヶー]{2,}/g);
  if (katakana) {
    for (var i = 0; i < katakana.length; i++) {
      keywords.push(katakana[i]);
    }
  }

  // 括弧内のフレーズ
  var quoted = text.match(/「([^」]+)」/g);
  if (quoted) {
    for (var j = 0; j < quoted.length; j++) {
      var inner = quoted[j].replace(/[「」]/g, '').trim();
      if (inner.length >= 2) {
        keywords.push(inner);
      }
    }
  }

  return keywords;
}

/**
 * TL連動投稿用のキーワード抽出。設定に応じて Yahoo API または簡易抽出を使う。
 * Yahoo API 失敗時は簡易抽出にフォールバックする。
 *
 * @param {string[]} cleanedTexts クリーニング済みノートテキストの配列
 * @param {Object} config 設定オブジェクト
 * @returns {string[]} 重複除去・NGフィルタ済みキーワード配列
 */
function extractTimelineKeywords_(cleanedTexts, config) {
  if (!cleanedTexts || cleanedTexts.length === 0) return [];

  var combined = cleanedTexts.join(' ');

  var rawKeywords = [];
  var source = String(config.TIMELINE_POST_KEYWORD_SOURCE || 'simple').toLowerCase();

  if (source === 'yahoo') {
    rawKeywords = callYahooMA_(combined);
    if (!rawKeywords || rawKeywords.length === 0) {
      if (config._forceTest) Logger.log('[TL keyword] Yahoo API 失敗/未設定 → 簡易抽出にフォールバック');
      rawKeywords = extractKeywordsSimple_(combined);
    } else {
      if (config._forceTest) Logger.log('[TL keyword] Yahoo API 使用: ' + rawKeywords.join(', '));
    }
  } else {
    if (config._forceTest) Logger.log('[TL keyword] 簡易抽出使用 (source=' + source + ')');
    rawKeywords = extractKeywordsSimple_(combined);
  }

  if (!rawKeywords || rawKeywords.length === 0) return [];

  // NGワードフィルタ
  var ngWords = loadNGWords(config);
  var filtered = [];
  for (var i = 0; i < rawKeywords.length; i++) {
    if (!containsNGWord(rawKeywords[i], ngWords)) {
      filtered.push(rawKeywords[i]);
    }
  }

  // 重複除去
  var unique = filtered.filter(function(v, idx, arr) {
    return arr.indexOf(v) === idx;
  });

  return unique;
}

/**
 * Gemini API (v1beta) を呼び出す。
 * @param {Object} config 設定オブジェクト
 * @param {string} userPrompt ユーザープロンプト
 * @param {string} systemPrompt システムプロンプト
 * @returns {string} 生成テキスト
 * @private
 */
function callGemini_(config, userPrompt, systemPrompt) {
  var model = config.AI_GEMINI_MODEL || 'gemini-2.5-flash-lite';
  var apiKey = config.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です');

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  var payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: parseFloat(config.AI_GEMINI_TEMPERATURE) || 1.0,
      maxOutputTokens: parseInt(config.AI_GEMINI_MAX_TOKENS) || 1024
    }
  };

  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  incrementCounter('URL_FETCH');

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Gemini HTTP ' + code + ': ' + response.getContentText());
  }

  var json = JSON.parse(response.getContentText());
  if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
    return json.candidates[0].content.parts[0].text;
  }

  throw new Error('Gemini: レスポンスからテキストを抽出できませんでした');
}

/**
 * OpenAI互換 API を呼び出す内部共通関数。
 * @param {string} url APIエンドポイント
 * @param {Object} headers リクエストヘッダー
 * @param {string} model モデル名
 * @param {number} temperature 温度
 * @param {number} maxTokens 最大トークン数
 * @param {string} userPrompt ユーザープロンプト
 * @param {string} systemPrompt システムプロンプト
 * @returns {string} 生成テキスト
 * @private
 */
function callOpenAICompatible_(url, headers, model, temperature, maxTokens, userPrompt, systemPrompt) {
  var messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  var payload = {
    model: model,
    messages: messages,
    temperature: temperature,
    max_tokens: maxTokens
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  incrementCounter('URL_FETCH');

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('HTTP ' + code + ': ' + response.getContentText());
  }

  var json = JSON.parse(response.getContentText());
  if (json.choices && json.choices[0] && json.choices[0].message) {
    return json.choices[0].message.content;
  }

  throw new Error('OpenAI互換API: レスポンスからテキストを抽出できませんでした');
}

/**
 * Ollama Cloud を呼び出す。
 * @param {Object} config 設定オブジェクト
 * @param {string} userPrompt ユーザープロンプト
 * @param {string} systemPrompt システムプロンプト
 * @returns {string} 生成テキスト
 * @private
 */
function callOllama_(config, userPrompt, systemPrompt) {
  var baseUrl = config.OLLAMA_BASE_URL || 'https://ollama.com';
  var url = baseUrl + '/api/chat';
  var headers = {};
  if (config.OLLAMA_API_KEY) {
    headers['Authorization'] = 'Bearer ' + config.OLLAMA_API_KEY;
  }

  var model = config.AI_OLLAMA_MODEL || 'gemini-3-flash-preview:cloud';
  var temperature = parseFloat(config.AI_OLLAMA_TEMPERATURE) || 0.8;
  var maxTokens = parseInt(config.AI_OLLAMA_NUM_PREDICT) || 1024;

  return callOpenAICompatible_(url, headers, model, temperature, maxTokens, userPrompt, systemPrompt);
}

/**
 * OpenRouter を呼び出す。
 * @param {Object} config 設定オブジェクト
 * @param {string} userPrompt ユーザープロンプト
 * @param {string} systemPrompt システムプロンプト
 * @returns {string} 生成テキスト
 * @private
 */
function callOpenRouter_(config, userPrompt, systemPrompt) {
  var url = 'https://openrouter.ai/api/v1/chat/completions';
  var apiKey = config.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY が未設定です');

  var headers = {
    'Authorization': 'Bearer ' + apiKey
  };

  var model = config.AI_OPENROUTER_MODEL || 'stepfun/step-3.5-flash:free';
  var temperature = parseFloat(config.AI_OPENROUTER_TEMPERATURE) || 1.0;
  var maxTokens = parseInt(config.AI_OPENROUTER_MAX_TOKENS) || 1024;

  return callOpenAICompatible_(url, headers, model, temperature, maxTokens, userPrompt, systemPrompt);
}
