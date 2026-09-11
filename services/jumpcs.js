
// ================= JUMP CS =================

const Web = require("../web");
const OTP = require("../otp");
const OtpNorth = require("./otpnorth");
const API = require("./jumpcs_api");
const Core = require("../core");

const MENU_URL =
  "https://jumpcs.shueisha.co.jp/shop/customer/menu.aspx";

const check = fn => {
  if (typeof fn === "function") fn();
};

const update = (cb, step, status) => {

  try {
    if (typeof cb === "function") cb(step, status);
  } catch (_) {
    //
  }
};

const log = (message, type) => {
  Core.addLog("[JumpCS] " + message, type || "info");
};

async function open(wv, url, stop) {
  check(stop);
  wv.url = url;
  await Web.waitPageReady(wv, 30000);
  await Web.delay(2500);
}

async function waitFor(wv, script, stop, timeout = 30000) {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    check(stop);

    try {
      const result = await Web.evalJS(wv, script);
      if (result) return result;
    } catch (_) {
      //
    }

    await Web.delay(500);
  }

  return null;
}

async function loginJumpCS(
  wv,
  email,
  password,
  stop
) {
  check(stop);

  await open(
    wv,
    MENU_URL,
    stop
  );

  const pageState = await waitFor(
    wv,
    `
(() => {
  const uid = document.querySelector(
    '.p-jcs-login__form input[name="uid"]'
  );

  const pwd = document.querySelector(
    '.p-jcs-login__form input[name="pwd"]'
  );

  const logout = document.querySelector(
    '.block-mypage--logout a[href*="logout.aspx"]'
  );

  if (uid && pwd) {
    return {
      state: "LOGIN_FORM",
      url: location.href
    };
  }

  if (logout) {
    return {
      state: "ALREADY_LOGGED_IN",
      url: location.href
    };
  }

  return null;
})();
`,
    stop,
    30000
  );

  if (!pageState) {
    throw new Error(
      "JUMPCS_LOGIN_PAGE_TIMEOUT"
    );
  }

  if (
    pageState.state ===
    "ALREADY_LOGGED_IN"
  ) {
    log(
      "Phát hiện session JumpCS cũ, đang clear",
      "warn"
    );
  
    await Web.clearSession(wv);
    
    check(stop);
    
    return await loginJumpCS(
      wv,
      email,
      password,
      stop
    );
  }

  const filled = await Web.evalJS(
    wv,
    `
(() => {
  const uid = document.querySelector(
    '.p-jcs-login__form input[name="uid"]'
  );

  const pwd = document.querySelector(
    '.p-jcs-login__form input[name="pwd"]'
  );

  if (!uid || !pwd) {
    return {
      ok: false,
      uidFound: Boolean(uid),
      pwdFound: Boolean(pwd)
    };
  }

  const setValue = (el, value) => {
    el.scrollIntoView({
      block: "center"
    });

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

    return (
      String(el.value || "") ===
      String(value)
    );
  };

  const uidOK = setValue(
    uid,
    ${JSON.stringify(String(email || ""))}
  );

  const pwdOK = setValue(
    pwd,
    ${JSON.stringify(String(password || ""))}
  );

  return {
    ok: uidOK && pwdOK,
    uidOK,
    pwdOK,
    uidValue: uid.value,
    passwordLength:
      String(pwd.value || "").length
  };
})();
`
  );

  if (!filled || !filled.ok) {
    throw new Error(
      "JUMPCS_LOGIN_FILL_FAILED_" +
      JSON.stringify(filled || {})
    );
  }

  await Web.delay(700);

  const clicked = await Web.evalJS(
    wv,
    `
(() => {
  const uid = document.querySelector(
    '.p-jcs-login__form input[name="uid"]'
  );

  if (!uid) {
    return "NO_UID";
  }

  const form = uid.closest("form");

  if (!form) {
    return "NO_FORM";
  }

  const buttons = Array.from(
    form.querySelectorAll("button")
  );

  const button = buttons.find(el => {
    const text = String(
      el.innerText ||
      el.textContent ||
      ""
    )
      .replace(/\\s+/g, "")
      .trim();

    return text === "ログイン";
  }) ||
  form.querySelector(
    ".p-jcs-login__button button"
  );

  if (!button) {
    return "NO_LOGIN_BUTTON";
  }

  button.disabled = false;
  button.removeAttribute("disabled");

  button.scrollIntoView({
    block: "center"
  });

  button.focus();
  button.click();

  return "CLICKED";
})();
`
  );

  if (clicked !== "CLICKED") {
    throw new Error(
      "JUMPCS_LOGIN_CLICK_FAILED_" +
      clicked
    );
  }

  const result = await waitFor(
    wv,
    `
(() => {
  const url = String(
    location.href || ""
  );

  const text = String(
    document.body
      ? document.body.innerText
      : ""
  )
    .replace(/\\s+/g, "")
    .trim();

  const uid = document.querySelector(
    '.p-jcs-login__form input[name="uid"]'
  );

  const pwd = document.querySelector(
    '.p-jcs-login__form input[name="pwd"]'
  );

  const authTel =
    document.querySelector("#auth_tel");

  const smsCode =
    document.querySelector("#code");

  const logout =
    document.querySelector(
      '.block-mypage--logout a[href*="logout.aspx"]'
    );

  if (
    uid &&
    pwd &&
    (
      text.includes(
        "メールアドレスまたはパスワードが正しくありません"
      ) ||
      text.includes(
        "ログインできません"
      )
    )
  ) {
    return {
      done: true,
      ok: false,
      state: "LOGIN_ERROR",
      error: text.slice(0, 500),
      url
    };
  }

  if (authTel) {
    return {
      done: true,
      ok: true,
      state: "PHONE_REQUIRED",
      url
    };
  }

  if (smsCode) {
    return {
      done: true,
      ok: true,
      state: "SMS_CODE_REQUIRED",
      url
    };
  }

  if (logout) {
    return {
      done: true,
      ok: true,
      state: "LOGGED_IN",
      url,
      title: document.title || ""
    };
  }

  return null;
})();
`,
    stop,
    30000
  );

  if (!result) {
    throw new Error(
      "JUMPCS_LOGIN_RESULT_TIMEOUT"
    );
  }

  if (!result.ok) {
    throw new Error(
      "JUMPCS_LOGIN_FAILED_" +
      result.error
    );
  }

  log(
    "Login JumpCS thành công",
    "success"
  );

  return result;
}

async function getPostLoginState(
  wv,
  stop,
  timeout = 30000
) {
  const state = await waitFor(
    wv,
    `
(() => {
  const url = String(
    location.href || ""
  );

  const text = String(
    document.body
      ? document.body.innerText
      : ""
  )
    .replace(/\\s+/g, "")
    .trim();

  const loginUid = document.querySelector(
    '.p-jcs-login__form input[name="uid"]'
  );

  const loginPwd = document.querySelector(
    '.p-jcs-login__form input[name="pwd"]'
  );

  if (
    loginUid &&
    loginPwd
  ) {
    if (
      text.includes(
        "メールアドレスまたはパスワードが正しくありません"
      ) ||
      text.includes(
        "ログインできません"
      )
    ) {
      return {
        state: "LOGIN_ERROR",
        url,
        preview: text.slice(0, 500)
      };
    }

    return null;
  }

  if (
    document.querySelector(
      "#auth_tel"
    )
  ) {
    return {
      state: "PHONE_REQUIRED",
      url
    };
  }

  if (
    document.querySelector(
      "#code"
    ) &&
    document.querySelector(
      'input.block-auth-tel-certify--submit[value="確認する"]'
    )
  ) {
    return {
      state: "SMS_CODE_REQUIRED",
      url
    };
  }

  const logout = document.querySelector(
    '.block-mypage--logout a[href*="logout.aspx"]'
  );

  if (logout) {
    return {
      state:
        "PHONE_ALREADY_VERIFIED",
      url
    };
  }

  return null;
})();
`,
    stop,
    timeout
  );

  if (!state) {
    throw new Error(
      "JUMPCS_POST_LOGIN_STATE_TIMEOUT"
    );
  }

  if (
    state.state ===
    "LOGIN_ERROR"
  ) {
    throw new Error(
      "JUMPCS_LOGIN_FAILED_" +
      state.preview
    );
  }

  return state;
}

async function waitEntryForm(wv, stop, timeout = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    check(stop);

    let state = null;

    try {
      state = await Web.evalJS(wv, `
(() => {
  const url=String(location.href || "");
  const text=String(
    document.body ? document.body.innerText : ""
  ).replace(/\\s+/g,"");

  const ready=Boolean(
    document.querySelector("#frmOnetime") &&
    document.querySelector("#mail") &&
    document.querySelector("#pwd") &&
    document.querySelector("#cpwd")
  );

  const loginPage=
    url.includes("/login") ||
    text.includes(
      "メールアドレスとパスワードを入力してログインしてください"
    );

  return {
    ready,
    loginPage,
    url,
    title:document.title || ""
  };
})();
`);
    } catch (_) {
      //
    }

    if (state && state.ready) return state;

    if (state && state.loginPage) {
      throw new Error(
        "JUMPCS_REDIRECTED_TO_LOGIN_" +
        state.url
      );
    }

    await Web.delay(1500);
  }

  throw new Error("JUMPCS_ENTRY_FORM_TIMEOUT");
}

