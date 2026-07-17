// ================= JUMP PLUS SERVICE =================

const Web = require("../web");
const OTP = require("../otp");
const Session = require("./session");
const Core = require("../core");

const PREMIUM_URL =
  "https://shonenjumpplus.com/premium/confirm?product_id=10834108156675977993";
  
const HOME_URL =
  "https://shonenjumpplus.com/";

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") {
    stopCheck();
  }
}

function log(message, type) {
  Core.addLog(
    "[Jump+] " + message,
    type || "info"
  );
}

async function openLoginPopup(wv, stopCheck) {
  checkStop(stopCheck);

  const result = await Web.evalJS(wv, `
(() => {
  const visible = el => {
    if (!el) return false;

    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0
    );
  };

  const loginForm = document.querySelector(
    'form[action*="/user_account/login"]'
  );

  if (loginForm && visible(loginForm)) {
    return "ALREADY_OPEN";
  }

  const target = Array.from(
    document.querySelectorAll(
      "button, a, [role='button']"
    )
  ).find(el => {
    if (!visible(el)) return false;

    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    )
      .replace(/\\s+/g, "")
      .trim();

    return (
      text.includes("ログイン・新規登録") ||
      text.includes("ログイン／新規登録") ||
      text === "ログイン"
    );
  });

  if (!target) {
    return "NO_LOGIN_BUTTON";
  }

  target.scrollIntoView({
    block: "center"
  });

  target.click();

  return "CLICKED";
})();
  `);

  if (
    result !== "CLICKED" &&
    result !== "ALREADY_OPEN"
  ) {
    throw new Error(
      "JUMP_LOGIN_BUTTON_NOT_FOUND"
    );
  }

  const ready = await Web.waitVisible(
    wv,
    "button.js-signup-button",
    15000
  );

  if (!ready) {
    throw new Error(
      "JUMP_LOGIN_POPUP_TIMEOUT"
    );
  }

  await Web.delay(1000);

  return true;
}

async function openSignupForm(wv, stopCheck) {
  checkStop(stopCheck);

  const readyBefore = await Web.waitVisible(
    wv,
    "button.js-signup-button",
    10000
  );

  if (!readyBefore) {
    throw new Error(
      "JUMP_SIGNUP_SWITCH_NOT_VISIBLE"
    );
  }

  await Web.tapButton(
    wv,
    "button.js-signup-button"
  );

  const ready = await Web.waitVisible(
    wv,
    "#input-agreement",
    15000
  );

  if (!ready) {
    throw new Error(
      "JUMP_SIGNUP_FORM_TIMEOUT"
    );
  }

  await Web.delay(1000);

  return true;
}

async function fillSignupForm(
  wv,
  email,
  password,
  stopCheck
) {
  checkStop(stopCheck);

  const result = await Web.evalJS(wv, `
(() => {
  const emailValue =
    ${JSON.stringify(String(email || ""))};

  const passwordValue =
    ${JSON.stringify(String(password || ""))};

  const agreement = document.querySelector(
    "#input-agreement"
  );

  if (!agreement) {
    return {
      ok: false,
      reason: "NO_AGREEMENT"
    };
  }

  const form = agreement.closest("form");

  if (!form) {
    return {
      ok: false,
      reason: "NO_SIGNUP_FORM"
    };
  }

  const emailInput = form.querySelector(
    'input[name="email_address"]'
  );

  const passwordInput = form.querySelector(
    'input[name="password"]'
  );

  if (!emailInput) {
    return {
      ok: false,
      reason: "NO_EMAIL_INPUT"
    };
  }

  if (!passwordInput) {
    return {
      ok: false,
      reason: "NO_PASSWORD_INPUT"
    };
  }

  const setValue = (el, value) => {
    el.focus();

    try {
      const setter =
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set;

      setter.call(el, value);
    } catch (e) {
      el.value = value;
    }

    el.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    el.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    el.dispatchEvent(
      new Event("blur", {
        bubbles: true
      })
    );
  };

  setValue(
    emailInput,
    emailValue
  );

  setValue(
    passwordInput,
    passwordValue
  );

  agreement.disabled = false;
  agreement.removeAttribute("disabled");

  if (!agreement.checked) {
    agreement.click();
  }

  if (!agreement.checked) {
    agreement.checked = true;

    agreement.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    agreement.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );
  }

  return {
    ok:
      emailInput.value === emailValue &&
      passwordInput.value === passwordValue &&
      agreement.checked === true,

    email: emailInput.value,
    passwordLength:
      passwordInput.value.length,

    agreement:
      agreement.checked
  };
})();
  `);

  if (!result || !result.ok) {
    throw new Error(
      "JUMP_FILL_SIGNUP_FAIL_" +
      (
        result &&
        result.reason
          ? result.reason
          : "UNKNOWN"
      )
    );
  }

  await Web.delay(1000);

  return result;
}

