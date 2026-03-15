/* ============================================================
 * Setup.gs — 初期設定・シート作成・メニュー・バリデーション
 * ============================================================ */

/**
 * スプレッドシートメニューを作成する。
 */
function onOpen() {
  var ui = SpreadsheetApp.getActiveSpreadsheet();
  ui.addMenu('みあbot', [
    { name: '初期設定（シート作成）', functionName: 'setupSpreadsheet' },
    { name: '設定バリデーション', functionName: 'validateConfig' }
  ]);
}

/**
 * 15シートを作成する（冪等: 既存シートはスキップ）。
 * ヘッダー行とデフォルト値を設定する。
 */
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // シート定義: { name, headers, defaultData? }
  var sheetDefs = [
    {
      name: SHEET.CONFIG,
      headers: ['Key', 'Value', '説明'],
      defaultData: [
        ['MISSKEY_INSTANCE', '', 'MisskeyインスタンスURL (例: https://misskey.io)'],
        ['BOT_ACTIVE', 'FALSE', 'Bot有効化 (TRUE/FALSE)'],
        ['AI_PROVIDER', 'none', 'LLMプロバイダ (gemini/ollama/openrouter/none)'],
        ['AI_INPUT_MAX_CHARS', '2500', 'LLM入力最大文字数'],
        ['AI_DAILY_LIMIT', '50', 'LLM日次上限'],
        ['AI_GEMINI_MODEL', 'gemini-2.5-flash-lite', 'Geminiモデル'],
        ['AI_GEMINI_TEMPERATURE', '1.0', 'Gemini温度'],
        ['AI_GEMINI_MAX_TOKENS', '1024', 'Gemini最大トークン'],
        ['AI_OLLAMA_MODEL', 'gemini-3-flash-preview:cloud', 'Ollamaモデル'],
        ['AI_OLLAMA_TEMPERATURE', '0.8', 'Ollama温度'],
        ['AI_OLLAMA_NUM_PREDICT', '1024', 'Ollama最大トークン'],
        ['AI_OPENROUTER_MODEL', 'stepfun/step-3.5-flash:free', 'OpenRouterモデル'],
        ['AI_OPENROUTER_TEMPERATURE', '1.0', 'OpenRouter温度'],
        ['AI_OPENROUTER_MAX_TOKENS', '1024', 'OpenRouter最大トークン'],
        ['AI_FP_REPLY', '', '返信用プロバイダ上書き'],
        ['AI_FP_HOROSCOPE', '', '占い用プロバイダ上書き'],
        ['AI_FP_TIMELINE_POST', '', 'TL連動投稿用プロバイダ上書き'],
        ['AI_FP_POLL', '', '投票用プロバイダ上書き'],
        ['POSTING_VISIBILITY', 'home', '投稿公開範囲 (public/home/followers)'],
        ['POSTING_NIGHT_START', '23', '夜間開始時刻'],
        ['POSTING_NIGHT_END', '6', '夜間終了時刻'],
        ['RANDOM_POST_ENABLED', 'TRUE', 'ランダム投稿'],
        ['RANDOM_POST_INTERVAL_HOURS', '4', 'ランダム投稿間隔（時間）'],
        ['SCHEDULED_POST_ENABLED', 'TRUE', 'スケジュール投稿'],
        ['SCHEDULED_POST_CHANCE', '100', 'スケジュール投稿確率 (%)'],
        ['WEEKDAY_POST_ENABLED', 'TRUE', '曜日別投稿'],
        ['WEEKDAY_POST_CHANCE', '30', '曜日別投稿確率 (%)'],
        ['TIMELINE_POST_ENABLED', 'TRUE', 'TL連動投稿'],
        ['TIMELINE_POST_INTERVAL_HOURS', '6', 'TL連動投稿間隔（時間）'],
        ['TIMELINE_POST_TYPE', 'local', 'TL種別 (local/home/hybrid)'],
        ['HOROSCOPE_ENABLED', 'FALSE', '星座占い'],
        ['HOROSCOPE_HOUR', '7', '占い投稿時刻'],
        ['HOROSCOPE_USE_AI', 'FALSE', 'AI占い使用'],
        ['HOROSCOPE_MAX_CHARS', '500', '占い最大文字数'],
        ['POLL_ENABLED', 'TRUE', '投票投稿'],
        ['POLL_INTERVAL_HOURS', '12', '投票投稿間隔（時間）'],
        ['EVENT_POST_ENABLED', 'TRUE', 'イベント投稿'],
        ['REACTION_ENABLED', 'TRUE', 'リアクション'],
        ['REACTION_MUTUAL_ONLY', 'TRUE', '相互フォローのみリアクション'],
        ['REACTION_RECENCY_MINUTES', '30', 'リアクション対象の最新分数'],
        ['FOLLOW_AUTO_FOLLOW_BACK', 'TRUE', '自動フォローバック'],
        ['FOLLOW_AUTO_UNFOLLOW_BACK', 'FALSE', 'フォロー自動解除'],
        ['FOLLOW_UNFOLLOW_GRACE_CYCLES', '2', 'フォロー解除猶予サイクル'],
        ['FOLLOW_KEYWORD_ENABLED', 'TRUE', 'キーワードフォローバック'],
        ['FOLLOW_KEYWORDS', 'フォローして,followして,相互フォロー', 'フォローキーワード（カンマ区切り）'],
        ['REPLY_ENABLED', 'TRUE', 'メンション返信'],
        ['REPLY_MUTUAL_ONLY', 'TRUE', '相互フォローのみ返信'],
        ['REPLY_MAX_PER_USER_PER_DAY', '10', '1ユーザーあたりの日次返信上限'],
        ['AFFINITY_ENABLED', 'TRUE', '好感度システム'],
        ['AFFINITY_RANK2_THRESHOLD', '5', '好感度ランク2閾値'],
        ['AFFINITY_RANK3_THRESHOLD', '20', '好感度ランク3閾値'],
        ['NG_WORDS_MATCH_MODE', 'substring', 'NGワード照合方式'],
        ['NG_WORDS_EXTERNAL_URL', '', '外部NGワードリストURL'],
        ['MAINTENANCE_ENABLED', 'TRUE', '日次メンテナンス'],
        ['MAINTENANCE_CLEANUP_DAYS', '30', 'クリーンアップ日数'],
        ['MAINTENANCE_AUTO_DELETE_ENABLED', 'FALSE', '自動投稿削除'],
        ['MAINTENANCE_DELETE_INTERVAL_SECONDS', '2', '削除API間隔（秒）'],
        ['MAINTENANCE_DELETE_MAX_RETRIES', '3', '削除リトライ回数'],
        ['ERROR_NOTIFY_ENABLED', 'FALSE', 'エラーメール通知'],
        ['ERROR_NOTIFY_EMAIL', '', '通知先メールアドレス']
      ]
    },
    {
      name: SHEET.CHARACTER_PROMPT,
      headers: ['System Prompt', '説明'],
      defaultData: [
        [
          'あなたは少女「みあ」一人称「あたし」マイペース,無頓着,好奇心はあるが浅い。敬語・句点・絵文字不使用。語尾は柔らかくゆるい。6月2日生まれのふたご座。',
          'メインキャラクタープロンプト'
        ]
      ]
    },
    {
      name: SHEET.SCHEDULED_POST,
      headers: ['時間帯', 'メモ', '投稿内容']
    },
    {
      name: SHEET.RANDOM_POST,
      headers: ['投稿内容']
    },
    {
      name: SHEET.WEEKDAY,
      headers: ['時刻', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    },
    {
      name: SHEET.EVENT,
      headers: ['日付(MM/dd)', 'イベント名', '投稿内容', '投稿済み']
    },
    {
      name: SHEET.POLL,
      headers: ['質問文', '接頭辞(Prefix)']
    },
    {
      name: SHEET.REACTION,
      headers: ['キーワード', 'リアクション候補1', 'リアクション候補2']
    },
    {
      name: SHEET.FALLBACK,
      headers: ['定型返信'],
      defaultData: [
        ['ん〜？ちょっとわかんない〜'],
        ['へぇ〜そうなんだ〜'],
        ['ん〜まあいっか〜'],
        ['あ〜それね〜'],
        ['ふーん〜'],
        ['え〜なにそれ〜'],
        ['あはは〜']
      ]
    },
    {
      name: SHEET.NG_WORDS,
      headers: ['NGワード']
    },
    {
      name: SHEET.USER_MGMT,
      headers: ['UserId', '最終会話日時', '総会話数']
    },
    {
      name: SHEET.DASHBOARD,
      headers: ['日付', '投稿数', '返信数', 'リアクション数', 'フォローバック数', 'AI数', 'エラー数', 'URL Fetch概算', 'アンフォロー数']
    },
    {
      name: SHEET.ERROR_LOG,
      headers: ['日時', '関数名', 'エラー内容']
    },
    {
      name: SHEET.POST_HISTORY,
      headers: ['noteId', '投稿日時', '投稿種別']
    },
    {
      name: SHEET.FOLLOW_MGMT,
      headers: ['userId', 'username', 'isFollower', 'iAmFollowing', 'missingCount', 'updatedAt']
    }
  ];

  var created = 0;
  var skipped = 0;

  for (var i = 0; i < sheetDefs.length; i++) {
    var def = sheetDefs[i];
    var existing = ss.getSheetByName(def.name);

    if (existing) {
      skipped++;
      continue;
    }

    var sheet = ss.insertSheet(def.name);

    // ヘッダー行
    if (def.headers) {
      sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      // ヘッダー行を太字に
      sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
      // 1行目を固定
      sheet.setFrozenRows(1);
    }

    // デフォルトデータ
    if (def.defaultData && def.defaultData.length > 0) {
      sheet.getRange(2, 1, def.defaultData.length, def.defaultData[0].length)
        .setValues(def.defaultData);
    }

    created++;
  }

  // OWN_USER_ID を自動取得（MISSKEY_TOKEN が設定済みの場合）
  try {
    var config = getConfig();
    if (config.MISSKEY_TOKEN && config.MISSKEY_INSTANCE && !config.OWN_USER_ID) {
      var me = callMisskeyApi('i', {});
      if (me && me.id) {
        PropertiesService.getScriptProperties().setProperty('OWN_USER_ID', me.id);
      }
    }
  } catch (e) {
    Logger.log('[setupSpreadsheet] OWN_USER_ID 自動取得スキップ: ' + e.message);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '作成: ' + created + ' シート / スキップ: ' + skipped + ' シート',
    '初期設定完了'
  );
}

