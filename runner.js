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
const BandaiNamcoCreate = require("./modes/bandainamco_create");
const BandaiImap = require("./services/bandai_imap_manager");
const BandaiPremiumCreate = require("./modes/bandaipremium_create");
const BandaiPremiumLottery = require("./modes/bandaipremium_lottery");

let STOP_FLAG = false;
let START_TIME = 0;
let PREMIUM_ADVANCING = false;

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

  if (mode === "BandaiPremium_Lottery") {
    return await BandaiPremiumLottery.runAccount({acc,index,total,form,stopCheck:checkStop});
  }

  if (mode === "BandaiPremium_Create") {
    return await BandaiPremiumCreate.runAccount({ acc, index, total, form, stopCheck: checkStop });
  }

  if (mode === "BandaiNamco_Create") {
    return await BandaiNamcoCreate.runAccount({ acc, index, total, form, stopCheck: checkStop });
  }

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
  if (!imapEmail) errors.push("Thiếu IMAP EMAIL");
  if (!imapPass) errors.push("Thiếu IMAP PASSWORD");
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
    mode === "BandaiPremium_Lottery" ||
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
  if (mode === "BandaiPremium_Create") {
    for (const key of ["names", "kanas", "phones", "postcode", "address2"]) {
      if (!String(f[key] || "").trim()) errors.push("Thiếu " + key.toUpperCase());
    }
  }
  if (mode === "BandaiNamco_Create") {
    if (!String(f.birthdate || "").trim()) errors.push("Thiếu BIRTHDATE");
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

  const selectedMode = Core.getState().mode;
  if (selectedMode === "BandaiNamco_Lottery") {
    $ui.alert({
      title: "Mode chưa có xử lý",
      message: "Đã thêm giao diện và lựa chọn mode. Chức năng RUN cho " + selectedMode + " chưa được tích hợp; các mode cũ vẫn hoạt động bình thường."
    });
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

    if (selectedMode === "BandaiPremium_Lottery") {
      while (pending.length && !STOP_FLAG) {
        const acc = pending[0];
        const index = total - pending.length + 1;
        const outcome = await runAccountJob(acc,index,total);
        if (STOP_FLAG || outcome.stopped) break;
        if (outcome.error || !outcome.result || outcome.result.ok !== true) {
          const reason = String(outcome.error ? outcome.error.message || outcome.error : 'LOTTERY_NOT_COMPLETED');
          pushFailed(acc,reason);
          Core.addLog('[Premium Lottery] Failed '+acc.email+': '+reason,'error');
          if (reason === 'Dính Paydi') {
            // Payment was not submitted: skip only this account and continue.
            pending.shift();
            savePending(pending);
            Core.refreshStats();
            continue;
          }
          // Do not automatically advance to another account on an uncertain payment state.
          break;
        }
        pushDone(acc,outcome.result);
        pending.shift();
        savePending(pending);
        Core.refreshStats();
        Core.addLog('[Premium Lottery] Clear WebView done; Reset IP', 'warn');
        Session.setDeferNetworkReset(false);
        const resetOk = await Session.resetIP();
        if (!resetOk) { Core.addLog('[Premium Lottery] Reset IP failed; stop', 'error'); break; }
        Session.setDeferNetworkReset(parallel);
      }
      Core.updateCurrent({step:STOP_FLAG?'Stopped':'Lottery finished/paused',status:STOP_FLAG?'Stopped':'Finished',elapsed:elapsedText()});
      return;
    }

    // Bandai Namco uses API/IMAP, not WebView. Run exactly one wave of
    // maxWorkers accounts at a time; rotate IP ONCE only after all jobs settle.
    if (selectedMode === "BandaiNamco_Create") {
      while (pending.length && !STOP_FLAG) {
        const batch = pending.slice(0, maxWorkers);
        const baseIndex = total - pending.length;
        Core.addLog("[BandaiNamco] Start wave: " + batch.length + "/" + maxWorkers + " workers", "info");
        const waveForm = Core.getState().form;
        try {
          await BandaiImap.startWave(waveForm.imapEmail, waveForm.imapPass, batch.map(a => a.email));
          Core.addLog('[BandaiNamco] IMAP ready; start workers with legacy OTP lookup', 'success');
        } catch (e) {
          Core.addLog('[BandaiNamco] IMAP startup failed: '+String(e.message||e), 'error');
          BandaiImap.endWave();
          break;
        }
        const outcomes = await Promise.all(batch.map((acc, i) =>
          runAccountJob(acc, baseIndex + i + 1, total)));
        BandaiImap.endWave();
        if (STOP_FLAG) break;
        for (const outcome of outcomes) {
          if (!outcome || outcome.stopped) continue;
          const acc = outcome.acc;
          if (outcome.error || (outcome.result && outcome.result.ok === false)) {
            const reason = outcome.error ? String(outcome.error.message || outcome.error) :
              String(outcome.result.reason || "UNKNOWN_ERROR");
            pushFailed(acc, reason, {data:acc.data});
            Core.addLog("Failed: " + acc.email + " / " + reason, "error");
          } else {
            pushDone(acc, outcome.result);
            Core.addLog("Done: " + acc.email, "success");
          }
        }
        pending = pending.filter(acc => !batch.includes(acc));
        savePending(pending);
        Core.refreshStats();
        if (STOP_FLAG) break;
        // Do not call cleanupAccount: BandaiNamco_Create uses no WV.
        // Temporarily disable deferral so this actually runs the Shortcut.
        Core.addLog("[BandaiNamco] Wave finished; Reset IP once", "warn");
        Session.setDeferNetworkReset(false);
        const resetOk = await Session.resetIP();
        if (!resetOk) {
          Core.addLog("[BandaiNamco] Reset IP failed; next wave blocked", "error");
          break;
        }
        Session.setDeferNetworkReset(parallel);
      }
      Core.updateCurrent({step: STOP_FLAG ? "Stopped" : "Wave finished",
        status: STOP_FLAG ? "Stopped" : "Finished", elapsed: elapsedText()});
      return;
    }

    // Premium: run a whole worker-sized wave concurrently. All OTP WebViews
    // stay alive until EVERY account in the wave has verified successfully.
    // Clear the entire wave, then rotate IP ONCE, then start the next wave.
    if (selectedMode === "BandaiPremium_Create") {
      while (pending.length && !STOP_FLAG) {
        const batch = pending.slice(0, maxWorkers);
        const baseIndex = total - pending.length;
        Core.addLog("[BandaiPremium] Start wave: " + batch.length + "/" + maxWorkers + " workers", "info");
        const outcomes = await Promise.all(batch.map((acc, i) =>
          runAccountJob(acc, baseIndex + i + 1, total)));
        const otpTasks = [];
        const webviews = [];
        let waveFailed = false;
        for (const outcome of outcomes) {
          if (!outcome || outcome.stopped || STOP_FLAG) continue;
          const acc = outcome.acc;
          const result = outcome.result;
          if (outcome.error || !result || !result.waitingSms) {
            const reason = outcome.error ? String(outcome.error.message || outcome.error) :
              String((result && result.reason) || "PREMIUM_UNEXPECTED_RESULT");
            pushFailed(acc, reason, {data:acc.data});
            Core.addLog("Failed: " + acc.email + " / " + reason, "error");
            waveFailed = true;
            continue;
          }
          webviews.push(result.webview);
          Core.addLog("Waiting SMS OTP: " + acc.email, "warn");
          otpTasks.push(new Promise(resolve => {
            let settled = false;
            const finish = ok => { if (!settled) { settled = true; resolve(ok); } };
            BandaiPremiumCreate.watchOtp(result.webview, acc, async doneAcc => {
              if (STOP_FLAG) { finish(false); return; }
              pushDone(doneAcc, {mode:"BandaiPremium_Create",verified:true});
              Core.addLog("Premium registration completed: " + doneAcc.email, "success");
              Core.refreshStats();
              finish(true);
            }, result.smsInfo, async (failedAcc, reason) => {
              if (STOP_FLAG) { finish(false); return; }
              pushFailed(failedAcc, reason, {data:failedAcc.data});
              Core.addLog('Premium OTP failed: ' + failedAcc.email + ' / ' + reason, 'error');
              Core.refreshStats();
              waveFailed = true;
              finish(true); // Settled failure: continue wave and next accounts.
            });
            // STOP must release the wave even when an OTP was never entered.
            (async () => {
              while (!settled && !STOP_FLAG) await Web.delay(250);
              if (STOP_FLAG) finish(false);
            })();
          }));
        }
        const otpResults = await Promise.all(otpTasks);
        if (STOP_FLAG) break;
        if (otpResults.some(ok => !ok)) {
          Core.addLog("[BandaiPremium] OTP watcher interrupted; wave stopped", "error");
          break;
        }
        // All accounts in this wave have finished or failed; never clear a
        // still-pending OTP session or reset network while it is in use.
        Core.addLog("[BandaiPremium] Wave finished; Clear Full " + webviews.length + " WebView(s)", "warn");
        for (const wv of webviews) {
          try { await Session.cleanupAccount(wv, 0, 0, {logout:false,resetIP:false}); }
          catch (e) { Core.addLog("Premium cleanup: " + String(e.message || e), "error"); waveFailed = true; }
        }
        pending = pending.filter(acc => !batch.includes(acc));
        savePending(pending);
        Core.refreshStats();
        if (STOP_FLAG) break;
        Core.addLog("[BandaiPremium] Reset IP once after entire wave", "warn");
        Session.setDeferNetworkReset(false);
        const resetOk = await Session.resetIP();
        if (!resetOk) {
          Core.addLog("[BandaiPremium] Reset IP failed; next wave blocked", "error");
          break;
        }
        Session.setDeferNetworkReset(parallel);
        if (waveFailed) Core.addLog("[BandaiPremium] Wave had failed accounts; see Fail list", "warn");
      }
      Core.updateCurrent({step:STOP_FLAG?"Stopped":"Wave finished",status:STOP_FLAG?"Stopped":"Finished",elapsed:elapsedText()});
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
      let pauseForSms = false;

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

        if (result && result.waitingSms) {
          const waiting = Core.loadJSON('bandai_premium_waiting_sms.json', []);
          waiting.push({email:acc.email, status:'Waiting SMS OTP', at:Date.now()});
          Core.saveJSON('bandai_premium_waiting_sms.json', waiting);
          Core.addLog('Waiting SMS OTP: ' + acc.email + ' / auto-submit after 6 digits; batch paused.', 'warn');
          if (selectedMode === 'BandaiPremium_Create') {
            BandaiPremiumCreate.watchOtp(result.webview, acc, async function(doneAcc) {
              const list=Core.loadJSON('bandai_premium_waiting_sms.json', []);
              Core.saveJSON('bandai_premium_waiting_sms.json', list.filter(x=>x.email!==doneAcc.email));
              pushDone(doneAcc, {mode:'BandaiPremium_Create',verified:true});
              Core.addLog('Premium registration completed: '+doneAcc.email, 'success');
              Core.refreshStats();
              // Serialize cleanup + network rotation + next account. Do not
              // start the next WebView until the previous one is fully cleared.
              if (PREMIUM_ADVANCING || STOP_FLAG) return;
              PREMIUM_ADVANCING = true;
              try {
                Core.updateCurrent({email:doneAcc.email,step:'Cleanup',status:'Clearing session'});
                Core.addLog('[BandaiPremium] Clear full after verified account', 'warn');
                await Session.cleanupAccount(result.webview, 0, 0, {logout:false,resetIP:false});
                if (STOP_FLAG) return;
                Core.updateCurrent({email:doneAcc.email,step:'Reset IP',status:'Airplane mode'});
                Core.addLog('[BandaiPremium] Reset IP: bật/tắt máy bay qua Shortcut Reset IP', 'warn');
                const resetOk = await Session.resetIP();
                if (!resetOk) {
                  Core.addLog('[BandaiPremium] Reset IP failed; không chạy account tiếp', 'error');
                  return;
                }
                if (STOP_FLAG) return;
                // The original batch may still be finishing its finally block.
                while (Core.getState().running && !STOP_FLAG) await Web.delay(200);
                if (STOP_FLAG) return;
                if (getPending().length) {
                  Core.addLog('[BandaiPremium] Cleanup + Reset IP xong; chạy account tiếp', 'success');
                  await run();
                } else {
                  Core.updateCurrent({email:doneAcc.email,step:'Done',status:'Finished'});
                  Core.addLog('[BandaiPremium] Hoàn tất toàn bộ danh sách', 'success');
                }
              } catch (e) {
                Core.addLog('[BandaiPremium] Post-success cleanup failed: '+String(e.message||e), 'error');
              } finally {
                PREMIUM_ADVANCING = false;
              }
            });
          }
          if (selectedMode === 'BandaiPremium_Create') pauseForSms = true;
        } else if (result && result.ok === false) {
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

      if (pauseForSms) {
        Core.addLog("Premium paused at SMS OTP; pending accounts will not auto-run", "warn");
        break;
      }

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

    if ((Core.getState().mode === "BandaiNamco_Create" || Core.getState().mode === "BandaiPremium_Create") && !STOP_FLAG) {
      Core.updateCurrent({
        status: Core.getState().mode === "BandaiPremium_Create" ? "Waiting SMS OTP" : "Finished",
        elapsed: elapsedText()
      });
    } else {
      Core.updateCurrent({
        email: "-",
        step: "Idle",
        status: STOP_FLAG ? "Stopped" : "Finished",
        elapsed: elapsedText()
      });
    }
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
      Core.addLog("Runner paused/finished", "info");
    }
  }
}

async function nextAccount() {
  if (Core.getState().mode !== "BandaiPremium_Create") {
    $ui.toast("NEXT ACC chỉ dành cho Premium Create");
    return;
  }
  if (Core.getState().running) {
    $ui.toast("Đang chạy, hãy chờ");
    return;
  }
  const pending = getPending();
  if (!pending.length) {
    $ui.toast("Không còn account đang chờ");
    return;
  }
  Core.addLog("NEXT ACC: " + pending[0].email, "info");
  await run();
}

function stop() {
  STOP_FLAG = true;
  BandaiPremiumCreate.cancelOtpWatchers();
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