async function submitSignup(wv, stopCheck) {
  checkStop(stopCheck);

  const result = await Web.evalJS(wv, `
(() => {
  const agreement = document.querySelector(
    "#input-agreement"
  );

  if (!agreement) {
    return "NO_AGREEMENT";
  }

  const form = agreement.closest("form");

  if (!form) {
    return "NO_SIGNUP_FORM";
  }

  const button = Array.from(
    form.querySelectorAll(
      'button[type="submit"]'
    )
  ).find(el => {
    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    ).trim();

    return text.includes(
      "新規会員登録"
    );
  });

  if (!button) {
    return "NO_SUBMIT_BUTTON";
  }

  button.disabled = false;
  button.removeAttribute("disabled");

  button.scrollIntoView({
    block: "center"
  });

  button.click();

  return "CLICKED";
})();
  `);

  if (result !== "CLICKED") {
    throw new Error(
      "JUMP_SIGNUP_SUBMIT_FAIL_" +
      result
    );
  }

  await Web.delay(1500);

  return true;
}

async function getSignupState(wv) {
  return await Web.evalJS(wv, `
(() => {
  const bodyText = String(
    document.body
      ? document.body.innerText
      : ""
  );

  const alerts = Array.from(
    document.querySelectorAll(
      [
        ".error-message",
        "[role='alert']"
      ].join(",")
    )
  )
    .map(el => {
      const style =
        getComputedStyle(el);

      const rect =
        el.getBoundingClientRect();

      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        rect.width === 0 ||
        rect.height === 0
      ) {
        return "";
      }

      return String(
        el.innerText ||
        el.textContent ||
        ""
      ).trim();
    })
    .filter(Boolean);

  return {
    url: location.href,
    title: document.title || "",
    errors: alerts,
  
    success:
      bodyText.includes("登録が完了") ||
      bodyText.includes("会員登録完了") ||
      bodyText.includes("確認メール") ||
      bodyText.includes("メールを送信"),
  
    duplicate:
      bodyText.includes("登録済み") ||
      bodyText.includes("既に登録") ||
      bodyText.includes("すでに登録") ||
      bodyText.includes("使用されています"),
  
    loginError:
      bodyText.includes(
        "メールアドレスまたはパスワードが正しくありません"
      )
  };
})();
  `);
}

async function waitSignupMailSent(
  wv,
  stopCheck,
  timeout
) {
  const start = Date.now();
  const limit = timeout || 20000;

  while (
    Date.now() - start < limit
  ) {
    checkStop(stopCheck);

    const result = await Web.evalJS(wv, `
(() => {
  const text = String(
    document.body
      ? document.body.innerText
      : ""
  );

  const errors = Array.from(
    document.querySelectorAll(
      ".error-message, [role='alert']"
    )
  )
    .map(el => {
      const style =
        getComputedStyle(el);

      const rect =
        el.getBoundingClientRect();

      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        rect.width === 0 ||
        rect.height === 0
      ) {
        return "";
      }

      return String(
        el.innerText ||
        el.textContent ||
        ""
      ).trim();
    })
    .filter(Boolean);

  if (
    text.includes(
      "登録メールを送信しました"
    )
  ) {
    return {
      done: true,
      ok: true,
      state: "MAIL_SENT",
      url: location.href
    };
  }

  if (errors.length > 0) {
    return {
      done: true,
      ok: false,
      state: "WEB_ERROR",
      reason:
        errors.join(" / "),
      url: location.href
    };
  }

  return null;
})();
    `);

    if (
      result &&
      result.done
    ) {
      return result;
    }

    await Web.delay(500);
  }

  return {
    ok: false,
    state:
      "MAIL_SENT_SCREEN_NOT_FOUND",
    reason:
      "登録メールを送信しました が表示されない"
  };
}

async function getSignupRegistrationLink(
  imapEmail,
  imapPass,
  targetEmail,
  stopCheck
) {
  checkStop(stopCheck);

  const link =
    await OTP.getOtpDirect(
      imapEmail,
      imapPass,
      targetEmail,
      "JumpPlusCreate"
    );

  checkStop(stopCheck);

  if (!link) {
    throw new Error(
      "JUMP_CREATE_LINK_NOT_FOUND"
    );
  }

  const value =
    String(link).trim();

  const prefix =
    "https://shonenjumpplus.com/user_account/signup_registration/";

  if (
    !value.startsWith(prefix)
  ) {
    throw new Error(
      "JUMP_CREATE_LINK_INVALID_" +
      value
    );
  }

  return value;
}

async function openRegistrationLink(
  wv,
  link,
  stopCheck
) {
  checkStop(stopCheck);

  wv.url = link;

  await Web.waitPageReady(
    wv,
    30000
  );

  checkStop(stopCheck);

  await Web.delay(1000);

  return true;
}

