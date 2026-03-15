require('../mocks/gas');

// Core.gs の containsNGWord ロジックをテスト用に再現
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

describe('containsNGWord', () => {
  const ngWords = ['テスト', 'spam', 'ngワード'];

  test('NGワードを含む場合 true', () => {
    expect(containsNGWord('これはテストです', ngWords)).toBe(true);
  });

  test('NGワードを含まない場合 false', () => {
    expect(containsNGWord('普通のテキスト', ngWords)).toBe(false);
  });

  test('大小文字を無視する', () => {
    expect(containsNGWord('SPAM is bad', ngWords)).toBe(true);
    expect(containsNGWord('Spam message', ngWords)).toBe(true);
  });

  test('部分一致で判定する', () => {
    expect(containsNGWord('これはspammer', ngWords)).toBe(true);
  });

  test('空入力は false', () => {
    expect(containsNGWord('', ngWords)).toBe(false);
    expect(containsNGWord(null, ngWords)).toBe(false);
    expect(containsNGWord(undefined, ngWords)).toBe(false);
  });

  test('空のNGリストは false', () => {
    expect(containsNGWord('テスト', [])).toBe(false);
    expect(containsNGWord('テスト', null)).toBe(false);
  });
});
