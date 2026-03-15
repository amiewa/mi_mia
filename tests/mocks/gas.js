/**
 * GAS API モック
 * テスト用にグローバルオブジェクトをシミュレートする
 */

// スプレッドシートモック
const mockSheet = {
  _data: [],
  _name: '',
  getName: function () {
    return this._name;
  },
  getRange: function () {
    return mockRange;
  },
  getDataRange: function () {
    return {
      getValues: () => this._data
    };
  },
  getLastRow: function () {
    return this._data.length;
  },
  appendRow: function (row) {
    this._data.push(row);
  },
  deleteRow: function () {},
  setValues: function () {}
};

const mockRange = {
  _values: [],
  getValues: function () {
    return this._values;
  },
  setValue: function () {},
  setValues: function () {}
};

const mockSpreadsheet = {
  _sheets: {},
  getSheetByName: function (name) {
    return this._sheets[name] || null;
  },
  insertSheet: function (name) {
    const sheet = Object.create(mockSheet);
    sheet._name = name;
    sheet._data = [];
    this._sheets[name] = sheet;
    return sheet;
  }
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: function () {
    return mockSpreadsheet;
  }
};

// CacheService モック
const cacheStore = {};
global.CacheService = {
  getScriptCache: function () {
    return {
      get: function (key) {
        return cacheStore[key] || null;
      },
      put: function (key, value, ttl) {
        cacheStore[key] = value;
      },
      remove: function (key) {
        delete cacheStore[key];
      }
    };
  }
};

// PropertiesService モック
const propertiesStore = {};
global.PropertiesService = {
  getScriptProperties: function () {
    return {
      getProperty: function (key) {
        return propertiesStore[key] || null;
      },
      setProperty: function (key, value) {
        propertiesStore[key] = value;
      },
      deleteProperty: function (key) {
        delete propertiesStore[key];
      },
      getProperties: function () {
        return { ...propertiesStore };
      }
    };
  }
};

// LockService モック
global.LockService = {
  getScriptLock: function () {
    return {
      tryLock: function () {
        return true;
      },
      releaseLock: function () {}
    };
  }
};

// UrlFetchApp モック
global.UrlFetchApp = {
  _lastRequest: null,
  _mockResponse: { getContentText: () => '{}', getResponseCode: () => 200 },
  fetch: function (url, options) {
    this._lastRequest = { url, options };
    return this._mockResponse;
  }
};

// Utilities モック
global.Utilities = {
  formatDate: function (date, tz, fmt) {
    return date.toISOString();
  },
  sleep: function () {}
};

// MailApp モック
global.MailApp = {
  getRemainingDailyQuota: function () {
    return 100;
  },
  sendEmail: function () {}
};

// ContentService モック
global.ContentService = {
  createTextOutput: function (text) {
    return {
      setMimeType: function () {
        return this;
      },
      getContent: function () {
        return text;
      }
    };
  },
  MimeType: { JSON: 'application/json' }
};

// Logger モック
global.Logger = {
  log: function () {}
};

// Session モック
global.Session = {
  getEffectiveUser: function () {
    return { getEmail: () => 'test@example.com' };
  }
};

module.exports = {
  mockSpreadsheet,
  mockSheet,
  mockRange,
  cacheStore,
  propertiesStore
};