async function checkRegistrationComplete(
  wv,
  stopCheck,
  timeout
) {
  const start = Date.now();
  const limit = timeout || 30000;

  while (
    Date.now() - start < limit
  ) {
    checkStop(stopCheck);

    const result =
      await Web.evalJS(wv, `
(() => {
  const text = String(
    document.body
      ? document.body.innerText
      : ""
  );

  return {
    ok:
      text.includes(
        "メールアドレスの登録が完了しました。"
      ) ||
      text.includes(
        "メールアドレスの登録が完了しました"
      ),

    url:
      location.href,

    title:
      document.title || ""
  };
})();
      `);

    if (
      result &&
      result.ok
    ) {
      return result;
    }

    await Web.delay(500);
  }

  throw new Error(
    "JUMP_REGISTRATION_COMPLETE_TIMEOUT"
  );
}

function parseCredit(raw) {
  const value = String(raw || "").trim();

  const match = value.match(
    /^(\d{13,19})-(\d{1,2})\/(\d{2}|\d{4})-(\d{3,4})(?:-([A-Za-z]+))?$/
  );

  if (!match) {
    throw new Error(
      "INVALID_CREDIT_FORMAT_" +
      value
    );
  }

  const cardNumber = match[1];

  const expMonth =
    match[2].padStart(2, "0");

  let expYear = match[3];

  const securityCode = match[4];

  const brand = String(
    match[5] || ""
  )
    .trim()
    .toLowerCase();

  if (expYear.length === 2) {
    expYear = "20" + expYear;
  }

  const monthNumber =
    Number(expMonth);

  if (
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new Error(
      "INVALID_CREDIT_MONTH_" +
      expMonth
    );
  }

  const brandMap = {
    visa: "visa",
    master: "master",
    mastercard: "master",
    jcb: "jcb",
    amex: "amex",
    americanexpress: "amex",
    diners: "diners",
    dinersclub: "diners"
  };

  if (
    brand &&
    !brandMap[brand]
  ) {
    throw new Error(
      "INVALID_CREDIT_BRAND_" +
      brand
    );
  }

  return {
    cardNumber,
    expMonth,
    expYear,
    securityCode,
    brand:
      brandMap[brand] || ""
  };
}

async function loginAccount(
  wv,
  email,
  password,
  stopCheck
) {
  checkStop(stopCheck);

  const result =
    await Web.evalJS(wv, `
(() => {
  const form =
    document.querySelector(
      'form[action*="/user_account/login"]'
    );

  if (!form)
    return "NO_FORM";

  const emailInput =
    form.querySelector(
      'input[name="email_address"]'
    );

  const passInput =
    form.querySelector(
      'input[name="password"]'
    );

  if (
    !emailInput ||
    !passInput
  ) {
    return "NO_INPUT";
  }

  emailInput.value =
    ${JSON.stringify(email)};

  passInput.value =
    ${JSON.stringify(password)};

  emailInput.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );

  passInput.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );

  const btn =
    form.querySelector(
      'button[type="submit"]'
    );

  if (!btn)
    return "NO_BUTTON";

  btn.click();

  return "CLICKED";
})();
`);

  if (
    result !== "CLICKED"
  ) {
    throw new Error(
      "LOGIN_FAILED_" +
      result
    );
  }

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(1500);

  return true;
}

