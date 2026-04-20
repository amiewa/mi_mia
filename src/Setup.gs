/* ============================================================
 * Setup.gs — 初期設定・シート作成・メニュー・バリデーション
 * ============================================================ */

/**
 * スプレッドシートメニューを作成する。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('みあbot')
    .addItem('初期設定（シート作成）', 'setupSpreadsheet')
    .addItem('設定バリデーション', 'validateConfig')
    .addSeparator()
    .addItem('APIトークン管理', 'manageApiTokens')
    .addSeparator()
    .addItem('台詞の自動生成', 'showGenerateDialog')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('手動テスト実行')
      .addItem('ランダム投稿', 'testProcessRandomPost')
      .addItem('イベント投稿', 'testProcessEventPost')
      .addItem('曜日別投稿', 'testProcessWeekdayPost')
      .addItem('スケジュール投稿', 'testProcessScheduledPost')
      .addItem('TL連動投稿', 'testProcessTimelinePost')
      .addItem('投票投稿', 'testProcessPollPost')
      .addItem('リアクション', 'testProcessReaction')
      .addItem('星座占い', 'testProcessHoroscope')
      .addSeparator()
      .addItem('日次メンテナンス（強制実行）', 'testRunDailyMaintenance')
    )
    .addToUi();
}

// ============================================================
// テスト用ラッパー関数（手動実行・GASエディタから直接呼び出し可能）
// ============================================================

/** @returns {void} */
function testProcessRandomPost()    { processRandomPost(getConfig()); }
/** @returns {void} */
function testProcessEventPost()     { processEventPost(getConfig()); }
/** @returns {void} */
function testProcessWeekdayPost()   { processWeekdayPost(getConfig()); }
/** @returns {void} */
function testProcessScheduledPost() { processScheduledPost(getConfig()); }
/** @returns {void} */
function testProcessTimelinePost()  { var c = getConfig(); c._forceTest = true; processTimelinePost(c); }

/**
 * TL連動投稿（templateモード）のテスト。
 */
function testProcessTimelinePostTemplate() {
  var config = getConfig();
  config.TIMELINE_POST_MODE = 'template';
  config._forceTest = true;
  var result = processTimelinePost(config);
  Logger.log('TL連動投稿(template)テスト: ' + (result ? '投稿成功' : '投稿なし'));
}

/**
 * キーワード応答マッチングのテスト。
 */
function testKeywordReplyMatch() {
  var testText = 'おはよう';

  var r1 = matchKeywordReply_(testText, 1, null, {});
  Logger.log('rank1「' + testText + '」→ ' + (r1 || '(該当なし)'));

  var r2 = matchKeywordReply_(testText, 2, null, {});
  Logger.log('rank2「' + testText + '」→ ' + (r2 || '(該当なし)'));

  var r3 = matchKeywordReply_(testText, 3, null, {});
  Logger.log('rank3「' + testText + '」→ ' + (r3 || '(該当なし)'));

  var noMatch = matchKeywordReply_('あいうえお', 1, null, {});
  Logger.log('rank1「あいうえお」→ ' + (noMatch || '(該当なし)'));
}

/**
 * Yahoo形態素解析APIのテスト。
 */