async function fillEntry(wv, email, pass, stop) {
  check(stop);

  const result = await Web.evalJS(wv, `
(() => {
  const set=(selector,value)=>{
    const el=document.querySelector(selector);
    if(!el) return false;

    el.focus();

    try {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(el,value);
    } catch (_) {
      el.value=value;
    }

    ["input","change","blur"].forEach(type =>
      el.dispatchEvent(new Event(type,{bubbles:true}))
    );

    return el.value===value;
  };

  const mail=set("#mail",${JSON.stringify(String(email || ""))});
  const pwd=set("#pwd",${JSON.stringify(String(pass || ""))});
  const cpwd=set("#cpwd",${JSON.stringify(String(pass || ""))});

  return {ok:mail&&pwd&&cpwd,mail,pwd,cpwd};
})();
`);

  if (!result || !result.ok) {
    throw new Error(
      "JUMPCS_ENTRY_FILL_FAILED_" +
      JSON.stringify(result || {})
    );
  }

  await Web.delay(1500);
}

async function submitEntry(wv, stop) {
  check(stop);

  const result = await Web.evalJS(wv, `
(() => {
  const form=document.querySelector("#frmOnetime");
  if(!form) return "NO_FORM";

  const btn=form.querySelector(
    'input[type="submit"][name="submit"][value="送信する"]'
  );

  if(!btn) return "NO_BUTTON";

  const mail=form.querySelector("#mail");
  const pwd=form.querySelector("#pwd");
  const cpwd=form.querySelector("#cpwd");
  const token=form.querySelector(
    'input[name="crsirefo_hidden"]'
  );

  if(!mail || !mail.value) return "MAIL_EMPTY";
  if(!pwd || !pwd.value) return "PWD_EMPTY";
  if(!cpwd || !cpwd.value) return "CPWD_EMPTY";
  if(!token || !token.value) return "TOKEN_EMPTY";

  btn.disabled=false;
  btn.removeAttribute("disabled");
  btn.scrollIntoView({block:"center"});

  btn.click();

  return "CLICKED";
})();
`);

  if (result !== "CLICKED") {
    throw new Error(
      "JUMPCS_SEND_FAILED_" +
      result
    );
  }

  const next = await waitFor(wv, `
(() => {
  const url=String(location.href || "");

  if(
    url.includes(
      "/shop/customer/entry.aspx?username="
    )
  ){
    return {
      ok:true,
      url
    };
  }

  if(
    url.includes(
      "/shop/customer/customer.aspx"
    )
  ){
    return {
      ok:false,
      login:true,
      url
    };
  }

  return null;
})();
`, stop, 30000);

  if (!next) {
    throw new Error(
      "JUMPCS_AFTER_SEND_TIMEOUT"
    );
  }

  if (!next.ok) {
    throw new Error(
      "JUMPCS_REDIRECTED_TO_CUSTOMER_LOGIN_" +
      next.url
    );
  }

  log(
    "Đã chuyển sang trang đăng ký hội viên",
    "success"
  );

  return next;
}

async function waitRegistrationPage(wv, stop) {
  const result = await waitFor(wv, `
(() => {
  const title=String(document.title || "");

  const otp=document.querySelector(
    '.form-group.block-member-info--confirmation_code input:not([type="hidden"])'
  );

  if(!title.includes("会員登録") || !otp) return null;

  return {
    ready:true,
    title,
    url:location.href
  };
})();
`, stop, 30000);

  if (!result) {
    throw new Error("JUMPCS_REGISTRATION_PAGE_TIMEOUT");
  }

  return result;
}

function splitFirst(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\S+)\s+(.+)$/);

  if (!match) {
    throw new Error("JUMPCS_NAME_NEEDS_TWO_PARTS_" + text);
  }

  return {
    first: match[1].trim(),
    second: match[2].trim()
  };
}

function parseBirthdate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);

  if (!match) match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) throw new Error("JUMPCS_INVALID_BIRTHDATE");

  return {
    year: match[1],
    month: match[2].padStart(2, "0"),
    day: match[3].padStart(2, "0")
  };
}

async function fillRegistration(wv, data, stop) {
  check(stop);

  const name = splitFirst(data.names);
  const kana = splitFirst(data.kanas);
  const birth = parseBirthdate(data.birthdate);
  const sex = Math.random() < 0.5 ? "M" : "F";

  const toFullWidth = value =>
    String(value || "")
      .replace(/[!-~]/g, char =>
        String.fromCharCode(
          char.charCodeAt(0) + 0xFEE0
        )
      )
      .replace(/ /g, "　");

  const values = {
    otp: String(data.otp || "").trim(),
    password: String(data.password || ""),
    name1: toFullWidth(name.first),
    name2: toFullWidth(name.second),
    kana1: String(kana.first || "").trim(),
    kana2: String(kana.second || "").trim(),
    phone: String(data.phone || "").replace(/\D/g, ""),
    postcode: String(data.postcode || "").replace(/\D/g, ""),
    pref: String(data.pref || "").trim(),
    city: String(data.city || "").trim(),
    address: String(data.address || "").trim(),
    year: birth.year,
    month: birth.month,
    day: birth.day,
    sex
  };

  const STEP_DELAY = 180;

  async function setInput(
    selector,
    value,
    required = true
  ) {
    check(stop);

    value = String(value || "");

    if (!value && !required) {
      return true;
    }

    const result = await Web.evalJS(wv, `
(() => {
  const el = document.querySelector(
    ${JSON.stringify(selector)}
  );

  if (!el) {
    return {
      ok: ${required ? "false" : "true"},
      error: "NOT_FOUND"
    };
  }

  const value =
    ${JSON.stringify(value)};

  el.scrollIntoView({
    block: "center"
  });

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

  return {
    ok:
      String(el.value || "") ===
      String(value),

    value:
      String(el.value || "")
  };
})();
`);

    await Web.delay(STEP_DELAY);

    return Boolean(
      result &&
      result.ok
    );
  }

  async function setSelect(
    selector,
    value
  ) {
    check(stop);

    const result = await Web.evalJS(wv, `
(() => {
  const el = document.querySelector(
    ${JSON.stringify(selector)}
  );

  if (!el) {
    return {
      ok: false,
      error: "NOT_FOUND"
    };
  }

  const value =
    ${JSON.stringify(String(value || ""))};

  const exists = Array.from(
    el.options || []
  ).some(option =>
    String(option.value) === value
  );

  if (!exists) {
    return {
      ok: false,
      error: "OPTION_NOT_FOUND",
      value
    };
  }

  el.scrollIntoView({
    block: "center"
  });

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

  return {
    ok:
      String(el.value || "") === value,

    value:
      String(el.value || "")
  };
})();
`);

    await Web.delay(STEP_DELAY);

    return Boolean(
      result &&
      result.ok
    );
  }

  const result = {};

  result.otpOK = await setInput(
    "#confirmation_code",
    values.otp
  );

  result.passwordOK = await setInput(
    "#pwd",
    values.password
  );

  result.name1OK = await setInput(
    "#name",
    values.name1
  );

  result.name2OK = await setInput(
    "#name2",
    values.name2
  );

  result.kana1OK = await setInput(
    "#kana",
    values.kana1
  );

  result.kana2OK = await setInput(
    "#kana2",
    values.kana2
  );

  result.telOK = await setInput(
    "#tel",
    values.phone
  );

  result.zipOK = await setInput(
    "#zip",
    values.postcode
  );

  result.prefOK = await setSelect(
    "#pref",
    values.pref
  );

  result.addrOK = await setInput(
    "#addr",
    values.city
  );

  result.addr2OK = await setInput(
    "#addr2",
    values.address,
    false
  );

  result.sexOK = await setSelect(
    'select[name="sex"]',
    values.sex
  );

  result.yearOK = await setSelect(
    'select[name="yy_birth"]',
    values.year
  );

  result.monthOK = await setSelect(
    'select[name="mm_birth"]',
    values.month
  );

  result.dayOK = await setSelect(
    'select[name="dd_birth"]',
    values.day
  );

  const optionsResult = await Web.evalJS(wv, `
(() => {
  const fire = el => {
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
  };

  const noMail =
    document.querySelector(
      "#mailnews_0"
    );

  if (noMail && !noMail.checked) {
    noMail.scrollIntoView({
      block: "center"
    });

    noMail.click();
    fire(noMail);
  }

  const agree =
    document.querySelector(
      "#agree_checkbox"
    );

  if (agree && !agree.checked) {
    agree.scrollIntoView({
      block: "center"
    });

    agree.click();
    fire(agree);
  }

  return {
    noMail:
      Boolean(
        noMail &&
        noMail.checked
      ),

    agree:
      Boolean(
        agree &&
        agree.checked
      )
  };
})();
`);

  await Web.delay(STEP_DELAY);

  result.noMail = Boolean(
    optionsResult &&
    optionsResult.noMail
  );

  result.agree = Boolean(
    optionsResult &&
    optionsResult.agree
  );

  result.valuesAfter =
    await Web.evalJS(wv, `
(() => ({
  otp:
    document.querySelector(
      "#confirmation_code"
    )?.value || "",

  passwordLength:
    String(
      document.querySelector(
        "#pwd"
      )?.value || ""
    ).length,

  name1:
    document.querySelector(
      "#name"
    )?.value || "",

  name2:
    document.querySelector(
      "#name2"
    )?.value || "",

  kana1:
    document.querySelector(
      "#kana"
    )?.value || "",

  kana2:
    document.querySelector(
      "#kana2"
    )?.value || "",

  tel:
    document.querySelector(
      "#tel"
    )?.value || "",

  zip:
    document.querySelector(
      "#zip"
    )?.value || "",

  pref:
    document.querySelector(
      "#pref"
    )?.value || "",

  addr:
    document.querySelector(
      "#addr"
    )?.value || "",

  addr2:
    document.querySelector(
      "#addr2"
    )?.value || ""
}))();
`);

  result.ok =
    result.otpOK &&
    result.passwordOK &&
    result.name1OK &&
    result.name2OK &&
    result.kana1OK &&
    result.kana2OK &&
    result.telOK &&
    result.zipOK &&
    result.prefOK &&
    result.addrOK &&
    result.addr2OK &&
    result.sexOK &&
    result.yearOK &&
    result.monthOK &&
    result.dayOK &&
    result.noMail &&
    result.agree;

  if (!result.ok) {
    throw new Error(
      "JUMPCS_PROFILE_FILL_FAILED_" +
      JSON.stringify(result)
    );
  }

  await Web.delay(500);

  return {
    ...result,
    sex,
    name,
    kana,
    birth
  };
}