async function registerAccount({
  email,
  password,
  imapEmail,
  imapPass,
  credit,
  stopCheck,
  onStep,
  retryCount = 0
}) {
  let wv = null;
  let purchaseResult = null;
  let premiumState = null;

  const update = (step, status) => {
    checkStop(stopCheck);
    if (typeof onStep === "function") onStep(step, status);
  };

  try {
    update("OPEN", "Open Jump+");
    log("Mở trang Jump+", "info");

    wv = Web.create(HOME_URL);
    if (!wv) throw new Error("JUMP_WEBVIEW_CREATE_FAILED");

    await Web.waitPageReady(wv, 30000);
    await Web.delay(1500);

    update("LOGIN", "Open login popup");

    try {
      await openLoginPopup(wv, stopCheck);
      log("Đã mở popup đăng nhập", "success");

    } catch (e) {
      const reason = String(e && e.message ? e.message : e);

      if (reason !== "JUMP_LOGIN_BUTTON_NOT_FOUND") throw e;
      if (retryCount >= 1) {
        throw new Error("JUMP_LOGIN_BUTTON_NOT_FOUND_AFTER_RETRY");
      }

      update("SESSION", "Logout old session");
      log("Phát hiện session cũ, đang logout", "warn");

      try {
        await Session.ensureJumpLoggedOut(wv);
      } catch (err) {
        log("Logout session cũ lỗi: " + String(err.message || err), "warn");
      }

      update("CLEAR", "Clear old session");

      try {
        await Session.clearJumpSession(wv);
      } catch (err) {
        log("Clear session cũ lỗi: " + String(err.message || err), "warn");
      }

      try {
        Web.destroy();
      } catch (_) {
        //
      }

      wv = null;

      update("RESET IP", "Reset network");

      try {
        await Session.resetIP();
      } catch (_) {
        //
      }

      log("Chạy lại account sau khi clear session", "info");

      return await registerAccount({
        email,
        password,
        imapEmail,
        imapPass,
        credit,
        stopCheck,
        onStep,
        retryCount: retryCount + 1
      });
    }

    update("SIGNUP", "Open signup form");
    await openSignupForm(wv, stopCheck);

    update("FILL", "Fill signup form");
    await fillSignupForm(wv, email, password, stopCheck);

    update("SUBMIT", "Submit signup");
    await submitSignup(wv, stopCheck);

    update("CHECK", "Check mail sent screen");

    const mailSent = await waitSignupMailSent(
      wv, stopCheck, 20000
    );

    let needCreate = true;

    if (!mailSent.ok) {
      const state = await getSignupState(wv);

      if (!state || !state.loginError) {
        throw new Error(
          mailSent.reason || "JUMP_SIGNUP_MAIL_NOT_SENT"
        );
      }

      update("LOGIN", "Login existing account");
      await loginAccount(wv, email, password, stopCheck);

      log("Đăng nhập account đã tồn tại thành công", "success");
      needCreate = false;
    }

    let link = null;
    let registration = null;

    if (needCreate) {
      update("MAIL", "Wait registration link");
      log("Đang chờ mail xác nhận", "info");

      link = await getSignupRegistrationLink(
        imapEmail,
        imapPass,
        email,
        stopCheck
      );

      update("VERIFY", "Open registration link");
      await openRegistrationLink(wv, link, stopCheck);

      update("CHECK", "Check registration complete");
      registration = await checkRegistrationComplete(
        wv, stopCheck, 30000
      );

      log("Đã xác nhận email", "success");
    }

    update("CHECK", "Check subscription status");

    premiumState = await checkAlreadyPremium(
      wv, stopCheck
    );

    if (premiumState && premiumState.premium) {
      log("Account đã 定期購読中, bỏ qua mua hàng", "warn");
      update("SKIP", "Already subscribed");
    
      return {
        ok: true,
        skipped: true,
        reason: "ALREADY_PREMIUM",
        premiumState,
        webView: wv
      };
    }

    update("PREMIUM", "Open premium page");
    log("Đang thanh toán", "info");

    await openPremiumPage(wv, stopCheck);

    update("PAYMENT", "Select payment method");
    await openPaymentMethod(wv, stopCheck);

    update("CREDIT", "Select credit 3D");
    await selectCredit3D(wv, stopCheck);

    update("CARD", "Fill credit card");

    const card = parseCredit(credit);
    await fillCreditCard(wv, card, stopCheck);

    update("NEXT", "Open payment confirmation");
    await submitCreditCard(wv, stopCheck);

    update("READY", "Purchase button ready");

    const purchaseConfirm = await waitPurchaseConfirm(
      wv, stopCheck, 30000
    );

    update("PURCHASE", "Click purchase button");
    await submitPurchase(wv, stopCheck);

    update("RESULT", "Wait purchase result");

    purchaseResult =
      await waitPurchaseResult(
        wv,
        stopCheck,
        update,
        5 * 60 * 1000
      );

    if (!purchaseResult || !purchaseResult.ok) {
      throw new Error(
        purchaseResult && purchaseResult.reason
          ? purchaseResult.reason
          : "PURCHASE_FAILED"
      );
    }

    update("DONE", "Purchase successful");

    return {
      ok: true,
      link,
      registration,
      purchaseConfirm,
      purchaseResult,
      webView: wv
    };

  } finally {
   if (
     wv &&
     !(
       purchaseResult &&
       purchaseResult.ok
     ) &&
     !(
       premiumState &&
       premiumState.premium
     )
   ){
      log("Đang logout và clear session", "info");

      try {
        await Session.clearJumpSession(wv);
        log("Clear session hoàn tất", "success");
      } catch (e) {
        log("Clear session lỗi: " + String(e.message || e), "warn");
      }

      try {
        Web.destroy();
      } catch (_) {
        //
      }

      try {
        await Session.resetIP();
      } catch (_) {
        //
      }
    }
  }
}

async function checkAlreadyPremium(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  const result = await Web.evalJS(wv, `
(() => {
  const visible = el => {
    if (!el) return false;

    const style =
      getComputedStyle(el);

    const rect =
      el.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0
    );
  };

  const item =
    document.querySelector(
      "li.plus-header-nav-premium.js-show-for-premium"
    );

  if (!item || !visible(item)) {
    return {
      premium: false
    };
  }

  const text = String(
    item.innerText ||
    item.textContent ||
    ""
  )
    .replace(/\\s+/g, "")
    .trim();

  return {
    premium:
      text.includes("定期購読中"),

    text,

    url:
      location.href
  };
})();
  `);

  return result || {
    premium: false
  };
}

async function openPremiumPage(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  wv.url = PREMIUM_URL;

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(1000);

  checkStop(stopCheck);

  return true;
}

