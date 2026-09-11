// ================= RUNNER - PokeTool V1.2 =================

const Core = require("./core");
const Web = require("./web");
const Lottery = require("./modes/lottery");
const CheckResult = require("./modes/checkresult");
const ChangeProfileOrder = require("./modes/changeprofileorder");
const Create = require("./modes/create");
const ChangeEmail = require("./modes/changeemail");
const Buy = require("./modes/autobuy");
const BuyJumpPlus = require("./modes/buyjumpplus");
const Session = require("./services/session");

let STOP_FLAG = false;
let START_TIME = 0;

const WORKER_CACHE_KEY = "PokeTool.V1.MaxWorkers";

function clampWorkers(value) {
  const n = Number(value || 2);
  return Math.max(1, Math.min(10, Math.floor(n)));
}

function getMaxWorkers() {
  try {
    return clampWorkers($cache.get(WORKER_CACHE_KEY) || 2);
  } catch (_) {
    return 2;
  }
}

function setMaxWorkers(value) {
  const workers = clampWorkers(value);

  try {
    $cache.set(WORKER_CACHE_KEY, workers);
  } catch (_) {}

  return workers;
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
    text:
      meta && meta.paymentCode
        ? `${acc.email}:${acc.pass}\t${meta.paymentCode}`
        : `${acc.email}:${acc.pass}`,
    doneAt: Date.now(),
    meta: meta || {}
  });

  Core.saveJSON(Core.FILE_DONE, list);
  Core.refreshStats();
}