async function submitRegistration(wv, stop) {
  check(stop);

  const ready = await waitFor(wv, `
(() => Boolean(
  document.querySelector(
    'input[name="regist"][value="登録する"]'
  )
))();
`, stop, 30000);

  if (!ready)
    throw new Error("JUMPCS_REGISTER_BUTTON_TIMEOUT");

  const result = await Web.evalJS(wv, `
(() => {
  const btn=document.querySelector(
    'input[name="regist"][value="登録する"]'
  );

  if(!btn) return "NO_REGISTER_BUTTON";

  btn.disabled=false;
  btn.removeAttribute("disabled");
  btn.scrollIntoView({block:"center"});
  btn.click();

  return "CLICKED";
})();
`);

  if (result !== "CLICKED")
    throw new Error("JUMPCS_REGISTER_FAILED_" + result);

  const next = await waitFor(wv, `
(() => {
  const tel=document.querySelector("#auth_tel");

  if(!tel) return null;

  return {
    ready:true,
    url:location.href,
    title:document.title || ""
  };
})();
`, stop, 30000);

  if (!next)
    throw new Error("JUMPCS_AUTH_TEL_PAGE_TIMEOUT");

  log("Đăng ký profile thành công", "success");
  return next;
}

async function verifyPhone(
  wv,
  phoneInfo,
  email,
  password,
  stop,
  onStep
) {
  check(stop);

  const info =
    phoneInfo || {};

  const phone =
    String(
      info.phone || ""
    ).replace(/\D/g, "");

  const pkey =
    String(
      info.pkey || ""
    ).trim();

  // ======================================================
  // HÀM CHỜ NGƯỜI DÙNG NHẬP OTP2
  // ======================================================

  async function confirmManualOtp2() {
    update(
      onStep,
      "JUMPCS_MANUAL",
      "Waiting manual SMS2 code"
    );

    log(
      "Đang chờ nhập tay OTP2",
      "info"
    );

    const completed =
      await waitFor(
        wv,
        `
(() => {
  const input =
    document.querySelector("#code");

  if (!input) {
    return null;
  }

  const value =
    String(
      input.value || ""
    ).replace(/\\D/g, "");

  if (value.length !== 6) {
    return null;
  }

  const button =
    document.querySelector(
      'input.block-auth-tel-certify--submit[value="確認する"]'
    );

  if (!button) {
    return null;
  }

  if (
    button.dataset.jsboxClicked ===
    "1"
  ) {
    return "CLICKED";
  }

  button.disabled = false;
  button.removeAttribute(
    "disabled"
  );

  button.scrollIntoView({
    block: "center"
  });

  button.focus();

  button.dataset.jsboxClicked =
    "1";

  button.click();

  return "CLICKED";
})();
`,
        stop,
        10 * 60 * 1000
      );

    if (
      completed !== "CLICKED"
    ) {
      throw new Error(
        "JUMPCS_MANUAL_CODE_TIMEOUT"
      );
    }

    const mypage =
      await waitFor(
        wv,
        `
(() => {
  const url =
    String(
      location.href || ""
    );

  const text =
    String(
      document.body
        ? document.body.innerText
        : ""
    )
      .replace(/\\s+/g, "")
      .trim();

  if (
    text.includes(
      "確認コードが正しくありません"
    ) ||
    text.includes(
      "確認コードが一致しません"
    ) ||
    text.includes(
      "認証に失敗"
    )
  ) {
    return {
      done: true,
      ok: false,
      error:
        text.slice(0, 500),
      url
    };
  }

  const logout =
    document.querySelector(
      '.block-mypage--logout a[href*="logout.aspx"]'
    );

  if (
    logout ||
    text.includes("マイページ") ||
    text.includes("ログアウト")
  ) {
    return {
      done: true,
      ok: true,
      url
    };
  }

  return null;
})();
`,
        stop,
        30000
      );

    if (!mypage) {
      throw new Error(
        "JUMPCS_MANUAL_CONFIRM_TIMEOUT"
      );
    }

    if (!mypage.ok) {
      throw new Error(
        "JUMPCS_SECOND_SMS_CODE_INVALID_" +
        mypage.error
      );
    }

    log(
      "OTP2 xác nhận thành công",
      "success"
    );

    return {
      ok: true,
      url:
        mypage.url
    };
  }

  // ======================================================
  // 1. KIỂM TRA TRẠNG THÁI HIỆN TẠI
  // ======================================================

  const state =
    await waitFor(
      wv,
      `
(() => {
  if (
    document.querySelector("#code")
  ) {
    return "CODE_READY";
  }

  if (
    document.querySelector("#auth_tel")
  ) {
    return "PHONE_READY";
  }

  const logout =
    document.querySelector(
      '.block-mypage--logout a[href*="logout.aspx"]'
    );

  if (logout) {
    return "ALREADY_VERIFIED";
  }

  return null;
})();
`,
      stop,
      30000
    );

  if (!state) {
    throw new Error(
      "JUMPCS_PHONE_PAGE_TIMEOUT"
    );
  }

  // ======================================================
  // 2. ĐÃ VERIFY HOÀN TOÀN
  // ======================================================

  if (
    state ===
    "ALREADY_VERIFIED"
  ) {
    return {
      ok: true,
      skipped: true,
      reason:
        "PHONE_ALREADY_VERIFIED",
      url:
        String(wv.url || "")
    };
  }

  // ======================================================
  // 3. ĐANG Ở #code
  // ĐÂY LÀ MÀN HÌNH SMS2
  // KHÔNG ORDER SĐT, KHÔNG LẤY OTP1
  // ======================================================

  if (
    state ===
    "CODE_READY"
  ) {
    log(
      "Phát hiện màn hình OTP2, bỏ qua SMS1",
      "success"
    );

    const secondResult =
      await confirmManualOtp2();

    return {
      ...secondResult,
      skippedFirstSms: true,
      phone:
        phone || "",
      pkey:
        pkey || ""
    };
  }

  // ======================================================
  // 4. ĐANG Ở MÀN HÌNH NHẬP SĐT
  // PHẢI LÀM ĐẦY ĐỦ SMS1
  // ======================================================

  if (
    !/^\d{11}$/.test(phone)
  ) {
    throw new Error(
      "JUMPCS_AUTH_PHONE_INVALID_" +
      phone
    );
  }

  if (!pkey) {
    throw new Error(
      "JUMPCS_PHONE_PKEY_EMPTY"
    );
  }

  update(
    onStep,
    "JUMPCS_PHONE",
    "Send phone verification code"
  );

  const sent =
    await Web.evalJS(
      wv,
      `
(() => {
  const tel =
    document.querySelector(
      "#auth_tel"
    );

  if (!tel) {
    return "NO_PHONE_INPUT";
  }

  const value =
    ${JSON.stringify(phone)};

  tel.scrollIntoView({
    block: "center"
  });

  tel.focus();

  try {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(
      tel,
      value
    );
  } catch (_) {
    tel.value = value;
  }

  [
    "input",
    "change",
    "blur"
  ].forEach(type => {
    tel.dispatchEvent(
      new Event(type, {
        bubbles: true
      })
    );
  });

  if (
    String(tel.value || "") !==
    value
  ) {
    return "PHONE_FILL_FAILED";
  }

  const button =
    document.querySelector(
      'input.block-auth-tel-send--submit[value="確認コードを送信"]'
    );

  if (!button) {
    return "NO_SEND_BUTTON";
  }

  button.disabled = false;

  button.removeAttribute(
    "disabled"
  );

  button.scrollIntoView({
    block: "center"
  });

  button.focus();
  button.click();

  return "CLICKED";
})();
`
    );

  if (
    sent !== "CLICKED"
  ) {
    throw new Error(
      "JUMPCS_SMS_SEND_FAILED_" +
      sent
    );
  }

  const codeReady =
    await waitFor(
      wv,
      `
(() => Boolean(
  document.querySelector("#code") &&
  document.querySelector(
    'input.block-auth-tel-certify--submit[value="確認する"]'
  )
))();
`,
      stop,
      30000
    );

  if (!codeReady) {
    throw new Error(
      "JUMPCS_SMS_CODE_PAGE_TIMEOUT"
    );
  }

  // ======================================================
  // 5. LẤY OTP1
  // ======================================================

  update(
    onStep,
    "JUMPCS_SMS_FIRST",
    "Wait first SMS code"
  );

  log(
    "Đang chờ OTP1",
    "info"
  );

  const firstOtp =
    await OtpNorth.waitOtp(
      pkey,
      phone,
      stop
    );

  check(stop);

  if (
    !firstOtp ||
    !/^\d{6}$/.test(
      String(firstOtp)
    )
  ) {
    throw new Error(
      "JUMPCS_FIRST_SMS_OTP_TIMEOUT"
    );
  }

  log(
    "Đã lấy OTP1: " +
      firstOtp,
    "success"
  );
  
  $cache.set(
    "north_sms2_pkey",
    pkey
  );
  
  $cache.set(
    "north_sms1_otp",
    firstOtp
  );

  // ======================================================
  // 6. NHẬP OTP1
  // ======================================================

  update(
    onStep,
    "JUMPCS_SMS_FIRST_CONFIRM",
    "Confirm first SMS code"
  );

  const firstFilled =
    await Web.evalJS(
      wv,
      `
(() => {
  const input =
    document.querySelector("#code");

  if (!input) {
    return {
      ok: false,
      reason: "NO_CODE_INPUT"
    };
  }

  const value =
    ${JSON.stringify(String(firstOtp))};

  input.scrollIntoView({
    block: "center"
  });

  input.focus();

  try {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(
      input,
      value
    );
  } catch (_) {
    input.value = value;
  }

  [
    "input",
    "change",
    "blur"
  ].forEach(type => {
    input.dispatchEvent(
      new Event(type, {
        bubbles: true
      })
    );
  });

  return {
    ok:
      String(input.value || "") ===
      value,

    value:
      String(input.value || "")
  };
})();
`
    );

  if (
    !firstFilled ||
    !firstFilled.ok
  ) {
    throw new Error(
      "JUMPCS_FIRST_SMS_FILL_FAILED_" +
      JSON.stringify(
        firstFilled || {}
      )
    );
  }

  await Web.delay(500);

  check(stop);

  // ======================================================
  // 7. XÁC NHẬN OTP1
  // ======================================================

  const firstClicked =
    await Web.evalJS(
      wv,
      `
(() => {
  const input =
    document.querySelector("#code");

  if (!input) {
    return "NO_CODE_INPUT";
  }

  const code =
    String(
      input.value || ""
    ).replace(/\\D/g, "");

  if (code.length !== 6) {
    return "CODE_NOT_COMPLETE";
  }

  const button =
    document.querySelector(
      'input.block-auth-tel-certify--submit[value="確認する"]'
    );

  if (!button) {
    return "NO_CONFIRM_BUTTON";
  }

  button.disabled = false;

  button.removeAttribute(
    "disabled"
  );

  button.scrollIntoView({
    block: "center"
  });

  button.focus();
  button.click();

  return "CLICKED";
})();
`
    );

  if (
    firstClicked !==
    "CLICKED"
  ) {
    throw new Error(
      "JUMPCS_FIRST_SMS_CONFIRM_FAILED_" +
      firstClicked
    );
  }

  // ======================================================
  // 8. CHỜ VỀ MYPAGE SAU OTP1
  // ======================================================

  const firstCompleted =
    await waitFor(
      wv,
      `
(() => {
  const url =
    String(
      location.href || ""
    );

  const text =
    String(
      document.body
        ? document.body.innerText
        : ""
    )
      .replace(/\\s+/g, "")
      .trim();

  if (
    text.includes(
      "確認コードが正しくありません"
    ) ||
    text.includes(
      "確認コードが一致しません"
    ) ||
    text.includes(
      "認証に失敗"
    )
  ) {
    return {
      done: true,
      ok: false,
      error:
        text.slice(0, 500),
      url
    };
  }

  const logout =
    document.querySelector(
      '.block-mypage--logout a[href*="logout.aspx"]'
    );

  if (
    logout ||
    text.includes("マイページ") ||
    text.includes("ログアウト")
  ) {
    return {
      done: true,
      ok: true,
      state: "MYPAGE",
      url
    };
  }

  return null;
})();
`,
      stop,
      30000
    );

  if (!firstCompleted) {
    throw new Error(
      "JUMPCS_FIRST_SMS_MYPAGE_TIMEOUT"
    );
  }

  if (!firstCompleted.ok) {
    throw new Error(
      "JUMPCS_FIRST_SMS_CODE_INVALID_" +
      firstCompleted.error
    );
  }

  log(
    "OTP1 thành công, đã về MyPage",
    "success"
  );

  // ======================================================
  // 9. LOGOUT SAU OTP1
  // ======================================================

  update(
    onStep,
    "JUMPCS_SMS_LOGOUT",
    "Logout before SMS2"
  );

  await logoutJumpCS(
    wv,
    stop
  );

  check(stop);

  // ======================================================
  // 10. ĐỢI 7 GIÂY
  // ======================================================

  update(
    onStep,
    "JUMPCS_SMS_WAIT",
    "Wait 7 seconds before login again"
  );

  log(
    "Đợi 7 giây trước khi login lại",
    "info"
  );

  await Web.delay(
    7000
  );

  check(stop);

  // ======================================================
  // 11. LOGIN LẠI ĐỂ LẤY SMS2
  // ======================================================

  update(
    onStep,
    "JUMPCS_SMS_LOGIN",
    "Login again for SMS2"
  );

  const loginResult =
    await loginJumpCS(
      wv,
      email,
      password,
      stop
    );

  const loginState =
    loginResult.state
      ? loginResult
      : await getPostLoginState(
          wv,
          stop,
          30000
        );

  if (
    loginState.state ===
      "LOGGED_IN" ||
    loginState.state ===
      "PHONE_ALREADY_VERIFIED"
  ) {
    return {
      ok: true,
      skippedSecondSms: true,
      reason:
        "PHONE_ALREADY_VERIFIED",
      phone,
      pkey,
      url:
        loginState.url
    };
  }

  if (
    loginState.state ===
    "PHONE_REQUIRED"
  ) {
    throw new Error(
      "JUMPCS_SMS2_PHONE_REQUIRED_AGAIN"
    );
  }

  if (
    loginState.state !==
    "SMS_CODE_REQUIRED"
  ) {
    throw new Error(
      "JUMPCS_SMS_RELOGIN_STATE_" +
      JSON.stringify(
        loginState || {}
      )
    );
  }

  // ======================================================
  // 12. CHỜ NHẬP TAY OTP2
  // ======================================================

  // ======================================================
  // 12. CHỜ 3 GIÂY TRƯỚC KHI GỌI SMS2
  // ======================================================
  
  update(
    onStep,
    "JUMPCS_SMS2",
    "Wait SMS2"
  );
  
  await Web.delay(3000);
  
  // ======================================================
  // 13. LẤY OTP2 TỰ ĐỘNG
  // ======================================================
  
  const secondOtp =
    await OtpNorth.waitSms2(
      stop
    );
  
  log(
    "Đã lấy OTP2: " + secondOtp,
    "success"
  );
  
  // ======================================================
  // 14. NHẬP OTP2
  // ======================================================
  
  const secondFilled =
    await Web.evalJS(
      wv,
  `
  (() => {
  
    const input =
      document.querySelector("#code");
  
    if (!input)
      return false;
  
    const value =
      ${JSON.stringify(secondOtp)};
  
    try {
  
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(
        input,
        value
      );
  
    } catch (_) {
  
      input.value = value;
  
    }
  
    ["input","change","blur"]
      .forEach(type =>
        input.dispatchEvent(
          new Event(type,{
            bubbles:true
          })
        )
      );
  
    return (
      String(input.value) ===
      value
    );
  
  })();
  `
    );
  
  if (!secondFilled) {
    throw new Error(
      "JUMPCS_SMS2_FILL_FAILED"
    );
  }
  
  // ======================================================
  // 15. CLICK XÁC NHẬN
  // ======================================================
  
  const clicked =
    await Web.evalJS(
      wv,
  `
  (() => {
  
    const btn =
      document.querySelector(
        'input.block-auth-tel-certify--submit[value="確認する"]'
      );
  
    if (!btn)
      return false;
  
    btn.disabled = false;
    btn.removeAttribute("disabled");
  
    btn.click();
  
    return true;
  
  })();
  `
    );
  
  if (!clicked) {
    throw new Error(
      "JUMPCS_SMS2_CONFIRM_FAILED"
    );
  }
  
  // ======================================================
  // 16. CHỜ MYPAGE
  // ======================================================
  
  const secondResult =
    await waitFor(
      wv,
  `
  (() => {
  
    const logout =
      document.querySelector(
        '.block-mypage--logout a[href*="logout.aspx"]'
      );
  
    if (logout) {
  
      return {
        ok:true,
        url:location.href
      };
  
    }
  
    return null;
  
  })();
  `,
      stop,
      30000
    );
  
  if (!secondResult) {
    throw new Error(
      "JUMPCS_SMS2_TIMEOUT"
    );
  }
  
  return {
    ...secondResult,
    phone,
    pkey,
    firstOtp,
    secondOtp
  };
}
  