async function openPaymentMethod(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  const result = await Web.evalJS(wv, `
(() => {
  const buttons = Array.from(
    document.querySelectorAll(
      'button[type="submit"]'
    )
  );

  const button = buttons.find(el => {
    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    )
      .replace(/\\s+/g, "")
      .trim();

    return text.includes(
      "決済方法を選択する"
    );
  });

  if (!button) {
    return false;
  }

  button.scrollIntoView({
    block: "center"
  });

  button.click();

  return true;
})();
  `);

  if (!result) {
    throw new Error(
      "PAYMENT_METHOD_BUTTON_NOT_FOUND"
    );
  }

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(1000);

  checkStop(stopCheck);

  return true;
}

async function selectCredit3D(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  const ready =
    await Web.waitVisible(
      wv,
      "a.payment_choose_credit_3d",
      30000
    );

  if (!ready) {
    const html =
      await Web.evalJS(
        wv,
        `
location.href
`
      );

    console.log(
      "[JUMP] CREDIT PAGE:",
      html
    );

    throw new Error(
      "CREDIT_3D_BUTTON_NOT_FOUND"
    );
  }

  await Web.delay(1000);

  const result =
    await Web.evalJS(
      wv,
      `
(() => {
  const button =
    document.querySelector(
      "a.payment_choose_credit_3d"
    );

  if (!button) {
    return false;
  }

  button.scrollIntoView({
    block: "center"
  });

  button.click();

  return true;
})();
`
    );

  if (!result) {
    throw new Error(
      "CREDIT_3D_CLICK_FAILED"
    );
  }

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(1500);

  return true;
}

async function fillCreditCard(
  wv,
  card,
  stopCheck
) {
  checkStop(stopCheck);

  card = card || {};

  const cardNumber = String(
    card.cardNumber || ""
  ).replace(/\D/g, "");

  const expMonth = String(
    card.expMonth || ""
  ).padStart(2, "0");

  let expYear = String(
    card.expYear || ""
  ).trim();

  const securityCode = String(
    card.securityCode || ""
  ).replace(/\D/g, "");

  if (expYear.length === 2) {
    expYear = "20" + expYear;
  }

  const result = await Web.evalJS(wv, `
(() => {
  const setInput = (
    selector,
    value
  ) => {
    const el =
      document.querySelector(
        selector
      );

    if (!el) return false;

    el.focus();

    try {
      const setter =
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set;

      setter.call(el, value);
    } catch (_) {
      el.value = value;
    }

    el.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    el.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    el.dispatchEvent(
      new Event("blur", {
        bubbles: true
      })
    );

    return el.value === value;
  };

  const setSelect = (
    selector,
    value
  ) => {
    const el =
      document.querySelector(
        selector
      );

    if (!el) return false;

    el.value = value;

    el.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    el.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    return el.value === value;
  };

  const numberOK = setInput(
    'input[name="ccNumber"]',
    ${JSON.stringify(cardNumber)}
  );

  const monthOK = setSelect(
    'select[name="ccExpirationMonth"]',
    ${JSON.stringify(expMonth)}
  );

  const yearOK = setSelect(
    'select[name="ccExpirationYear"]',
    ${JSON.stringify(expYear)}
  );

  const codeOK = setInput(
    'input[name="securityCode"]',
    ${JSON.stringify(securityCode)}
  );

  return {
    ok:
      numberOK &&
      monthOK &&
      yearOK &&
      codeOK,

    numberOK,
    monthOK,
    yearOK,
    codeOK
  };
})();
  `);

  if (!result || !result.ok) {
    throw new Error(
      "CREDIT_FILL_FAILED_" +
      JSON.stringify(result || {})
    );
  }

  await Web.delay(1000);

  return result;
}

async function submitCreditCard(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  const result = await Web.evalJS(wv, `
(() => {
  const form =
    document.querySelector(
      'form[name="creditFepChargePaymentInfoEntryActionForm"]'
    );

  if (!form) {
    return "NO_CREDIT_FORM";
  }

  const button = Array.from(
    form.querySelectorAll(
      "a.common-button"
    )
  ).find(el => {
    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    ).trim();

    return text === "次へ";
  });

  if (!button) {
    return "NO_NEXT_BUTTON";
  }

  button.scrollIntoView({
    block: "center"
  });

  button.click();

  return "CLICKED";
})();
  `);

  if (result !== "CLICKED") {
    throw new Error(
      "CREDIT_NEXT_FAILED_" +
      result
    );
  }

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(1000);

  checkStop(stopCheck);

  return true;
}

async function waitPurchaseConfirm(
  wv,
  stopCheck,
  timeout
) {
  const started = Date.now();
  const limit = timeout || 30000;

  while (
    Date.now() - started < limit
  ) {
    checkStop(stopCheck);

    const result = await Web.evalJS(wv, `
(() => {
  const form =
    document.querySelector(
      'form[name="fepChargeIntensionConfirmActionForm"]'
    );

  if (!form) {
    return null;
  }

  const button = Array.from(
    form.querySelectorAll(
      "a.common-button"
    )
  ).find(el => {
    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    ).trim();

    return text === "購入";
  });

  if (!button) {
    return null;
  }

  return {
    ready: true,
    url: location.href,
    title: document.title || "",
    buttonText: String(
      button.innerText ||
      button.textContent ||
      ""
    ).trim()
  };
})();
    `);

    if (
      result &&
      result.ready
    ) {
      return result;
    }

    await Web.delay(500);
  }

  throw new Error(
    "PURCHASE_CONFIRM_NOT_READY"
  );
}

