// ================= LOTTERY MODE - PokeTool V1.2 =================

const Core = require("../core");
const Web = require("../web");
const Auth = require("../services/auth");
const Session = require("../services/session");

const LOGIN_URL = "https://www.pokemoncenter-online.com/login/";

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") {
    stopCheck();
  }
}

async function goToLotteryPage(wv) {
  Core.addLog("Open lottery page", "info");

  await Web.showNotify(wv, "🎯 Lottery", 2000);

  wv.url =
    "https://www.pokemoncenter-online.com/lottery/apply.html?t=" +
    Date.now();

  await Web.waitPageReady(wv, 30000);
  await Web.delay(5000);
}

async function getJwtViaGigya(wv) {
  Core.addLog("Getting JWT", "info");

  const resultVar = "__JWT_RESULT_" + Date.now();

  await Web.evalJS(wv, `
(() => {
  window.${resultVar} = "";

  try {
    if (!window.gigya || !gigya.accounts || !gigya.accounts.getJWT) {
      window.${resultVar} = JSON.stringify({
        ok: false,
        reason: "NO_GIGYA"
      });
      return "STARTED";
    }

    gigya.accounts.getJWT({
      fields: "UID,email,data.memberID,data.isPhoneNumberVerified",
      callback: function(res) {
        try {
          window.${resultVar} = JSON.stringify({
            ok: true,
            data: res
          });
        } catch(e) {
          window.${resultVar} = JSON.stringify({
            ok: false,
            reason: String(e.message || e)
          });
        }
      }
    });

    return "STARTED";
  } catch(e) {
    window.${resultVar} = JSON.stringify({
      ok: false,
      reason: String(e.message || e)
    });

    return "ERROR";
  }
})();
  `);

  for (let i = 0; i < 40; i++) {
    await Web.delay(500);

    const raw = await Web.evalJS(wv, `window.${resultVar} || ""`);

    if (!raw) continue;

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch(e) {
      Core.addLog("JWT parse error", "error");
      return null;
    }

    if (!parsed.ok) {
      Core.addLog("JWT error: " + (parsed.reason || "UNKNOWN"), "error");
      return null;
    }

    const data = parsed.data || {};

    if (!data.id_token) {
      Core.addLog("JWT no id_token", "error");
      return null;
    }

    Core.addLog("JWT OK", "success");

    return {
      token: data.id_token,
      userId: data.UID || ""
    };
  }

  Core.addLog("JWT timeout", "error");
  return null;
}

async function getLotteryListViaWebview(wv, token) {
  const resultVar = "__LOTTERY_LIST_" + Date.now();

  await Web.evalJS(wv, `
(async () => {
  window.${resultVar} = "";

  const headers = {
    "x-requested-with": "XMLHttpRequest",
    "content-type": "application/json"
  };

  if (${JSON.stringify(token || "")}) {
    headers.authorization = "Bearer " + ${JSON.stringify(token || "")};
  }

  try {
    const response = await fetch("/a/ltr/api/lottery/v1/get-lottery-list", {
      method: "GET",
      credentials: "include",
      headers
    });

    const text = await response.text();

    window.${resultVar} = JSON.stringify({
      ok: response.ok,
      status: response.status,
      text
    });
  } catch(e) {
    window.${resultVar} = JSON.stringify({
      ok: false,
      status: 0,
      error: String(e.message || e)
    });
  }
})();
  `);

  for (let i = 0; i < 30; i++) {
    await Web.delay(500);

    const raw = await Web.evalJS(wv, `window.${resultVar} || ""`);

    if (!raw) continue;

    try {
      const result = JSON.parse(raw);

      if (!result.ok) {
        Core.addLog("Lottery list API error: " + result.status, "error");
        return [];
      }

      const json = JSON.parse(result.text || "{}");

      Core.addLog(
        "Lottery list OK: " + ((json.data || []).length),
        "success"
      );

      return json.data || [];
    } catch(e) {
      Core.addLog("Lottery list parse error", "error");
      return [];
    }
  }

  Core.addLog("Lottery list timeout", "error");
  return [];
}

async function applyLotteryViaWebview(wv, lotteryGroupId, itemPrizeId, token) {
  const resultVar = "__APPLY_RESULT_" + Date.now();

  await Web.evalJS(wv, `
(async () => {
  window.${resultVar} = "";

  try {
    const headers = {
      accept: "*/*",
      "x-requested-with": "XMLHttpRequest",
      "content-type": "application/json"
    };

    if (${JSON.stringify(token || "")}) {
      headers.authorization = "Bearer " + ${JSON.stringify(token || "")};
    }

    const res = await fetch("/a/ltr/api/lottery/v1/apply-lottery", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        lotteryGroupId: ${JSON.stringify(lotteryGroupId)},
        itemPrizeId: ${JSON.stringify(itemPrizeId)}
      })
    });

    const body = await res.text();

    window.${resultVar} = JSON.stringify({
      ok: res.ok,
      status: res.status,
      body
    });
  } catch(e) {
    window.${resultVar} = JSON.stringify({
      ok: false,
      status: 0,
      error: String(e.message || e)
    });
  }
})();
  `);

  for (let i = 0; i < 40; i++) {
    await Web.delay(500);

    const raw = await Web.evalJS(wv, `window.${resultVar} || ""`);

    if (!raw) continue;

    const result = JSON.parse(raw);

    if (!result.ok) {
      let msg = result.error || "";
      
      try {
        const json = JSON.parse(result.body || "{}");
      
        if (json.message) {
          msg = json.message;
        }
      } catch (e) {
        //
      }
      
      return {
        success: false,
        error: msg || "UNKNOWN_ERROR",
        body: result.body || ""
      };
    }

    let data = {};

    try {
      data = result.body ? JSON.parse(result.body) : {};
    } catch(e) {
      //
    }

    return {
      success: true,
      data,
      body: result.body || ""
    };
  }

  return {
    success: false,
    error: "APPLY_TIMEOUT"
  };
}