async function submitConfirmation(wv, stop) {
  check(stop);

  const result = await Web.evalJS(wv, `
(() => {
  const visible=el=>{
    if(!el) return false;

    const style=getComputedStyle(el);
    const rect=el.getBoundingClientRect();

    return (
      style.display!=="none" &&
      style.visibility!=="hidden" &&
      rect.width>0 &&
      rect.height>0
    );
  };

  const elements=Array.from(
    document.querySelectorAll(
      'input[type="submit"], button[type="submit"], button, a'
    )
  );

  const button=elements.find(el=>{
    if(!visible(el)) return false;

    const text=String(
      el.value ||
      el.innerText ||
      el.textContent ||
      ""
    )
      .replace(/\\s+/g,"")
      .trim();

    return text.includes("確認画面へ");
  });

  if(!button) return "NO_CONFIRM_BUTTON";

  button.scrollIntoView({block:"center"});
  button.click();

  return "CLICKED";
})();
`);

  if (result !== "CLICKED") {
    throw new Error("JUMPCS_CONFIRM_FAILED_" + result);
  }

  await Web.delay(1000);
  await Web.waitPageReady(wv, 30000);
  await Web.delay(1500);

  return true;
}

async function openNewMemberPage(wv, stop) {
  check(stop);

  await open(wv, MENU_URL, stop);

  let state = await Web.evalJS(wv, `
(() => {
  const logout=document.querySelector(
    '.block-mypage--logout a[href*="/shop/customer/logout.aspx"]'
  );

  const loginForm=Boolean(
    document.querySelector('input[name="uid"]') &&
    document.querySelector('input[name="pwd"]')
  );

  const signupForm=document.querySelector(
    '.p-jcs-login__group form[action="/shop/customer/entry.aspx"]'
  );

  return {
    loggedIn:Boolean(logout),
    loginForm,
    hasSignup:Boolean(signupForm),
    url:location.href,
    title:document.title || ""
  };
})();
`);

  if (state.loggedIn) {
  
    log(
      "Phát hiện session JumpCS cũ, đang clear",
      "warn"
    );
  
    await Web.clearSession(wv);
  
    check(stop);
  
    await open(
      wv,
      MENU_URL,
      stop
    );
  
  }

  check(stop);

  const clicked = await Web.evalJS(wv, `
(() => {
  const form=document.querySelector(
    '.p-jcs-login__group form[action="/shop/customer/entry.aspx"]'
  );

  if(!form) return "NO_SIGNUP_FORM";

  const button=form.querySelector(
    'button[type="submit"][name="order"]'
  );

  if(!button) return "NO_SIGNUP_BUTTON";

  button.scrollIntoView({block:"center"});

  if(typeof form.requestSubmit==="function"){
    form.requestSubmit(button);
  }else{
    button.click();
  }

  return "CLICKED";
})();
`);

  if (clicked !== "CLICKED") {
    throw new Error(
      "JUMPCS_NEW_MEMBER_CLICK_FAILED_" +
      clicked
    );
  }

  const ready = await waitFor(wv, `
(() => {
  return Boolean(
    document.querySelector("#frmOnetime") &&
    document.querySelector("#mail") &&
    document.querySelector("#pwd") &&
    document.querySelector("#cpwd")
  );
})();
`, stop, 30000);

  if (!ready) throw new Error("JUMPCS_NEW_MEMBER_PAGE_TIMEOUT");

  log("Đã mở form đăng ký JumpCS", "success");

  return true;
}