async function submitPurchase(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  const result = await Web.evalJS(wv, `
(() => {
  const form =
    document.querySelector(
      'form[name="fepChargeIntensionConfirmActionForm"]'
    );

  if (!form) {
    return "NO_PURCHASE_FORM";
  }

  const button = Array.from(
    form.querySelectorAll(
      "a.common-button"
    )
  ).find(el => {
    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    ).replace(/\\s+/g, "").trim();

    return text === "購入";
  });

  if (!button) {
    return "NO_PURCHASE_BUTTON";
  }

  button.scrollIntoView({
    block: "center"
  });

  button.click();

  return "CLICKED";
})();
  `);

  if (result !== "CLICKED") {
    throw new Error(
      "PURCHASE_CLICK_FAILED_" +
      result
    );
  }

  console.log(
    "✅ CLICKED 購入 BUTTON"
  );

  await Web.delay(1500);

  checkStop(stopCheck);

  return true;
}

async function getPurchaseState(wv) {
  return await Web.evalJS(wv, `
(() => {
  const url =
    String(location.href || "");

  const title =
    String(document.title || "");

  const text =
    String(
      document.body
        ? document.body.innerText
        : ""
    );

  const html =
    String(
      document.documentElement
        ? document.documentElement.innerHTML
        : ""
    );

  const normalized =
    text
      .replace(/\\s+/g, "")
      .trim();

  const lowerUrl =
    url.toLowerCase();

  const lowerHtml =
    html.toLowerCase();

  // =============================
  // PURCHASE SUCCESS
  // =============================

  const success =
    normalized.includes(
      "ご購入処理の完了"
    ) ||
    normalized.includes(
      "ご購入は正常に完了しました"
    ) ||
    normalized.includes(
      "購入が完了しました"
    ) ||
    normalized.includes(
      "決済が完了しました"
    ) ||
    normalized.includes(
      "ご購入ありがとうございます"
    );

  // =============================
  // PURCHASE FAILED
  // =============================

  const failed =
    normalized.includes(
      "決済に失敗"
    ) ||
    normalized.includes(
      "購入に失敗"
    ) ||
    normalized.includes(
      "カードが利用できません"
    ) ||
    normalized.includes(
      "エラーが発生しました"
    );

  // =============================
  // 3DS - OUTER PAGE STRUCTURE
  // =============================

  const has3dsAuthForm = Boolean(
    document.querySelector(
      [
        'form[name="credit3d2FepBuyAuthenticateActionForm"]',
        'form[action*="PaymentInfoAuthenticate"]',
        'form[action*="StepUp"]',
        'form[action*="tds2"]',
        'form[action*="challenge"]'
      ].join(",")
    )
  );

  const has3dsResponseForm = Boolean(
    document.querySelector(
      [
        "#responseForm",
        "#resSumbitButtonId",
        'input[name="md"]',
        'input[name="MD"]',
        'input[name="JWT"]',
        'input[name="creq"]',
        'input[name="CReq"]',
        'input[name="PaReq"]'
      ].join(",")
    )
  );

  const has3dsIframe = Boolean(
    document.querySelector(
      [
        "#iframeId",
        "#iframeTag iframe",
        'iframe[src*="emvtds"]',
        'iframe[src*="cardinal"]',
        'iframe[src*="3ds"]',
        'iframe[src*="challenge"]',
        'iframe[name*="challenge"]'
      ].join(",")
    )
  );

  // =============================
  // 3DS - PAGE SOURCE
  // =============================

  const has3dsHtml =
    lowerHtml.includes(
      "credit3d2fepbuyauthenticateactionform"
    ) ||
    lowerHtml.includes(
      "ressumbitbuttonid"
    ) ||
    lowerHtml.includes(
      "tds2-init-challenge"
    ) ||
    lowerHtml.includes(
      "emvtds.sps-system.com"
    ) ||
    lowerHtml.includes(
      "cardinalcommerce.com"
    ) ||
    lowerHtml.includes(
      "sendstepup"
    ) ||
    lowerHtml.includes(
      "afterstepup"
    ) ||
    lowerHtml.includes(
      "senddevicedatacollection"
    );

  // =============================
  // 3DS - URL
  // =============================

  const has3dsUrl =
    lowerUrl.includes(
      "credit3d2"
    ) ||
    lowerUrl.includes(
      "authenticate"
    ) ||
    lowerUrl.includes(
      "stepup"
    ) ||
    lowerUrl.includes(
      "challenge"
    ) ||
    lowerUrl.includes(
      "emvtds"
    ) ||
    lowerUrl.includes(
      "cardinal"
    ) ||
    lowerUrl.includes(
      "/acs"
    );

  // =============================
  // 3DS - TEXT
  // =============================

  const has3dsText =
    normalized.includes(
      "SMSによる本人認証"
    ) ||
    normalized.includes(
      "本人認証"
    ) ||
    normalized.includes(
      "3Dセキュア"
    ) ||
    normalized.includes(
      "ワンタイムパスワード"
    ) ||
    normalized.includes(
      "認証コード"
    ) ||
    normalized.includes(
      "パスワード再送"
    ) ||
    normalized.includes(
      "IDCheck"
    );

  const need3ds =
    !success &&
    (
      has3dsAuthForm ||
      has3dsResponseForm ||
      has3dsIframe ||
      has3dsHtml ||
      has3dsUrl ||
      has3dsText
    );

  return {
    url,
    title,
    success,
    failed,
    need3ds,

    signals: {
      authForm:
        has3dsAuthForm,

      responseForm:
        has3dsResponseForm,

      iframe:
        has3dsIframe,

      html:
        has3dsHtml,

      url:
        has3dsUrl,

      text:
        has3dsText
    },

    preview:
      normalized.slice(
        0,
        500
      )
  };
})();
  `);
}

