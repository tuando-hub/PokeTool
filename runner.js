// ================= RUNNER - PokeTool V1.2 =================

const Core = require("./core");
const Web = require("./web");
const Lottery = require("./modes/lottery");
const CheckResult = require("./modes/checkresult");

const LOGIN_URL = "https://www.pokemoncenter-online.com/login/";

let STOP_FLAG = false;
let START_TIME = 0;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sleep(ms) {
  const step = 200;
  let passed = 0;

  while (passed < ms) {
    checkStop();
    await delay(step);
    passed += step;
  }
}

function checkStop() {
  if (STOP_FLAG) {
    throw new Error("__STOP__");
  }
}

function elapsedText() {
  const sec = Math.floor((Date.now() - START_TIME) / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function getPending() {
  return Core.loadJSON(Core.FILE_PENDING, []);
}

function savePending(list) {
  Core.saveJSON(Core.FILE_PENDING, list || []);
  Core.refreshStats();
}

function pushDone(acc, meta) {
  const list = Core.loadJSON(Core.FILE_DONE, []);

  list.push({
    email: acc.email,
    pass: acc.pass,
    text: `${acc.email}:${acc.pass}`,
    doneAt: Date.now(),
    meta: meta || {}
  });

  Core.saveJSON(Core.FILE_DONE, list);
  Core.refreshStats();
}

function pushFailed(acc, error) {
  const list = Core.loadJSON(Core.FILE_FAILED, []);

  list.push({
    email: acc.email,
    pass: acc.pass,
    text: `${acc.email}:${acc.pass}\t${String(error || "Unknown error")}`,
    reason: String(error || "Unknown error"),
    failedAt: Date.now()
  });

  Core.saveJSON(Core.FILE_FAILED, list);
  Core.refreshStats();
}

function updateCurrent(acc, index, total, step, status) {
  Core.updateCurrent({
    email: acc && acc.email ? acc.email : "-",
    step: step || "-",
    status: status || "-",
    index,
    total,
    elapsed: elapsedText()
  });
}

async function runOneAccount(acc, index, total) {
  checkStop();

  const mode = Core.getState().mode;
  const form = Core.getState().form;

  if (mode === "Lottery") {
    return await Lottery.runAccount({
      acc,
      index,
      total,
      form,
      stopCheck: checkStop
    });
  }
  
  if (mode === "CheckResult") {
    return await CheckResult.runAccount({
      acc,
      index,
      total,
      form,
      stopCheck: checkStop
    });
  }

  throw new Error("MODE_NOT_IMPLEMENTED_" + mode);
}

function validateBeforeRun() {
  const s = Core.getState();
  const f = s.form || {};
  const mode = s.mode;

  const errors = [];

  const imapEmail = String(f.imapEmail || "").trim();
  const imapPass = String(f.imapPass || "").trim();
  const mailList = String(f.mailList || "").trim();
  const productIds = String(f.productIds || "").trim();
  const buyQty = String(f.buyQty || "").trim();

  const accounts = Core.parseAccounts(mailList, mode);

  if (!mode) errors.push("Chưa chọn Mode");
  if (!imapEmail) errors.push("Thiếu IMAP EMAIL");
  if (!imapPass) errors.push("Thiếu IMAP PASSWORD");
  if (!mailList) errors.push("Thiếu MAIL LIST");

  if (mailList && accounts.length === 0) {
    errors.push("MAIL LIST sai định dạng");
  }

  if (
    mode === "Lottery" ||
    mode === "Buy" ||
    mode === "CheckResult"
  ) {
    if (!productIds) errors.push("Thiếu PRODUCT IDS");
  }

  if (mode === "Buy") {
    const qty = Number(buyQty);

    if (!Number.isInteger(qty) || qty <= 0) {
      errors.push("BUY QTY không hợp lệ");
    }

    if (!String(f.creditOwnerList || "").trim()) {
      errors.push("Thiếu CARD OWNER");
    }

    if (!String(f.creditList || "").trim()) {
      errors.push("Thiếu CARD LIST");
    }
  }

  if (mode === "Create") {
    if (!String(f.names || "").trim()) errors.push("Thiếu NAMES");
    if (!String(f.kanas || "").trim()) errors.push("Thiếu KANAS");
    if (!String(f.phones || "").trim()) errors.push("Thiếu PHONES");
    if (!String(f.postcode || "").trim()) errors.push("Thiếu POSTCODE");
    if (!String(f.pref || "").trim()) errors.push("Thiếu PREF");
    if (!String(f.address1 || "").trim()) errors.push("Thiếu CITY");
    if (!String(f.address2 || "").trim()) errors.push("Thiếu ADDRESS");
    if (!String(f.birthdate || "").trim()) errors.push("Thiếu BIRTHDATE");
  }

  if (
    mode === "ChangeProfile" ||
    mode === "ChangeProfileOrder"
  ) {
    if (!String(f.phones || "").trim()) errors.push("Thiếu PHONES");
    if (!String(f.postcode || "").trim()) errors.push("Thiếu POSTCODE");
    if (!String(f.pref || "").trim()) errors.push("Thiếu PREF");
    if (!String(f.address1 || "").trim()) errors.push("Thiếu CITY");
    if (!String(f.address2 || "").trim()) errors.push("Thiếu ADDRESS");
  }

  if (mode === "ChangeEmail") {
    const bad = mailList
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean)
      .filter(line => line.split(":").length < 5);

    if (bad.length > 0) {
      errors.push("ChangeEmail cần dạng oldmail:pass:newmail:imapmail:imappass");
    }
  }

  return errors;
}

async function run() {
  if (Core.getState().running) {
    Core.addLog("Runner already running", "warn");
    return;
  }
  
  const errors = validateBeforeRun();
  
  if (errors.length > 0) {
    $ui.alert({
      title: "Không thể RUN",
      message: errors.map((e, i) => `${i + 1}. ${e}`).join("\n"),
      actions: ["OK"]
    });
  
    Core.addLog("Validate failed: " + errors.length + " errors", "error");
    return;
  }

  STOP_FLAG = false;
  START_TIME = Date.now();

  Core.setRunning(true);
  Core.addLog("Runner started", "success");

  try {
    let pending = getPending();
    const total = Core.getState().stats.total || pending.length;
    
    if (Core.getState().mode === "CheckResult") {
      await CheckResult.run({
        form: Core.getState().form,
        accounts: pending,
        stopCheck: checkStop
      });
      return;
    }

    if (!pending.length) {
      Core.addLog("No pending accounts", "warn");
      $ui.toast("No pending accounts");
      return;
    }

    while (pending.length > 0) {
      if (STOP_FLAG) {
        Core.addLog("Runner stopped by user", "warn");
        break;
      }

      const acc = pending[0];
      const index = total - pending.length + 1;

      try {
        Core.addLog("Start account: " + acc.email, "info");

        const result = await runOneAccount(acc, index, total);

        if (STOP_FLAG) {
          Core.addLog("Runner stopped before saving result", "warn");
          break;
        }

        pending.shift();
        savePending(pending);

        if (result && result.ok === false) {
          pushFailed(acc, result.reason || "UNKNOWN_ERROR");
        
          Core.addLog(
            "Failed: " + acc.email + " / " + (result.reason || "UNKNOWN_ERROR"),
            "error"
          );
        } else {
          pushDone(acc, result);
          Core.addLog("Done: " + acc.email, "success");
        }
      } catch (e) {
        if (e.message === "__STOP__") {
          Core.addLog("Runner stopped", "warn");
          break;
        }

        pending.shift();
        savePending(pending);

        pushFailed(acc, e.message || e);

        Core.addLog(
          "Failed: " + acc.email + " / " + (e.message || e),
          "error"
        );

        try {
          Web.destroy();
        } catch (_) {
          //
        }
      }

      Core.refreshStats();
    }

    Core.updateCurrent({
      email: "-",
      step: "Idle",
      status: STOP_FLAG ? "Stopped" : "Finished",
      elapsed: elapsedText()
    });

  } catch (e) {
    Core.addLog("Runner fatal: " + (e.message || e), "error");
    $ui.alert(String(e.message || e));
  } finally {
    Core.setRunning(false);
    Core.refreshStats();
  
    if (!STOP_FLAG) {
      Core.addLog("Runner finished", "info");
    }
  }
}

function stop() {
  STOP_FLAG = true;
  Core.setRunning(false);
  Core.addLog("Stop requested", "warn");

  try {
    Web.destroy();
  } catch (_) {
    //
  }
}

module.exports = {
  run,
  stop
};