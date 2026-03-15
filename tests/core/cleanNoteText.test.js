require('../mocks/gas');

// Core.gs の cleanNoteText ロジックをテスト用に再現
function cleanNoteText(text) {
  if (!text) return '';
  text = text.replace(/https?:\/\/\S+/g, '');
  text = text.replace(/@\w+(@[\w.]+)?/g, '');
  text = text.replace(/:[\w]+:/g, '');
  text = text.replace(/#\S+/g, '');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`[^`]*`/g, '');
  for (var i = 0; i < 5; i++) {
    var prev = text;
    text = text.replace(/\$\[[^\s\]]+\s+([^\[\]]*?)\]/g, '$1');
    text = text.replace(/\$\[[^\s\]]+\]/g, '');
    if (text === prev) break;
  }
  return text.trim();
}

describe('cleanNoteText', () => {
  test('null/undefined は空文字を返す', () => {
    expect(cleanNoteText(null)).toBe('');
    expect(cleanNoteText(undefined)).toBe('');
    expect(cleanNoteText('')).toBe('');
  });

  test('URLを除去する', () => {
    expect(cleanNoteText('こんにちは https://example.com 元気？')).toBe('こんにちは  元気？');
    expect(cleanNoteText('http://test.jp/path?q=1 テスト')).toBe('テスト');
  });

  test('メンションを除去する', () => {
    expect(cleanNoteText('@user こんにちは')).toBe('こんにちは');
    expect(cleanNoteText('@user@misskey.io やっほー')).toBe('やっほー');
  });

  test('カスタム絵文字を除去する', () => {
    expect(cleanNoteText(':emoji: テスト :blobcat:')).toBe('テスト');
  });

  test('ハッシュタグを除去する', () => {
    expect(cleanNoteText('テスト #tag1 #タグ2')).toBe('テスト');
  });

  test('コードブロックを除去する', () => {
    expect(cleanNoteText('前文\n```\ncode here\n```\n後文')).toBe('前文\n\n後文');
  });

  test('インラインコードを除去する', () => {
    expect(cleanNoteText('これは `code` です')).toBe('これは  です');
  });

  test('MFM $[tag content] のコンテンツを保持する', () => {
    expect(cleanNoteText('$[x2 大きい文字]')).toBe('大きい文字');
    expect(cleanNoteText('$[sparkle キラキラ]')).toBe('キラキラ');
  });

  test('MFM $[tag] (空) を除去する', () => {
    expect(cleanNoteText('前 $[flip] 後')).toBe('前  後');
  });

  test('MFM の入れ子を処理する', () => {
    expect(cleanNoteText('$[x2 $[sparkle テスト]]')).toBe('テスト');
  });

  test('複合パターンを処理する', () => {
    var input = '@user https://example.com $[x2 こんにちは] :emoji: #tag';
    expect(cleanNoteText(input)).toBe('こんにちは');
  });

  test('通常テキストはそのまま', () => {
    expect(cleanNoteText('普通のテキスト')).toBe('普通のテキスト');
  });
});