async function waitPurchaseResult(
  wv,
  stopCheck,
  onStep,
  timeout
) {
  const started = Date.now();
  const limit =
    timeout || 5 * 60 * 1000;

  let announced3ds = false;

  let lastUrl = "";
  let stableSince = 0;
  let lastLoggedUrl = "";

  while (
    Date.now() - started < limit
  ) {
    checkStop(stopCheck);

    let currentUrl = "";

    try {
      currentUrl = String(
        await Web.evalJS(
          wv,
          "location.href || ''"
        ) || ""
      );
    } catch (_) {
      await Web.delay(300);
      continue;
    }

    // URL vừa đổi => đang load/redirect tiếp
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      stableSince = Date.now();

      if (
        currentUrl &&
        currentUrl !== lastLoggedUrl
      ) {
        lastLoggedUrl = currentUrl;

        console.log(
          "[JUMP PURCHASE URL]",
          currentUrl
        );
      }

      await Web.delay(300);
      continue;
    }

    // Đợi URL đứng yên ít nhất 700ms
    // rồi mới đọc DOM
    if (
      Date.now() - stableSince <
      700
    ) {
      await Web.delay(200);
      continue;
    }

    let state = null;

    try {
      state =
        await getPurchaseState(
          wv
        );
    } catch (_) {
      // Có thể DOM đang bị thay trong lúc redirect
      await Web.delay(300);
      continue;
    }

    if (!state) {
      await Web.delay(300);
      continue;
    }

    if (state.success) {
      log(
        "Thanh toán thành công",
        "success"
      );
    
      return {
        ok: true,
        state:
          "PURCHASE_SUCCESS",
        url:
          state.url,
        title:
          state.title
      };
    }

    if (state.failed) {
      console.log(
        "❌ JUMP+ PURCHASE FAILED"
      );

      return {
        ok: false,
        state:
          "PURCHASE_FAILED",
        reason:
          "PURCHASE_FAILED_ON_WEB",
        meta:
          state
      };
    }

    if (
      state.need3ds &&
      !announced3ds
    ) {
      announced3ds = true;
    
      log(
        "Phát hiện 3DS",
        "warn"
      );
    
      if (
        typeof onStep ===
        "function"
      ) {
        onStep(
          "3DS",
          "Waiting for 3DS authentication"
        );
      }
    }

    await Web.delay(500);
  }

  return {
    ok: false,

    state:
      announced3ds
        ? "3DS_TIMEOUT"
        : "PURCHASE_RESULT_TIMEOUT",

    reason:
      announced3ds
        ? "3DS_NOT_COMPLETED"
        : "PURCHASE_RESULT_TIMEOUT"
  };
}

