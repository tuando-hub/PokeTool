function splitAddressLine(v) {
  const s = String(v || "").trim();

  if (!s) {
    return {
      addressLine1: "",
      addressLine2: ""
    };
  }

  const parts = s.split(/\s+/);

  return {
    addressLine1: parts[0] || "",
    addressLine2: parts.slice(1).join(" ")
  };
}

function toZenkaku(s) {
  return String(s || "")
    .replace(/-/g, "－")
    .replace(/ /g, "　")
    .replace(/[0-9A-Za-z]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
    );
}

function normalizeProfileData(form) {
  form = form || {};

  const addr = splitAddressLine(form.address2);

  return {
    name: String(form.names || "").trim(),
    kana: String(form.kanas || "").trim(),
    phone: String(form.phones || "").trim(),

    postcode: String(form.postcode || "").trim(),
    pref: String(form.pref || "").trim(),
    city: String(form.address1 || "").trim(),

    addressLine1: String(addr.addressLine1),
    addressLine2: String(addr.addressLine2),

    birthdate: String(form.birthdate || "").trim()
  };
}

function mergeWithGigya(profile, finalJson) {
  const d = finalJson && finalJson.data ? finalJson.data : {};

  return Object.assign({}, profile, {
    // luôn lấy từ Gigya
    name: d.fullName || "",
    kana: d.fullNameKana || "",
    phone: d.phoneNumber || "",

    uid: finalJson.UID || "",
    uidSignature: finalJson.UIDSignature || "",
    signatureTimestamp: finalJson.signatureTimestamp || ""
  });
}

async function fillOrderAddressForm(wv, profile) {
  const Web = require("../web");

  try {

    await Web.evalJS(wv, `
(() => {

  const radio = document.querySelector(
    'input.polAddressSelector[value="new"]'
  );

  if (radio) {
    radio.checked = true;
    radio.click();
    radio.dispatchEvent(new Event("change", { bubbles:true }));
  }

  const set = (selector, value) => {
    const el = document.querySelector(selector);

    if (!el) return;

    el.focus();
    el.value = value || "";

    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.dispatchEvent(new Event("change", { bubbles:true }));
    el.dispatchEvent(new Event("blur", { bubbles:true }));
  };

  set("#name", ${JSON.stringify(profile.name || "")});
  set("#kana", ${JSON.stringify(profile.kana || "")});
  set("#postal-code", ${JSON.stringify(profile.postcode || "")});

  // Prefecture
  const pref = document.querySelector("#address-level1");
  if (pref) {
    pref.disabled = false;
    pref.removeAttribute("disabled");
    pref.value = ${JSON.stringify(profile.pref || "")};

    pref.dispatchEvent(new Event("input", { bubbles:true }));
    pref.dispatchEvent(new Event("change", { bubbles:true }));
    pref.dispatchEvent(new Event("blur", { bubbles:true }));
  }

  set("#address-level2", ${JSON.stringify(profile.city || "")});
  set("#address-line1", ${JSON.stringify(profile.addressLine1 || "")});
  set("#address-line2", ${JSON.stringify(profile.addressLine2 || "")});
  set("[name='dwfrm_changeAddress_phone']", ${JSON.stringify(profile.phone || "")});

  return true;

})();
    `);

    await Web.delay(1000);

    await Web.tapButton(
      wv,
      ".linkList a.popup-modal"
    );

    const ok = await Web.waitVisible(
      wv,
      "#changeAddressButton",
      10000
    );

    if (!ok) {
      return {
        ok: false,
        reason: "CHANGE_BUTTON_NOT_VISIBLE"
      };
    }

    await Web.delay(5000);

    await Web.tapButton(
      wv,
      "#changeAddressButton"
    );

    await Web.waitPageReady(wv, 30000);
    await Web.delay(5000);

    return {
      ok: true
    };

  } catch (e) {

    return {
      ok: false,
      reason: String(e.message || e)
    };

  }
}

