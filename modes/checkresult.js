const Core = require("../core");
const Web = require("../web");
const Auth = require("../services/auth");
const Session = require("../services/session");

const LOGIN_URL = "https://www.pokemoncenter-online.com/login/";
const HISTORY_URL = "https://www.pokemoncenter-online.com/lottery-history/";
const ORDER_HISTORY_URL =
  "https://www.pokemoncenter-online.com/order-history/";

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
    await Session.cleanupAccount(wv, index, total, {
      logout: true,
      resetIP: true
    });
  }
}

async function runCheckOrderOne(
  acc,
  index,
  total,
  form,
  stopCheck
) {
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
      step: "CHECK ORDER",
      status: "Create WebView",
      index,
      total
    });

    wv = Web.create("about:blank");

    if (!wv) {
      throw new Error("Cannot create WebView");
    }

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

    if (!authRs.ok) {
      return authRs;
    }

    checkStop(stopCheck);

    Core.updateCurrent({
      email,
      step: "ORDER HISTORY",
      status: "Open order history",
      index,
      total
    });

    wv.url =
      ORDER_HISTORY_URL +
      "?t=" +
      Date.now();

    await Web.waitPageReady(wv, 30000);
    await Web.delay(3000);

    const rs = await fetchOrderHistory(
      wv,
      productIds
    );

    if (!rs || !rs.ok) {
      return {
        ok: false,
        reason:
          (rs && rs.reason) ||
          "ORDER_HISTORY_FAIL"
      };
    }
    
    const results = rs.results || [];
    
    const found =
      results.filter(x => x.found);
    
    const notFound =
      results.filter(x => !x.found);
    
    return {
      ok: true,
      reason: "ORDER_STATUS_OK",
      results,
      found,
      notFound
    };

  } finally {
    await Session.cleanupAccount(
      wv,
      index,
      total,
      {
        logout: true,
        resetIP: true
      }
    );
  }
}

function chooseCheckAccType() {
  return new Promise(resolve => {
    $ui.menu({
      title: "CheckAcc",
      items: [
        "🎯 Check kết quả chusen",
        "📦 Check tình trạng đơn"
      ],
      handler(title) {
        resolve(title || "");
      }
    });
  });
}

async function fetchOrderHistory(wv, productIds) {
  return await Web.evalJS(
    wv,
`
(() => {
  const targetIds =
    ${JSON.stringify(productIds || [])};

  try {
    const items = [
      ...document.querySelectorAll(
        ".comOrderList > li"
      )
    ];

    const foundMap = {};

    targetIds.forEach(id => {
      foundMap[id] = [];
    });

    items.forEach(li => {
      const imageUrls = [
        li.querySelector(".phoBox img")
          ?.src || ""
      ].filter(Boolean);

      const hitIds = targetIds.filter(id => {
        const s = String(id || "").trim();
      
        if (!s) return false;
      
        return imageUrls.some(src => {
          src = String(src || "");
      
          if (src.includes(s)) {
            return true;
          }
      
          const marker = "/item/";
          const start = src.indexOf(marker);
      
          if (start < 0) {
            return false;
          }
      
          const rest = src.slice(
            start + marker.length
          );
      
          const imgId =
            rest.split("/")[0] || "";
      
          return (
            imgId === s ||
            imgId.endsWith(s)
          );
        });
      });

      if (!hitIds.length) return;

      const statusEl =
        li.querySelector(".txtList li.on") ||
        li.querySelector(".txtList li.current") ||
        li.querySelector(".txtList li.finish");
      
      let currentStatus =
        String(
          statusEl?.innerText || ""
        ).trim();
        
      if (!currentStatus) {
        currentStatus =
          [...li.querySelectorAll(".txtList li")]
            .map(x =>
              x.innerText.trim()
            )
            .filter(Boolean)
            .join(" ");
      }

      const allStatuses = [
        ...li.querySelectorAll(".txtList li")
      ]
        .map(x => String(x.innerText || "").trim())
        .filter(Boolean);

      const orderNo = String(
        li.querySelector(".number span")
          ?.innerText || ""
      ).trim();

      const itemName = String(
        li.querySelector(".ttl")
          ?.innerText || ""
      ).trim();

      const date = String(
        li.querySelector(".time")
          ?.childNodes?.[0]
          ?.textContent || ""
      ).trim();

      const time = String(
        li.querySelector(".time span")
          ?.innerText || ""
      ).trim();

      const progressClass = String(
        li.querySelector(".comReceiptBox")
          ?.className || ""
      ).trim();

      const detailUrl = String(
        li.querySelector(".comBtn a")
          ?.href || ""
      ).trim();

      hitIds.forEach(productId => {
        foundMap[productId].push({
          productId,
          orderNo,
          itemName,
          currentStatus,
          allStatuses,
          date,
          time,
          progressClass,
          detailUrl,
          imageUrls
        });
      });
    });

    const results = targetIds.map(productId => {
      const matches =
        foundMap[productId] || [];

      if (!matches.length) {
        return {
          productId,
          found: false,
          result: "PRODUCT_NOT_FOUND"
        };
      }

      const order = matches[0];

      return {
        found: true,
        result:
          order.currentStatus ||
          "STATUS_UNKNOWN",
        matchCount: matches.length,
        ...order
      };
    });

    return {
      ok: true,
      itemCount: items.length,
      results
    };

  } catch(e) {
    return {
      ok: false,
      reason: String(e.message || e)
    };
  }
})()
`
  );
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

    Core.addLog("*********************", "info");
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
    const subType =
      await chooseCheckAccType();

    if (
      subType ===
      "🎯 Check kết quả chusen"
    ) {
      return await runCheckAcc(ctx);
    }

    if (
      subType ===
      "📦 Check tình trạng đơn"
    ) {
      return await runCheckOrder(ctx);
    }
  }

  Core.addLog(
    "CheckResult cancelled",
    "warn"
  );
}

