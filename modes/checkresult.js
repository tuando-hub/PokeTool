const Core = require("../core");
const Web = require("../web");
const Auth = require("../services/auth");
const Session = require("../services/session");

const LOGIN_URL = "https://www.pokemoncenter-online.com/login/";
const HISTORY_URL = "https://www.pokemoncenter-online.com/lottery-history/";

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") stopCheck();
}

function formatImapDate(d) {
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()}-${m[d.getMonth()]}-${d.getFullYear()}`;
}

function chooseCheckType() {
  return new Promise(resolve => {
    $ui.menu({
      title: "CheckResult",
      items: ["CheckMail", "CheckAcc"],
      handler(title) {
        resolve(title || "");
      }
    });
  });
}

function pickDate() {
  return new Promise(resolve => {
    const CHECKERS = ["Tuấn", "Hào", "Hoàng"];
    let selectedChecker = null;
    let selectedLimit = 1;

    $ui.push({
      props: { title: "📅 Chọn ngày check mail" },
      views: [
        {
          type: "date-picker",
          props: { id: "datePicker", mode: 1, date: new Date() },
          layout: make => {
            make.top.inset(20);
            make.left.right.inset(20);
            make.height.equalTo(180);
          }
        },
        {
          type: "button",
          props: {
            id: "checkerBtn",
            title: "👤 Chọn người",
            bgcolor: $color("#111827"),
            titleColor: $color("white"),
            radius: 12
          },
          layout: make => {
            make.top.equalTo($("datePicker").bottom).offset(20);
            make.left.right.inset(20);
            make.height.equalTo(50);
          },
          events: {
            tapped() {
              $ui.menu({
                title: "👤 Người check",
                items: CHECKERS,
                handler(name) {
                  if (!name) return;
                  selectedChecker = name;
                  $("checkerBtn").title = "👤 " + name;
                }
              });
            }
          }
        },
        {
          type: "button",
          props: {
            id: "limitBtn",
            title: "📦 Số mail check: 1",
            bgcolor: $color("#111827"),
            titleColor: $color("white"),
            radius: 12
          },
          layout: make => {
            make.top.equalTo($("checkerBtn").bottom).offset(12);
            make.left.right.inset(20);
            make.height.equalTo(50);
          },
          events: {
            tapped() {
              $ui.menu({
                title: "📦 Chọn số mail",
                items: ["1", "2", "3", "4", "5"],
                handler(v) {
                  if (!v) return;
                  selectedLimit = Number(v);
                  $("limitBtn").title = "📦 Số mail check: " + v;
                }
              });
            }
          }
        },
        {
          type: "button",
          props: {
            title: "✅ Xác nhận",
            bgcolor: $color("#22C55E"),
            titleColor: $color("white"),
            radius: 14
          },
          layout: make => {
            make.left.right.inset(20);
            make.bottom.inset(30);
            make.height.equalTo(52);
          },
          events: {
            tapped() {
              if (!selectedChecker) {
                $ui.toast("Chưa chọn người check");
                return;
              }

              const d = $("datePicker").date;
              $ui.pop();

              resolve({
                date: formatImapDate(d),
                checker: selectedChecker,
                limit: selectedLimit
              });
            }
          }
        }
      ]
    });
  });
}

function callNodeCheckMail({ imapEmail, imapPass, mails, date, checker, limit }) {
  return new Promise(resolve => {
    const eventId = "CHECKMAIL_" + Date.now();

    $nodejs.listen(eventId, res => {
      resolve(res || { ok: false, reason: "EMPTY_NODE_RESPONSE" });
    });

    $nodejs.run({
      name: "GETOtp",
      argv: [
        imapEmail,
        imapPass,
        "",
        eventId,
        "CheckMail",
        JSON.stringify({ mails, date, checker, limit })
      ]
    });
  });
}

function findAcc(accounts, email) {
  return accounts.find(a =>
    String(a.email || "").toLowerCase() ===
    String(email || "").toLowerCase()
  );
}

async function runCheckMail(ctx) {
  const form = ctx.form || {};
  const accounts = Array.isArray(ctx.accounts) ? ctx.accounts : [];

  const firstTask = accounts[0] || {};
  
  const imapEmail = String(
    firstTask.imapEmail || form.imapEmail || ""
  ).trim();
  
  const imapPass = String(
    firstTask.imapPass || form.imapPass || ""
  ).trim();

  if (!imapEmail || !imapPass) {
    $ui.alert("Thiếu IMAP EMAIL / PASSWORD");
    return;
  }

  if (!accounts.length) {
    $ui.alert("Không có account để check");
    return;
  }

  const opt = await pickDate();

  Core.addLog(
    "CheckMail: " + opt.date + " / " + opt.checker + " / limit " + opt.limit,
    "info"
  );

  Core.updateCurrent({
    email: "-",
    step: "CHECKMAIL",
    status: "Checking mail...",
    index: 0,
    total: accounts.length
  });

  const mails = accounts.map(a => a.email).filter(Boolean);

  const rs = await callNodeCheckMail({
    imapEmail,
    imapPass,
    mails,
    date: opt.date,
    checker: opt.checker,
    limit: opt.limit
  });

  if (!rs.ok) {
    Core.addLog("CheckMail failed: " + (rs.reason || "UNKNOWN"), "error");
    $ui.alert("CheckMail lỗi: " + (rs.reason || "UNKNOWN"));
    return;
  }

  const done = [];
  const failed = [];

  (rs.win || []).forEach(mail => {
    const acc = findAcc(accounts, mail) || { email: mail, pass: "" };

    done.push({
      ...acc,
      text: `${acc.email}:${acc.pass}`,
      result: "WIN",
      doneAt: Date.now()
    });
  });

  (rs.lost || []).forEach(mail => {
    const acc = findAcc(accounts, mail) || { email: mail, pass: "" };

    failed.push({
      ...acc,
      text: `${acc.email}:${acc.pass}\tLOST`,
      reason: "LOST",
      failedAt: Date.now()
    });
  });

  (rs.notmail || []).forEach(mail => {
    const acc = findAcc(accounts, mail) || { email: mail, pass: "" };

    failed.push({
      ...acc,
      text: `${acc.email}:${acc.pass}\tNOTMAIL`,
      reason: "NOTMAIL",
      failedAt: Date.now()
    });
  });

  Core.saveJSON(Core.FILE_PENDING, []);
  Core.saveJSON(Core.FILE_DONE, done);
  Core.saveJSON(Core.FILE_FAILED, failed);
  Core.refreshStats();
  
  Core.updateCurrent({
      email: "-",
      step: "Idle",
      status: "CheckMail Finished"
    });

  Core.addLog(
    "CheckMail done: WIN " +
      (rs.win || []).length +
      " / LOST " +
      (rs.lost || []).length +
      " / NOTMAIL " +
      (rs.notmail || []).length,
    "success"
  );

  $ui.alert(
    "🎉 CheckMail xong\n" +
    "🏆 Win: " + (rs.win || []).length + "\n" +
    "❌ Lost: " + (rs.lost || []).length + "\n" +
    "📭 NotMail: " + (rs.notmail || []).length
  );
}

async function detectLotteryResult(wv, productId) {
  return await Web.evalJS(wv, `
