// ================= AUTH SERVICE - PokeTool V1.2 =================

const Core = require("../core");
const Web = require("../web");
const OTP = require("../otp");

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") {
    stopCheck();
  }
}

async function installLoginHook(wv) {
  await Web.evalJS(wv, `
(() => {
  window.__LOGIN_RESULT = "";
  try { localStorage.removeItem("__LOGIN_RESULT"); } catch(e) {}

  if (window.__LOGIN_HOOK_INSTALLED) {
    return "LOGIN_HOOK_ALREADY";
  }

  window.__LOGIN_HOOK_INSTALLED = true;

  function save(item) {
    try {
      const s = JSON.stringify(item);
      window.__LOGIN_RESULT = s;
      localStorage.setItem("__LOGIN_RESULT", s);
    } catch(e) {}
  }

  const oldOpen = XMLHttpRequest.prototype.open;
  const oldSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__login_m = method;
    this.__login_u = url || "";
    return oldOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    try {
      const url = String(this.__login_u || "");

      if (url.includes("accounts.login")) {
        this.addEventListener("load", function() {
          save({
            type: "XHR",
            method: this.__login_m,
            url: this.__login_u,
            body: String(body || ""),
            status: this.status,
            response: this.responseText || ""
          });
        });
      }
    } catch(e) {}

    return oldSend.apply(this, arguments);
  };

  const oldFetch = window.fetch;

  window.fetch = async function() {
    const args = arguments;
    const url = String(args[0] || "");
    const opt = args[1] || {};

    const res = await oldFetch.apply(this, args);

    try {
      if (url.includes("accounts.login")) {
        const text = await res.clone().text();

        save({
          type: "FETCH",
          method: opt.method || "GET",
          url,
          body: String(opt.body || ""),
          status: res.status,
          response: text
        });
      }
    } catch(e) {}

    return res;
  };

  return "LOGIN_HOOK_OK";
})();
  `);
}

async function clickLoginAndWait(wv, email, password, fill) {
  await Web.evalJS(wv, `window.__LOGIN_RESULT = "";`);

  if (fill !== false) {
    await Web.evalJS(wv, `
(() => {
  const mail = document.querySelector("#login-form-email");
  const pass = document.querySelector("#current-password");

  if (mail) {
    mail.value = ${JSON.stringify(email)};
    mail.dispatchEvent(new Event("input", { bubbles:true }));
    mail.dispatchEvent(new Event("change", { bubbles:true }));
  }

  if (pass) {
    pass.value = ${JSON.stringify(password)};
    pass.dispatchEvent(new Event("input", { bubbles:true }));
    pass.dispatchEvent(new Event("change", { bubbles:true }));
  }
})();
    `);
  }

  await Web.tapButton(wv, "#form1Button");

  const loginRaw = await Web.waitVar(wv, "__LOGIN_RESULT", 15000);

  if (!loginRaw) {
    return { ok: false, retry: true, reason: "NO_LOGIN_RESULT" };
  }

  const loginCap = JSON.parse(loginRaw);

  if (loginCap.status !== 200 || !loginCap.response) {
    return { ok: false, retry: true, reason: "LOGIN_EMPTY_OR_BLOCKED" };
  }

  let loginJson = {};

  try {
    loginJson = JSON.parse(loginCap.response || "{}");
  } catch (e) {
    return { ok: false, retry: true, reason: "LOGIN_JSON_PARSE_FAIL" };
  }

  if (loginJson.errorCode === 403042) {
    return { ok: false, retry: false, reason: "INVALID_LOGIN" };
  }

  if (loginJson.errorCode === 403101) {
    return { ok: true, cap: loginCap, json: loginJson };
  }

  return {
    ok: false,
    retry: true,
    reason: "LOGIN_CODE_" + loginJson.errorCode
  };
}

