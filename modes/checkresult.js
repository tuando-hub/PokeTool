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
                checker: selectedChecker
              });
            }
          }
        }
      ]
    });
  });
}

function callNodeCheckMail({ imapEmail, imapPass, mails, date, checker, productId }) {
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
        JSON.stringify({
          mails,
          date,
          checker,
          productId
        })
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
  
  const mails = accounts.map(a => a.email).filter(Boolean);
  
  const productId = String(
    firstTask.productIds || form.productIds || ""
  )
    .split(/[,，\n\r\s]+/)
    .map(x => x.trim())
    .filter(Boolean)[0] || "";
  
  if (!productId) {
    $ui.alert("Thiếu PRODUCT IDS");
    return;
  }
  
  Core.addLog(
    "CheckMail: " + opt.date + " / " + opt.checker + " / product " + productId,
    "info"
  );
  
  Core.updateCurrent({
    email: "-",
    step: "CHECKMAIL",
    status: "Checking mail...",
    index: 0,
    total: accounts.length
  });

  const rs = await callNodeCheckMail({
    imapEmail,
    imapPass,
    mails,
    date: opt.date,
    checker: opt.checker,
    productId
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

async function detectLotteryResults(wv, productIds) {
  return await Web.evalJS(wv, `
(() => {
  const productIds = ${JSON.stringify(productIds || [])};

  const items = [...document.querySelectorAll(".comOrderList li")];

  if (!items.length) {
    return productIds.map(id => ({
      productId: id,
      result: "NO_HISTORY"
    }));
  }

  return productIds.map(id => {
    const item = items.find(x => {
      const img = x.querySelector("img")?.src || "";
      return img.includes("/" + id + "/");
    });

    if (!item) {
      return {
        productId: id,
        result: "NO_HISTORY"
      };
    }

    const status =
      item.querySelector(".txtBox01 p")
        ?.innerText
        ?.trim() || "";

    const title =
      item.querySelector(".ttl")
        ?.innerText
        ?.trim() || "";

    if (status.includes("当選")) {
      return {
        productId: id,
        result: "WIN",
        title,
        status
      };
    }

    if (status.includes("落選")) {
      return {
        productId: id,
        result: "LOST",
        title,
        status
      };
    }

    if (status.includes("応募中")) {
      return {
        productId: id,
        result: "WAIT",
        title,
        status
      };
    }

    return {
      productId: id,
      result: "UNKNOWN",
      title,
      status
    };
  });
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
    .split(/[,，\n\r\s]+/)
    .map(x => x.trim())
    .filter(Boolean);
  
  if (!productIds.length) {
    return {
      ok: false,
      reason: "NO_PRODUCT_IDS"
    };
  }

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

    const results = await detectLotteryResults(wv, productIds);
    
    const winList = results.filter(x => x.result === "WIN");
    const failList = results.filter(x => x.result !== "WIN");
    
    if (winList.length > 0) {
      Core.playSuccessSound();
    }
    
    Core.addLog(
      "CheckAcc: " +
        email +
        " / WIN " +
        winList.length +
        " / OTHER " +
        failList.length,
      winList.length ? "success" : "warn"
    );
    
    if (winList.length > 0) {
      return {
        ok: true,
        reason: "WIN",
        results,
        winList
      };
    }
    
    return {
      ok: false,
      reason: failList[0]?.result || "CHECK_ACC_FAIL",
      results
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
      (rs.winList || []).forEach(w => {
        done.push({
          email: acc.email,
          pass: acc.pass,
          productId: w.productId,
          text: `${acc.email}:${acc.pass}\t${w.productId}\tWIN`,
          result: "WIN",
          doneAt: Date.now(),
          meta: w
        });
      });
    
      const others = (rs.results || []).filter(x => x.result !== "WIN");
    
      others.forEach(x => {
        failed.push({
          email: acc.email,
          pass: acc.pass,
          productId: x.productId,
          text: `${acc.email}:${acc.pass}\t${x.productId}\t${x.result}`,
          reason: x.result,
          failedAt: Date.now(),
          meta: x
        });
      });
    
    } else {
      (rs.results || []).forEach(x => {
        failed.push({
          email: acc.email,
          pass: acc.pass,
          productId: x.productId,
          text: `${acc.email}:${acc.pass}\t${x.productId}\t${x.result || rs.reason || "UNKNOWN"}`,
          reason: x.result || rs.reason || "UNKNOWN",
          failedAt: Date.now(),
          meta: x
        });
      });
    
      if (!rs.results || !rs.results.length) {
        failed.push({
          email: acc.email,
          pass: acc.pass,
          text: `${acc.email}:${acc.pass}\t\t${rs.reason || "UNKNOWN"}`,
          reason: rs.reason || "UNKNOWN",
          failedAt: Date.now(),
          meta: rs
        });
      }
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
  
  const stat = {
    WIN: 0,
    LOST: 0,
    WAIT: 0,
    NO_HISTORY: 0,
    UNKNOWN: 0
  };
  
  done.forEach(() => stat.WIN++);
  
  failed.forEach(x => {
    const k = x.reason || "UNKNOWN";
  
    if (stat[k] == null) {
      stat.UNKNOWN++;
    } else {
      stat[k]++;
    }
  });

  $ui.alert(
    "🎉 CheckAcc xong\n\n" +
    "🏆 WIN: " + stat.WIN + "\n" +
    "❌ LOST: " + stat.LOST + "\n" +
    "⏳ WAIT: " + stat.WAIT + "\n" +
    "📜 NO_HISTORY: " + stat.NO_HISTORY + "\n" +
    "❓ UNKNOWN: " + stat.UNKNOWN
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