function parseStoreCard(raw, owner) {
  const text=String(raw || "").trim();
  const parts=text.split("-");

  if(parts.length < 4)
    throw new Error("JUMPCS_INVALID_CARD_" + text);

  const number=parts[0].replace(/\D/g,"");
  const exp=parts[1].match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
  const cvv=parts[2].replace(/\D/g,"");
  const brandRaw=parts.slice(3).join("-").toLowerCase();

  if(!exp) throw new Error("JUMPCS_INVALID_CARD_EXP");

  const brandMap={
    visa:"1",
    master:"2",
    mastercard:"2",
    jcb:"3",
    amex:"4",
    americanexpress:"4",
    diners:"5",
    dinersclub:"5"
  };

  const brand=brandMap[brandRaw];

  if(!brand)
    throw new Error("JUMPCS_INVALID_CARD_BRAND_" + brandRaw);

  return {
    brand,
    number,
    cvv,
    month:exp[1].padStart(2,"0"),
    year:exp[2].length===2 ? "20"+exp[2] : exp[2],
    owner:String(owner || "").trim().toUpperCase()
  };
}

function parseProductId(ids) {
  const match=String(ids || "").match(/\d{8,20}/);

  if(!match)
    throw new Error("JUMPCS_INVALID_PRODUCT_ID_" + ids);

  return match[0];
}

async function clickElement(wv, selector, stop, timeout=30000) {
  const ready=await waitFor(wv, `
(() => {
  const el=document.querySelector(${JSON.stringify(selector)});
  if(!el) return false;

  const s=getComputedStyle(el);
  const r=el.getBoundingClientRect();

  return (
    s.display!=="none" &&
    s.visibility!=="hidden" &&
    r.width>0 &&
    r.height>0
  );
})();
`, stop, timeout);

  if(!ready)
    throw new Error("JUMPCS_SELECTOR_TIMEOUT_" + selector);

  const result=await Web.evalJS(wv, `
(() => {
  const el=document.querySelector(${JSON.stringify(selector)});
  if(!el) return "NOT_FOUND";

  el.disabled=false;
  el.removeAttribute("disabled");
  el.scrollIntoView({block:"center"});
  el.focus();

  el.dispatchEvent(new MouseEvent("mousedown",{
    bubbles:true,
    cancelable:true,
    view:window
  }));

  el.dispatchEvent(new MouseEvent("mouseup",{
    bubbles:true,
    cancelable:true,
    view:window
  }));

  el.click();

  return "CLICKED";
})();
`);

  if(result !== "CLICKED")
    throw new Error("JUMPCS_CLICK_FAILED_" + result);

  await Web.delay(1200);
}

async function setStoreInput(
  wv,
  selector,
  value,
  stop,
  charDelay = 120
) {
  check(stop);

  const text =
    String(value || "");

  // ==============================
  // KIỂM TRA INPUT + XÓA GIÁ TRỊ CŨ
  // ==============================

  const prepared =
    await Web.evalJS(wv, `
(() => {
  const el = document.querySelector(
    ${JSON.stringify(selector)}
  );

  if (!el) {
    return {
      ok: false,
      reason: "NOT_FOUND"
    };
  }

  el.scrollIntoView({
    block: "center"
  });

  el.focus();

  try {
    const setter =
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set;

    setter.call(el, "");
  } catch (_) {
    el.value = "";
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

  return {
    ok: true,
    value:
      String(el.value || "")
  };
})();
    `);

  if (
    !prepared ||
    !prepared.ok
  ) {
    throw new Error(
      "JUMPCS_INPUT_PREPARE_FAILED_" +
      selector +
      "_" +
      JSON.stringify(
        prepared || {}
      )
    );
  }

  await Web.delay(300);

  // ==============================
  // GÕ TỪNG KÝ TỰ
  // ==============================

  let current = "";

  for (
    let index = 0;
    index < text.length;
    index++
  ) {
    check(stop);

    current += text[index];

    const typed =
      await Web.evalJS(wv, `
(() => {
  const el = document.querySelector(
    ${JSON.stringify(selector)}
  );

  if (!el) {
    return {
      ok: false,
      reason: "NOT_FOUND"
    };
  }

  const value =
    ${JSON.stringify(current)};

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

  return {
    ok:
      String(el.value || "") ===
      value,

    value:
      String(el.value || "")
  };
})();
      `);

    if (
      !typed ||
      !typed.ok
    ) {
      throw new Error(
        "JUMPCS_INPUT_CHAR_FAILED_" +
        selector +
        "_INDEX_" +
        index +
        "_" +
        JSON.stringify(
          typed || {}
        )
      );
    }

    await Web.delay(charDelay);
  }

  // ==============================
  // CHANGE + BLUR + KIỂM TRA CUỐI
  // ==============================

  const completed =
    await Web.evalJS(wv, `
(() => {
  const el = document.querySelector(
    ${JSON.stringify(selector)}
  );

  if (!el) {
    return {
      ok: false,
      reason: "NOT_FOUND"
    };
  }

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

  return {
    ok:
      String(el.value || "") ===
      ${JSON.stringify(text)},

    value:
      String(el.value || "")
  };
})();
    `);

  if (
    !completed ||
    !completed.ok
  ) {
    throw new Error(
      "JUMPCS_INPUT_FAILED_" +
      selector +
      "_" +
      JSON.stringify(
        completed || {}
      )
    );
  }

  await Web.delay(500);

  return completed;
}

async function setStoreSelect(wv, selector, value, stop) {
  check(stop);

  const result=await Web.evalJS(wv, `
(() => {
  const el=document.querySelector(${JSON.stringify(selector)});
  if(!el) return "NOT_FOUND";

  const value=${JSON.stringify(String(value || ""))};

  if(!Array.from(el.options).some(x => x.value===value))
    return "OPTION_NOT_FOUND";

  el.value=value;

  ["input","change"].forEach(type =>
    el.dispatchEvent(new Event(type,{bubbles:true}))
  );

  return el.value===value ? "SET" : "FAILED";
})();
`);

  if(result !== "SET")
    throw new Error(
      "JUMPCS_SELECT_FAILED_" +
      selector + "_" + result
    );
}

