// ================= CORE - PokeTool Design V1 =================

const CACHE_KEY = "PokeTool.V1.Cache";

const FILE_META = "meta.json";
const FILE_PENDING = "pending.json";
const FILE_DONE = "done.json";
const FILE_FAILED = "failed.json";
const FILE_CONFIG = "config.json";
const FILE_LOG = "log.json";

const THEME = {
  bg: "#020617",
  card: "#0B1220",
  card2: "#111827",
  input: "#020617",
  text: "#E5E7EB",
  muted: "#9CA3AF",
  primary: "#6366F1",
  success: "#22C55E",
  danger: "#EF4444",
  warning: "#F59E0B",
  secondary: "#1F2937",
  border: "#334155"
};

const MODES = [
  "Lottery",
  "Buy",
  "Create",
  "ChangeProfile",
  "ChangeEmail",
  "CheckResult",
  "ChangeProfileOrder"
];

const TABS = [
  "Dashboard",
  "Data",
  "Browser",
  "Queue",
  "Result",
  "Settings"
];

let state = {
  version: getAppVersion(),
  mode: "Lottery",
  tab: "Dashboard",
  running: false,
  paused: false,

  current: {
    email: "-",
    step: "Idle",
    status: "Ready",
    index: 0,
    total: 0,
    elapsed: "00:00"
  },

  stats: {
    total: 0,
    waiting: 0,
    running: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    percent: 0
  },

  form: {
    imapEmail: "",
    imapPass: "",
    buyQty: "1",
    mailList: "",
    productIds: "",

    names: "",
    kanas: "",
    phones: "",
    postcode: "",
    pref: "",
    address1: "",
    address2: "",
    birthdate: "",

    creditList: "",
    creditOwnerList: ""
  },

  logs: []
};

const MODE_FIELDS = {
  Lottery: [
    "imapEmail",
    "imapPass",
    "productIds"
  ],

  Buy: [
    "imapEmail",
    "imapPass",
    "productIds",
    "buyQty",
    "creditOwnerList",
    "creditList"
  ],

  Create: [
    "imapEmail",
    "imapPass",
    "names",
    "kanas",
    "phones",
    "postcode",
    "pref",
    "address1",
    "address2",
    "birthdate"
  ],

  ChangeProfile: [
    "names",
    "kanas",
    "phones",
    "postcode",
    "pref",
    "address1",
    "address2"
  ],

  ChangeProfileOrder: [
    "names",
    "kanas",
    "phones",
    "postcode",
    "pref",
    "address1",
    "address2"
  ],

  ChangeEmail: [
    "imapEmail",
    "imapPass"
  ],

  CheckResult: [
    "imapEmail",
    "imapPass",
    "productIds"
  ]
};

let listeners = [];

function init() {
  loadState();

  state.tab = "Dashboard";

  refreshStats();
}

function getState() {
  return state;
}

function setState(patch) {
  state = Object.assign({}, state, patch || {});
  persist();
  emit();
}

function updateForm(key, value) {
  state.form[key] = value == null ? "" : String(value);
  persist();
  emit();
}

function setMode(mode) {
  state.mode = mode || "Lottery";
  persist();
  emit();
}

function setTab(tab) {
  state.tab = tab || "Dashboard";
  emit();
}

function setRunning(v) {
  state.running = !!v;
  persist();
  emit();
}

function updateCurrent(patch) {
  state.current = Object.assign({}, state.current, patch || {});
  persist();
  emit();
}

function updateStats(patch) {
  state.stats = Object.assign({}, state.stats, patch || {});
  persist();
  emit();
}

function getAppVersion() {
  try {
    const f = $file.read("app.json");
    if (!f || !f.string) return "0.0.0";

    const json = JSON.parse(f.string);
    return json.version || "0.0.0";
  } catch (e) {
    return "0.0.0";
  }
}

