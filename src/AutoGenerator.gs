/* ============================================================
 * AutoGenerator.gs — AI を使ったシート別台詞自動生成
 * ============================================================ */

/**
 * 台詞自動生成のメインダイアログ。
 * シートを選択し、必要に応じて追加設定（曜日・件数・対象列）を入力後、生成を実行する。
 */
function showGenerateDialog() {
  var ui = SpreadsheetApp.getUi();
  var config = getConfig();

  if (!config.AI_PROVIDER || config.AI_PROVIDER === 'none') {
    ui.alert('エラー', 'AI_PROVIDER が "none" に設定されているため台詞を生成できません。\n設定シートで AI_PROVIDER を設定してください。', ui.ButtonSet.OK);
    return;
  }

  // 1. シート選択
  var sheetRes = ui.prompt(
    '台詞の自動生成',
    '生成するシートを選んでください（半角数字）。\n\n1: スケジュール投稿\n2: ランダム投稿\n3: 曜日別\n4: イベント\n5: 投票質問文\n6: フォールバック定型文',
    ui.ButtonSet.OK_CANCEL
  );
  if (sheetRes.getSelectedButton() !== ui.Button.OK) return;
  var target = sheetRes.getResponseText().trim();
  if (['1', '2', '3', '4', '5', '6'].indexOf(target) === -1) {
    ui.alert('エラー', '1〜6の数字を入力してください。', ui.ButtonSet.OK);
    return;
  }

  // 2. シート別追加質問
  var pollColumn = null;  // 'questions' | 'items'
  var dayCode = null;

  if (target === '5') {
    var colRes = ui.prompt(
      '投票質問文 — 生成対象',
      '生成する対象を選んでください（半角数字）。\n\n1: 質問文 + Prefix（A・B 列）\n2: アイテム（C 列）',
      ui.ButtonSet.OK_CANCEL
    );
    if (colRes.getSelectedButton() !== ui.Button.OK) return;
    pollColumn = colRes.getResponseText().trim() === '1' ? 'questions' : 'items';
  }

  if (target === '3') {
    var dayRes = ui.prompt(
      '曜日別 — 生成する曜日',
      '曜日を英字 3 文字で入力してください。\n\nSUN / MON / TUE / WED / THU / FRI / SAT',
      ui.ButtonSet.OK_CANCEL
    );
    if (dayRes.getSelectedButton() !== ui.Button.OK) return;
    dayCode = dayRes.getResponseText().trim().toUpperCase();
    if (['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].indexOf(dayCode) === -1) {
      ui.alert('エラー', '有効な曜日コードを入力してください（SUN〜SAT）。', ui.ButtonSet.OK);
      return;
    }
  }

  // 3. 件数質問（スケジュール投稿・曜日別は固定24件のためスキップ）
  var count = 10;
  if (target !== '1' && target !== '3') {
    var countRes = ui.prompt(
      '生成件数',
      '生成する件数を入力してください（5〜30、既定値: 10）。',
      ui.ButtonSet.OK_CANCEL
    );
    if (countRes.getSelectedButton() !== ui.Button.OK) return;
    var countInput = parseInt(countRes.getResponseText().trim(), 10);
    if (isNaN(countInput) || countInput < 5 || countInput > 30) {
      ui.alert('エラー', '5〜30 の数字を入力してください。', ui.ButtonSet.OK);
      return;
    }
    count = countInput;
  }

  // 4. クリア / 追加
  var modeRes = ui.prompt(
    '生成モード',
    '既存の台詞をどうしますか？ 半角英字で入力してください。\n\nC: クリアして生成\nA: 現在のリストに追加',
    ui.ButtonSet.OK_CANCEL
  );
  if (modeRes.getSelectedButton() !== ui.Button.OK) return;
  var mode = modeRes.getResponseText().trim().toUpperCase() === 'C' ? 'CLEAR' : 'APPEND';

  // 5. キャラクタープロンプト取得
  var charPrompt = getCharacterPrompt_();
  if (!charPrompt) {
    ui.alert('エラー', 'キャラクター設定シートに「キャラクタープロンプト」が設定されていません。', ui.ButtonSet.OK);
    return;
  }

  ui.alert('確認', '生成を開始します。APIの制限のため完了まで少し時間がかかる場合があります。\n「完了」が表示されるまでお待ちください。', ui.ButtonSet.OK);

  // 6. 生成実行
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (target) {
      case '1': generateSchedule_(ss, charPrompt, mode); break;
      case '2': generateRandom_(ss, charPrompt, mode, count); break;
      case '3': generateWeekly_(ss, charPrompt, mode, dayCode); break;
      case '4': generateEvent_(ss, charPrompt, mode, count); break;
      case '5':
        if (pollColumn === 'questions') generatePollQuestions_(ss, charPrompt, mode, count);
        else generatePollItems_(ss, charPrompt, mode, count);
        break;
      case '6': generateFallback_(ss, charPrompt, mode, count); break;
    }
    ui.alert('完了', '台詞の生成が完了しました！', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('エラー', '生成中にエラーが発生しました。\n\n詳細: ' + e.message, ui.ButtonSet.OK);
  }
}

/**
 * AI から JSON 形式の結果を取得する共通関数。
 * @param {string} charPrompt キャラクタープロンプト
 * @param {string} userPrompt ユーザープロンプト
 * @returns {*} パース済みオブジェクト
 * @private
 */
function fetchGeneratedJson_(charPrompt, userPrompt) {
  var strictPrompt = userPrompt + '\n\n【絶対厳守】出力するJSONのデータ内（セリフの中など）には、絶対に「改行（エンター）」や「ダブルクォーテーション(")」を含めないでください。セリフは必ず1行のテキストとして出力してください。';

  var resText = callLLM('autogen', strictPrompt, charPrompt);
  if (!resText) throw new Error('AI_PROVIDER が無効か、日次制限に達しています。');

  var cleaned = resText.replace(/```json/gi, '').replace(/```/g, '').trim();
  cleaned = cleaned.replace(/\r?\n/g, '');

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    Logger.log('[AutoGenerator AI返答エラー] ' + cleaned);
    throw new Error('AIが想定外の形式を返しました。再実行してみてください。\n詳細: ' + e.message);
  }
}