async function setStoreCheckbox(
  wv,
  selector,
  checked,
  stop
) {
  check(stop);

  const result = await waitFor(
    wv,
    `
(() => {
  const el = document.querySelector(
    ${JSON.stringify(selector)}
  );

  if (!el) {
    return {
      done: true,
      ok: false,
      reason: "NOT_FOUND"
    };
  }

  const wanted =
    ${checked ? "true" : "false"};

  // Đúng trạng thái sẵn rồi
  if (el.checked === wanted) {
    return {
      done: true,
      ok: true,
      state: "ALREADY_SET"
    };
  }

  el.scrollIntoView({
    block: "center"
  });

  const label =
    document.querySelector(
      'label[for="' + el.id + '"]'
    ) ||
    el.closest("label");

  const target =
    label || el;

  target.click();

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

  return {
    done: true,
    ok:
      el.checked === wanted,

    state:
      el.checked
        ? "CHECKED"
        : "UNCHECKED"
  };
})();
    `,
    stop,
    10000
  );

  if (
    !result ||
    !result.ok
  ) {
    const debug =
      await Web.evalJS(wv, `
(() => {
  const el = document.querySelector(
    ${JSON.stringify(selector)}
  );

  return {
    found: Boolean(el),
    checked:
      el ? Boolean(el.checked) : null,
    disabled:
      el ? Boolean(el.disabled) : null,
    id:
      el ? el.id || "" : "",
    html:
      el ? el.outerHTML : "",
    url:
      location.href
  };
})();
      `);

    throw new Error(
      "JUMPCS_CHECKBOX_FAILED_" +
      selector +
      "_" +
      JSON.stringify(debug || {})
    );
  }

  await Web.delay(700);

  return result;
}

async function selectNewCard(wv, stop) {
  const result = await waitFor(wv, `
(() => {
  const radio = document.querySelector(
    'input[name="selectcard"][id="new"][value="new"]'
  );

  if (!radio) return null;

  const box = document.querySelector(".js-newcard");

  // Đã được chọn sẵn thì không click lại
  if (radio.checked) {
    return {
      ok: true,
      state: "ALREADY_SELECTED",
      boxVisible: Boolean(box)
    };
  }

  const label =
    document.querySelector('label[for="new"]') ||
    radio.closest("label");

  const target = label || radio;

  target.scrollIntoView({
    block: "center"
  });

  target.click();

  if (!radio.checked) {
    radio.checked = true;

    radio.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    radio.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );
  }

  return {
    ok: radio.checked,
    state: radio.checked
      ? "SELECTED"
      : "FAILED",
    boxVisible: Boolean(box)
  };
})();
`, stop, 30000);

  if (!result || !result.ok) {
    throw new Error(
      "JUMPCS_NEW_CARD_FAILED_" +
      JSON.stringify(result || {})
    );
  }

  await Web.delay(
    result.state === "ALREADY_SELECTED"
      ? 200
      : 700
  );

  return result;
}

async function getRegistrationState(
  wv,
  stop,
  timeout = 30000
) {
  const result = await waitFor(
    wv,
    `
(() => {
  const url = String(location.href || "");

  const text = String(
    document.body
      ? document.body.innerText
      : ""
  )
    .replace(/\\s+/g, "")
    .trim();

  const registerButton =
    document.querySelector(
      'input[name="regist"][value="登録する"]'
    );

  const profileForm =
    document.querySelector(
      "#confirmation_code"
    ) &&
    document.querySelector(
      "#pwd"
    ) &&
    document.querySelector(
      "#name"
    );

  const inputError =
    text.includes(
      "メールアドレス・確認コード・パスワードのいずれかが誤っています"
    ) ||
    text.includes(
      "入力内容に誤りがあります"
    );

  if (registerButton) {
    return {
      state: "CONFIRM_PAGE",
      url
    };
  }

  if (
    profileForm &&
    inputError
  ) {
    return {
      state: "PROFILE_ERROR",
      url,
      preview:
        text.slice(0, 500)
    };
  }

  return null;
})();
`,
    stop,
    timeout
  );

  if (!result) {
    throw new Error(
      "JUMPCS_AFTER_PROFILE_TIMEOUT"
    );
  }

  return result;
}

async function openStoreAndProduct(
  wv,
  storeUrl,
  productId,
  stop
) {
  check(stop);

  log("Đang mở Store URL", "info");
  await open(wv, storeUrl, stop);

  const productUrl=
    "https://jumpcs.shueisha.co.jp/shop/g/g" +
    productId + "/";

  log("Đang mở sản phẩm " + productId, "info");
  await open(wv, productUrl, stop);

  const ready=await waitFor(wv, `
(() => Boolean(
  document.querySelector("#qty") &&
  document.querySelector("#cart_button")
))();
`, stop, 30000);

  if(!ready)
    throw new Error("JUMPCS_PRODUCT_PAGE_TIMEOUT");

  return productUrl;
}

async function getFinalButtonIndex(
  wv,
  stop,
  timeout = 45000
) {
  const result = await waitFor(
    wv,
    `
(() => {
  const buttons = Array.from(
    document.querySelectorAll(
      'input[name="submit.x"][value="注文を確定する"]'
    )
  );

  const items = buttons.map(
    (btn, index) => {
      const style =
        getComputedStyle(btn);

      const rect =
        btn.getBoundingClientRect();

      const visible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.pointerEvents !== "none" &&
        rect.width > 0 &&
        rect.height > 0 &&
        btn.offsetParent !== null;

      return {
        index,
        visible,
        disabled:
          Boolean(btn.disabled)
      };
    }
  );

  const ready =
    items.find(item =>
      item.visible &&
      !item.disabled
    );

  if (!ready) {
    return null;
  }

  return {
    ready: true,
    index: ready.index,
    count: items.length
  };
})();
`,
    stop,
    timeout
  );

  if (
    !result ||
    !result.ready
  ) {
    throw new Error(
      "JUMPCS_FINAL_BUTTON_TIMEOUT"
    );
  }

  return Number(
    result.index
  );
}

async function clickFinalOrder(wv, stop) {
  for(let attempt=1;attempt<=5;attempt++){
    check(stop);

    const index=await getFinalButtonIndex(
      wv,
      stop,
      45000
    );

    await Web.delay(3000);

    const result=await Web.evalJS(wv, `
(() => {
  const buttons=Array.from(
    document.querySelectorAll(
      'input[name="submit.x"][value="注文を確定する"]'
    )
  );

  const btn=buttons[${index}];

  if(!btn) return "NOT_FOUND";
  if(btn.disabled) return "DISABLED";

  const s=getComputedStyle(btn);
  const r=btn.getBoundingClientRect();

  if(
    s.display==="none" ||
    s.visibility==="hidden" ||
    r.width===0 ||
    r.height===0 ||
    btn.offsetParent===null
  ) return "NOT_VISIBLE";

  if(btn.dataset.jsboxClicked==="1")
    return "ALREADY_CLICKED";

  btn.scrollIntoView({block:"center"});
  btn.focus();
  btn.dataset.jsboxClicked="1";
  btn.click();

  return "CLICKED";
})();
`);

    if(
      result==="CLICKED" ||
      result==="ALREADY_CLICKED"
    ){
      return {
        ok:true,
        attempt
      };
    }

    await Web.delay(3000);
  }

  throw new Error("JUMPCS_FINAL_CLICK_FAILED");
}

async function waitOrderResult(wv, stop, timeout=60000) {
  const result=await waitFor(wv, `
(() => {
  const url=String(location.href || "");
  const text=String(
    document.body ? document.body.innerText : ""
  ).replace(/\\s+/g,"");

  const match=url.match(/[?&]order_id=([^&#]+)/);

  if(match){
    return {
      ok:true,
      orderId:decodeURIComponent(match[1]),
      url
    };
  }

  if(
    text.includes("ご注文ありがとうございました") ||
    text.includes("注文が完了") ||
    text.includes("ご注文を承りました")
  ){
    return {
      ok:true,
      orderId:"",
      url
    };
  }

  if(
    text.includes("決済に失敗") ||
    text.includes("カードが利用できません") ||
    text.includes("エラーが発生しました")
  ){
    return {
      ok:false,
      error:true,
      url,
      preview:text.slice(0,500)
    };
  }

  return null;
})();
`, stop, timeout);

  if(!result)
    return {
      ok:false,
      pending:true,
      url:String(wv.url || "")
    };

  if(result.error)
    throw new Error(
      "JUMPCS_ORDER_FAILED_" +
      result.preview
    );

  return result;
}