async function loginWithRetry(wv, email, password, maxRetry) {
  maxRetry = maxRetry || 5;

  for (let i = 1; i <= maxRetry; i++) {
    Core.updateCurrent({
      email,
      step: "LOGIN",
      status: "Login try " + i
    });

    await installLoginHook(wv);
    
    const rs = await clickLoginAndWait(
      wv,
      email,
      password,
      i === 1
    );

    if (rs.ok) return rs;
    if (rs.retry === false) return rs;

    Core.addLog("Login retry " + i + ": " + rs.reason, "warn");

    if (i >= maxRetry) break;

    await Web.delay(5000);
  }

  return {
    ok: false,
    reason: "LOGIN_RETRY_FAILED"
  };
}

async function installOtpHook(wv) {
  await Web.evalJS(wv, `
(() => {
  window.__OTP_RESULT = "";

  const cap = item => {
    try {
      window.__OTP_RESULT = JSON.stringify(item);
    } catch(e) {}
  };

  const oldOpen = XMLHttpRequest.prototype.open;
  const oldSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__otp_m = method;
    this.__otp_u = url || "";
    return oldOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    try {
      const url = String(this.__otp_u || "");

      if (url.includes("Factor2Auth-Authentication")) {
        this.addEventListener("load", function() {
          cap({
            type: "XHR",
            method: this.__otp_m,
            url: this.__otp_u,
            body: String(body || ""),
            status: this.status,
            response: this.responseText || ""
          });
        });
      }
    } catch(e) {}

    return oldSend.apply(this, arguments);
  };

  const oldFetch = window.fetch;

  window.fetch = async function() {
    const args = arguments;
    const url = String(args[0] || "");
    const opt = args[1] || {};

    const res = await oldFetch.apply(this, args);

    try {
      if (url.includes("Factor2Auth-Authentication")) {
        const text = await res.clone().text();

        cap({
          type: "FETCH",
          method: opt.method || "GET",
          url,
          body: String(opt.body || ""),
          status: res.status,
          response: text
        });
      }
    } catch(e) {}

    return res;
  };

  return "OTP_HOOK_OK";
})();
  `);
}

async function verifyOtp(wv, email, otp, mode, form, stopCheck) {
  let currentOtp = otp;

  for (let attempt = 1; attempt <= 10; attempt++) {
    checkStop(stopCheck);

    await Web.evalJS(wv, `window.__OTP_RESULT = "";`);

    await Web.tapButton(wv, "#authBtn, #certify, button[type=submit]");

    const raw = await Web.waitVar(wv, "__OTP_RESULT", 30000);

    if (raw) {
      try {
        const cap = JSON.parse(raw);
        
        if (
          !String(cap.body || "")
            .includes(currentOtp)
        ) {
          Core.addLog(
            "Ignore old OTP response",
            "warn"
          );
          continue;
        }
        
        const json =
          JSON.parse(cap.response || "{}");

        if (
          cap.status === 200 &&
          (
            json.success === true ||
            String(cap.response || "").includes('"success": true') ||
            String(cap.response || "").includes('"success":true')
          )
        ) {
          Core.addLog("OTP OK: " + currentOtp, "success");
          await Web.waitPageReady(wv, 30000);
          await Web.delay(1500);
          return true;
        }

        Core.addLog(
          "OTP Fail ",
          "warn"
        );

      } catch (e) {
        Core.addLog("OTP parse fail", "warn");
      }
    }

    if (attempt >= 10) break;

    Core.addLog("OTP retry " + attempt, "warn");

    await Web.showNotify(wv, "OTP fail -> Retry getting OTP", 700);

    currentOtp = await OTP.getOtpDirect(
      form.imapEmail,
      form.imapPass,
      email,
      mode
    );

    if (!currentOtp) continue;

    await Web.showNotify(wv, "OTP: " + currentOtp, 2500);

    await Web.evalJS(wv, `
(() => {
  const el = document.querySelector("#authCode");

  if (el) {
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles:true }));

    el.value = ${JSON.stringify(currentOtp)};
    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.dispatchEvent(new Event("change", { bubbles:true }));
  }
})();
    `);

    await Web.delay(1500);
  }

  return false;
}

