require('../mocks/gas');

// SCRIPT_START をテスト可能にするためグローバルに設定
global.SCRIPT_START = Date.now();

// Core.gs の関数を読み込む代わりに、同じロジックで直接テスト
function isTimeSafe(marginMs) {
  if (marginMs === undefined || marginMs === null) marginMs = 60000;
  return (Date.now() - global.SCRIPT_START) < (360000 - marginMs);
}

describe('isTimeSafe', () => {
  test('開始直後は true を返す', () => {
    global.SCRIPT_START = Date.now();
    expect(isTimeSafe()).toBe(true);
  });

  test('デフォルトマージンは60秒', () => {
    global.SCRIPT_START = Date.now();
    expect(isTimeSafe()).toBe(true);
    // 300秒経過をシミュレート（残り60秒=ぎりぎりセーフ）
    global.SCRIPT_START = Date.now() - 299000;
    expect(isTimeSafe()).toBe(true);
  });

  test('5分以上経過でデフォルトマージンだと false', () => {
    // 301秒経過（残り59秒 < マージン60秒）
    global.SCRIPT_START = Date.now() - 301000;
    expect(isTimeSafe()).toBe(false);
  });

  test('カスタムマージンが適用される', () => {
    // 残り120秒必要、240秒経過（残り120秒=ぎりぎりセーフ）
    global.SCRIPT_START = Date.now() - 239000;
    expect(isTimeSafe(120000)).toBe(true);

    // 241秒経過（残り119秒 < マージン120秒）
    global.SCRIPT_START = Date.now() - 241000;
    expect(isTimeSafe(120000)).toBe(false);
  });

  test('6分超過で常に false', () => {
    global.SCRIPT_START = Date.now() - 400000;
    expect(isTimeSafe()).toBe(false);
    expect(isTimeSafe(0)).toBe(false);
  });
});