async function fillCreateForm(wv, profile) {
  const Web = require("../web");

  try {
    let birthYear = "";
    let birthMonth = "";
    let birthDay = "";

    if (
      profile.birthdate &&
      profile.birthdate.includes("-")
    ) {
      const parts =
        profile.birthdate.split("-");

      if (parts.length === 3) {
        birthYear =
          parts[0].trim();

        birthMonth =
          parts[1].trim().padStart(2, "0");

        birthDay =
          parts[2].trim().padStart(2, "0");
      }
    }

    // ==================================================
    // STEP 1
    // Nhập thông tin cơ bản và postcode trước
    // Postcode sẽ tự động điền tỉnh + thành phố
    // ==================================================

    const basicResult =
      await Web.evalJS(wv, `
(() => {
  const set = (selector, value) => {
    const el =
      document.querySelector(selector);

    if (!el) {
      return {
        ok: false,
        selector,
        reason: "NOT_FOUND"
      };
    }

    const proto =
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : null;

    const setter =
      proto
        ? Object.getOwnPropertyDescriptor(
            proto,
            "value"
          )?.set
        : null;

    el.focus();

    if (setter) {
      setter.call(el, value || "");
    } else {
      el.value = value || "";
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

    return {
      ok: true,
      selector,
      value: el.value
    };
  };

  const result = {};

  result.name = set(
    "#registration-form-fname",
    ${JSON.stringify(profile.name || "")}
  );

  result.kana = set(
    "#registration-form-kana",
    ${JSON.stringify(profile.kana || "")}
  );

  result.birthYear = set(
    "#registration-form-birthdayyear",
    ${JSON.stringify(birthYear)}
  );

  result.birthMonth = set(
    "#registration-form-birthdaymonth",
    ${JSON.stringify(birthMonth)}
  );

  result.birthDay = set(
    "#registration-form-birthdayday",
    ${JSON.stringify(birthDay)}
  );

  result.postcode = set(
    "#registration-form-postcode",
    ${JSON.stringify(profile.postcode || "")}
  );

  result.phone = set(
    "[name='dwfrm_profile_customer_phone']",
    ${JSON.stringify(profile.phone || "")}
  );

  result.password = set(
    "[name='dwfrm_profile_login_password']",
    ${JSON.stringify(profile.pass || "")}
  );

  result.passwordConfirm = set(
    "[name='dwfrm_profile_login_passwordconfirm']",
    ${JSON.stringify(profile.pass || "")}
  );

  const mailOff =
    document.querySelector(
      "input[name='dwfrm_profile_customer_addtoemaillist'][value='false']"
    );

  if (mailOff) {
    mailOff.checked = true;

    mailOff.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    mailOff.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    result.mailOff = true;
  } else {
    result.mailOff = false;
  }

  const terms =
    document.querySelector(
      "[name='dwfrm_profile_customer_agreetotheterms']"
    );

  if (terms) {
    terms.checked = true;

    terms.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    terms.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    result.terms = true;
  } else {
    result.terms = false;
  }

  const privacy =
    document.querySelector(
      "[name='dwfrm_profile_customer_agreetotheprivacypolicy']"
    );

  if (privacy) {
    privacy.checked = true;

    privacy.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    privacy.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    result.privacy = true;
  } else {
    result.privacy = false;
  }

  return result;
})();
      `);

    console.log(
      "CREATE BASIC RESULT:",
      JSON.stringify(basicResult)
    );

    if (
      !basicResult ||
      !basicResult.postcode ||
      basicResult.postcode.ok !== true
    ) {
      return {
        ok: false,
        reason: "POSTCODE_INPUT_NOT_FOUND",
        basicResult
      };
    }

    // ==================================================
    // STEP 2
    // Đợi postcode tự động điền tỉnh + thành phố
    // ==================================================

    let autoAddressReady = false;
    let autoAddressState = null;

    for (let i = 0; i < 20; i++) {
      await Web.delay(300);

      autoAddressState =
        await Web.evalJS(wv, `
(() => {
  const pref =
    document.querySelector(
      "#registration-form-address-level1"
    );

  const city =
    document.querySelector(
      "#registration-form-address-level2"
    );

  return {
    prefExists: !!pref,
    cityExists: !!city,
    pref: pref ? String(pref.value || "") : "",
    city: city ? String(city.value || "") : ""
  };
})();
        `);

      if (
        autoAddressState &&
        autoAddressState.prefExists &&
        autoAddressState.cityExists &&
        autoAddressState.pref &&
        autoAddressState.city
      ) {
        autoAddressReady = true;
        break;
      }
    }

    console.log(
      "CREATE AUTO ADDRESS:",
      JSON.stringify(autoAddressState)
    );

    if (!autoAddressReady) {
      return {
        ok: false,
        reason: "POSTCODE_AUTO_ADDRESS_TIMEOUT",
        autoAddressState
      };
    }

    // ==================================================
    // STEP 3
    // Chỉ nhập 番地 và 建物名・部屋番号
    // Không ghi đè tỉnh + thành phố đã tự động điền
    // ==================================================

    const addressResult =
      await Web.evalJS(wv, `
(() => {
  const set = (selector, value) => {
    const el =
      document.querySelector(selector);

    if (!el) {
      return {
        ok: false,
        selector,
        reason: "NOT_FOUND"
      };
    }

    const setter =
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;

    el.focus();

    if (setter) {
      setter.call(el, value || "");
    } else {
      el.value = value || "";
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

    return {
      ok: true,
      selector,
      value: el.value,
      valid: el.checkValidity(),
      message:
        el.validationMessage || "",
      maxlength:
        Number(el.maxLength || 0),
      pattern:
        el.getAttribute("pattern") || ""
    };
  };

  const line1 = set(
    "#registration-form-address-line1",
    ${JSON.stringify(profile.addressLine1 || "")}
  );

  const line2 = set(
    "#registration-form-address-line2",
    ${JSON.stringify(profile.addressLine2 || "")}
  );

  const pref =
    document.querySelector(
      "#registration-form-address-level1"
    );

  const city =
    document.querySelector(
      "#registration-form-address-level2"
    );

  return {
    pref:
      pref ? String(pref.value || "") : "",
    city:
      city ? String(city.value || "") : "",
    line1,
    line2
  };
})();
      `);

    console.log(
      "CREATE ADDRESS RESULT:",
      JSON.stringify(addressResult)
    );

    if (
      !addressResult ||
      !addressResult.line1 ||
      addressResult.line1.ok !== true
    ) {
      return {
        ok: false,
        reason: "ADDRESS_LINE1_NOT_FOUND",
        addressResult
      };
    }

    if (
      !addressResult.line2 ||
      addressResult.line2.ok !== true
    ) {
      return {
        ok: false,
        reason: "ADDRESS_LINE2_NOT_FOUND",
        addressResult
      };
    }

    if (!addressResult.line1.valid) {
      return {
        ok: false,
        reason: "ADDRESS_LINE1_INVALID",
        message:
          addressResult.line1.message,
        value:
          addressResult.line1.value,
        addressResult
      };
    }

    if (!addressResult.line2.valid) {
      return {
        ok: false,
        reason: "ADDRESS_LINE2_INVALID",
        message:
          addressResult.line2.message,
        value:
          addressResult.line2.value,
        addressResult
      };
    }

    await Web.delay(500);

    // ==================================================
    // STEP 4
    // Kiểm tra lần cuối tránh website ghi đè/xóa địa chỉ
    // ==================================================

    const verifyResult =
      await Web.evalJS(wv, `
(() => {
  const line1 =
    document.querySelector(
      "#registration-form-address-line1"
    );

  const line2 =
    document.querySelector(
      "#registration-form-address-line2"
    );

  return {
    line1: line1
      ? {
          value:
            String(line1.value || ""),
          valid:
            line1.checkValidity(),
          message:
            line1.validationMessage || ""
        }
      : null,

    line2: line2
      ? {
          value:
            String(line2.value || ""),
          valid:
            line2.checkValidity(),
          message:
            line2.validationMessage || ""
        }
      : null
  };
})();
      `);

    console.log(
      "CREATE ADDRESS VERIFY:",
      JSON.stringify(verifyResult)
    );

    const expectedLine1 =
      String(
        profile.addressLine1 || ""
      );

    const expectedLine2 =
      String(
        profile.addressLine2 || ""
      );

    if (
      !verifyResult ||
      !verifyResult.line1 ||
      verifyResult.line1.value !==
        expectedLine1
    ) {
      return {
        ok: false,
        reason: "ADDRESS_LINE1_CHANGED",
        expected: expectedLine1,
        actual:
          verifyResult &&
          verifyResult.line1
            ? verifyResult.line1.value
            : "",
        verifyResult
      };
    }

    if (
      !verifyResult.line2 ||
      verifyResult.line2.value !==
        expectedLine2
    ) {
      return {
        ok: false,
        reason: "ADDRESS_LINE2_CHANGED",
        expected: expectedLine2,
        actual:
          verifyResult &&
          verifyResult.line2
            ? verifyResult.line2.value
            : "",
        verifyResult
      };
    }

    return {
      ok: true,
      basicResult,
      autoAddressState,
      addressResult,
      verifyResult
    };

  } catch (e) {
    return {
      ok: false,
      reason: String(e.message || e)
    };
  }
}

module.exports = {
  splitAddressLine,
  normalizeProfileData,
  mergeWithGigya,
  toZenkaku,
  fillOrderAddressForm,
  fillCreateForm
};