async function purchaseProduct({
  webView,
  storeUrl,
  ids,
  quantity,
  credit,
  creditOwner,
  paymentMethod,

  email,
  imapEmail,
  imapPass,

  stopCheck,
  onStep
}) {
  const productId =
    parseProductId(ids);
  
  const qty =
    String(quantity || "1");
  
  const method =
    String(
      paymentMethod || "credit"
    ).toLowerCase();
  
  let card = null;
  
  if (method === "credit") {
    card = parseStoreCard(
      credit,
      creditOwner
    );
  }
  
  if (
    method !== "credit" &&
    method !== "conbini"
  ) {
    throw new Error(
      "JUMPCS_INVALID_PAYMENT_METHOD_" +
      method
    );
  }

  update(onStep,"JUMPCS_STORE","Open Store Session");

  const productUrl=await openStoreAndProduct(
    webView,
    storeUrl,
    productId,
    stopCheck
  );

  update(onStep,"JUMPCS_QTY","Select Quantity");

  await setStoreSelect(
    webView,
    "#qty",
    qty,
    stopCheck
  );

  update(onStep,"JUMPCS_CART","Add To Cart");

  await clickElement(
    webView,
    "#cart_button",
    stopCheck
  );

  update(onStep,"JUMPCS_CHECKOUT","Open Checkout");

  await clickElement(
    webView,
    '.u-jcs-forSp button[name="submit.x"], ' +
    'button[name="submit.x"][value="submit.x"]',
    stopCheck
  );

  update(onStep,"JUMPCS_TERMS","Accept Terms");
  
  await Web.delay(3500);

  await setStoreCheckbox(
    webView,
    "#agree_checkbox",
    true,
    stopCheck
  );

  if (method === "credit") {
    update(
      onStep,
      "JUMPCS_CARD",
      "Select New Card"
    );
  
    await selectNewCard(
      webView,
      stopCheck
    );
  
    const cardReady =
      await waitFor(
        webView,
        `
  (() => {
    const brand =
      document.querySelector(
        'select[name="card_brand"]'
      );
  
    const number =
      document.querySelector(
        'input[name="card_num"]'
      );
  
    const code =
      document.querySelector(
        'input[name="security_code"]'
      );
  
    if (!brand || !number || !code) {
      return null;
    }
  
    return {
      ready: true
    };
  })();
  `,
        stopCheck,
        30000
      );
  
    if (!cardReady) {
      throw new Error(
        "JUMPCS_CARD_FORM_TIMEOUT"
      );
    }
  
    await setStoreSelect(
      webView,
      'select[name="card_brand"]',
      card.brand,
      stopCheck
    );
  
    await Web.delay(500);
  
    await setStoreInput(
      webView,
      'input[name="card_num"]',
      card.number,
      stopCheck,
      140
    );
  
    await Web.delay(500);
  
    await setStoreInput(
      webView,
      'input[name="security_code"]',
      card.cvv,
      stopCheck,
      180
    );
  
    await Web.delay(500);
  
    await setStoreSelect(
      webView,
      'select[name="card_m"]',
      card.month,
      stopCheck
    );
  
    await Web.delay(500);
  
    await setStoreSelect(
      webView,
      'select[name="card_y"]',
      card.year,
      stopCheck
    );
  
    await Web.delay(500);
  
    await setStoreInput(
      webView,
      'input[name="holder_name"]',
      card.owner,
      stopCheck,
      140
    );
  
    await Web.delay(1000);
  
  } else {
    update(
      onStep,
      "JUMPCS_CONBINI",
      "Select Seven-Eleven"
    );
  
    const conbiniResult =
      await Web.evalJS(
        webView,
        `
  (() => {
    const fire = el => {
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
    };
  
    const method =
      document.querySelector(
        '#method_rB'
      );
  
    if (!method) {
      return {
        ok: false,
        reason: "NO_CONBINI_METHOD"
      };
    }
  
    method.scrollIntoView({
      block: "center"
    });
  
    if (!method.checked) {
      const label =
        document.querySelector(
          'label[for="method_rB"]'
        );
  
      if (label) {
        label.click();
      } else {
        method.click();
      }
  
      method.checked = true;
      fire(method);
    }
  
    const seven =
      document.querySelector(
        'input[name="cvs_type"][value="00007"]'
      );
  
    if (!seven) {
      return {
        ok: false,
        reason: "NO_SEVEN_ELEVEN"
      };
    }
  
    seven.scrollIntoView({
      block: "center"
    });
  
    if (!seven.checked) {
      const label =
        seven.closest("label");
  
      if (label) {
        label.click();
      } else {
        seven.click();
      }
  
      seven.checked = true;
      fire(seven);
    }
  
    return {
      ok:
        method.checked &&
        seven.checked,
  
      method:
        method.value,
  
      cvsType:
        seven.value
    };
  })();
  `
      );
  
    if (
      !conbiniResult ||
      !conbiniResult.ok
    ) {
      throw new Error(
        "JUMPCS_CONBINI_SELECT_FAILED_" +
        JSON.stringify(
          conbiniResult || {}
        )
      );
    }
  
    await Web.delay(1200);
  }

  update(onStep,"JUMPCS_ORDER_CONFIRM","Open Order Confirmation");

  await clickElement(
    webView,
    'input[name="submit.x"]' +
    '[value="ご注文内容の確認へ"]',
    stopCheck
  );

  update(onStep,"JUMPCS_FINAL_READY","Wait Final Button");

  await getFinalButtonIndex(
    webView,
    stopCheck,
    45000
  );

  await Web.delay(1500);
  
  update(
    onStep,
    "JUMPCS_FINAL",
    "Submit Order"
  );
  
  const finalClick =
    await clickFinalOrder(
      webView,
      stopCheck
    );

  update(onStep,"JUMPCS_RESULT","Wait Order Result");

  const orderResult =
    await waitOrderResult(
      webView,
      stopCheck,
      60000
    );
  
  let paymentCode = "";
  
  if (
    method === "conbini" &&
    orderResult.ok &&
    orderResult.orderId
  ) {
    check(stopCheck);
    
    log(
        "Thanh toán conbini thành công",
         "info"
        );
  
    update(
      onStep,
      "JUMPCS_PAYMENT_MAIL",
      "Wait Seven-Eleven payment mail"
    );
  
    log(
      "Đang chờ mail mã thanh toán Seven",
      "info"
    );
  
    // Đợi hệ thống gửi mail trước khi bắt đầu check IMAP
    await Web.delay(5000);
  
    check(stopCheck);
  
    paymentCode =
      await OTP.getJumpConbiniPayment(
        imapEmail,
        imapPass,
        email,
        orderResult.orderId
      );
  
    check(stopCheck);
  
    if (!paymentCode) {
      throw new Error(
        "JUMPCS_CONBINI_PAYMENT_CODE_NOT_FOUND_" +
        orderResult.orderId
      );
    }
  
    log(
      "Đã lấy mã thanh toán Seven: " +
        paymentCode,
      "success"
    );
  }
  
  if (orderResult.ok) {
    log(
      "Đặt hàng thành công" +
      (
        orderResult.orderId
          ? ": " + orderResult.orderId
          : ""
      ),
      "success"
    );
  } else {
    log(
      "Đã gửi đơn nhưng chưa xác định kết quả",
      "warn"
    );
  }

  return {
    ok: orderResult.ok,
  
    pending: orderResult.pending || false,
    productId,
    productUrl,
  
    quantity: qty,
    paymentMethod: method,
    finalClick,
  
    orderId: orderResult.orderId || "",
    paymentCode: paymentCode || "",
  
    url: orderResult.url || ""
  };
}

  // ======================================================
  // LOGOUT JUMP CS
  // ======================================================
  
async function logoutJumpCS(
  wv,
  stop
) {
  check(stop);

  log(
    "Đang logout JumpCS",
    "info"
  );

  await open(
    wv,
    MENU_URL,
    stop
  );

  const result =
    await Web.evalJS(
      wv,
      `
(() => {
  const link =
    document.querySelector(
      '.block-mypage--logout a[href*="logout.aspx"]'
    );

  if (!link) {
    return "NO_LOGOUT_LINK";
  }

  link.scrollIntoView({
    block: "center"
  });

  link.click();

  return "CLICKED";
})();
`
    );

  if (
    result ===
    "NO_LOGOUT_LINK"
  ) {
    log(
      "JumpCS đã logout sẵn",
      "success"
    );

    return {
      ok: true,
      skipped: true,
      reason:
        "ALREADY_LOGGED_OUT"
    };
  }

  if (
    result !== "CLICKED"
  ) {
    throw new Error(
      "JUMPCS_LOGOUT_FAILED_" +
      result
    );
  }

  log(
    "Đã bấm Logout JumpCS",
    "success"
  );

  return {
    ok: true
  };
}
  
// ======================================================
// CREATE JUMP CS ACCOUNT
// ======================================================

