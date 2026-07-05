const Core = require("../core");
const Web = require("../web");
const OTP = require("../otp");
const Auth = require("../services/auth");
const Session = require("../services/session");

const LOGIN_URL =
  "https://www.pokemoncenter-online.com/login/";

const CHANGEEMAIL_URL =
  "https://www.pokemoncenter-online.com/mail-change-input/";

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") stopCheck();
}

async function fillNewEmail(wv, newEmail) {
  await Web.evalJS(wv, `
(() => {
  const set = (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) return;

    el.focus();
    el.value = value || "";
    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.dispatchEvent(new Event("change", { bubbles:true }));
    el.dispatchEvent(new Event("blur", { bubbles:true }));
  };

  set("#email", ${JSON.stringify(newEmail)});
  set("#emailRe", ${JSON.stringify(newEmail)});

  return true;
})();
  `);

  await Web.delay(1000);
}

async function clickSendMail(wv) {
  const rs = await Web.tapButton(
    wv,
    "button.sendmail"
  );

  await Web.waitPageReady(wv, 30000);
  await Web.delay(2000);

  return rs;
}

async function openChangeEmailLink(wv, acc, stopCheck) {
  const newEmail = String(acc.newEmail || "").trim();
  const imapEmail = String(
    acc.accImapEmail || acc.imapEmail || ""
  ).trim();
  
  const imapPass = String(
    acc.accImapPass || acc.imapPass || ""
  ).trim();

  if (!newEmail) {
    return {
      ok: false,
      reason: "NO_NEW_EMAIL"
    };
  }

  if (!imapEmail || !imapPass) {
    return {
      ok: false,
      reason: "NO_NEW_IMAP"
    };
  }

  for (let i = 1; i <= 3; i++) {
    checkStop(stopCheck);

    Core.addLog(
      "Get change mail link try " + i + "/3",
      "info"
    );

    const link = await OTP.getOtpDirect(
      imapEmail,
      imapPass,
      newEmail,
      "ChangeEmail"
    );

    if (!link) {
      Core.addLog("No change mail link", "warn");
      continue;
    }

    wv.url = link;

    await Web.waitPageReady(wv, 30000);
    await Web.delay(3000);

    Core.addLog("Change mail link opened", "success");

    return {
      ok: true,
      link
    };
  }

  return {
    ok: false,
    reason: "CHANGE_LINK_TIMEOUT"
  };
}

async function runAccount(ctx) {
  const acc = ctx.acc;
  const index = ctx.index;
  const total = ctx.total;
  const form = ctx.form || {};
  const stopCheck = ctx.stopCheck;

  const email = acc.email;
  const pass = acc.pass;
  const newEmail = acc.newEmail || "";

  const runForm = Object.assign({}, form, {
    imapEmail: form.imapEmail,
    imapPass: form.imapPass
  });

  if (!newEmail) {
    return {
      ok: false,
      reason: "NO_NEW_EMAIL"
    };
  }

  let wv = null;

  try {
    checkStop(stopCheck);

    Core.updateCurrent({
      email,
      step: "LOGIN",
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
      mode: "otp",
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
      step: "CHANGE EMAIL",
      status: "Open change email page",
      index,
      total
    });

    wv.url = CHANGEEMAIL_URL + "?t=" + Date.now();

    await Web.waitPageReady(wv, 30000);
    await Web.delay(2500);

    await fillNewEmail(wv, newEmail);

    Core.addLog(
      "Input new email: " + newEmail,
      "info"
    );

    await clickSendMail(wv);

    Core.updateCurrent({
      email,
      step: "CHANGE LINK",
      status: "Waiting link",
      index,
      total
    });

    const linkRs = await openChangeEmailLink(
      wv,
      acc,
      stopCheck
    );

    if (!linkRs.ok) {
      return linkRs;
    }

    Core.playSuccessSound();

    return {
      ok: true,
      reason: "CHANGE_EMAIL_OK",
      newEmail,
      link: linkRs.link
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

module.exports = {
  runAccount
};