function testYahooMA() {
  var result = callYahooMA_('今日はいい天気ですね。プログラミングを勉強しています。');
  if (result) {
    Logger.log('Yahoo API 抽出結果: ' + result.join(', '));
  } else {
    Logger.log('Yahoo API: 結果なし（YAHOO_CLIENT_ID 未設定 or API エラー）');
  }
}
/** @returns {void} */
function testProcessPollPost()      { var c = getConfig(); c._forceTest = true; processPollPost(c); }
/** @returns {void} */
function testProcessReaction()      { var c = getConfig(); c._forceTest = true; processReaction(c); }
/** @returns {void} */
function testProcessHoroscope()     { var c = getConfig(); c._forceTest = true; processHoroscope(c); }
/** 0時台チェックと実行済みチェックをスキップして日次メンテナンスを強制実行する。 */
function testRunDailyMaintenance()  { var c = getConfig(); c._forceTest = true; runDailyMaintenance(c); }

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
        ['MISSKEY_INSTANCE', '', 'MisskeyインスタンスURL (例: https://example.misskey.net)'],
        ['BOT_ACTIVE', 'FALSE', 'Bot有効化 (TRUE/FALSE)'],
        ['AI_PROVIDER', 'none', 'LLMプロバイダ (gemini/ollama/openrouter/none)'],
        ['AI_INPUT_MAX_CHARS', '2500', 'LLM入力最大文字数'],
        ['AI_DAILY_LIMIT', '100', 'LLM日次上限'],
        ['AI_GEMINI_MODEL', 'gemini-2.0-flash-lite', 'Geminiモデル'],
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
        ['AI_FP_AUTOGEN', '', '台詞自動生成用プロバイダ上書き'],
        ['POSTING_VISIBILITY', 'home', '投稿公開範囲 (public/home/followers)'],
        ['POSTING_NIGHT_START', '23', '夜間開始時刻'],
        ['POSTING_NIGHT_END', '6', '夜間終了時刻'],
        ['RANDOM_POST_ENABLED', 'TRUE', 'ランダム投稿'],
        ['RANDOM_POST_INTERVAL_HOURS', '4', 'ランダム投稿間隔（時間）'],
        ['RANDOM_POST_CHANCE', '30', 'ランダム投稿確率 (%)'],
        ['SCHEDULED_POST_ENABLED', 'TRUE', 'スケジュール投稿'],
        ['SCHEDULED_POST_CHANCE', '100', 'スケジュール投稿確率 (%)'],
        ['WEEKDAY_POST_ENABLED', 'TRUE', '曜日別投稿'],
        ['WEEKDAY_POST_CHANCE', '30', '曜日別投稿確率 (%)'],
        ['TIMELINE_POST_ENABLED', 'TRUE', 'TL連動投稿'],
        ['TIMELINE_POST_INTERVAL_HOURS', '6', 'TL連動投稿間隔（時間）'],
        ['TIMELINE_POST_TYPE', 'local', 'TL種別: local / home / hybrid / global'],
        ['TIMELINE_POST_CHANCE', '70', 'TL連動投稿確率 (%)'],
        ['HOROSCOPE_ENABLED', 'FALSE', '星座占い'],
        ['HOROSCOPE_HOUR', '7', '占い投稿時刻'],
        ['HOROSCOPE_USE_AI', 'FALSE', 'AI占い使用'],
        ['HOROSCOPE_MAX_CHARS', '500', '占い最大文字数'],
        ['POLL_ENABLED', 'TRUE', '投票投稿'],
        ['POLL_INTERVAL_HOURS', '12', '投票投稿間隔（時間）'],
        ['POLL_CHANCE', '50', '投票投稿確率 (%)'],
        ['POLL_EXPIRE_HOURS', '3', '投票締め切り時間（時間）'],
        ['POLL_TIMELINE_TYPE', 'local', '投票選択肢抽出用TL種別: local / home / hybrid / global'],
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
        ['NG_WORDS_EXTERNAL_URL', 'https://raw.githubusercontent.com/sayonari/goodBadWordlist/main/ja/BadList.txt', '外部NGワードリストのURL（1行1ワードのテキスト）'],
        ['MAINTENANCE_ENABLED', 'TRUE', '日次メンテナンス'],
        ['MAINTENANCE_CLEANUP_DAYS', '30', 'クリーンアップ日数'],
        ['MAINTENANCE_AUTO_DELETE_ENABLED', 'FALSE', '自動投稿削除'],
        ['MAINTENANCE_DELETE_INTERVAL_SECONDS', '2', '削除API間隔（秒）'],
        ['MAINTENANCE_DELETE_MAX_RETRIES', '3', '削除リトライ回数'],
        ['ERROR_NOTIFY_ENABLED', 'FALSE', 'エラーメール通知'],
        ['ERROR_NOTIFY_EMAIL', '', '通知先メールアドレス'],
        ['CONV_MAX_TURNS', '3', '会話履歴の保持ターン数 (0=無効)'],
        ['NICKNAME_ENABLED', 'TRUE', 'ニックネーム登録機能（「○○って呼んで」）'],
        ['NICKNAME_MAX_LENGTH', '20', 'ニックネームの最大文字数'],
        ['REPLY_MODE', 'no_ai', 'リプライモード: no_ai（キーワード応答のみ）/ ai（LLM優先）'],
        ['TIMELINE_POST_MODE', 'template', 'TL連動投稿モード: template / ai'],
        ['TIMELINE_POST_KEYWORD_SOURCE', 'simple', 'キーワード抽出方式: simple（正規表現）/ yahoo（Yahoo API）'],
        ['POLL_KEYWORD_SOURCE', 'simple', 'POLL用キーワード抽出方式: simple（正規表現）/ yahoo（Yahoo API）'],
        ['POLL_MODE', 'tl_word', 'POLL選択肢生成モード: tl_word / static / ai']
      ]
    },
    {
      name: SHEET.CHARACTER_SETTINGS,
      headers: ['項目', '設定'],
      defaultData: [
        ['キャラクタープロンプト', 'あなたは少女「みあ」一人称「あたし」マイペース,無頓着,好奇心はあるが浅い。敬語・句点・絵文字不使用。語尾は柔らかくゆるい。6月2日生まれのふたご座。'],
        ['呼び名登録', '{nickname}って呼べばいいんだね！ わかった〜'],
        ['呼び名リセット', 'わかった、元の呼び方に戻すね〜'],
        ['呼び名NG', 'ん〜、その名前はちょっと… 別のにしてほしいな〜']
      ]
    },
    {
      name: SHEET.SCHEDULED_POST,
      headers: ['時間帯', '投稿内容'],
      defaultData: [
        ['07', 'おはよ～'],
        ['07', '朝だ～ 今日もなんとかなるかな'],
        ['12', 'お昼にしよ～'],
        ['21', 'もう夜だ　時間経つの早すぎ'],
        ['23', 'そろそろ寝る時間かな～']
      ]
    },
    {
      name: SHEET.RANDOM_POST,
      headers: ['投稿内容'],
      defaultData: [
        ['ふと思ったんだけど　あたしってなんで存在してるんだろ'],
        ['眠い　でも寝たくない　でも眠い'],
        ['なんかいいこと起きそうな予感　根拠はない'],
        ['ごはん食べたい　なにがいいかな'],
        ['今日も一日おつかれ～']
      ]
    },
    {
      name: SHEET.WEEKDAY,
      headers: ['時刻', '曜日', '投稿内容'],
      defaultData: [
        ['20', 'SUN', 'もうすぐ日曜日が終わるよ～'],
        ['08', 'MON', '月曜日～　なんとか起きたよ'],
        ['12', 'WED', '週の半分きたよ　まだ半分あるけど'],
        ['17', 'FRI', 'やっと週末　今週なにもしてないけど～'],
        ['10', 'SAT', '土曜日ってだけでなんかいい気がする']
      ]
    },
    {
      name: SHEET.EVENT,
      headers: ['日付(MM/dd)', 'イベント名', '投稿内容', '投稿済み']
    },
    {
      name: SHEET.POLL,
      headers: ['質問文', '接頭辞(Prefix)', 'アイテム'],
      defaultData: [
        ['今日のごほうびスイーツは？',   '世界一の',     'ミルクレープ'],
        ['一番幸せを感じる甘いものは？', 'とろける',     'ティラミス'],
        ['今すぐ食べたいのは？',         '魔法の',       'モンブラン'],
        ['カフェで頼むなら？',           'ふわふわの',   'ショートケーキ'],
        ['差し入れにもらって嬉しいのは？', '禁断の',     'マカロン'],
        ['夜中にこっそり食べたいのは？', '至高の',       'シュークリーム'],
        ['季節限定で気になるのは？',     '伝説の',       'パンケーキ'],
        ['雨の日に食べたくなるのは？',   '罪深い',       'クロワッサン'],
        ['友達とシェアしたいのは？',     'ご褒美の',     'プリン'],
        ['お祝いの日に欲しいのは？',     '限定の',       'タルト'],
        ['コンビニで思わず手が伸びるのは？', '黄金の',   'クッキー'],
        ['疲れた時に救われるのは？',     '究極の',       'パフェ'],
        ['朝食に出てきたら嬉しいのは？', '神レベルの',   'ドーナツ'],
        ['手土産に持っていくなら？',     '幻の',         'ロールケーキ'],
        ['一生に一度の贅沢なら？',       '天使の',       'チョコレート'],
        ['クリスマスに食べたいのは？',   '悪魔的な',     'アイスクリーム']
      ]
    },
    {
      name: SHEET.REACTION,
      headers: ['キーワード', 'リアクション候補1', 'リアクション候補2'],
      defaultData: [
        ['おはよう', '🌅', '🐔'],
        ['おやすみ', '💤', '🌙'],
        ['ありがとう', '🙏', '😊'],
        ['かわいい', '❤️', '🥺'],
        ['えらい', '👏', '✨']
      ]
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
      headers: ['UserId', '最終会話日時', '総会話数', 'ニックネーム']
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

  // --- キーワード応答シート（v2.6.0）---
  if (!SS.getSheetByName(SHEET.KEYWORD_REPLY)) {
    var kwSheet = SS.insertSheet(SHEET.KEYWORD_REPLY);
    kwSheet.getRange('A1:C1').setValues([['キーワード', '親愛度', 'メッセージ']]);
    kwSheet.getRange('A1:C1').setFontWeight('bold');
    kwSheet.setFrozenRows(1);

    var sampleData = [
      ['おはよう', 1, 'おはよ～'],
      ['おはよう', 2, '{name} おはよ～'],
      ['おはよう', 3, 'おはよ～{name} よく眠れた～？'],
      ['おやすみ', 1, 'おやすみ～'],
      ['おやすみ', 2, '{name} おやすみ～'],
      ['おやすみ', 3, 'おやすみ～{name} いい夢見てね～'],
      ['ありがとう', 1, 'えへへ～'],
      ['ありがとう', 2, '{name} どういたしまして～'],
      ['かわいい', 1, 'えっ……ほんと～？'],
      ['かわいい', 2, '{name}もかわいい～'],
      ['すき', 1, 'え～照れる～'],
      ['すき', 2, 'あたしも{name}のことすき～'],
      ['つらい', 1, '大丈夫～？'],
      ['つらい', 2, '{name} 無理しないでね～'],
      ['ひま', 1, 'あたしもひま～'],
      ['たすけて', 1, 'どうしたの～？']
    ];
    kwSheet.getRange(2, 1, sampleData.length, 3).setValues(sampleData);
    kwSheet.setColumnWidth(1, 120);
    kwSheet.setColumnWidth(2, 70);
    kwSheet.setColumnWidth(3, 300);
    created++;
  } else {
    skipped++;
  }

  // --- v2.6.0 新規設定キーを既存 CONFIG シートに追記（アップグレード対応）---
  var configSheet = SS.getSheetByName(SHEET.CONFIG);
  if (configSheet && configSheet.getLastRow() >= 2) {
    var existingKeys = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 1).getValues()
      .map(function(row) { return String(row[0]).trim(); });
    var newSettings = [
      ['REPLY_MODE', 'no_ai', 'リプライモード: no_ai（キーワード応答のみ）/ ai（LLM優先）'],
      ['TIMELINE_POST_MODE', 'template', 'TL連動投稿モード: template / ai'],
      ['TIMELINE_POST_KEYWORD_SOURCE', 'simple', 'キーワード抽出方式: simple（正規表現）/ yahoo（Yahoo API）'],
      ['POLL_KEYWORD_SOURCE', 'simple', 'POLL用キーワード抽出方式: simple（正規表現）/ yahoo（Yahoo API）'],
      ['POLL_MODE', 'tl_word', 'POLL選択肢生成モード: tl_word / static / ai'],
      ['AI_FP_AUTOGEN', '', '台詞自動生成用プロバイダ上書き']
    ];
    for (var ns = 0; ns < newSettings.length; ns++) {
      if (existingKeys.indexOf(newSettings[ns][0]) === -1) {
        configSheet.appendRow(newSettings[ns]);
      }
    }
  }

  // --- TL連動テンプレートをキャラクター設定シートに追加（T9: v2.6.0）---
  var charSheet = SS.getSheetByName(SHEET.CHARACTER_SETTINGS);
  if (charSheet) {
    var charData = charSheet.getLastRow() >= 2
      ? charSheet.getRange(2, 1, charSheet.getLastRow() - 1, 1).getValues()
      : [];
    var existingCharKeys = charData.map(function(row) { return String(row[0]).trim(); });

    if (existingCharKeys.indexOf('TL連動テンプレート') === -1) {
      charSheet.appendRow([
        'TL連動テンプレート',
        '{keyword}……　きになる～\n{keyword}かあ……　ん～なんだろ\n{keyword}ってみんな言ってる～\nTLに{keyword}がいっぱい～'
      ]);
    }
  }

  // --- 投票質問文シートに C 列「アイテム」を追加（v2.7.0 マイグレーション）---
  var pollSheet = SS.getSheetByName(SHEET.POLL);
  if (pollSheet) {
    var pollHeaders = pollSheet.getRange(1, 1, 1, pollSheet.getLastColumn()).getValues()[0];
    if (pollHeaders.length < 3 || String(pollHeaders[2]).trim() === '') {
      pollSheet.getRange(1, 3).setValue('アイテム');
      pollSheet.getRange(1, 3).setFontWeight('bold');
    }
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
  var fpKeys = ['AI_FP_REPLY', 'AI_FP_HOROSCOPE', 'AI_FP_TIMELINE_POST', 'AI_FP_POLL', 'AI_FP_AUTOGEN'];
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
    'RANDOM_POST_INTERVAL_HOURS', 'RANDOM_POST_CHANCE',
    'SCHEDULED_POST_CHANCE', 'WEEKDAY_POST_CHANCE',
    'TIMELINE_POST_INTERVAL_HOURS', 'TIMELINE_POST_CHANCE',
    'HOROSCOPE_HOUR', 'HOROSCOPE_MAX_CHARS',
    'POLL_INTERVAL_HOURS', 'POLL_CHANCE', 'POLL_EXPIRE_HOURS',
    'REACTION_RECENCY_MINUTES',
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

  // --- v2.6.0 追加チェック ---

  var replyMode = String(config.REPLY_MODE || 'no_ai').toLowerCase();
  if (replyMode !== 'no_ai' && replyMode !== 'ai') {
    errors.push('REPLY_MODE は "no_ai" または "ai" を指定してください（現在: ' + config.REPLY_MODE + '）');
  }
  if (replyMode === 'ai' && (!config.AI_PROVIDER || config.AI_PROVIDER === 'none')) {
    warnings.push('REPLY_MODE=ai ですが AI_PROVIDER=none です。キーワード応答→定型文にフォールバックします');
  }

  var tlMode = String(config.TIMELINE_POST_MODE || 'template').toLowerCase();
  if (tlMode !== 'template' && tlMode !== 'ai') {
    errors.push('TIMELINE_POST_MODE は "template" または "ai" を指定してください（現在: ' + config.TIMELINE_POST_MODE + '）');
  }
  if (tlMode === 'ai' && (!config.AI_PROVIDER || config.AI_PROVIDER === 'none')) {
    warnings.push('TIMELINE_POST_MODE=ai ですが AI_PROVIDER=none です。TL連動投稿はランダム投稿にフォールバックします');
  }

  if (tlMode === 'template') {
    var tlTemplate = getCharacterSetting_('TL連動テンプレート');
    if (!tlTemplate) {
      errors.push('TIMELINE_POST_MODE=template ですが、キャラクター設定シートに「TL連動テンプレート」が未設定です');
    } else if (tlTemplate.indexOf('{keyword}') === -1) {
      errors.push('TL連動テンプレートに {keyword} プレースホルダーが含まれていません');
    }
  }

  var kwSource = String(config.TIMELINE_POST_KEYWORD_SOURCE || 'simple').toLowerCase();
  if (kwSource !== 'simple' && kwSource !== 'yahoo') {
    errors.push('TIMELINE_POST_KEYWORD_SOURCE は "simple" または "yahoo" を指定してください');
  }
  if (kwSource === 'yahoo') {
    var yahooId = PropertiesService.getScriptProperties().getProperty('YAHOO_CLIENT_ID');
    if (!yahooId) {
      errors.push('TIMELINE_POST_KEYWORD_SOURCE=yahoo ですが ScriptProperties に YAHOO_CLIENT_ID が未設定です');
    }
  }

  var pollKwSource = String(config.POLL_KEYWORD_SOURCE || 'simple').toLowerCase();
  if (pollKwSource !== 'simple' && pollKwSource !== 'yahoo') {
    errors.push('POLL_KEYWORD_SOURCE は "simple" または "yahoo" を指定してください');
  }
  if (pollKwSource === 'yahoo') {
    var yahooIdPoll = PropertiesService.getScriptProperties().getProperty('YAHOO_CLIENT_ID');
    if (!yahooIdPoll) {
      errors.push('POLL_KEYWORD_SOURCE=yahoo ですが ScriptProperties に YAHOO_CLIENT_ID が未設定です');
    }
  }

  // --- v2.7.0 追加チェック ---

  var pollMode = String(config.POLL_MODE || 'tl_word').toLowerCase();
  if (pollMode !== 'tl_word' && pollMode !== 'static' && pollMode !== 'ai') {
    errors.push('POLL_MODE は "tl_word", "static", "ai" のいずれかを指定してください（現在: ' + config.POLL_MODE + '）');
  }
  if (pollMode === 'ai' && (!config.AI_PROVIDER || config.AI_PROVIDER === 'none')) {
    warnings.push('POLL_MODE=ai ですが AI_PROVIDER=none です。static にフォールバックします');
  }
  if (pollMode === 'static' || pollMode === 'ai') {
    var pollSheetCheck = SS.getSheetByName(SHEET.POLL);
    if (pollSheetCheck) {
      var pollLastRow = pollSheetCheck.getLastRow();
      var hasStaticItems = false;
      if (pollLastRow >= 2) {
        var pollColC = pollSheetCheck.getRange(2, 3, pollLastRow - 1, 1).getValues();
        hasStaticItems = pollColC.some(function(r) { return String(r[0]).trim() !== ''; });
      }
      if (!hasStaticItems) {
        errors.push('POLL_MODE=' + pollMode + ' ですが 投票質問文シートの C 列（アイテム）が空です');
      }
    }
  }

  if (!SS.getSheetByName(SHEET.KEYWORD_REPLY)) {
    warnings.push('キーワード応答シートが見つかりません。メニューから「初期セットアップ」を実行してください');
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

/**
 * APIトークン・シークレットキーをスプレッドシートUIから管理する。
 * 実際の値はダイアログ・トースト・ログに一切表示しない。
 */
function manageApiTokens() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var secretKeys = [
    'MISSKEY_TOKEN',
    'GEMINI_API_KEY',
    'OLLAMA_BASE_URL',
    'OLLAMA_API_KEY',
    'OPENROUTER_API_KEY',
    'OWN_USER_ID',
    'YAHOO_CLIENT_ID'
  ];

  // 設定状況を確認してメニュー文字列を構築
  var lines = ['変更したいキーの番号を入力してください。\n空欄でOKを押すとキャンセルします。\n'];
  for (var i = 0; i < secretKeys.length; i++) {
    var status = props.getProperty(secretKeys[i]) ? '設定済み' : '未設定';
    lines.push((i + 1) + '. ' + secretKeys[i] + '  [' + status + ']');
  }

  var listPrompt = ui.prompt('APIトークン管理', lines.join('\n'), ui.ButtonSet.OK_CANCEL);
  if (listPrompt.getSelectedButton() !== ui.Button.OK) return;

  var input = listPrompt.getResponseText().trim();
  if (!input) return;

  var num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > secretKeys.length) {
    ui.alert('無効な番号です。操作をキャンセルしました。');
    return;
  }

  var targetKey = secretKeys[num - 1];

  var valuePrompt = ui.prompt(
    'APIトークン管理',
    targetKey + ' の新しい値を入力してください。\n空欄のままOKを押すと現在の値をクリアします。',
    ui.ButtonSet.OK_CANCEL
  );
  if (valuePrompt.getSelectedButton() !== ui.Button.OK) return;

  var newValue = valuePrompt.getResponseText().trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (newValue === '') {
    props.deleteProperty(targetKey);
    CacheService.getScriptCache().remove('config_cache');
    ss.toast(targetKey + ' をクリアしました', 'APIトークン管理');
  } else {
    props.setProperty(targetKey, newValue);
    CacheService.getScriptCache().remove('config_cache');
    ss.toast(targetKey + ' を更新しました', 'APIトークン管理');
  }
}