function pushFailed(acc, error, meta) {
  const list = Core.loadJSON(Core.FILE_FAILED, []);
  const reason = String(error || "Unknown error");

  list.push(
    Object.assign({}, acc, {
      text: `${acc.email}:${acc.pass}\t${reason}`,
      reason,
      failedAt: Date.now(),
      meta: meta || {}
    })
  );

  Core.saveJSON(Core.FILE_FAILED, list);
  Core.refreshStats();
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

  if (mode === "ChangeProfileOrder") {
    return await ChangeProfileOrder.runAccount({
      acc,
      index,
      total,
      form,
      stopCheck: checkStop
    });
  }

  if (mode === "Create") {
    return await Create.runAccount({
      acc,
      index,
      total,
      form,
      stopCheck: checkStop
    });
  }

  if (mode === "ChangeEmail") {
    return await ChangeEmail.runAccount({
      acc,
      index,
      total,
      form,
      stopCheck: checkStop
    });
  }

  if (mode === "Buy") {
    return await Buy.runAccount({
      acc,
      index,
      total,
      form,
      stopCheck: checkStop
    });
  }

  if (mode === "BuyJumpPlus") {
    return await BuyJumpPlus.runAccount({
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
  if (!mode) {
    errors.push("Chưa chọn Mode");
  }
  if (!imapEmail) {
    errors.push("Thiếu IMAP EMAIL");
  }
  if (!imapPass) {
    errors.push("Thiếu IMAP PASSWORD");
  }
  if (!mailList) {
    errors.push("Thiếu MAIL LIST");
  }
  if (mailList && accounts.length === 0) {
    errors.push("MAIL LIST sai định dạng");
  }
  if (mode === "Buy" || mode === "BuyJumpPlus") {
    const creditList = String(f.creditList || "").trim();
    const creditOwnerList = String(f.creditOwnerList || "").trim();
    if (!creditList) {
      errors.push("Thiếu CREDIT LIST");
    }
    if (!creditOwnerList) {
      errors.push("Thiếu CREDIT OWNER LIST");
    }
  }
  if (
    mode === "Lottery" ||
    mode === "Buy" ||
    mode === "BuyJumpPlus" ||
    mode === "CheckResult" ||
    mode === "ChangeProfileOrder"
  ) {
    if (!productIds) {
      errors.push("Thiếu PRODUCT IDS");
    }
  }
  if (mode === "Buy" || mode === "BuyJumpPlus") {
    const qty = Number(buyQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      errors.push("BUY QTY không hợp lệ");
    }
  }
  if (mode === "Create" || mode === "BuyJumpPlus") {
    if (!String(f.names || "").trim()) {
      errors.push("Thiếu NAMES");
    }

    if (!String(f.kanas || "").trim()) {
      errors.push("Thiếu KANAS");
    }
    if (mode === "Create" && !String(f.phones || "").trim()) {
      errors.push("Thiếu PHONES");
    }

    if (!String(f.postcode || "").trim()) {
      errors.push("Thiếu POSTCODE");
    }

    if (!String(f.pref || "").trim()) {
      errors.push("Thiếu PREF");
    }

    if (!String(f.address1 || "").trim()) {
      errors.push("Thiếu CITY");
    }

    if (!String(f.address2 || "").trim()) {
      errors.push("Thiếu ADDRESS");
    }

    if (!String(f.birthdate || "").trim()) {
      errors.push("Thiếu BIRTHDATE");
    }
  }
  if (mode === "ChangeProfile" || mode === "ChangeProfileOrder") {
    const hasAnyProfile =
      String(f.names || "").trim() ||
      String(f.kanas || "").trim() ||
      String(f.phones || "").trim() ||
      String(f.postcode || "").trim() ||
      String(f.pref || "").trim() ||
      String(f.address1 || "").trim() ||
      String(f.address2 || "").trim() ||
      String(f.birthdate || "").trim();
    if (!hasAnyProfile) {
      errors.push("Thiếu dữ liệu cần đổi");
    }
  }
  if (mode === "ChangeEmail") {
    const bad = mailList
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean)
      .filter(line => {
        return line.split(":").length < 5;
      });
    if (bad.length > 0) {
      errors.push(
        "ChangeEmail cần dạng " + "oldmail:pass:newmail:imapmail:imappass"
      );
    }
  }
  return errors;
}

async function runAccountJob(acc, index, total) {
  try {
    Core.addLog("*************************************", "info");
    Core.addLog("[A" + index + "] Start account: " + acc.email, "info");

    const result = await runOneAccount(acc, index, total);

    if (STOP_FLAG) {
      return {
        acc,
        index,
        stopped: true
      };
    }

    return {
      acc,
      index,
      result
    };
  } catch (error) {
    if (error && error.message === "__STOP__") {
      return {
        acc,
        index,
        stopped: true
      };
    }

    return {
      acc,
      index,
      error
    };
  }
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

  const maxWorkers = getMaxWorkers();
  const parallel = maxWorkers > 1;

  Core.addLog("Runner started / workers=" + maxWorkers, "success");

  // Khi nhiều account chạy đồng thời, không reset IP giữa lúc
  // worker khác còn đang dùng network. Reset một lần sau mỗi batch.
  Session.setDeferNetworkReset(parallel);

  try {
    let pending = getPending();
    const total = Core.getState().stats.total || pending.length;

    // Giữ nguyên flow CheckResult cũ.
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

      const batchSize = Math.min(maxWorkers, pending.length);
      const batch = pending.slice(0, batchSize);
      const baseIndex = total - pending.length;

      Core.addLog("Start batch: " + batch.length + " account(s)", "info");

      const jobs = batch.map((acc, offset) =>
        runAccountJob(acc, baseIndex + offset + 1, total)
      );

      const outcomes = await Promise.all(jobs);
      let changed = false;

      for (const outcome of outcomes) {
        if (!outcome || outcome.stopped) {
          continue;
        }

        const acc = outcome.acc;
        const pos = pending.indexOf(acc);

        if (pos >= 0) {
          pending.splice(pos, 1);
          changed = true;
        }

        if (outcome.error) {
          pushFailed(acc, outcome.error.message || outcome.error, {
            data: acc.data
          });

          Core.addLog(
            "Failed: " +
              acc.email +
              " / " +
              (outcome.error.message || outcome.error),
            "error"
          );
          continue;
        }

        const result = outcome.result;

        if (result && result.ok === false) {
          pushFailed(acc, result.reason || "UNKNOWN_ERROR", result);

          Core.addLog(
            "Failed: " + acc.email + " / " + (result.reason || "UNKNOWN_ERROR"),
            "error"
          );
        } else {
          pushDone(acc, result);
          Core.addLog("Done: " + acc.email, "success");
        }
      }

      if (changed) {
        savePending(pending);
      }

      Core.refreshStats();

      if (parallel) {
        try {
          await Session.flushDeferredReset();
        } catch (_) {}
      }

      if (STOP_FLAG) {
        Core.addLog("Runner stopped by user", "warn");
        break;
      }
    }

    Core.updateCurrent({
      email: "-",
      step: "Idle",
      status: STOP_FLAG ? "Stopped" : "Finished",
      elapsed: elapsedText()
    });
  } catch (error) {
    Core.addLog("Runner fatal: " + (error.message || error), "error");
    $ui.alert(String(error.message || error));
  } finally {
    try {
      if (parallel) {
        await Session.flushDeferredReset();
      }
    } catch (_) {}

    Session.setDeferNetworkReset(false);

    try {
      BuyJumpPlus.resetSelection();
    } catch (error) {
      Core.addLog(
        "Reset Jump selection lỗi: " +
          String(error && error.message ? error.message : error),
        "warn"
      );
    }

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
    Web.destroyAll();
  } catch (_) {
    //
  }
}

module.exports = {
  run,
  stop,
  getMaxWorkers,
  setMaxWorkers
};
