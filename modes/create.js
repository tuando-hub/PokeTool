const Core = require("../core");
const Web = require("../web");
const OTP = require("../otp");
const Session = require("../services/session");
const FormFill = require("../services/formfill");

const LOGIN_URL = "https://www.pokemoncenter-online.com/login/";
const HOME_URL = "https://www.pokemoncenter-online.com/";

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") stopCheck();
}

function getLine(v, index) {
  return String(v || "")
    .split(/\r?\n/)
    .map(x => x.trim())[index] || "";
}

function getRunData(form, acc, index) {
  if (acc.data) return acc.data;

  const i = Math.max(0, index - 1);

  return {
    name: acc.name || getLine(form.names, i),
    kana: acc.kana || getLine(form.kanas, i),
    phone: acc.phone || getLine(form.phones, i),
    postcode: acc.postcode || getLine(form.postcode, i),
    pref: acc.pref || getLine(form.pref, i),
    city: acc.address1 || acc.city || getLine(form.address1, i),
    address2: acc.address2 || getLine(form.address2, i),
    birthdate: acc.birthdate || getLine(form.birthdate, i)
  };
}

async function waitCreateConfirmPage(wv, timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const ok = await Web.evalJS(wv, `
      !!document.querySelector("#send-confirmation-email") ||
      document.title.includes("メールアドレス確認") ||
      document.body.innerText.includes("メールアドレス確認")
    `);

    if (ok) return true;
    await Web.delay(300);
  }

  return false;
}

async function submitAndSendConfirmationEmail(wv, email) {
  Core.addLog("Request create mail", "info");

  await Web.evalJS(wv, `
(function(){
  window.__REQ_STATE = "RUNNING";

  const emailEl = document.querySelector("#login-form-regist-email");
  const csrfEl = document.querySelector('input[name="csrf_token"]');

  if (!csrfEl) {
    window.__REQ_STATE = "NO_CSRF";
    return;
  }

  if (emailEl) {
    emailEl.value = ${JSON.stringify(email)};
    emailEl.dispatchEvent(new Event("input", { bubbles:true }));
    emailEl.dispatchEvent(new Event("change", { bubbles:true }));
  }

  const xhr = new XMLHttpRequest();
  xhr.open(
    "POST",
    "/on/demandware.store/Sites-POL-Site/ja_JP/Account-SubmitConfirmationEmail?rurl=1",
    true
  );

  xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

  xhr.onload = function() {
    try {
      const r = JSON.parse(xhr.responseText);

      if (xhr.status === 200 && r.success && r.redirectUrl) {
        window.__REQ_STATE = "POST_OK";
        location.href = r.redirectUrl;
      } else {
        window.__REQ_STATE = "POST_FAIL";
      }
    } catch(e) {
      window.__REQ_STATE = "POST_FAIL";
    }
  };

  xhr.onerror = function() {
    window.__REQ_STATE = "XHR_ERROR";
  };

  xhr.send(
    "dwfrm_profile_confirmationEmail_email=" +
      encodeURIComponent(${JSON.stringify(email)}) +
    "&csrf_token=" +
      encodeURIComponent(csrfEl.value)
  );
})();
  `);

  let form2Ok = false;

  for (let i = 0; i < 40; i++) {
    await Web.delay(500);

    const done = await Web.evalJS(wv, `
      !!document.querySelector("#send-confirmation-email") ||
      document.title.includes("メールアドレス確認") ||
      document.body.innerText.includes("メールアドレス確認")
    `);

    const state = await Web.evalJS(wv, `window.__REQ_STATE || ""`);

    if (done) {
      form2Ok = true;
      break;
    }

    if (
      state === "POST_FAIL" ||
      state === "XHR_ERROR" ||
      state === "NO_CSRF"
    ) {
      break;
    }
  }

  if (!form2Ok) {
    Core.addLog("Fallback click create", "warn");

    const clicked = await Web.evalJS(wv, `
(function(){
  const btn = document.querySelector("#form2Button");
  if (!btn) return "NO_BUTTON";

  btn.disabled = false;
  btn.removeAttribute("disabled");
  btn.click();

  return "CLICKED";
})();
    `);

    if (clicked !== "CLICKED") {
      throw new Error("FORM2_CLICK_FAIL");
    }

    form2Ok = await waitCreateConfirmPage(wv, 5000);

    if (!form2Ok) {
      throw new Error("FORM2_TIMEOUT");
    }
  }

  await Web.delay(1500);

  const sendClicked = await Web.evalJS(wv, `
(function(){
  const btn = document.querySelector("#send-confirmation-email");
  if (!btn) return "NO_BUTTON";

  btn.disabled = false;
  btn.removeAttribute("disabled");

  btn.dispatchEvent(new MouseEvent("mousedown", { bubbles:true, cancelable:true }));
  btn.dispatchEvent(new MouseEvent("mouseup", { bubbles:true, cancelable:true }));
  btn.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));

  try { btn.click(); } catch(e) {}

  return "CLICKED";
})();
  `);

  if (sendClicked !== "CLICKED") {
    throw new Error("SEND_MAIL_CLICK_FAIL");
  }

  for (let i = 0; i < 40; i++) {
    await Web.delay(500);

    const done = await Web.evalJS(wv, `
      document.title.includes("仮登録メールが送信されました") ||
      document.body.innerText.includes("仮登録メールが送信されました")
    `);

    if (done) {
      Core.addLog("Send create mail OK", "success");
      return true;
    }
  }

  throw new Error("SEND_MAIL_TIMEOUT");
}

