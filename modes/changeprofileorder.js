const Core = require("../core");
const Web = require("../web");
const Auth = require("../services/auth");
const Session = require("../services/session");
const FormFill = require("../services/formfill");

const LOGIN_URL =
  "https://www.pokemoncenter-online.com/login/";

const ORDER_HISTORY_URL =
  "https://www.pokemoncenter-online.com/order-history/";

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") stopCheck();
}

function getRunForm(form, acc) {
  return Object.assign({}, form || {}, {
    imapEmail: acc.imapEmail || form.imapEmail,
    imapPass: acc.imapPass || form.imapPass,
    productIds: acc.productIds || form.productIds
  });
}

async function changeOrderAddressByRequest(wv, orderNo, profile) {
  const varName = "__CHANGE_ORDER_ADDRESS_" + Date.now();

  await Web.evalJS(wv, `
(() => {
  window.${varName} = "";

  (async () => {
    try {
      function hidden(name) {
        return document.querySelector('[name="' + name + '"]')?.value || "";
      }

      const body = new URLSearchParams();

      body.set("orderNo", ${JSON.stringify(orderNo)});
      body.set("orderDay", hidden("orderDay"));
      body.set("orderTime", hidden("orderTime"));

      body.set("apiUidSignatureUid", ${JSON.stringify(profile.uid || "")});
      body.set("apiUidSignatureUIDSignature", ${JSON.stringify(profile.uidSignature || "")});
      body.set("apiUidSignaturesignatureTimestamp", ${JSON.stringify(profile.signatureTimestamp || "")});

      body.set("radio01", "new");

      body.set("dwfrm_changeAddress_name", ${JSON.stringify(profile.name || "")});
      body.set("dwfrm_changeAddress_nameKana", ${JSON.stringify(profile.kana || "")});
      body.set("dwfrm_changeAddress_postalCode", ${JSON.stringify(profile.postcode || "")});
      body.set("dwfrm_changeAddress_states_stateCode", ${JSON.stringify(profile.pref || "")});
      body.set("dwfrm_changeAddress_address2", ${JSON.stringify(profile.city || "")});
      body.set("dwfrm_changeAddress_addressLine1", ${JSON.stringify(profile.addressLine1 || "")});
      body.set("dwfrm_changeAddress_addressLine2", ${JSON.stringify(profile.addressLine2 || "")});
      body.set("dwfrm_changeAddress_phone", ${JSON.stringify(profile.phone || "")});

      body.set("csrf_token", hidden("csrf_token"));

      const res = await fetch(
        "/on/demandware.store/Sites-POL-Site/ja_JP/Order-DeliveryAddressChange",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest"
          },
          body: body.toString()
        }
      );

      const text = await res.text();

      window.${varName} = JSON.stringify({
        ok: res.ok,
        status: res.status,
        url: res.url,
        text: text
      });

    } catch(e) {
      window.${varName} = JSON.stringify({
        ok: false,
        reason: String(e.message || e)
      });
    }
  })();

  return "START";
})();
  `);

  const raw = await Web.waitVar(wv, varName, 30000);

  if (!raw) {
    return {
      ok: false,
      reason: "CHANGE_REQUEST_TIMEOUT"
    };
  }

  try {
    return JSON.parse(raw);
  } catch(e) {
    return {
      ok: false,
      reason: "CHANGE_PARSE_FAIL",
      raw
    };
  }
}

function splitProductIds(text) {
  return String(text || "")
    .split(/[,，\n\r\s]+/)
    .map(x => x.trim())
    .filter(Boolean);
}

async function findOrderNoByProductIds(wv, productIds) {
  return await Web.evalJS(wv, `
(() => {
  const productIds = ${JSON.stringify(productIds || [])};

  const items = [
    ...document.querySelectorAll(".comOrderList > li")
  ];

  for (const li of items) {
    const img = li.querySelector(".phoBox img");
    const src = img ? img.src || "" : "";

    const hitId = productIds.find(id =>
      src.includes("/" + id + "/")
    );

    if (!hitId) continue;

    const orderNo =
      li.querySelector(".number span")
        ?.innerText
        ?.trim() || "";

    const title =
      li.querySelector(".ttl")
        ?.innerText
        ?.trim() || "";

    return {
      ok: true,
      productId: hitId,
      orderNo,
      title,
      imgSrc: src
    };
  }

  return {
    ok: false,
    reason: "ORDER_NOT_FOUND",
    checked: items.length
  };
})();
  `);
}

async function runAccount(ctx) {
  const acc = ctx.acc;
  const index = ctx.index;
  const total = ctx.total;
  const form = ctx.form || {};
  const stopCheck = ctx.stopCheck;

  const email = acc.email;
  const pass = acc.pass;
  const runForm = getRunForm(form, acc);

  const productIds = splitProductIds(runForm.productIds);

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
      mode: "ChangeProfileOrder",
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
      step: "ORDER",
      status: "Open order history",
      index,
      total
    });

    Core.addLog("Open order history: " + email, "info");

    wv.url = ORDER_HISTORY_URL + "?t=" + Date.now();

    await Web.waitPageReady(wv, 30000);
    await Web.delay(5000);

    const found = await findOrderNoByProductIds(
      wv,
      productIds
    );

    if (!found || !found.ok) {
      Core.addLog(
        "Order not found: " + email,
        "warn"
      );

      return {
        ok: false,
        reason: found.reason || "ORDER_NOT_FOUND",
        meta: found
      };
    }

    Core.addLog(
      "Found Order Number: " +
        found.orderNo,
      "success"
    );

    Core.updateCurrent({
      email,
      step: "ADDRESS",
      status: "Open ChangeAddress OrderNum: " + found.orderNo,
      index,
      total
    });

    const addressUrl =
      "https://www.pokemoncenter-online.com/order-delivery-address-show/?orderNo=" +
      encodeURIComponent(found.orderNo);

    wv.url = addressUrl;

    await Web.waitPageReady(wv, 30000);
    await Web.delay(3000);

    const baseProfile =
      FormFill.normalizeProfileData(runForm);
    
    const profile =
      FormFill.mergeWithGigya(
        baseProfile,
        authRs.finalJson || {}
      );
    
    const changeRs = await changeOrderAddressByRequest(
      wv,
      found.orderNo,
      profile
    );
    
    Core.addLog(
      "Change address request: " +
        (changeRs.status || changeRs.reason || "UNKNOWN"),
      changeRs.ok ? "success" : "error"
    );
    
    if (!changeRs.ok) {
      return {
        ok: false,
        reason: "CHANGE_ADDRESS_REQUEST_FAIL",
        orderNo: found.orderNo,
        productId: found.productId,
        meta: changeRs
      };
    }
    
    Core.playSuccessSound();
    return {
      ok: true,
      reason: "ADDRESS_CHANGED",
      orderNo: found.orderNo,
      productId: found.productId,
      title: found.title || "",
      meta: changeRs
    };

  } finally {
    await Session.cleanupAccount(wv, index, total);
  }
}

module.exports = {
  runAccount
};