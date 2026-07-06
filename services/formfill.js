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

    addressLine1: toZenkaku(addr.addressLine1),
    addressLine2: toZenkaku(addr.addressLine2),

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

    if (profile.birthdate && profile.birthdate.includes("-")) {
      const parts = profile.birthdate.split("-");

      if (parts.length === 3) {
        birthYear = parts[0].trim();
        birthMonth = parts[1].trim().padStart(2, "0");
        birthDay = parts[2].trim().padStart(2, "0");
      }
    }

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

  set("#registration-form-fname", ${JSON.stringify(profile.name || "")});
  set("#registration-form-kana", ${JSON.stringify(profile.kana || "")});

  set("#registration-form-birthdayyear", ${JSON.stringify(birthYear)});
  set("#registration-form-birthdaymonth", ${JSON.stringify(birthMonth)});
  set("#registration-form-birthdayday", ${JSON.stringify(birthDay)});

  set("#registration-form-postcode", ${JSON.stringify(profile.postcode || "")});
  set("#registration-form-address-level1", ${JSON.stringify(profile.pref || "")});
  set("#registration-form-address-level2", ${JSON.stringify(profile.city || "")});
  set("#registration-form-address-line1", ${JSON.stringify(profile.addressLine1 || "")});
  set("#registration-form-address-line2", ${JSON.stringify(profile.addressLine2 || "")});

  set("[name='dwfrm_profile_customer_phone']", ${JSON.stringify(profile.phone || "")});
  set("[name='dwfrm_profile_login_password']", ${JSON.stringify(profile.pass || "")});
  set("[name='dwfrm_profile_login_passwordconfirm']", ${JSON.stringify(profile.pass || "")});

  const mailOff = document.querySelector(
    "input[name='dwfrm_profile_customer_addtoemaillist'][value='false']"
  );

  if (mailOff) {
    mailOff.checked = true;
    mailOff.dispatchEvent(new Event("input", { bubbles:true }));
    mailOff.dispatchEvent(new Event("change", { bubbles:true }));
  }

  const terms = document.querySelector(
    "[name='dwfrm_profile_customer_agreetotheterms']"
  );

  if (terms) {
    terms.checked = true;
    terms.dispatchEvent(new Event("change", { bubbles:true }));
  }

  const privacy = document.querySelector(
    "[name='dwfrm_profile_customer_agreetotheprivacypolicy']"
  );

  if (privacy) {
    privacy.checked = true;
    privacy.dispatchEvent(new Event("change", { bubbles:true }));
  }

  return true;
})();
    `);

    await Web.delay(1000);

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

module.exports = {
  splitAddressLine,
  normalizeProfileData,
  mergeWithGigya,
  toZenkaku,
  fillOrderAddressForm,
  fillCreateForm
};