(() => {
  const items = [...document.querySelectorAll(".comOrderList li")];

  if (!items.length) return { result: "NO_HISTORY" };

  let item = items[0];

  if (${JSON.stringify(productId || "")}) {
    item = items.find(x => {
      const img = x.querySelector("img")?.src || "";
      return img.includes("/" + ${JSON.stringify(productId || "")} + "/");
    });

    if (!item) return { result: "NOT_FOUND" };
  }

  const status = item.querySelector(".txtBox01 p")?.innerText?.trim() || "";
  const title = item.querySelector(".ttl")?.innerText?.trim() || "";

  if (status.includes("当選")) return { result: "WIN", title, status };
  Core.playSuccessSound();
  if (status.includes("落選")) return { result: "LOST", title, status };
  if (status.includes("応募中")) return { result: "WAIT", title, status };

  return { result: "UNKNOWN", title, status };
})();
  `);
}

async function runCheckAccOne(acc, index, total, form, stopCheck) {
  const email = acc.email;
  const pass = acc.pass;

  const runForm = Object.assign({}, form, {
    imapEmail: acc.imapEmail || form.imapEmail,
    imapPass: acc.imapPass || form.imapPass,
    productIds: acc.productIds || form.productIds
  });
  
  const productIds = String(runForm.productIds || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
  
  const productId = productIds[0] || "";

  let wv = null;

  try {
    checkStop(stopCheck);

    Core.updateCurrent({
      email,
      step: "CHECKACC",
      status: "Create WebView",
      index,
      total
    });

    wv = Web.create("about:blank");

    if (!wv) throw new Error("Cannot create WebView");

    wv.url = LOGIN_URL + "?t=" + Date.now();

    await Web.waitPageReady(wv, 30000);
    await Web.delay(2500);

    const authRs = await Auth.loginOtpTerms({
      wv,
      email,
      pass,
      form: runForm,
      mode: "CheckResult",
      stopCheck,
      index,
      total
    });

    if (!authRs.ok) return authRs;

    checkStop(stopCheck);

    Core.updateCurrent({
      email,
      step: "HISTORY",
      status: "Open lottery history",
      index,
      total
    });

    Core.addLog("Open lottery history", "info");

    wv.url = HISTORY_URL + "?t=" + Date.now();

    await Web.waitPageReady(wv, 30000);
    await Web.delay(3000);

    const rs = await detectLotteryResult(wv, productId);

    Core.addLog(
      "CheckAcc: " +
        email +
        " / " +
        rs.result +
        (rs.title ? " / " + rs.title : ""),
      rs.result === "WIN"
        ? "success"
        : rs.result === "LOST"
        ? "error"
        : "warn"
    );

    if (rs.result === "WIN") {
      return {
        ok: true,
        reason: "WIN",
        result: "WIN",
        title: rs.title || "",
        status: rs.status || ""
      };
    }

    return {
      ok: false,
      reason: rs.result || "CHECK_ACC_FAIL",
      result: rs.result || "UNKNOWN",
      title: rs.title || "",
      status: rs.status || ""
    };

  } finally {
    await Session.cleanupAccount(wv, index, total);
  }
}

async function runCheckAcc(ctx) {
  const form = ctx.form || {};
  const accounts = Array.isArray(ctx.accounts) ? ctx.accounts.slice() : [];
  const stopCheck = ctx.stopCheck;

  if (!accounts.length) {
    $ui.alert("Không có account để check");
    return;
  }

  const done = [];
  const failed = [];

  Core.saveJSON(Core.FILE_PENDING, accounts);

  const total = accounts.length;

  while (accounts.length > 0) {
    checkStop(stopCheck);

    const acc = accounts[0];
    const index = total - accounts.length + 1;

    Core.addLog("Start check acc: " + acc.email, "info");

    const rs = await runCheckAccOne(
      acc,
      index,
      total,
      form,
      stopCheck
    );

    accounts.shift();

    if (rs.ok) {
      done.push({
        email: acc.email,
        pass: acc.pass,
        text: `${acc.email}:${acc.pass}`,
        result: "WIN",
        doneAt: Date.now(),
        meta: rs
      });
    } else {
      failed.push({
        email: acc.email,
        pass: acc.pass,
        text: `${acc.email}:${acc.pass}\t${rs.reason || "LOST"}`,
        reason: rs.reason || "LOST",
        failedAt: Date.now(),
        meta: rs
      });
    }

    Core.saveJSON(Core.FILE_PENDING, accounts);
    Core.saveJSON(Core.FILE_DONE, done);
    Core.saveJSON(Core.FILE_FAILED, failed);
    Core.refreshStats();
  }

  Core.updateCurrent({
    email: "-",
    step: "Idle",
    status: "CheckAcc Finished",
    index: total,
    total
  });

  $ui.alert(
    "🎉 CheckAcc xong\n" +
    "🏆 Win: " + done.length + "\n" +
    "❌ Lost/Wait/NotFound: " + failed.length
  );
}

async function run(ctx) {
  const type = await chooseCheckType();

  if (type === "CheckMail") {
    return await runCheckMail(ctx);
  }

  if (type === "CheckAcc") {
    return await runCheckAcc(ctx);
  }

  Core.addLog("CheckResult cancelled", "warn");
}

module.exports = {
  run,
  runCheckMail,
  runCheckAcc
};