function playSuccessSound() {
  try {
    $device.taptic(2);
  } catch(e) {
    //
  }

  try {
    if (!$file.exists("success.mp3")) return;

    $audio.play({
      path: "success.mp3"
    });
  } catch(e) {
    //
  }
}

async function runAccount(ctx) {
  const acc = ctx.acc;
  const index = ctx.index;
  const total = ctx.total;
  const form = ctx.form || {};
  const stopCheck = ctx.stopCheck;
  
  const email = acc.email;
  const pass = acc.pass;
  
  const runForm = Object.assign({}, form, {
    imapEmail: acc.imapEmail || form.imapEmail,
    imapPass: acc.imapPass || form.imapPass,
    productIds: acc.productIds || form.productIds
  });
  
  const products = String(runForm.productIds || "")
    .split(/[,\r\n]+/)
    .map(x => x.trim())
    .filter(Boolean);
    
  let wv = null;
  try{
    checkStop(stopCheck);
    
    Core.updateCurrent({
      email,
      step: "LOTTERY",
      status: "Create WebView",
      index,
      total
    });
    
    wv = Web.create("about:blank");
    
    if (!wv) {
      throw new Error("Cannot create WebView");
    }
    
    checkStop(stopCheck);
    
    wv.url = LOGIN_URL + "?t=" + Date.now();
    
    await Web.waitPageReady(wv, 30000);
    await Web.delay(2500);
    
      const authRs = await Auth.loginOtpTerms({
        wv,
        email,
        pass,
        form: runForm,
        mode: "Lottery",
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
        step: "LOTTERY",
        status: "Opening lottery page",
        index,
        total
      });
      
      await goToLotteryPage(wv);
      
      checkStop(stopCheck);
      
      Core.updateCurrent({
        email,
        step: "JWT",
        status: "Getting JWT",
        index,
        total
      });
      
      const tokenInfo = await getJwtViaGigya(wv);
      const token = tokenInfo && tokenInfo.token;
      
      if (!token) {
        //Web.destroy();
        return {
          ok: false,
          reason: "NO_JWT"
        };
      }
      
      checkStop(stopCheck);
      
      Core.updateCurrent({
        email,
        step: "LIST",
        status: "Getting lottery list",
        index,
        total
      });
      
      const lotteryList = await getLotteryListViaWebview(wv, token);
      
      if (!lotteryList || lotteryList.length === 0) {
        //Web.destroy();
        return {
          ok: false,
          reason: "NO_LOTTERY_LIST"
        };
      }
      
      const results = [];
      
      for (const productCode of products) {
        checkStop(stopCheck);
      
        let found = null;
      
        for (const lottery of lotteryList) {
          const items = lottery.applicationItems || [];
      
          for (const item of items) {
            if (item.itemCd === productCode) {
              found = {
                lotteryGroupId: lottery.lotteryGroupId,
                itemPrizeId: item.itemPrizeId,
                itemName: item.itemPrizeName
              };
              break;
            }
          }
      
          if (found) break;
        }
      
        if (!found) {
          Core.addLog("Product not found: " + productCode, "warn");
      
          results.push({
            productCode,
            success: false,
            reason: "PRODUCT_NOT_FOUND"
          });
      
          continue;
        }
      
        Core.updateCurrent({
          email,
          step: "APPLY",
          status: found.itemName,
          index,
          total
        });
      
        await Web.showNotify(wv, "🎯 Applying: " + found.itemName, 2500);
        Core.addLog("Apply: " + found.itemName, "info");
      
        const applyResult = await applyLotteryViaWebview(
          wv,
          found.lotteryGroupId,
          found.itemPrizeId,
          token
        );
      
        if (applyResult.success) {
          Core.addLog("Apply OK: " + found.itemName, "success");
          playSuccessSound();
          await Web.showNotify(wv, "✅ " + found.itemName, 3000);
        } else {
          Core.addLog(
            "Apply NG: " +
              found.itemName +
              " / " +
              applyResult.error,
            "error"
          );
      
          await Web.showNotify(
            wv,
            "❌ " + (applyResult.body || applyResult.error),
            3000
          );
        }
      
        results.push({
          productCode,
          success: applyResult.success,
          data: applyResult.data,
          error: applyResult.error
        });
      
        await Web.delay(2000);
      }
      
      const failed = results.find(r => !r.success);
      
      return {
          ok: !failed,
          reason: failed ? failed.error : "OK",
          results
      };
  } finally{
    await Session.cleanupAccount(
      wv,
      index,
      total
    );
  }
}

module.exports = {
  runAccount
};