async function isExpiredRegisterPage(wv) {
  return await Web.evalJS(wv, `
(() => {
  const s =
    document.title +
    "\\n" +
    (document.body?.innerText || "");

  return (
    s.includes("システムエラー") ||
    s.includes("会員登録の有効期限が切れました")
  );
})();
  `);
}

async function openCreateLinkWithRetry(wv, acc, form, stopCheck) {
  for (let retry = 1; retry <= 3; retry++) {
    checkStop(stopCheck);

    Core.addLog("Get create link try " + retry + "/3", "info");

    const link = await OTP.getOtpDirect(
      form.imapEmail,
      form.imapPass,
      acc.email,
      "Create"
    );

    if (!link) {
      Core.addLog("No create link", "warn");
      continue;
    }

    if (link === "REGISTERED_MAIL") {
      Core.addLog("Registered mail: " + acc.email, "success");
      return "REGISTERED_MAIL";
    }

    wv.url = link;

    await Web.waitPageReady(wv, 30000);
    await Web.delay(2000);

    const expired = await isExpiredRegisterPage(wv);

    if (!expired) {
      Core.addLog("Create link OK", "success");
      return link;
    }

    Core.addLog("Old link / system error", "warn");
  }

  return null;
}

async function submitRegistration(wv) {
  Core.addLog("Request submit registration", "info");

  await Web.evalJS(wv, `
(function(){
  window.__SUBMIT = "RUNNING";

  const csrf =
    document.querySelector('input[name="csrf_token"]')?.value;

  if (!csrf) {
    window.__SUBMIT = "NO_CSRF";
    return;
  }

  const xhr = new XMLHttpRequest();

  xhr.open(
    "POST",
    "/on/demandware.store/Sites-POL-Site/ja_JP/Account-SubmitRegistration",
    true
  );

  xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

  xhr.onload = () => {
    try {
      const r = JSON.parse(xhr.responseText);

      if (xhr.status === 200) {
        window.__SUBMIT = "POST_OK";

        if (r.redirectUrl) {
          location.href = r.redirectUrl;
        }
      } else {
        window.__SUBMIT = "FAIL";
      }
    } catch(e) {
      window.__SUBMIT = "FAIL";
    }
  };

  xhr.onerror = () => {
    window.__SUBMIT = "FAIL";
  };

  xhr.send(
    "csrf_token=" + encodeURIComponent(csrf)
  );
})();
  `);

  for (let i = 0; i < 40; i++) {
    await Web.delay(500);

    const state = await Web.evalJS(wv, `window.__SUBMIT || ""`);

    const done = await Web.evalJS(wv, `
      document.title.includes("会員登録完了") ||
      document.body.innerText.includes("会員登録完了")
    `);

    if (done) {
      Core.addLog("Submit registration OK", "success");
      Core.playSuccessSound();
      await Web.delay(1000);
      return true;
    }

    if (state === "FAIL" || state === "NO_CSRF") {
      break;
    }
  }

  Core.addLog("Fallback click submit", "warn");

  const clicked = await Web.evalJS(wv, `
(function(){
  const btn = document.querySelector(".submitButton");
  if (!btn) return "NO_BUTTON";

  btn.disabled = false;
  btn.removeAttribute("disabled");
  btn.click();

  return "CLICKED";
})();
  `);

  if (clicked !== "CLICKED") {
    throw new Error("SUBMIT_REQUEST_FAIL_AND_CLICK_FAIL");
  }

  for (let i = 0; i < 40; i++) {
    await Web.delay(500);

    const done = await Web.evalJS(wv, `
      document.title.includes("会員登録完了") ||
      document.body.innerText.includes("会員登録完了")
    `);

    if (done) {
      Core.addLog("Submit click OK", "success");
      Core.playSuccessSound();
      await Web.delay(1000);
      return true;
    }
  }

  throw new Error("CLICK_TIMEOUT");
}

