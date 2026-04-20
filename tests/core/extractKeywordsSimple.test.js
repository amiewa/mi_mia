require('../mocks/gas');

// extractKeywordsSimple_ のロジックをテスト用に再現
function extractKeywordsSimple_(text) {
  if (!text) return [];
  var keywords = [];

  var katakana = text.match(/[ァ-ヶー]{2,}/g);
  if (katakana) {
    for (var i = 0; i < katakana.length; i++) {
      keywords.push(katakana[i]);
    }
  }

  var quoted = text.match(/「([^」]+)」/g);
  if (quoted) {
    for (var j = 0; j < quoted.length; j++) {
      var inner = quoted[j].replace(/[「」]/g, '').trim();
      if (inner.length >= 2) {
        keywords.push(inner);
      }
    }
  }

  var kanji = text.match(/[\u4E00-\u9FFF]{2,}/g);
  if (kanji) {
    for (var k = 0; k < kanji.length; k++) {
      keywords.push(kanji[k]);
    }
  }

  return keywords;
}

describe('extractKeywordsSimple_', () => {
  test('null/undefined/空文字は空配列を返す', () => {
    expect(extractKeywordsSimple_(null)).toEqual([]);
    expect(extractKeywordsSimple_(undefined)).toEqual([]);
    expect(extractKeywordsSimple_('')).toEqual([]);
  });

  test('漢字2文字以上を抽出する', () => {
    const result = extractKeywordsSimple_('今日は週末だよ〜');
    expect(result).toContain('週末');
  });

  test('漢字3文字以上も抽出する', () => {
    const result = extractKeywordsSimple_('映画館に行きたい');
    expect(result).toContain('映画館');
  });

  test('漢字1文字は抽出しない', () => {
    const result = extractKeywordsSimple_('猫が好き');
    expect(result).not.toContain('猫');
  });

  test('カタカナ語を抽出する（既存動作維持）', () => {
    const result = extractKeywordsSimple_('アニメが面白い');
    expect(result).toContain('アニメ');
  });

  test('カタカナ1文字は抽出しない', () => {
    const result = extractKeywordsSimple_('テ');
    expect(result).not.toContain('テ');
  });

  test('括弧内フレーズを抽出する（既存動作維持）', () => {
    const result = extractKeywordsSimple_('「週末映画」を見た');
    expect(result).toContain('週末映画');
  });

  test('カタカナと漢字が混在するテキストで両方抽出する', () => {
    const result = extractKeywordsSimple_('アニメの映画館に行く');
    expect(result).toContain('アニメ');
    expect(result).toContain('映画館');
  });
});