/**
 * 設定バリデーションを実行し、結果をダイアログで表示する。
 */
function validateConfig() {
  var config = getConfig();
  var errors = [];
  var warnings = [];

  // 必須キー
  if (!config.MISSKEY_INSTANCE) {
    errors.push('MISSKEY_INSTANCE が未設定です');
  }
  if (!config.MISSKEY_TOKEN) {
    errors.push('MISSKEY_TOKEN が ScriptProperties に未設定です');
  }

  // AI_PROVIDER の有効値チェック
  var validProviders = ['none', 'gemini', 'ollama', 'openrouter', ''];
  if (validProviders.indexOf(config.AI_PROVIDER) === -1) {
    errors.push('AI_PROVIDER の値が無効です: ' + config.AI_PROVIDER);
  }

  // プロバイダ別の必須キー
  if (config.AI_PROVIDER === 'gemini' && !config.GEMINI_API_KEY) {
    errors.push('AI_PROVIDER=gemini ですが GEMINI_API_KEY が未設定です');
  }
  if (config.AI_PROVIDER === 'ollama' && !config.OLLAMA_API_KEY) {
    warnings.push('AI_PROVIDER=ollama ですが OLLAMA_API_KEY が未設定です（不要な場合もあります）');
  }
  if (config.AI_PROVIDER === 'openrouter' && !config.OPENROUTER_API_KEY) {
    errors.push('AI_PROVIDER=openrouter ですが OPENROUTER_API_KEY が未設定です');
  }

  // function_providers の有効値チェック
  var fpKeys = ['AI_FP_REPLY', 'AI_FP_HOROSCOPE', 'AI_FP_TIMELINE_POST', 'AI_FP_POLL'];
  for (var i = 0; i < fpKeys.length; i++) {
    var val = config[fpKeys[i]];
    if (val && validProviders.indexOf(val) === -1) {
      errors.push(fpKeys[i] + ' の値が無効です: ' + val);
    }
  }

  // 数値型チェック
  var numericKeys = [
    'AI_INPUT_MAX_CHARS', 'AI_DAILY_LIMIT',
    'AI_GEMINI_TEMPERATURE', 'AI_GEMINI_MAX_TOKENS',
    'AI_OLLAMA_TEMPERATURE', 'AI_OLLAMA_NUM_PREDICT',
    'AI_OPENROUTER_TEMPERATURE', 'AI_OPENROUTER_MAX_TOKENS',
    'POSTING_NIGHT_START', 'POSTING_NIGHT_END',
    'RANDOM_POST_INTERVAL_HOURS', 'SCHEDULED_POST_CHANCE',
    'WEEKDAY_POST_CHANCE', 'TIMELINE_POST_INTERVAL_HOURS',
    'HOROSCOPE_HOUR', 'HOROSCOPE_MAX_CHARS',
    'POLL_INTERVAL_HOURS', 'REACTION_RECENCY_MINUTES',
    'FOLLOW_UNFOLLOW_GRACE_CYCLES',
    'REPLY_MAX_PER_USER_PER_DAY',
    'AFFINITY_RANK2_THRESHOLD', 'AFFINITY_RANK3_THRESHOLD',
    'MAINTENANCE_CLEANUP_DAYS',
    'MAINTENANCE_DELETE_INTERVAL_SECONDS', 'MAINTENANCE_DELETE_MAX_RETRIES'
  ];
  for (var j = 0; j < numericKeys.length; j++) {
    var k = numericKeys[j];
    if (config[k] && isNaN(Number(config[k]))) {
      errors.push(k + ' が数値ではありません: ' + config[k]);
    }
  }

  // OWN_USER_ID チェック
  if (!config.OWN_USER_ID) {
    warnings.push('OWN_USER_ID が未設定です（初期設定を実行すると自動取得されます）');
  }

  // 結果表示
  var msg = '';
  if (errors.length === 0 && warnings.length === 0) {
    msg = '設定に問題はありません。';
  } else {
    if (errors.length > 0) {
      msg += '【エラー】\n' + errors.join('\n') + '\n\n';
    }
    if (warnings.length > 0) {
      msg += '【警告】\n' + warnings.join('\n');
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'バリデーション結果', 10);
  Logger.log('[validateConfig] ' + msg);
}