async function runCheckOrder(ctx) {
  const form = ctx.form || {};
  const accounts = Array.isArray(ctx.accounts)
    ? ctx.accounts.slice()
    : [];

  const stopCheck = ctx.stopCheck;

  if (!accounts.length) {
    $ui.alert("Không có account để check");
    return;
  }

  const done = [];
  const failed = [];

  Core.saveJSON(
    Core.FILE_PENDING,
    accounts
  );

  const total = accounts.length;

  while (accounts.length > 0) {
    checkStop(stopCheck);

    const acc = accounts[0];
    const index =
      total - accounts.length + 1;

    Core.addLog(
      "*********************",
      "info"
    );

    Core.addLog(
      "Start check order: " +
        acc.email,
      "info"
    );

    let rs;

    try {
      rs = await runCheckOrderOne(
        acc,
        index,
        total,
        form,
        stopCheck
      );
    } catch (e) {
      rs = {
        ok: false,
        reason: String(
          e.message || e
        )
      };
    }

    accounts.shift();

    if (rs && rs.ok) {
      (rs.results || []).forEach(item => {
        done.push({
          ...acc,
    
          productId:
            item.productId || "",
    
          result:
            item.result || "UNKNOWN",
    
          text:
            `${acc.email}:${acc.pass}\t` +
            `${item.productId || ""}\t` +
            `${item.result || "UNKNOWN"}`,
    
          doneAt:
            Date.now(),
    
          meta:
            item
        });
      });
    
      Core.addLog(
        "Check order: " +
          acc.email +
          " / found " +
          (rs.found || []).length +
          " / not found " +
          (rs.notFound || []).length,
        "success"
      );
    } else {
      const reason =
        (rs && rs.reason) ||
        "CHECK_ORDER_FAIL";

      failed.push({
        ...acc,

        text:
          `${acc.email}:${acc.pass}\t` +
          reason,

        reason,

        failedAt:
          Date.now(),

        meta:
          rs || {}
      });

      Core.addLog(
        "Check order failed: " +
          acc.email +
          " / " +
          reason,
        "error"
      );
    }

    Core.saveJSON(
      Core.FILE_PENDING,
      accounts
    );

    Core.saveJSON(
      Core.FILE_DONE,
      done
    );

    Core.saveJSON(
      Core.FILE_FAILED,
      failed
    );

    Core.refreshStats();
  }

  Core.updateCurrent({
    email: "-",
    step: "Idle",
    status: "Check Order Finished",
    index: total,
    total
  });

  Core.addLog(
    "Check Order done: " +
      done.length +
      " result / " +
      failed.length +
      " failed",
    failed.length
      ? "warn"
      : "success"
  );

  $ui.alert(
    "🎉 Check tình trạng đơn xong\n\n" +
    "📦 Found: " +
    done.length +
    "\n" +
    "❌ Failed: " +
    failed.length
  );
}

module.exports = {
  run,
  runCheckMail,
  runCheckAcc,
  runCheckOrder
};