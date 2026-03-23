require('../mocks/gas');

// テスト用にロジックを再現

var SHEET_CHARACTER_SETTINGS = 'キャラクター設定';

// モックシート準備ヘルパー
function setupCharacterSettingsSheet(data) {
  var { mockSpreadsheet } = require('../mocks/gas');
  var sheet = mockSpreadsheet.insertSheet(SHEET_CHARACTER_SETTINGS);
  // ヘッダー + データ
  sheet._data = [['項目', '設定']].concat(data);
  sheet.getRange = function (row, col, numRows, numCols) {
    var values = [];
    for (var i = row - 1; i < row - 1 + numRows; i++) {
      var rowData = [];
      for (var j = col - 1; j < col - 1 + numCols; j++) {
        rowData.push(sheet._data[i] && sheet._data[i][j] !== undefined ? sheet._data[i][j] : '');
      }
      values.push(rowData);
    }
    return { getValues: function () { return values; } };
  };
  sheet.getLastRow = function () { return sheet._data.length; };
  return sheet;
}

function clearCharacterSettingsSheet() {
  var { mockSpreadsheet } = require('../mocks/gas');
  delete mockSpreadsheet._sheets[SHEET_CHARACTER_SETTINGS];
}

// テスト対象のロジックを再現
function getCharacterSetting_(key) {
  var ss = global.SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CHARACTER_SETTINGS);
  if (!sheet || sheet.getLastRow() < 2) return null;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      return String(data[i][1]).trim() || null;
    }
  }
  return null;
}

function getCharacterPrompt_() {
  var prompt = getCharacterSetting_('キャラクタープロンプト');
  return prompt || 'あなたは少女「みあ」一人称「あたし」マイペース,無頓着,好奇心はあるが浅い。敬語・句点・絵文字不使用。語尾は柔らかくゆるい。';
}

describe('getCharacterSetting_', () => {
  afterEach(() => {
    clearCharacterSettingsSheet();
  });

  test('存在するキーに対して正しい値を返す', () => {
    setupCharacterSettingsSheet([
      ['キャラクタープロンプト', 'テスト用プロンプト'],
      ['呼び名登録', '{nickname}だね！'],
    ]);
    expect(getCharacterSetting_('キャラクタープロンプト')).toBe('テスト用プロンプト');
    expect(getCharacterSetting_('呼び名登録')).toBe('{nickname}だね！');
  });

  test('存在しないキーに対して null を返す', () => {
    setupCharacterSettingsSheet([
      ['キャラクタープロンプト', 'テスト用プロンプト'],
    ]);
    expect(getCharacterSetting_('存在しないキー')).toBeNull();
  });

  test('シートが存在しない場合に null を返す', () => {
    expect(getCharacterSetting_('キャラクタープロンプト')).toBeNull();
  });

  test('値が空文字の場合に null を返す', () => {
    setupCharacterSettingsSheet([
      ['呼び名登録', ''],
    ]);
    expect(getCharacterSetting_('呼び名登録')).toBeNull();
  });

  test('キー名の前後の空白を無視する', () => {
    setupCharacterSettingsSheet([
      ['  呼び名リセット  ', 'リセットしたよ'],
    ]);
    expect(getCharacterSetting_('呼び名リセット')).toBe('リセットしたよ');
  });
});

describe('getCharacterPrompt_', () => {
  afterEach(() => {
    clearCharacterSettingsSheet();
  });

  test('シートから取得した値を返す', () => {
    setupCharacterSettingsSheet([
      ['キャラクタープロンプト', 'カスタムプロンプト'],
    ]);
    expect(getCharacterPrompt_()).toBe('カスタムプロンプト');
  });

  test('シートがない場合にデフォルト値を返す', () => {
    expect(getCharacterPrompt_()).toBe(
      'あなたは少女「みあ」一人称「あたし」マイペース,無頓着,好奇心はあるが浅い。敬語・句点・絵文字不使用。語尾は柔らかくゆるい。'
    );
  });

  test('キーが見つからない場合にデフォルト値を返す', () => {
    setupCharacterSettingsSheet([
      ['呼び名登録', 'テスト'],
    ]);
    expect(getCharacterPrompt_()).toBe(
      'あなたは少女「みあ」一人称「あたし」マイペース,無頓着,好奇心はあるが浅い。敬語・句点・絵文字不使用。語尾は柔らかくゆるい。'
    );
  });
});

describe('ニックネーム応答メッセージのテンプレート', () => {
  afterEach(() => {
    clearCharacterSettingsSheet();
  });

  test('呼び名登録テンプレートの {nickname} が置換される', () => {
    setupCharacterSettingsSheet([
      ['呼び名登録', '{nickname}って呼ぶね〜'],
    ]);
    var tpl = getCharacterSetting_('呼び名登録') || '{nickname}って呼べばいいんだね！ わかった〜';
    var result = tpl.replace('{nickname}', 'たろう');
    expect(result).toBe('たろうって呼ぶね〜');
  });

  test('呼び名登録のデフォルトテンプレートでも {nickname} が置換される', () => {
    var tpl = getCharacterSetting_('呼び名登録') || '{nickname}って呼べばいいんだね！ わかった〜';
    var result = tpl.replace('{nickname}', 'はなこ');
    expect(result).toBe('はなこって呼べばいいんだね！ わかった〜');
  });
});