async function cancelSubscription(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  log(
    "Đang mở trang quản lý gói tháng",
    "info"
  );

  wv.url =
    "https://shonenjumpplus.com/my/setting";

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(1500);
  checkStop(stopCheck);

  // ==============================
  // BẤM 定期購読を解約する
  // ==============================

  const opened = await Web.evalJS(wv, `
(() => {
  const product = document.querySelector(
    'input[name="product_id"]' +
    '[value="10834108156675977993"]'
  );

  if (!product) {
    return "NO_PRODUCT";
  }

  const form = product.closest("form");

  if (!form) {
    return "NO_FORM";
  }

  const button = Array.from(
    form.querySelectorAll(
      'button[type="submit"], input[type="submit"], a'
    )
  ).find(el => {
    const text = String(
      el.value ||
      el.innerText ||
      el.textContent ||
      ""
    )
      .replace(/\\s+/g, "")
      .trim();

    return text.includes(
      "定期購読を解約する"
    );
  });

  if (!button) {
    return "NO_CANCEL_START_BUTTON";
  }

  button.disabled = false;
  button.removeAttribute("disabled");

  button.scrollIntoView({
    block: "center"
  });

  if (
    button.tagName === "BUTTON" &&
    typeof form.requestSubmit === "function"
  ) {
    form.requestSubmit(button);
  } else {
    button.click();
  }

  return "CLICKED";
})();
  `);

  if (opened === "NO_PRODUCT") {
    const state = await Web.evalJS(wv, `
(() => {
  const text = String(
    document.body
      ? document.body.innerText
      : ""
  )
    .replace(/\\s+/g, "")
    .trim();

  return {
    alreadyCancelled:
      !text.includes("定期購読中") &&
      !text.includes(
        "定期購読を解約する"
      ),

    url: location.href
  };
})();
    `);

    if (
      state &&
      state.alreadyCancelled
    ) {
      log(
        "Gói tháng đã được huỷ trước đó",
        "success"
      );

      return {
        ok: true,
        skipped: true,
        reason: "ALREADY_CANCELLED",
        url: state.url
      };
    }
  }

  if (opened !== "CLICKED") {
    throw new Error(
      "JUMP_CANCEL_OPEN_FAILED_" +
      opened
    );
  }

  // ==============================
  // ĐỢI TRANG XÁC NHẬN HUỶ
  // ==============================

  let confirmReady = null;
  let started = Date.now();

  while (
    Date.now() - started < 30000
  ) {
    checkStop(stopCheck);

    try {
      confirmReady = await Web.evalJS(wv, `
(() => {
  const form = document.querySelector(
    'form[name="fepCancelIntensionConfirmActionForm"]'
  );

  if (!form) {
    return null;
  }

  const button = Array.from(
    form.querySelectorAll(
      "a.common-button"
    )
  ).find(el => {
    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    )
      .replace(/\\s+/g, "")
      .trim();

    return text === "解約";
  });

  if (!button) {
    return null;
  }

  return {
    ready: true,
    url: location.href
  };
})();
      `);
    } catch (_) {
      confirmReady = null;
    }

    if (
      confirmReady &&
      confirmReady.ready
    ) {
      break;
    }

    await Web.delay(500);
  }

  if (
    !confirmReady ||
    !confirmReady.ready
  ) {
    throw new Error(
      "JUMP_CANCEL_CONFIRM_PAGE_TIMEOUT"
    );
  }

  await Web.delay(1000);
  checkStop(stopCheck);

  // ==============================
  // BẤM 解約
  // ==============================

  const confirmed = await Web.evalJS(wv, `
(() => {
  const form = document.querySelector(
    'form[name="fepCancelIntensionConfirmActionForm"]'
  );

  if (!form) {
    return "NO_CONFIRM_FORM";
  }

  const button = Array.from(
    form.querySelectorAll(
      "a.common-button"
    )
  ).find(el => {
    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    )
      .replace(/\\s+/g, "")
      .trim();

    return text === "解約";
  });

  if (!button) {
    return "NO_CONFIRM_BUTTON";
  }

  button.scrollIntoView({
    block: "center"
  });

  button.focus();
  button.click();

  return "CLICKED";
})();
  `);

  if (confirmed !== "CLICKED") {
    throw new Error(
      "JUMP_CANCEL_CONFIRM_FAILED_" +
      confirmed
    );
  }

  // ==============================
  // ĐỢI TRANG HOÀN TẤT
  // ==============================

  let completed = null;
  started = Date.now();

  while (
    Date.now() - started < 60000
  ) {
    checkStop(stopCheck);

    try {
      completed = await Web.evalJS(wv, `
(() => {
  const title = String(
    document.title || ""
  );

  const text = String(
    document.body
      ? document.body.innerText
      : ""
  )
    .replace(/\\s+/g, "")
    .trim();

  const completeForm =
    document.querySelector(
      'form[name="fepCancelCompleteActionForm"]'
    );

  const success =
    title.includes(
      "継続課金停止完了"
    ) ||
    text.includes(
      "ご解約の内容の確認および解約処理の完了"
    ) ||
    Boolean(
      completeForm &&
      text.includes(
        "解約処理の完了"
      )
    );

  if (!success) {
    return null;
  }

  return {
    ok: true,
    title,
    url: location.href
  };
})();
      `);
    } catch (_) {
      completed = null;
    }

    if (
      completed &&
      completed.ok
    ) {
      break;
    }

    await Web.delay(500);
  }

  if (
    !completed ||
    !completed.ok
  ) {
    throw new Error(
      "JUMP_CANCEL_RESULT_TIMEOUT"
    );
  }

  log(
    "Huỷ gói tháng Jump+ thành công",
    "success"
  );

  return completed;
}

module.exports = {
  registerAccount,
  openLoginPopup,
  openSignupForm,
  fillSignupForm,
  submitSignup,
  waitSignupMailSent,
  getSignupState,
  getSignupRegistrationLink,
  openRegistrationLink,
  checkRegistrationComplete,

  openPremiumPage,
  loginAccount,
  openPaymentMethod,
  selectCredit3D,
  fillCreditCard,
  submitCreditCard,
  waitPurchaseConfirm,

  cancelSubscription
};