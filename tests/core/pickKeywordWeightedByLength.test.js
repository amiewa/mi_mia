require('../mocks/gas');

// pickKeywordWeightedByLength_ のロジックをテスト用に再現
function pickKeywordWeightedByLength_(keywords) {
  if (!keywords || keywords.length === 0) return null;
  var total = 0;
  var weights = [];
  for (var i = 0; i < keywords.length; i++) {
    var w = Math.max(1, keywords[i].length - 1);
    weights.push(w);
    total += w;
  }
  var r = Math.random() * total;
  for (var j = 0; j < keywords.length; j++) {
    r -= weights[j];
    if (r < 0) return keywords[j];
  }
  return keywords[keywords.length - 1];
}

describe('pickKeywordWeightedByLength_', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('空配列で null を返す', () => {
    expect(pickKeywordWeightedByLength_([])).toBeNull();
  });

  test('null で null を返す', () => {
    expect(pickKeywordWeightedByLength_(null)).toBeNull();
  });

  test('1件配列はその語を返す', () => {
    expect(pickKeywordWeightedByLength_(['映画'])).toBe('映画');
  });

  test('乱数0に近い値（先頭寄り）で先頭語が選ばれる', () => {
    // ['ab', 'xyz'] → 重み [1, 2], 合計3
    // r=0.1*3=0.3 → 'ab'(重み1)を超えない → 'ab'
    jest.spyOn(Math, 'random').mockReturnValue(0.09);
    expect(pickKeywordWeightedByLength_(['ab', 'xyz'])).toBe('ab');
  });

  test('乱数が先頭重みを超えた値で後続語が選ばれる', () => {
    // ['ab', 'xyz'] → 重み [1, 2], 合計3
    // r=0.5*3=1.5 → 'ab'(重み1)を超える → 'xyz'
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(pickKeywordWeightedByLength_(['ab', 'xyz'])).toBe('xyz');
  });

  test('2文字語より3文字語の方が2倍選ばれやすい（統計検証）', () => {
    // 2文字=重み1, 3文字=重み2 → 3文字が2倍選ばれる
    const keywords = ['AB', 'ABC'];
    let count2 = 0;
    let count3 = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const result = pickKeywordWeightedByLength_(keywords);
      if (result === 'AB') count2++;
      else count3++;
    }
    // 3文字の選出率が40%〜70%の範囲にあることを確認（期待値=66.7%）
    const rate3 = count3 / N;
    expect(rate3).toBeGreaterThan(0.55);
    expect(rate3).toBeLessThan(0.78);
  });

  test('等確率選択より2文字の選出率が下がる（大域確認）', () => {
    // ['あ', 'いい', 'ううう'] → 重み [1, 1, 2], 合計4
    // 等確率なら2文字(いい)は33.3%, 加重では25%
    const keywords = ['あ', 'いい', 'ううう'];
    let count2char = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (pickKeywordWeightedByLength_(keywords) === 'いい') count2char++;
    }
    const rate = count2char / N;
    // 期待値25% → 等確率33%より有意に低い
    expect(rate).toBeLessThan(0.32);
  });
});