/**
 * 列の実際の最終行を取得する（空白行を無視）。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} col 列番号（1始まり）
 * @returns {number}
 * @private
 */
function getLastRowOfCol_(sheet, col) {
  var values = sheet.getRange(1, col, sheet.getMaxRows(), 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]).trim() !== '') return i + 1;
  }
  return 1;
}

// ============================================================
// シート別生成関数
// ============================================================

function generateSchedule_(ss, charPrompt, mode) {
  var sheet = ss.getSheetByName(SHEET.SCHEDULED_POST);
  if (!sheet) throw new Error('スケジュール投稿シートが見つかりません。');
  if (mode === 'CLEAR' && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  var prompt = 'キャラクターになりきって、スケジュール投稿用のセリフを生成してください。\n\n'
    + '【条件】\n'
    + '- 00〜23 時の各時間帯につき 1 件ずつ、計 24 件生成してください。\n'
    + '- 時刻は必ず 2 桁（例: 00, 07, 12, 23）で出力してください。\n'
    + '- 天候の話題は避けてください。\n'
    + '- 以下の厳密な JSON 配列形式で出力してください。\n'
    + '[{"time":"07","text":"セリフ内容"}, ...]';

  var data = fetchGeneratedJson_(charPrompt, prompt);
  var rows = data.map(function(d) { return [d.time, d.text]; });
  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
  Utilities.sleep(3000);
}

function generateRandom_(ss, charPrompt, mode, count) {
  var sheet = ss.getSheetByName(SHEET.RANDOM_POST);
  if (!sheet) throw new Error('ランダム投稿シートが見つかりません。');
  if (mode === 'CLEAR' && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).clearContent();
  }

  var prompt = 'キャラクターになりきって、ランダム投稿用のセリフを生成してください。\n\n'
    + '【条件】\n'
    + '- 意味はあまりなく、でもちょっと遊び心があり、何度見ても飽きない、でもちょっと冗談っぽいセリフを「' + count + '個」生成してください。\n'
    + '- 以下の厳密な JSON 配列形式で出力してください。\n'
    + '["セリフ1", "セリフ2", ...]';

  var data = fetchGeneratedJson_(charPrompt, prompt);
  var rows = data.map(function(d) { return [d]; });
  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 1).setValues(rows);
  Utilities.sleep(3000);
}

function generateWeekly_(ss, charPrompt, mode, dayCode) {
  var sheet = ss.getSheetByName(SHEET.WEEKDAY);
  if (!sheet) throw new Error('曜日別シートが見つかりません。');

  if (mode === 'CLEAR') {
    // 指定曜日の行のみクリア
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var existing = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      for (var i = existing.length - 1; i >= 0; i--) {
        if (String(existing[i][1]).trim().toUpperCase() === dayCode) {
          sheet.deleteRow(i + 2);
        }
      }
    }
  }

  var prompt = 'キャラクターになりきって、曜日別投稿（' + dayCode + '）のセリフを生成してください。\n\n'
    + '【条件】\n'
    + '- 曜日は「' + dayCode + '」のみ使用してください。\n'
    + '- 00〜23 時の各時間帯につき 1 件ずつ、計 24 件生成してください。\n'
    + '- キャラクターの性格・バックボーンを考慮した内容にしてください。\n'
    + '- 天候の話題は避けてください。\n'
    + '- 時刻は必ず 2 桁（例: 00, 07, 23）で出力してください。\n'
    + '- 以下の厳密な JSON 配列形式で出力してください。\n'
    + '[{"time":"07","day":"' + dayCode + '","text":"セリフ内容"}, ...]';

  var data = fetchGeneratedJson_(charPrompt, prompt);
  var rows = data.map(function(d) { return [d.time, d.day, d.text]; });
  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  Utilities.sleep(3000);
}

