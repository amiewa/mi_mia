require('../mocks/gas');

// ============================================================
// テスト用に pickStatic_, mixWithStatic_, applyPrefixes_ を再現
// ============================================================

function applyPrefixes_(choices, prefixes) {
  if (!prefixes || prefixes.length === 0) return choices;
  return choices.map(function(c) {
    var p = prefixes[Math.floor(Math.random() * prefixes.length)];
    return p + c;
  });
}

function pickStatic_(questions, items, prefixes) {
  if (items.length < 4) return null;
  var pool = items.slice();
  var chosen = [];
  for (var i = 0; i < 4 && pool.length > 0; i++) {
    var idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  var qText = questions.length > 0
    ? questions[Math.floor(Math.random() * questions.length)].question
    : chosen[0] + 'といえば？';
  return { question: qText, choices: applyPrefixes_(chosen, prefixes) };
}

function mixWithStatic_(choices4, items, replaceCount) {
  var result = choices4.slice();
  var available = items.filter(function(it) { return choices4.indexOf(it) === -1; });
  if (available.length === 0) available = items.slice();

  var indices = [0, 1, 2, 3];
  for (var i = indices.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
  }
  var toReplace = indices.slice(0, replaceCount);
  toReplace.forEach(function(idx) {
    if (available.length === 0) return;
    var ri = Math.floor(Math.random() * available.length);
    result[idx] = available.splice(ri, 1)[0];
  });
  return result;
}

// ============================================================

const ITEMS_16 = [
  'ミルクレープ', 'ティラミス', 'モンブラン', 'ショートケーキ',
  'マカロン', 'シュークリーム', 'パンケーキ', 'クロワッサン',
  'プリン', 'タルト', 'クッキー', 'パフェ',
  'ドーナツ', 'ロールケーキ', 'チョコレート', 'アイスクリーム'
];

const QUESTIONS = [
  { question: '今日のごほうびは？', prefix: '世界一の' },
  { question: '食べたいのは？',     prefix: 'とろける' }
];

const PREFIXES = QUESTIONS.map(q => q.prefix);

// ============================================================
// pickStatic_
// ============================================================

describe('pickStatic_', () => {
  test('items が 4 件以上なら { question, choices } を返す', () => {
    const result = pickStatic_(QUESTIONS, ITEMS_16, PREFIXES);
    expect(result).not.toBeNull();
    expect(result.question).toBeTruthy();
    expect(Array.isArray(result.choices)).toBe(true);
    expect(result.choices).toHaveLength(4);
  });

  test('choices は ITEMS_16 の部分集合（prefix を除いた元の語が含まれる）', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const result = pickStatic_(QUESTIONS, ITEMS_16, []);
    result.choices.forEach(c => {
      expect(ITEMS_16).toContain(c);
    });
    jest.restoreAllMocks();
  });

  test('items が 3 件以下なら null を返す', () => {
    expect(pickStatic_(QUESTIONS, ['A', 'B', 'C'], PREFIXES)).toBeNull();
  });

  test('items ちょうど 4 件なら null を返さない', () => {
    const result = pickStatic_(QUESTIONS, ['A', 'B', 'C', 'D'], []);
    expect(result).not.toBeNull();
    expect(result.choices).toHaveLength(4);
  });

  test('questions が空でも items からデフォルト質問を生成する', () => {
    const result = pickStatic_([], ITEMS_16, []);
    expect(result).not.toBeNull();
    expect(result.question).toMatch(/といえば？$/);
  });
});

// ============================================================
// mixWithStatic_
// ============================================================

describe('mixWithStatic_', () => {
  const SHORT_CHOICES = ['あ', 'い', 'う', 'え'];

  test('常に 4 件を返す', () => {
    const result = mixWithStatic_(SHORT_CHOICES, ITEMS_16, 2);
    expect(result).toHaveLength(4);
  });

  test('replaceCount=2 のとき 2 件が ITEMS_16 から置換される', () => {
    const result = mixWithStatic_(SHORT_CHOICES, ITEMS_16, 2);
    const replaced = result.filter(c => ITEMS_16.includes(c));
    expect(replaced).toHaveLength(2);
  });

  test('replaceCount=4 のとき全件置換される', () => {
    const result = mixWithStatic_(SHORT_CHOICES, ITEMS_16, 4);
    const replaced = result.filter(c => ITEMS_16.includes(c));
    expect(replaced).toHaveLength(4);
  });

  test('元 choices と重複しない items を優先して使う', () => {
    const choices4 = [ITEMS_16[0], ITEMS_16[1], 'あ', 'い'];
    const result = mixWithStatic_(choices4, ITEMS_16, 2);
    // 置換後に ITEMS_16[0] や ITEMS_16[1] が重複して登場しないこと
    const counts = {};
    result.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    Object.values(counts).forEach(cnt => expect(cnt).toBe(1));
  });

  test('items が choices4 と完全一致しても壊れない', () => {
    const same = ['A', 'B', 'C', 'D'];
    expect(() => mixWithStatic_(same, same, 2)).not.toThrow();
  });
});

// ============================================================
// applyPrefixes_
// ============================================================

describe('applyPrefixes_', () => {
  test('prefixes が空なら choices をそのまま返す', () => {
    const choices = ['りんご', 'みかん', 'ぶどう', 'もも'];
    expect(applyPrefixes_(choices, [])).toEqual(choices);
  });

  test('prefixes があれば各 choice に prefix が付く', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const result = applyPrefixes_(['A', 'B', 'C', 'D'], ['世界一の']);
    result.forEach(c => expect(c.startsWith('世界一の')).toBe(true));
    jest.restoreAllMocks();
  });
});
