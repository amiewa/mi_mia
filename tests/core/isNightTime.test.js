require('../mocks/gas');

// テスト用に Utilities.formatDate をオーバーライドして時刻を制御
function isNightTime(config, mockHour) {
  var start = parseInt(config.POSTING_NIGHT_START) || 23;
  var end = parseInt(config.POSTING_NIGHT_END) || 6;
  var hour = mockHour;

  if (start > end) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

describe('isNightTime', () => {
  const defaultConfig = {
    POSTING_NIGHT_START: '23',
    POSTING_NIGHT_END: '6'
  };

  describe('日付またぎ (23〜6)', () => {
    test('23時は夜間', () => {
      expect(isNightTime(defaultConfig, 23)).toBe(true);
    });

    test('0時は夜間', () => {
      expect(isNightTime(defaultConfig, 0)).toBe(true);
    });

    test('3時は夜間', () => {
      expect(isNightTime(defaultConfig, 3)).toBe(true);
    });

    test('5時は夜間', () => {
      expect(isNightTime(defaultConfig, 5)).toBe(true);
    });

    test('6時は昼間（終了時刻は含まない）', () => {
      expect(isNightTime(defaultConfig, 6)).toBe(false);
    });

    test('12時は昼間', () => {
      expect(isNightTime(defaultConfig, 12)).toBe(false);
    });

    test('22時は昼間', () => {
      expect(isNightTime(defaultConfig, 22)).toBe(false);
    });
  });

  describe('通常範囲 (1〜5)', () => {
    const config = {
      POSTING_NIGHT_START: '1',
      POSTING_NIGHT_END: '5'
    };

    test('1時は夜間', () => {
      expect(isNightTime(config, 1)).toBe(true);
    });

    test('3時は夜間', () => {
      expect(isNightTime(config, 3)).toBe(true);
    });

    test('5時は昼間', () => {
      expect(isNightTime(config, 5)).toBe(false);
    });

    test('0時は昼間', () => {
      expect(isNightTime(config, 0)).toBe(false);
    });

    test('23時は昼間', () => {
      expect(isNightTime(config, 23)).toBe(false);
    });
  });

  describe('デフォルト値', () => {
    test('設定なしでもデフォルト 23〜6 で動作', () => {
      expect(isNightTime({}, 23)).toBe(true);
      expect(isNightTime({}, 12)).toBe(false);
    });
  });
});