function generateEvent_(ss, charPrompt, mode, count) {
  var sheet = ss.getSheetByName(SHEET.EVENT);
  if (!sheet) throw new Error('イベントシートが見つかりません。');
  if (mode === 'CLEAR' && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  var required = count <= 10
    ? '以下のイベントは必ず含めてください：元旦(01/01)、バレンタインデー(02/14)、ホワイトデー(03/14)、クリスマスイブ(12/24)、クリスマス(12/25)、大晦日(12/31)。'
    : '';

  var prompt = 'キャラクターになりきって、日本の記念日・イベント日に合わせたセリフを生成してください。\n\n'
    + '【条件】\n'
    + '- 日付が年によって変動しない記念日を選んでください（春分の日などは除外）。\n'
    + '- 各イベントにつき 1 つ、合計「' + count + '個」生成してください。\n'
    + (required ? '- ' + required + '\n' : '')
    + '- 誰も知らないようなネタっぽい珍しい記念日もいくつか含めてください。\n'
    + '- 日付は "MM/DD" 形式（例: 01/01）を厳守してください。\n'
    + '- 以下の厳密な JSON 配列形式で出力してください。\n'
    + '[{"date":"01/01","name":"元旦","text":"セリフ"}, ...]';

  var data = fetchGeneratedJson_(charPrompt, prompt);
  var rows = data.map(function(d) { return [d.date, d.name, d.text]; });
  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  Utilities.sleep(3000);
}

function generatePollQuestions_(ss, charPrompt, mode, count) {
  var sheet = ss.getSheetByName(SHEET.POLL);
  if (!sheet) throw new Error('投票質問文シートが見つかりません。');

  if (mode === 'CLEAR') {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
    }
  }

  var prompt = 'キャラクターになりきって、投票機能用の質問文と接頭辞（prefix）をセットで生成してください。\n\n'
    + '【条件】\n'
    + '- 「〜〜したいもの」をお題にした 4 択アンケートの質問文（q）と、接頭辞（p）を「' + count + 'セット」生成してください。\n'
    + '- 質問文（q）は 35 文字以内にしてください。\n'
    + '- 接頭辞（p）は、キャラクター性を活かした、カオスなものから普通のものまで織り交ぜてください。\n'
    + '- 以下の厳密な JSON 配列形式で出力してください。\n'
    + '[{"q":"質問文1","p":"接頭辞1"}, ...]';

  var data = fetchGeneratedJson_(charPrompt, prompt);
  var rows = data.map(function(d) { return [d.q, d.p]; });

  // A列の実際の最終行を基準に書き込む
  var lastRowA = getLastRowOfCol_(sheet, 1);
  if (rows.length > 0) sheet.getRange(lastRowA + 1, 1, rows.length, 2).setValues(rows);
  Utilities.sleep(3000);
}

function generatePollItems_(ss, charPrompt, mode, count) {
  var sheet = ss.getSheetByName(SHEET.POLL);
  if (!sheet) throw new Error('投票質問文シートが見つかりません。');

  if (mode === 'CLEAR') {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 3, lastRow - 1, 1).clearContent();
    }
  }

  var prompt = 'キャラクターになりきって、投票の選択肢アイテムを生成してください。\n\n'
    + '【条件】\n'
    + '- キャラクターが好きそうな、スイーツや食べ物、趣味・物・キャラなどのアイテム名を「' + count + '個」生成してください。\n'
    + '- 各アイテムは 10 文字以内の短い単語にしてください。\n'
    + '- 重複なく、バラエティ豊かに選んでください。\n'
    + '- 以下の厳密な JSON 配列形式で出力してください。\n'
    + '["アイテム1", "アイテム2", ...]';

  var data = fetchGeneratedJson_(charPrompt, prompt);
  var rows = data.map(function(d) { return [d]; });

  // C列の実際の最終行を基準に書き込む
  var lastRowC = getLastRowOfCol_(sheet, 3);
  if (rows.length > 0) sheet.getRange(lastRowC + 1, 3, rows.length, 1).setValues(rows);
  Utilities.sleep(3000);
}

function generateFallback_(ss, charPrompt, mode, count) {
  var sheet = ss.getSheetByName(SHEET.FALLBACK);
  if (!sheet) throw new Error('フォールバック定型文シートが見つかりません。');
  if (mode === 'CLEAR' && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).clearContent();
  }

  var prompt = 'キャラクターになりきって、エラー時や返信不能時に使う定型文を生成してください。\n\n'
    + '【条件】\n'
    + '- APIの制限に達した時や、返信に失敗した時などに使う定型文を「' + count + '個」生成してください。\n'
    + '- スルーする態度、聞こえないふり、体調が悪い態度などのニュアンスを含めてください。\n'
    + '- 以下の厳密な JSON 配列形式で出力してください。\n'
    + '["定型文1", "定型文2", ...]';

  var data = fetchGeneratedJson_(charPrompt, prompt);
  var rows = data.map(function(d) { return [d]; });
  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 1).setValues(rows);
  Utilities.sleep(3000);
}