async function getFinalJson(wv) {
  const id = "__FINAL_JSON_" + Date.now();

  await Web.evalJS(wv, `
(() => {
  window.${id} = "";

  try {
    if (!window.gigya || !gigya.accounts || !gigya.accounts.getAccountInfo) {
      window.${id} = JSON.stringify({
        errorCode: -1,
        reason: "NO_GIGYA"
      });
      return;
    }

    gigya.accounts.getAccountInfo({
      callback: function(res) {
        window.${id} = JSON.stringify(res || {});
      }
    });
  } catch(e) {
    window.${id} = JSON.stringify({
      errorCode: -2,
      reason: String(e.message || e)
    });
  }
})();
  `);

  const raw = await Web.waitVar(wv, id, 30000);

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch(e) {
    return {};
  }
}

async function loginOtpTerms(ctx) {
  const wv = ctx.wv;
  const email = ctx.email;
  const pass = ctx.pass;
  const form = ctx.form || {};
  const mode = ctx.mode || "Lottery";
  const stopCheck = ctx.stopCheck;
  const index = ctx.index;
  const total = ctx.total;

  Core.updateCurrent({
    email,
    step: "LOGIN",
    status: "Page ready",
    index,
    total
  });

  await Web.showNotify(wv, "Login: " + email, 2500);

  await installLoginHook(wv);
  checkStop(stopCheck);

  const loginRs = await loginWithRetry(wv, email, pass, 5);

  if (!loginRs.ok) {
    return {
      ok: false,
      reason: loginRs.reason || "LOGIN_FAIL"
    };
  }

  const loginJson = loginRs.json || {};

  if (loginJson.errorCode === 403042) {
    return {
      ok: false,
      reason: "INVALID_LOGIN"
    };
  }

  if (loginJson.errorCode !== 403101) {
    return {
      ok: false,
      reason: "LOGIN_CODE_" + loginJson.errorCode
    };
  }

  Core.addLog("Login OK: " + email, "success");

  Core.updateCurrent({
    email,
    step: "OTP",
    status: "Login OK / Waiting OTP",
    index,
    total
  });

  Core.addLog("Waiting for OTP...", "info");
  await Web.showNotify(wv, "Waiting for OTP...", 3000);

  const otp = await OTP.getOtpDirect(
    form.imapEmail,
    form.imapPass,
    email,
    mode
  );

  if (!otp) {
    return {
      ok: false,
      reason: "OTP_TIMEOUT"
    };
  }

  await Web.showNotify(wv, "OTP: " + otp, 2500);
  
  await installOtpHook(wv);
  
  await Web.evalJS(wv, `window.__OTP_RESULT = "";`);
  
  await Web.evalJS(wv, `
  (() => {
    const el = document.querySelector("#authCode");
  
    if (el) {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles:true }));
  
      el.value = ${JSON.stringify(otp)};
      el.dispatchEvent(new Event("input", { bubbles:true }));
      el.dispatchEvent(new Event("change", { bubbles:true }));
    }
  })();
  `);
  
  await Web.delay(500);

  const otpOk = await verifyOtp(
    wv,
    email,
    otp,
    mode,
    form,
    stopCheck
  );

  if (!otpOk) {
    return {
      ok: false,
      reason: "OTP_FAIL"
    };
  }

  Core.updateCurrent({
    email,
    step: "OTP",
    status: "OTP OK",
    index,
    total
  });
  
  const finalJson = await getFinalJson(wv);

  await Web.delay(2000);

  checkStop(stopCheck);

  const needTerms = await Web.hasTermsButton(wv);

  if (needTerms) {
    Core.updateCurrent({
      email,
      step: "TERMS",
      status: "Accepting terms",
      index,
      total
    });

    await Web.showNotify(wv, "Accepting terms...", 2500);
    await Web.acceptTermsIfNeeded(wv);
  }

  return {
    ok: true,
    finalJson
  };
}

module.exports = {
  installLoginHook,
  clickLoginAndWait,
  loginWithRetry,
  installOtpHook,
  verifyOtp,
  getFinalJson,
  loginOtpTerms
};