function addLog(text, type) {
  const d = new Date();

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  state.logs.unshift({
    time: `${hh}:${mm}:${ss}`,
    text: String(text || ""),
    type: type || "info"
  });

  state.logs = state.logs.slice(0, 200);

  saveJSON(FILE_LOG, state.logs);
  emit();
}

function onChange(fn) {
  listeners.push(fn);
}

function emit() {
  listeners.forEach(fn => {
    try {
      fn(state);
    } catch (e) {
      console.log("listener error:", e);
    }
  });
}

function persist() {
  try {
    $cache.set(CACHE_KEY, state);

    saveJSON(FILE_CONFIG, {
      version: state.version,
      mode: state.mode,
      form: state.form
    });
  } catch (e) {
    console.log("persist error:", e);
  }
}

function loadState() {
  let cache = null;

  try {
    cache = $cache.get(CACHE_KEY);
  } catch (e) {
    //
  }

  let config = loadJSON(FILE_CONFIG, null);

  if (cache) {
    state = Object.assign({}, state, cache);
  }

  if (config && config.form) {
    state.mode = config.mode || state.mode;
    state.form = Object.assign({}, state.form, config.form);
  }

  const pendingText = listToAccountText(
    loadJSON(FILE_PENDING, []),
    state.mode
  );
  if (pendingText) {
    state.form.mailList = pendingText;
  }

  const logs = loadJSON(FILE_LOG, []);
  if (Array.isArray(logs)) {
    state.logs = logs.slice(0, 200);
  }
  state.version = getAppVersion();
}

function saveText(path, text) {
  try {
    $drive.write({
      path,
      data: $data({
        string: text || ""
      })
    });
  } catch (e) {
    console.log("saveText error:", path, e);
  }
}

function saveJSON(path, obj) {
  saveText(path, JSON.stringify(obj, null, 2));
}

function loadJSON(path, defVal) {
  try {
    if (!$drive.exists(path)) return defVal;

    const d = $drive.read(path);

    if (!d || !d.string) return defVal;

    return JSON.parse(d.string);
  } catch (e) {
    return defVal;
  }
}

function deleteFile(path) {
  try {
    if ($drive.exists(path)) {
      $drive.delete(path);
    }
  } catch (e) {
    //
  }
}

function clearProgress() {
  saveJSON(FILE_PENDING, []);
  saveJSON(FILE_DONE, []);
  saveJSON(FILE_FAILED, []);

  refreshStats();
  addLog("Progress cleared", "warn");
}

function parseAccounts(text, mode) {
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(line => {
      if (mode === "ChangeEmail") {
        const p = line.split(":");

        if (p.length < 5) return null;

        return {
          email: p[0].trim(),
          pass: p[1].trim(),
          newEmail: p[2].trim(),
          imapEmail: p[3].trim(),
          imapPass: p[4].trim()
        };
      }

      const p = line.split(":");

      if (!p[0] || !p[1]) return null;

      return {
        email: p[0].trim(),
        pass: p[1].trim()
      };
    })
    .filter(Boolean);
}

function accountObjToText(a) {
  if (!a) return "";

  if (a.newEmail || a.imapEmail || a.imapPass) {
    return [
      a.email || "",
      a.pass || "",
      a.newEmail || "",
      a.imapEmail || "",
      a.imapPass || ""
    ].join(":");
  }

  return `${a.email || ""}:${a.pass || ""}`;
}

function listToAccountText(list, mode) {
  return (list || [])
    .map(a => {
      if (mode === "ChangeEmail") {
        return [
          a.email || "",
          a.pass || "",
          a.newEmail || "",
          a.accImapEmail || a.imapEmail || "",
          a.accImapPass || a.imapPass || ""
        ].join(":");
      }

      return `${a.email || ""}:${a.pass || ""}`;
    })
    .filter(x => x !== ":")
    .join("\n");
}