async function createAccount({
  email,
  pass,
  imapEmail,
  imapPass,
  names,
  kanas,
  phones,
  postcode,
  pref,
  address1,
  address2,
  birthdate,
  webView,
  stopCheck,
  onStep
}) {
  if (!webView) {
    throw new Error(
      "JUMPCS_NO_WEBVIEW"
    );
  }

  const password =
    String(pass || "");

  const pendingPhone =
    String(phones || "")
      .replace(/\D/g, "");

  const city =
    String(address1 || "");

  const address =
    String(address2 || "");

  let phoneOrder = null;
  let phoneResult = null;

  // SĐT trong pending dùng cho profile
  if (!pendingPhone) {
    throw new Error(
      "JUMPCS_PENDING_PHONE_EMPTY"
    );
  }

  update(
    onStep,
    "JUMPCS_MENU",
    "Open JumpCS registration"
  );

  log(
    "Đang mở trang đăng ký JumpCS",
    "info"
  );

  await openNewMemberPage(
    webView,
    stopCheck
  );

  update(
    onStep,
    "JUMPCS_WAIT",
    "Wait entry form"
  );

  await waitEntryForm(
    webView,
    stopCheck
  );

  update(
    onStep,
    "JUMPCS_FILL",
    "Fill email and password"
  );

  await fillEntry(
    webView,
    email,
    password,
    stopCheck
  );

  update(
    onStep,
    "JUMPCS_SEND",
    "Send confirmation mail"
  );

  await submitEntry(
    webView,
    stopCheck
  );

  update(
    onStep,
    "JUMPCS_REGISTER",
    "Wait registration page"
  );

  await waitRegistrationPage(
    webView,
    stopCheck
  );

  update(
    onStep,
    "JUMPCS_OTP",
    "Wait confirmation code"
  );

  log(
    "Đang lấy OTP JumpCS",
    "info"
  );

  const otp =
    await OTP.getOtpDirect(
      imapEmail,
      imapPass,
      email,
      "JumpCSCreate"
    );

  if (
    !otp ||
    !/^\d{6}$/.test(
      String(otp)
    )
  ) {
    throw new Error(
      "JUMPCS_OTP_NOT_FOUND"
    );
  }

  log(
    "Đã lấy OTP JumpCS",
    "success"
  );

  update(
    onStep,
    "JUMPCS_PROFILE",
    "Fill registration profile"
  );

  // Profile dùng SĐT từ pending
  const profile =
    await fillRegistration(
      webView,
      {
        otp,
        password,
        names,
        kanas,
        phone:
          pendingPhone,
        postcode,
        pref,
        city,
        address,
        birthdate
      },
      stopCheck
    );

  update(
    onStep,
    "JUMPCS_CONFIRM",
    "Open confirmation page"
  );

  await Web.delay(
    4000
  );

  await submitConfirmation(
    webView,
    stopCheck
  );

  const registrationState =
    await getRegistrationState(
      webView,
      stopCheck,
      30000
    );

  if (
    registrationState.state ===
    "CONFIRM_PAGE"
  ) {
    update(
      onStep,
      "JUMPCS_REGISTER",
      "Submit registration"
    );

    await submitRegistration(
      webView,
      stopCheck
    );

  } else if (
    registrationState.state ===
    "PROFILE_ERROR"
  ) {
    update(
      onStep,
      "JUMPCS_MAIL_CHECK",
      "Check registration mail"
    );

    const registeredResult =
      await OTP.getOtpDirect(
        imapEmail,
        imapPass,
        email,
        "JumpCSRegistered"
      );

    check(stopCheck);

    const registered =
      String(
        registeredResult || ""
      ).trim() ===
      "REGISTERED";

    if (!registered) {
      throw new Error(
        "JUMPCS_PROFILE_ERROR_AND_NOT_REGISTERED_" +
        registrationState.preview
      );
    }

    log(
      "Phát hiện account đã được tạo, đang login lại",
      "success"
    );

    const loginResult =
      await loginJumpCS(
        webView,
        email,
        password,
        stopCheck
      );

    const postLogin =
      loginResult.state
        ? loginResult
        : await getPostLoginState(
            webView,
            stopCheck,
            30000
          );
    
    log(
      "Trạng thái sau khi login account đã tạo: " +
        postLogin.state,
      "info"
    );
    
    // ======================================================
    // ACCOUNT ĐÃ VERIFY HOÀN TOÀN
    // ======================================================
    
    if (
      postLogin.state ===
        "LOGGED_IN" ||
      postLogin.state ===
        "PHONE_ALREADY_VERIFIED"
    ) {
      phoneResult = {
        ok: true,
        skipped: true,
        reason:
          "PHONE_ALREADY_VERIFIED",
        url:
          postLogin.url
      };
    }
    
    // ======================================================
    // ACCOUNT ĐÃ LÀM SMS1, ĐANG CHỜ SMS2
    // KHÔNG ORDER SỐ MỚI
    // ======================================================
    
    else if (
      postLogin.state ===
      "SMS_CODE_REQUIRED"
    ) {
      log(
        "Account đã qua SMS1, tiếp tục chờ OTP2",
        "success"
      );
    
      phoneResult =
        await verifyPhone(
          webView,
          null,
          email,
          password,
          stopCheck,
          onStep
        );
    }
    
    // ======================================================
    // ACCOUNT ĐÃ TẠO NHƯNG CHƯA NHẬP SĐT
    // GIỮ phoneResult = null ĐỂ PHÍA DƯỚI ORDER SĐT
    // ======================================================
    
    else if (
      postLogin.state ===
      "PHONE_REQUIRED"
    ) {
      log(
        "Account đã tạo nhưng chưa xác minh SĐT, tiếp tục SMS1",
        "warn"
      );
    
      phoneResult = null;
    }
    
    // ======================================================
    // TRẠNG THÁI KHÔNG HỢP LỆ
    // ======================================================
    
    else {
      throw new Error(
        "JUMPCS_EXISTING_ACCOUNT_STATE_" +
        JSON.stringify(
          postLogin || {}
        )
      );
    }
  }

  if (!phoneResult) {
    update(
      onStep,
      "JUMPCS_PHONE",
      "Get verification phone"
    );

    log(
      "Đang lấy số điện thoại xác minh",
      "info"
    );

    // SĐT API chỉ lấy ở bước xác minh
    phoneOrder =
      await OtpNorth.orderPhone(
        stopCheck
      );

    log(
      "Đã lấy số xác minh: " +
      String(
        phoneOrder.phone || ""
      ),
      "success"
    );

    update(
      onStep,
      "JUMPCS_PHONE",
      "Verify phone number"
    );

    phoneResult =
      await verifyPhone(
        webView,
        phoneOrder,
        email,
        password,
        stopCheck,
        onStep
      );
  }

  await Web.clearSession(webView);
    check(stopCheck);

  update(
    onStep,
    "JUMPCS_CREATE_DONE",
    "JumpCS account created"
  );

  log(
    "Tạo account JumpCS hoàn tất: " +
    email,
    "success"
  );

  return {
    ok: true,
    otp,
    profile,
    phoneOrder,
    phoneResult
  };
}

// ======================================================
// BUY JUMP CS
// ======================================================

async function buyAccount({
  email,
  pass,

  imapEmail,
  imapPass,

  productIds,
  buyQty,
  creditList,
  creditOwnerList,
  paymentMethod,
  webView,
  stopCheck,
  onStep
}) {
  if (!webView) {
    throw new Error(
      "JUMPCS_NO_WEBVIEW"
    );
  }

  const password =
    String(pass || "");

  const ids =
    String(productIds || "");

  const quantity =
    String(buyQty || "1");

  const credit =
    String(creditList || "");

  const creditOwner =
    String(
      creditOwnerList || ""
    );

    // ======================================================
    // JUMP+ API: LOGIN → LẤY STORE URL → LOGOUT
    // ======================================================
  
    update(
      onStep,
      "JUMPPLUS_STORE_URL",
      "Get JumpCS Store URL"
    );
  
    log(
      "Đang dùng Jump+ API lấy Store URL",
      "info"
    );
  
    //const storeResult =
      //await API.loginAndGetStoreUrl({
        //email,
        //password
      //});
      
      const storeResult =
        await API.loginAndGetStoreUrl({
          email: "ripped-page-7a@icloud.com",
          password: "Hoai1234"
        });
  
    check(stopCheck);
  
    const url =
      String(
        storeResult &&
        storeResult.url
          ? storeResult.url
          : ""
      ).trim();
  
    if (!url) {
      throw new Error(
        "JUMPCS_STORE_URL_EMPTY"
      );
    }
  
    if (
      !/[?&]subscr_token=/.test(url)
    ) {
      throw new Error(
        "JUMPCS_STORE_URL_NO_TOKEN_" +
        url
      );
    }
  
    log(
      "Đã lấy Store URL và logout Jump+ API",
      "success"
    );

  update(
    onStep,
    "JUMPCS_LOGIN",
    "Login JumpCS"
  );

  const loginResult =
    await loginJumpCS(
      webView,
      email,
      password,
      stopCheck
    );

  const loginState =
    loginResult.state
      ? loginResult
      : await getPostLoginState(
          webView,
          stopCheck,
          30000
        );

  if (
    loginState.state !==
      "LOGGED_IN" &&
    loginState.state !==
      "PHONE_ALREADY_VERIFIED" &&
    !loginResult.alreadyLoggedIn
  ) {
    throw new Error(
      "JUMPCS_BUY_LOGIN_STATE_" +
      JSON.stringify(
        loginState
      )
    );
  }

  update(
    onStep,
    "JUMPCS_PURCHASE",
    "Start product purchase"
  );

  const purchaseResult =
    await purchaseProduct({
      webView,
  
      storeUrl:
        url,
  
      ids,
      quantity,
  
      credit,
      creditOwner,
  
      paymentMethod,
  
      email,
      imapEmail,
      imapPass,
  
      stopCheck,
      onStep
    });

  if (
    !purchaseResult.ok &&
    !purchaseResult.pending
  ) {
    throw new Error(
      "JUMPCS_PURCHASE_NOT_SUCCESSFUL"
    );
  }

  update(
    onStep,
    "JUMPCS_LOGOUT",
    "Logout JumpCS"
  );

  await Web.clearSession(webView);
  check(stopCheck);

  update(
    onStep,
    purchaseResult.ok
      ? "JUMPCS_DONE"
      : "JUMPCS_PENDING",
    purchaseResult.ok
      ? "Order successful"
      : "Order result pending"
  );

  return {
    ok: purchaseResult.ok,
    pending: purchaseResult.pending,
    purchaseResult,
  
    orderId: purchaseResult.orderId,
    paymentCode: purchaseResult.paymentCode || "",
  
    url: purchaseResult.url
  };
}

module.exports = {
  createAccount,
  buyAccount,

  loginJumpCS,
  logoutJumpCS,
  purchaseProduct
};