require('../mocks/gas');

// getConversationHistory_ / saveConversationTurn_ のロジックをテスト用に再現

function getConversationHistory_(userId, maxTurns) {
  if (!userId || maxTurns <= 0) return [];
  try {
    var props = global.PropertiesService.getScriptProperties();
    var raw = props.getProperty('CONV_' + userId);
    if (!raw) return [];
    var turns = JSON.parse(raw);
    var start = Math.max(0, turns.length - maxTurns);
    var lines = [];
    for (var i = start; i < turns.length; i++) {
      lines.push('ユーザー: ' + turns[i].user);
      lines.push('みあ: ' + turns[i].bot);
    }
    return lines;
  } catch (e) {
    return [];
  }
}

function saveConversationTurn_(userId, userMessage, botReply, maxTurns) {
  if (!userId || !userMessage || !botReply) return;
  try {
    var props = global.PropertiesService.getScriptProperties();
    var key = 'CONV_' + userId;
    var raw = props.getProperty(key);
    var turns = raw ? JSON.parse(raw) : [];
    turns.push({ user: userMessage, bot: botReply });
    if (turns.length > maxTurns) {
      turns = turns.slice(turns.length - maxTurns);
    }
    props.setProperty(key, JSON.stringify(turns));
  } catch (e) {}
}

describe('会話履歴 (マルチターン)', () => {
  beforeEach(() => {
    // PropertiesService をクリア
    const store = require('../mocks/gas').propertiesStore;
    for (const k in store) delete store[k];
  });

  test('履歴がない場合は空配列を返す', () => {
    expect(getConversationHistory_('user1', 3)).toEqual([]);
  });

  test('userId が空の場合は空配列を返す', () => {
    expect(getConversationHistory_('', 3)).toEqual([]);
    expect(getConversationHistory_(null, 3)).toEqual([]);
  });

  test('maxTurns が 0 の場合は空配列を返す', () => {
    saveConversationTurn_('user1', 'こんにちは', 'やっほー', 3);
    expect(getConversationHistory_('user1', 0)).toEqual([]);
  });

  test('1ターン保存・取得できる', () => {
    saveConversationTurn_('user1', 'こんにちは', 'やっほー', 3);
    const history = getConversationHistory_('user1', 3);
    expect(history).toEqual(['ユーザー: こんにちは', 'みあ: やっほー']);
  });

  test('複数ターンを古い順で返す', () => {
    saveConversationTurn_('user1', '1回目', '返信1', 3);
    saveConversationTurn_('user1', '2回目', '返信2', 3);
    saveConversationTurn_('user1', '3回目', '返信3', 3);
    const history = getConversationHistory_('user1', 3);
    expect(history[0]).toBe('ユーザー: 1回目');
    expect(history[2]).toBe('ユーザー: 2回目');
    expect(history[4]).toBe('ユーザー: 3回目');
  });

  test('maxTurns を超えたら古いターンが削除される', () => {
    saveConversationTurn_('user1', '1回目', '返信1', 2);
    saveConversationTurn_('user1', '2回目', '返信2', 2);
    saveConversationTurn_('user1', '3回目', '返信3', 2);
    const history = getConversationHistory_('user1', 2);
    // 1回目は削除され、2回目と3回目が残る
    expect(history.length).toBe(4);
    expect(history[0]).toBe('ユーザー: 2回目');
    expect(history[2]).toBe('ユーザー: 3回目');
  });

  test('maxTurns より少ない取得数を指定できる', () => {
    saveConversationTurn_('user1', '1回目', '返信1', 5);
    saveConversationTurn_('user1', '2回目', '返信2', 5);
    saveConversationTurn_('user1', '3回目', '返信3', 5);
    // 最新2ターンだけ取得
    const history = getConversationHistory_('user1', 2);
    expect(history.length).toBe(4);
    expect(history[0]).toBe('ユーザー: 2回目');
  });

  test('ユーザーごとに独立して保存される', () => {
    saveConversationTurn_('userA', 'Aさんの発言', 'Aへの返信', 3);
    saveConversationTurn_('userB', 'Bさんの発言', 'Bへの返信', 3);
    const histA = getConversationHistory_('userA', 3);
    const histB = getConversationHistory_('userB', 3);
    expect(histA[0]).toBe('ユーザー: Aさんの発言');
    expect(histB[0]).toBe('ユーザー: Bさんの発言');
    expect(histA.length).toBe(2);
    expect(histB.length).toBe(2);
  });

  test('空のメッセージは保存しない', () => {
    saveConversationTurn_('user1', '', 'bot reply', 3);
    saveConversationTurn_('user1', 'user msg', '', 3);
    expect(getConversationHistory_('user1', 3)).toEqual([]);
  });
});