function saveQueueFromMailList(text) {
  const accounts = parseAccounts(text, state.mode);

  saveJSON(FILE_PENDING, accounts);
  saveJSON(FILE_DONE, []);
  saveJSON(FILE_FAILED, []);

  saveJSON(FILE_META, {
    total: accounts.length,
    savedAt: Date.now()
  });

  refreshStats();

  return accounts.length;
}

function refreshStats() {
  const pending = loadJSON(FILE_PENDING, []);
  const done = loadJSON(FILE_DONE, []);
  const failed = loadJSON(FILE_FAILED, []);

  const waiting = Array.isArray(pending) ? pending.length : 0;
  const doneCount = Array.isArray(done) ? done.length : 0;
  const failedCount = Array.isArray(failed) ? failed.length : 0;

  const total = waiting + doneCount + failedCount;

  state.stats = {
    total,
    waiting,
    running: state.running ? 1 : 0,
    done: doneCount,
    failed: failedCount,
    skipped: 0,
    percent: total
      ? Math.floor(((doneCount + failedCount) * 100) / total)
      : 0
  };

  persist();
  emit();
}

function lines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function pickLine(arr, i) {
  if (!arr || !arr.length) return "";
  if (arr.length === 1) return arr[0];
  return arr[i] || "";
}

function buildTasksFromForm(form, mode, accounts) {
  form = form || {};
  accounts = accounts || [];

  const fields = MODE_FIELDS[mode] || [];
  const lineMap = {};

  fields.forEach(k => {
    lineMap[k] = lines(form[k]);
  });

  return accounts.map((acc, i) => {
    const task = {
      mode,
      email: acc.email || "",
      pass: acc.pass || "",
      newEmail: acc.newEmail || "",
      accImapEmail: acc.accImapEmail || acc.imapEmail || "",
      accImapPass: acc.accImapPass || acc.imapPass || "",
      reason: acc.reason || ""
    };

    fields.forEach(k => {
      task[k] = acc[k] || pickLine(lineMap[k], i);
    });

    return task;
  });
}

function saveQueueFromForm(form, mode) {
  const accounts = parseAccounts(form.mailList || "", mode);
  const tasks = buildTasksFromForm(form, mode, accounts);

  saveJSON(FILE_PENDING, tasks);
  saveJSON(FILE_DONE, []);
  saveJSON(FILE_FAILED, []);

  refreshStats();

  return tasks.length;
}

function resetAll() {
  try {
    $cache.remove(CACHE_KEY);
  } catch (e) {
    //
  }

  deleteFile(FILE_PENDING);
  deleteFile(FILE_DONE);
  deleteFile(FILE_FAILED);
  deleteFile(FILE_CONFIG);
  deleteFile(FILE_LOG);
  deleteFile(FILE_META);

  state.form = {
    imapEmail: "",
    imapPass: "",
    buyQty: "1",
    mailList: "",
    productIds: "",
    names: "",
    kanas: "",
    phones: "",
    postcode: "",
    pref: "",
    address1: "",
    address2: "",
    birthdate: "",
    creditList: "",
    creditOwnerList: ""
  };

  state.logs = [];
  state.mode = "Lottery";
  state.tab = "Dashboard";
  state.running = false;

  refreshStats();
  persist();
  emit();
}

module.exports = {
  THEME,
  MODES,
  TABS,

  FILE_META,
  FILE_PENDING,
  FILE_DONE,
  FILE_FAILED,
  FILE_CONFIG,
  FILE_LOG,

  init,
  getState,
  setState,
  setMode,
  setTab,
  setRunning,
  updateForm,
  updateCurrent,
  updateStats,
  addLog,
  onChange,

  saveText,
  saveJSON,
  loadJSON,
  deleteFile,
  clearProgress,
  resetAll,

  parseAccounts,
  accountObjToText,
  listToAccountText,
  refreshStats,
  MODE_FIELDS,
  buildTasksFromForm,
  saveQueueFromForm,
  lines,
  pickLine,
  saveQueueFromMailList
};