async function runAccount(ctx) {
  const acc = ctx.acc;
  const index = ctx.index;
  const total = ctx.total;
  const form = ctx.form || {};
  const stopCheck = ctx.stopCheck;

  const email = acc.email;
  const pass = acc.pass;

  const data = getRunData(form, acc, index);

  let wv = null;

  try {
    checkStop(stopCheck);

    Core.updateCurrent({
      email,
      step: "CREATE",
      status: "Create WebView",
      index,
      total
    });

    wv = Web.create("about:blank");

    if (!wv) {
      throw new Error("Cannot create WebView");
    }

    let createMailOk = false;

    for (let retry = 1; retry <= 3; retry++) {
      checkStop(stopCheck);

      Core.updateCurrent({
        email,
        step: "CREATE MAIL",
        status: "Try " + retry + "/3",
        index,
        total
      });
      
      try {
        wv.url = HOME_URL;
        await Web.waitPageReady(wv, 30000);
        await Web.delay(1500);

        wv.url = LOGIN_URL;
        await Web.waitPageReady(wv, 30000);
        await Web.delay(1500);

        await submitAndSendConfirmationEmail(wv, email);

        createMailOk = true;
        break;

      } catch (e) {
        Core.addLog(
          "Create mail fail: " + (e.message || e),
          "error"
        );

        await Session.cleanupAccount(wv, index, total, {
          logout: false,
          resetIP: true
        });

        wv = Web.create("about:blank");

        if (!wv) {
          throw new Error("Cannot recreate WebView");
        }
      }
    }

    if (!createMailOk) {
      return {
        ok: false,
        reason: "CREATE_MAIL_RETRY_FAILED"
      };
    }

    await Web.delay(2000);

    Core.updateCurrent({
      email,
      step: "LINK",
      status: "Waiting create link",
      index,
      total
    });

    const link = await openCreateLinkWithRetry(
      wv,
      acc,
      form,
      stopCheck
    );

    if (!link) {
      return {
        ok: false,
        reason: "CREATE_LINK_FAILED"
      };
    }

    if (link === "REGISTERED_MAIL") {
      return {
        ok: true,
        reason: "REGISTERED_MAIL"
      };
    }

    const profile =
      FormFill.normalizeProfileData({
        names: data.name,
        kanas: data.kana,
        phones: data.phone,
        postcode: data.postcode,
        pref: data.pref,
        address1: data.city,
        address2: data.address2,
        birthdate: data.birthdate
      });

    Core.updateCurrent({
      email,
      step: "FORM",
      status: "Fill create form",
      index,
      total
    });

    await FormFill.fillCreateForm(
      wv,
      Object.assign({}, profile, {
        pass
      })
    );

    await Web.delay(1000);

    Core.updateCurrent({
      email,
      step: "SUBMIT",
      status: "Submit registration",
      index,
      total
    });

    await Web.tapButton(wv, "#registration_button");
    await Web.delay(1500);

    await submitRegistration(wv);

    Core.addLog(
      "Create success: " + email,
      "success"
    );

    return {
      ok: true,
      reason: "CREATE_SUCCESS",
      data
    };

  } finally {
    try {
      await Session.cleanupAccount(wv, index, total, {
        logout: true,
        resetIP: true
      });
    } catch (e) {
      //
    }
  }
}

module.exports = {
  runAccount
};