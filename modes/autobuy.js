// ================= BUY MODE - PokeTool V1.3 =================
// Auto flow:
// Login + OTP
// Add products
// Cart
// Shipping
// Payment
// Submit order
// Verify result
// Cleanup account
// Runner tự chuyển account tiếp theo

const Core = require("../core");
const Web = require("../web");
const Auth = require("../services/auth");
const Session = require("../services/session");

const LOGIN_URL =
  "https://www.pokemoncenter-online.com/login/";

const CART_URL =
  "https://www.pokemoncenter-online.com/cart/";

let PAYMENT_METHOD = "";
let PAYMENT_CANCELLED = false;

// ============================================================
// BASIC HELPERS
// ============================================================

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") {
    stopCheck();
  }
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function splitProductIds(text) {
  return String(text || "")
    .split(/[,，\n\r\s]+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function parseCreditCard(line) {
  const value = String(line || "").trim();

  if (!value) {
    return null;
  }

  const parts = value.split("-");

  if (parts.length < 3) {
    return null;
  }

  const number = String(parts[0] || "")
    .replace(/\s+/g, "")
    .trim();

  let expiry = String(parts[1] || "")
    .replace(/\s+/g, "")
    .replace(/\//g, "")
    .trim();

  const cvv = String(parts.slice(2).join("-") || "")
    .replace(/\s+/g, "")
    .trim();

  if (expiry.length !== 4) {
    return null;
  }

  const expMonth = expiry.substring(0, 2);
  const expYear = expiry.substring(2, 4);

  if (
    !number ||
    !/^\d+$/.test(number) ||
    !/^\d{2}$/.test(expMonth) ||
    !/^\d{2}$/.test(expYear) ||
    !/^\d{3,4}$/.test(cvv)
  ) {
    return null;
  }

  const monthNumber = Number(expMonth);

  if (
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return null;
  }

  return {
    number,
    expMonth,
    expYear,
    cvv
  };
}

function pickTaskLine(taskValue, formValue, index) {
  const taskText = String(taskValue || "").trim();

  if (taskText) {
    return taskText;
  }

  const lines = splitLines(formValue);

  if (!lines.length) {
    return "";
  }

  if (lines.length === 1) {
    return lines[0];
  }

  return lines[index - 1] || "";
}

function getRunForm(form, acc) {
  form = form || {};
  acc = acc || {};

  return Object.assign({}, form, {
    imapEmail:
      acc.imapEmail ||
      acc.accImapEmail ||
      form.imapEmail,

    imapPass:
      acc.imapPass ||
      acc.accImapPass ||
      form.imapPass,

    productIds:
      acc.productIds ||
      form.productIds,

    buyQty:
      acc.buyQty ||
      form.buyQty
  });
}

// ============================================================
// PAYMENT MENU
// ============================================================

function choosePaymentMethod() {
  return new Promise(resolve => {
    $ui.alert({
      title: "💳 Thanh toán",

      message:
        "Chọn phương thức thanh toán cho toàn bộ lần chạy này.",

      actions: [
        {
          title: "💵 Daibiki (COD)",

          handler() {
            resolve("DAIBIKI");
          }
        },

        {
          title: "💳 Credit Card",

          handler() {
            resolve("CREDIT");
          }
        },

        {
          title: "Huỷ",

          style: "cancel",

          handler() {
            resolve("");
          }
        }
      ]
    });
  });
}

async function preparePayment(index) {
  // Mỗi lần Runner mới chạy, account đầu tiên luôn có index = 1.
  // Reset lựa chọn cũ để hiện menu lại.
  if (index === 1) {
    PAYMENT_METHOD = "";
    PAYMENT_CANCELLED = false;
  }

  if (PAYMENT_CANCELLED) {
    return "";
  }

  if (PAYMENT_METHOD) {
    return PAYMENT_METHOD;
  }

  PAYMENT_METHOD =
    await choosePaymentMethod();

  if (!PAYMENT_METHOD) {
    PAYMENT_CANCELLED = true;
  }

  return PAYMENT_METHOD;
}

// ============================================================
// WEB HELPERS
// ============================================================

async function getCurrentUrl(wv) {
  try {
    return String(
      await Web.evalJS(
        wv,
        "location.href || '';"
      ) || ""
    );
  } catch (e) {
    return "";
  }
}

async function waitUrlChange(
  wv,
  oldUrl,
  timeout
) {
  const start = Date.now();
  const maxWait = timeout || 30000;

  while (
    Date.now() - start <
    maxWait
  ) {
    const current =
      await getCurrentUrl(wv);

    if (
      current &&
      current !== oldUrl
    ) {
      return true;
    }

    await Web.delay(500);
  }

  return false;
}

async function tapFirst(
  wv,
  selectors
) {
  const list =
    Array.isArray(selectors)
      ? selectors
      : [selectors];

  return await Web.evalJS(
    wv,
    `
(() => {
  const selectors =
    ${JSON.stringify(list)};

  for (
    const selector of selectors
  ) {
    const element =
      document.querySelector(
        selector
      );

    if (!element) {
      continue;
    }

    try {
      element.disabled = false;
      element.removeAttribute(
        "disabled"
      );
    } catch(e) {}

    try {
      element.scrollIntoView({
        block: "center",
        behavior: "auto"
      });
    } catch(e) {}

    try {
      element.focus();
    } catch(e) {}

    try {
      element.click();

      return {
        ok: true,
        selector
      };
    } catch(e) {
      return {
        ok: false,
        selector,
        reason:
          String(
            e.message || e
          )
      };
    }
  }

  return {
    ok: false,
    reason:
      "BUTTON_NOT_FOUND",
    selectors
  };
})();
`
  );
}

async function waitAnyVisible(
  wv,
  selectors,
  timeout
) {
  const list =
    Array.isArray(selectors)
      ? selectors
      : [selectors];

  const start = Date.now();
  const maxWait =
    timeout || 15000;

  while (
    Date.now() - start <
    maxWait
  ) {
    const result =
      await Web.evalJS(
        wv,
        `
(() => {
  const selectors =
    ${JSON.stringify(list)};

  for (
    const selector of selectors
  ) {
    const element =
      document.querySelector(
        selector
      );

    if (!element) continue;

    const style =
      getComputedStyle(element);

    const rect =
      element
        .getBoundingClientRect();

    const visible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0 &&
      rect.width > 0 &&
      rect.height > 0;

    if (visible) {
      return {
        ok: true,
        selector
      };
    }
  }

  return {
    ok: false
  };
})();
`
      );

    if (
      result &&
      result.ok
    ) {
      return result;
    }

    await Web.delay(400);
  }

  return {
    ok: false,
    reason:
      "VISIBLE_TIMEOUT"
  };
}

// ============================================================
// PRODUCT
// ============================================================

async function addProduct(
  wv,
  productId,
  quantity
) {
  const productUrl =
    "https://www.pokemoncenter-online.com/" +
    encodeURIComponent(productId) +
    ".html?t=" +
    Date.now();

  Core.addLog(
    "Open product: " +
      productId,
    "info"
  );

  wv.url = productUrl;

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(1500);

  const pageInfo =
    await Web.evalJS(
      wv,
      `
(() => {
  const quantity =
    document.querySelector(
      "#quantity"
    );

  const cartButton =
    document.querySelector(
      ".add-to-cart-button a"
    ) ||
    document.querySelector(
      ".add-to-cart-button button"
    ) ||
    document.querySelector(
      "[data-action='add-to-cart']"
    );

  const unavailableText =
    document.body
      ? document.body.innerText
      : "";

  return {
    hasQuantity:
      !!quantity,

    hasCartButton:
      !!cartButton,

    soldOut:
      unavailableText.includes(
        "在庫切れ"
      ) ||
      unavailableText.includes(
        "SOLD OUT"
      ) ||
      unavailableText.includes(
        "販売終了"
      )
  };
})();
`
    );

  if (
    pageInfo &&
    pageInfo.soldOut
  ) {
    return {
      ok: false,
      reason:
        "PRODUCT_SOLD_OUT",
      productId
    };
  }

  if (
    !pageInfo ||
    !pageInfo.hasCartButton
  ) {
    return {
      ok: false,
      reason:
        "ADD_CART_BUTTON_NOT_FOUND",
      productId
    };
  }

  const fillResult =
    await Web.evalJS(
      wv,
      `
(() => {
  const input =
    document.querySelector(
      "#quantity"
    );

  if (!input) {
    return {
      ok: false,
      reason:
        "QUANTITY_INPUT_NOT_FOUND"
    };
  }

  const value =
    ${JSON.stringify(
      String(quantity)
    )};

  input.focus();
  input.value = value;

  input.dispatchEvent(
    new Event(
      "input",
      {
        bubbles: true
      }
    )
  );

  input.dispatchEvent(
    new Event(
      "change",
      {
        bubbles: true
      }
    )
  );

  input.dispatchEvent(
    new Event(
      "blur",
      {
        bubbles: true
      }
    )
  );

  return {
    ok: true,
    value:
      input.value
  };
})();
`
    );

  if (
    !fillResult ||
    !fillResult.ok
  ) {
    return {
      ok: false,
      reason:
        (
          fillResult &&
          fillResult.reason
        ) ||
        "QUANTITY_FILL_FAIL",
      productId
    };
  }

  const oldUrl =
    await getCurrentUrl(wv);

  const tapResult =
    await tapFirst(
      wv,
      [
        ".add-to-cart-button a",
        ".add-to-cart-button button",
        "[data-action='add-to-cart']"
      ]
    );

  if (
    !tapResult ||
    !tapResult.ok
  ) {
    return {
      ok: false,
      reason:
        "ADD_CART_CLICK_FAIL",
      productId,
      meta:
        tapResult
    };
  }

  await Web.delay(2000);

  const cartCheck =
    await Web.evalJS(
      wv,
      `
(() => {
  const bodyText =
    document.body
      ? document.body.innerText
      : "";

  const cartCount =
    document.querySelector(
      ".cart-quantity"
    ) ||
    document.querySelector(
      ".minicart-quantity"
    ) ||
    document.querySelector(
      "[data-cart-count]"
    );

  const error =
    document.querySelector(
      ".error-message"
    ) ||
    document.querySelector(
      ".alert-danger"
    ) ||
    document.querySelector(
      ".invalid-feedback"
    );

  return {
    ok:
      !!cartCount ||
      bodyText.includes(
        "カートに追加"
      ) ||
      bodyText.includes(
        "カートに入りました"
      ),

    cartCount:
      cartCount
        ? String(
            cartCount.innerText ||
            cartCount.textContent ||
            ""
          ).trim()
        : "",

    error:
      error
        ? String(
            error.innerText ||
            error.textContent ||
            ""
          ).trim()
        : "",

    url:
      location.href
  };
})();
`
    );

  if (
    cartCheck &&
    cartCheck.error
  ) {
    return {
      ok: false,
      reason:
        "ADD_CART_ERROR",
      productId,
      error:
        cartCheck.error
    };
  }

  Core.addLog(
    "Added product: " +
      productId +
      " x" +
      quantity,
    "success"
  );

  return {
    ok: true,
    productId,
    quantity,
    oldUrl,
    cart:
      cartCheck || {}
  };
}

// ============================================================
// CART
// ============================================================

async function openCartAndCheckout(wv) {
  Core.addLog(
    "Open cart",
    "info"
  );

  wv.url =
    CART_URL +
    "?t=" +
    Date.now();

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(2000);

  const cartInfo =
    await Web.evalJS(
      wv,
      `
(() => {
  const bodyText =
    document.body
      ? document.body.innerText
      : "";

  const empty =
    bodyText.includes(
      "カートに商品がありません"
    ) ||
    bodyText.includes(
      "ショッピングカートは空です"
    );

  const checkout =
    document.querySelector(
      '.comBtn a[href="/order/"]'
    ) ||
    document.querySelector(
      'a[href*="/order/"]'
    ) ||
    document.querySelector(
      ".checkout-btn"
    );

  return {
    empty,
    hasCheckout:
      !!checkout
  };
})();
`
    );

  if (
    cartInfo &&
    cartInfo.empty
  ) {
    return {
      ok: false,
      reason:
        "CART_EMPTY"
    };
  }

  if (
    !cartInfo ||
    !cartInfo.hasCheckout
  ) {
    return {
      ok: false,
      reason:
        "CHECKOUT_BUTTON_NOT_FOUND"
    };
  }

  const oldUrl =
    await getCurrentUrl(wv);

  const tapped =
    await tapFirst(
      wv,
      [
        '.comBtn a[href="/order/"]',
        'a[href*="/order/"]',
        ".checkout-btn",
        "button.checkout"
      ]
    );

  if (
    !tapped ||
    !tapped.ok
  ) {
    return {
      ok: false,
      reason:
        "CHECKOUT_CLICK_FAIL",
      meta:
        tapped
    };
  }

  await waitUrlChange(
    wv,
    oldUrl,
    15000
  );

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(2000);

  return {
    ok: true
  };
}

// ============================================================
// SHIPPING
// ============================================================

async function fillShipping(wv) {
  Core.addLog(
    "Select delivery",
    "info"
  );

  const result =
    await Web.evalJS(
      wv,
      `
(() => {
  try {
    const radio =
      document.querySelector(
        'input[name="dwfrm_shipping_shippingAddress_timetable_hasRequest"][value="true"]'
      );

    if (radio) {
      radio.disabled = false;
      radio.removeAttribute(
        "disabled"
      );

      radio.checked = true;

      radio.dispatchEvent(
        new Event(
          "input",
          {
            bubbles: true
          }
        )
      );

      radio.dispatchEvent(
        new Event(
          "change",
          {
            bubbles: true
          }
        )
      );

      radio.dispatchEvent(
        new Event(
          "click",
          {
            bubbles: true
          }
        )
      );
    }

    const dateSelect =
      document.querySelector(
        'select[name="dwfrm_shipping_shippingAddress_timetable_dateRange"]'
      );

    if (
      dateSelect &&
      dateSelect.options &&
      dateSelect.options.length >
        1
    ) {
      dateSelect.disabled =
        false;

      dateSelect.removeAttribute(
        "disabled"
      );

      dateSelect.selectedIndex =
        1;

      dateSelect.dispatchEvent(
        new Event(
          "input",
          {
            bubbles: true
          }
        )
      );

      dateSelect.dispatchEvent(
        new Event(
          "change",
          {
            bubbles: true
          }
        )
      );
    }

    const timeSelect =
      document.querySelector(
        'select[name="dwfrm_shipping_shippingAddress_timetable_timeRange"]'
      );

    if (timeSelect) {
      timeSelect.disabled =
        false;

      timeSelect.removeAttribute(
        "disabled"
      );

      const morningOption =
        [
          ...timeSelect.options
        ].find(option => {
          const text =
            String(
              option.textContent ||
              ""
            );

          return (
            String(
              option.value ||
              ""
            ) === "8" ||
            text.includes(
              "午前中"
            )
          );
        });

      if (morningOption) {
        timeSelect.value =
          morningOption.value;
      } else if (
        timeSelect.options.length >
        1
      ) {
        timeSelect.selectedIndex =
          1;
      }

      timeSelect.dispatchEvent(
        new Event(
          "input",
          {
            bubbles: true
          }
        )
      );

      timeSelect.dispatchEvent(
        new Event(
          "change",
          {
            bubbles: true
          }
        )
      );
    }

    return {
      ok: true,

      hasRadio:
        !!radio,

      hasDate:
        !!dateSelect,

      hasTime:
        !!timeSelect,

      date:
        dateSelect
          ? dateSelect.value
          : "",

      time:
        timeSelect
          ? timeSelect.value
          : ""
    };
  } catch(e) {
    return {
      ok: false,
      reason:
        String(
          e.message || e
        )
    };
  }
})();
`
    );

  if (
    !result ||
    !result.ok
  ) {
    return {
      ok: false,
      reason:
        (
          result &&
          result.reason
        ) ||
        "SHIPPING_FILL_FAIL",
      meta:
        result
    };
  }

  await Web.delay(1500);

  return {
    ok: true,
    meta:
      result
  };
}

async function goToPayment(wv) {
  const oldUrl =
    await getCurrentUrl(wv);

  const result =
    await tapFirst(
      wv,
      [
        "ul.linkList li.next-step-button a.submit-shipping",
        "a.submit-shipping",
        "button.submit-shipping",
        ".next-step-button a",
        ".next-step-button button"
      ]
    );

  if (
    !result ||
    !result.ok
  ) {
    return {
      ok: false,
      reason:
        "SHIPPING_NEXT_BUTTON_NOT_FOUND",
      meta:
        result
    };
  }

  await waitUrlChange(
    wv,
    oldUrl,
    15000
  );

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(2500);

  return {
    ok: true
  };
}

// ============================================================
// PAYMENT
// ============================================================

async function selectDaibiki(wv) {
  const result =
    await Web.evalJS(
      wv,
      `
(() => {
  const cod =
    document.querySelector(
      'input[name="radioMethodMain"][value="CASH_ON_DELIVERY"]'
    );

  if (!cod) {
    return {
      ok: false,
      reason:
        "COD_RADIO_NOT_FOUND"
    };
  }

  cod.disabled = false;
  cod.removeAttribute(
    "disabled"
  );

  cod.checked = true;

  cod.dispatchEvent(
    new Event(
      "input",
      {
        bubbles: true
      }
    )
  );

  cod.dispatchEvent(
    new Event(
      "change",
      {
        bubbles: true
      }
    )
  );

  cod.dispatchEvent(
    new Event(
      "click",
      {
        bubbles: true
      }
    )
  );

  const hidden =
    document.querySelector(
      "#hidMethodName"
    );

  if (hidden) {
    hidden.value =
      "CASH_ON_DELIVERY";

    hidden.dispatchEvent(
      new Event(
        "change",
        {
          bubbles: true
        }
      )
    );
  }

  return {
    ok:
      cod.checked === true,

    checked:
      cod.checked,

    hidden:
      hidden
        ? hidden.value
        : ""
  };
})();
`
    );

  await Web.delay(1200);

  if (
    !result ||
    !result.ok
  ) {
    return {
      ok: false,
      reason:
        (
          result &&
          result.reason
        ) ||
        "COD_SELECT_FAIL",
      meta:
        result
    };
  }

  Core.addLog(
    "Payment: Daibiki",
    "success"
  );

  return {
    ok: true,
    payment:
      "DAIBIKI"
  };
}

async function fillCreditCard(wv, owner, credit) {
  if (!wv) {
    return {
      ok: false,
      reason: "NO_WEBVIEW"
    };
  }

  if (!owner) {
    return {
      ok: false,
      reason: "NO_CARD_OWNER"
    };
  }

  if (
    !credit ||
    !credit.number ||
    !credit.expMonth ||
    !credit.expYear ||
    !credit.cvv
  ) {
    return {
      ok: false,
      reason: "INVALID_CREDIT_DATA"
    };
  }

  try {
    // ===== CHECK NEW CARD =====
    const checkRs = await Web.evalJS(wv, `
(() => {
  const chk =
    document.querySelector("#checkNewCard");

  if (!chk) {
    return {
      ok: false,
      reason: "CHECK_NEW_CARD_NOT_FOUND"
    };
  }

  try {
    chk.disabled = false;
    chk.removeAttribute("disabled");
  } catch(e) {}

  if (!chk.checked) {
    chk.checked = true;

    chk.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    chk.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    chk.dispatchEvent(
      new Event("click", {
        bubbles: true
      })
    );
  }

  return {
    ok: true,
    checked: chk.checked
  };
})();
    `);

    if (!checkRs || !checkRs.ok) {
      return {
        ok: false,
        reason:
          checkRs?.reason ||
          "CHECK_NEW_CARD_FAIL",
        meta: checkRs
      };
    }

    await Web.delay(1000);

    // ===== NHẬP THẺ GIỐNG CODE CŨ =====
    const fillRs = await Web.evalJS(wv, `
(async function() {
  try {
    const sleep = ms =>
      new Promise(resolve =>
        setTimeout(resolve, ms)
      );

    // 1. Tên chủ thẻ và số thẻ
    const ownerEl =
      document.querySelector("#cardOwner");

    const numEl =
      document.querySelector("#cardNumber");

    if (ownerEl) {
      try {
        ownerEl.disabled = false;
        ownerEl.removeAttribute("disabled");
        ownerEl.removeAttribute("readonly");
      } catch(e) {}

      ownerEl.focus();

      ownerEl.value =
        ${JSON.stringify(owner)};

      ownerEl.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );

      ownerEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    }

    if (numEl) {
      try {
        numEl.disabled = false;
        numEl.removeAttribute("disabled");
        numEl.removeAttribute("readonly");
      } catch(e) {}

      numEl.focus();

      numEl.value =
        ${JSON.stringify(credit.number)};

      numEl.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );

      numEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    }

    await sleep(300);

    // 2. THÁNG
    // Giữ nguyên cách cũ:
    // focus tháng để trang tự chuyển focus sang năm
    const mmEl =
      document.querySelector(
        "#expirationMonth"
      );

    if (mmEl) {
      try {
        mmEl.disabled = false;
        mmEl.removeAttribute("disabled");
        mmEl.removeAttribute("readonly");
      } catch(e) {}

      const month =
        ${JSON.stringify(
          String(credit.expMonth).padStart(2, "0")
        )};

      mmEl.value = "";
      mmEl.focus();

      mmEl.value = month;

      mmEl.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );

      mmEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    }

    await sleep(300);

    // 3. NĂM
    const yyEl =
      document.querySelector(
        "#expirationYear"
      );

    if (yyEl) {
      try {
        yyEl.disabled = false;
        yyEl.removeAttribute("disabled");
        yyEl.removeAttribute("readonly");
      } catch(e) {}

      const year =
        ${JSON.stringify(
          String(credit.expYear).padStart(2, "0")
        )};

      yyEl.value = year;

      yyEl.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );

      yyEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );

      yyEl.dispatchEvent(
        new Event("blur", {
          bubbles: true
        })
      );
    }

    await sleep(300);

    // 4. CVV
    const cvvEl =
      document.querySelector(
        "#securityCode"
      );

    if (cvvEl) {
      try {
        cvvEl.disabled = false;
        cvvEl.removeAttribute("disabled");
        cvvEl.removeAttribute("readonly");
      } catch(e) {}

      cvvEl.focus();

      cvvEl.value =
        ${JSON.stringify(credit.cvv)};

      cvvEl.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );

      cvvEl.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );

      cvvEl.blur();
    }

    // 5. Đợi validation của trang
    await sleep(1000);

    const result = {
      ownerFound: !!ownerEl,
      numberFound: !!numEl,
      monthFound: !!mmEl,
      yearFound: !!yyEl,
      cvvFound: !!cvvEl,

      ownerValue:
        ownerEl
          ? String(ownerEl.value || "")
          : "",

      numberValue:
        numEl
          ? String(numEl.value || "")
          : "",

      monthValue:
        mmEl
          ? String(mmEl.value || "")
          : "",

      yearValue:
        yyEl
          ? String(yyEl.value || "")
          : "",

      cvvValue:
        cvvEl
          ? String(cvvEl.value || "")
          : ""
    };

    result.ok =
      result.ownerFound &&
      result.numberFound &&
      result.monthFound &&
      result.yearFound &&
      result.cvvFound &&
      result.ownerValue !== "" &&
      result.numberValue !== "" &&
      result.monthValue !== "" &&
      result.yearValue !== "" &&
      result.cvvValue !== "";

    if (!result.ok) {
      result.reason =
        "CREDIT_FIELD_EMPTY";
    }

    return result;

  } catch(e) {
    return {
      ok: false,
      reason:
        String(e.message || e)
    };
  }
})();
    `);

    if (!fillRs || !fillRs.ok) {
      Core.addLog(
        "Credit fill failed: " +
          JSON.stringify(fillRs || {}),
        "error"
      );

      return {
        ok: false,
        reason:
          fillRs?.reason ||
          "CREDIT_FILL_FAIL",
        meta: fillRs || {}
      };
    }

    Core.addLog(
      "Credit card filled",
      "success"
    );

    return {
      ok: true,
      reason: "CREDIT_FILLED",
      meta: fillRs
    };

  } catch (e) {
    Core.addLog(
      "Credit fill exception: " +
        String(e.message || e),
      "error"
    );

    return {
      ok: false,
      reason:
        String(e.message || e)
    };
  }
}

async function goToOrderConfirm(wv) {
  const oldUrl =
    await getCurrentUrl(wv);

  const result =
    await tapFirst(
      wv,
      [
        "ul.linkList li.next-step-button a.submit-payment",
        "a.submit-payment",
        "button.submit-payment",
        ".next-step-button a",
        ".next-step-button button",
        "button[name='submit']"
      ]
    );

  if (
    !result ||
    !result.ok
  ) {
    return {
      ok: false,
      reason:
        "PAYMENT_NEXT_BUTTON_NOT_FOUND",
      meta:
        result
    };
  }

  await waitUrlChange(
    wv,
    oldUrl,
    20000
  );

  await Web.waitPageReady(
    wv,
    30000
  );

  await Web.delay(2500);

  return {
    ok: true
  };
}

// ============================================================
// FINAL ORDER
// ============================================================

async function submitOrder(wv) {
  Core.addLog(
    "Submit order",
    "info"
  );

  const before =
    await Web.evalJS(
      wv,
      `
(() => {
  const bodyText =
    document.body
      ? document.body.innerText
      : "";

  const button =
    document.querySelector(
      "#submitOrder"
    ) ||
    document.querySelector(
      "button.submit-order"
    ) ||
    document.querySelector(
      "a.submit-order"
    ) ||
    document.querySelector(
      ".place-order"
    ) ||
    document.querySelector(
      "button[name='submitOrder']"
    ) ||
    document.querySelector(
      "form[name='dwfrm_placeOrder'] button[type='submit']"
    );

  const error =
    document.querySelector(
      ".error-message"
    ) ||
    document.querySelector(
      ".alert-danger"
    ) ||
    document.querySelector(
      ".invalid-feedback"
    );

  return {
    hasButton:
      !!button,

    error:
      error
        ? String(
            error.innerText ||
            error.textContent ||
            ""
          ).trim()
        : "",

    bodySample:
      bodyText.substring(
        0,
        500
      ),

    url:
      location.href
  };
})();
`
    );

  if (
    before &&
    before.error
  ) {
    return {
      ok: false,
      reason:
        "ORDER_CONFIRM_ERROR",
      error:
        before.error
    };
  }

  if (
    !before ||
    !before.hasButton
  ) {
    return {
      ok: false,
      reason:
        "SUBMIT_ORDER_BUTTON_NOT_FOUND",
      meta:
        before
    };
  }

  const oldUrl =
    await getCurrentUrl(wv);

  const tapped =
    await tapFirst(
      wv,
      [
        "#submitOrder",
        "button.submit-order",
        "a.submit-order",
        ".place-order",
        "button[name='submitOrder']",
        "form[name='dwfrm_placeOrder'] button[type='submit']"
      ]
    );

  if (
    !tapped ||
    !tapped.ok
  ) {
    return {
      ok: false,
      reason:
        "SUBMIT_ORDER_CLICK_FAIL",
      meta:
        tapped
    };
  }

  await waitUrlChange(
    wv,
    oldUrl,
    30000
  );

  await Web.waitPageReady(
    wv,
    45000
  );

  await Web.delay(4000);

  return await verifyOrderResult(
    wv
  );
}

async function verifyOrderResult(wv) {
  const result =
    await Web.evalJS(
      wv,
      `
(() => {
  const url =
    String(
      location.href || ""
    );

  const text =
    document.body
      ? String(
          document.body.innerText ||
          ""
        )
      : "";

  const orderNoElement =
    document.querySelector(
      ".order-number"
    ) ||
    document.querySelector(
      ".number span"
    ) ||
    document.querySelector(
      "[data-order-number]"
    );

  const orderNoText =
    orderNoElement
      ? String(
          orderNoElement.innerText ||
          orderNoElement.textContent ||
          orderNoElement.getAttribute(
            "data-order-number"
          ) ||
          ""
        ).trim()
      : "";

  const match =
    text.match(
      /注文番号[^0-9]*([0-9]{8,})/
    );

  const orderNo =
    orderNoText ||
    (
      match
        ? match[1]
        : ""
    );

  const success =
    url.includes(
      "order-confirmation"
    ) ||
    url.includes(
      "order-complete"
    ) ||
    url.includes(
      "order-success"
    ) ||
    text.includes(
      "ご注文ありがとうございます"
    ) ||
    text.includes(
      "ご注文を承りました"
    ) ||
    text.includes(
      "注文が完了しました"
    ) ||
    !!orderNo;

  const errorElement =
    document.querySelector(
      ".error-message"
    ) ||
    document.querySelector(
      ".alert-danger"
    ) ||
    document.querySelector(
      ".invalid-feedback"
    );

  const error =
    errorElement
      ? String(
          errorElement.innerText ||
          errorElement.textContent ||
          ""
        ).trim()
      : "";

  return {
    ok:
      success &&
      !error,

    success,
    url,
    orderNo,
    error,

    textSample:
      text.substring(
        0,
        1000
      )
  };
})();
`
    );

  if (
    !result ||
    !result.ok
  ) {
    return {
      ok: false,
      reason:
        result &&
        result.error
          ? "ORDER_SUBMIT_ERROR"
          : "ORDER_VERIFY_FAIL",
      meta:
        result
    };
  }

  return {
    ok: true,
    reason:
      "BUY_OK",
    orderNo:
      result.orderNo || "",
    url:
      result.url || "",
    meta:
      result
  };
}

// ============================================================
// RUN ONE ACCOUNT
// ============================================================

async function runAccount(ctx) {
  const acc =
    ctx.acc || {};

  const index =
    Number(ctx.index) || 1;

  const total =
    Number(ctx.total) || 1;

  const form =
    ctx.form || {};

  const stopCheck =
    ctx.stopCheck;

  const email =
    String(
      acc.email || ""
    ).trim();

  const pass =
    String(
      acc.pass || ""
    ).trim();

  if (
    !email ||
    !pass
  ) {
    return {
      ok: false,
      reason:
        "INVALID_ACCOUNT"
    };
  }

  const payment =
    await preparePayment(
      index
    );

  if (!payment) {
    return {
      ok: false,
      reason:
        "PAYMENT_CANCEL"
    };
  }

  const runForm =
    getRunForm(
      form,
      acc
    );

  const productIds =
    splitProductIds(
      runForm.productIds
    );

  if (!productIds.length) {
    return {
      ok: false,
      reason:
        "NO_PRODUCT_IDS"
    };
  }

  const quantity =
    Number(
      runForm.buyQty
    );

  if (
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return {
      ok: false,
      reason:
        "INVALID_BUY_QTY"
    };
  }

  let cardOwner = "";
  let credit = null;

  if (
    payment === "CREDIT"
  ) {
    cardOwner =
      pickTaskLine(
        acc.creditOwnerList ||
          acc.creditOwner,
        form.creditOwnerList,
        index
      );

    const creditRaw =
      pickTaskLine(
        acc.creditList ||
          acc.credit,
        form.creditList,
        index
      );

    credit =
      parseCreditCard(
        creditRaw
      );

    if (!cardOwner) {
      return {
        ok: false,
        reason:
          "NO_CARD_OWNER"
      };
    }

    if (!credit) {
      return {
        ok: false,
        reason:
          "INVALID_CREDIT"
      };
    }
  }

  let wv = null;

  try {
    checkStop(
      stopCheck
    );

    Core.updateCurrent({
      email,
      step: "BUY",
      status:
        "Create WebView",
      index,
      total
    });

    wv =
      Web.create(
        "about:blank"
      );

    if (!wv) {
      throw new Error(
        "Cannot create WebView"
      );
    }

    wv.url =
      LOGIN_URL +
      "?t=" +
      Date.now();

    await Web.waitPageReady(
      wv,
      30000
    );

    await Web.delay(
      2500
    );

    checkStop(
      stopCheck
    );

    Core.updateCurrent({
      email,
      step: "LOGIN",
      status:
        "Login account",
      index,
      total
    });

    const authResult =
      await Auth.loginOtpTerms({
        wv,
        email,
        pass,
        form:
          runForm,
        mode:
          "Buy",
        stopCheck,
        index,
        total
      });

    if (
      !authResult ||
      !authResult.ok
    ) {
      return (
        authResult || {
          ok: false,
          reason:
            "LOGIN_FAIL"
        }
      );
    }

    const addResults = [];

    for (
      let productIndex = 0;
      productIndex <
      productIds.length;
      productIndex++
    ) {
      checkStop(
        stopCheck
      );

      const productId =
        productIds[
          productIndex
        ];

      Core.updateCurrent({
        email,
        step: "ADD CART",
        status:
          (
            productIndex +
            1
          ) +
          "/" +
          productIds.length +
          " " +
          productId,
        index,
        total
      });

      const addResult =
        await addProduct(
          wv,
          productId,
          quantity
        );

      addResults.push(
        addResult
      );

      if (
        !addResult ||
        !addResult.ok
      ) {
        return {
          ok: false,
          reason:
            (
              addResult &&
              addResult.reason
            ) ||
            "ADD_PRODUCT_FAIL",
          productId,
          addResults
        };
      }
    }

    checkStop(
      stopCheck
    );

    Core.updateCurrent({
      email,
      step: "CART",
      status:
        "Open checkout",
      index,
      total
    });

    const cartResult =
      await openCartAndCheckout(
        wv
      );

    if (
      !cartResult ||
      !cartResult.ok
    ) {
      return {
        ok: false,
        reason:
          (
            cartResult &&
            cartResult.reason
          ) ||
          "CART_FAIL",
        meta:
          cartResult,
        addResults
      };
    }

    checkStop(
      stopCheck
    );

    Core.updateCurrent({
      email,
      step: "SHIPPING",
      status:
        "Select delivery",
      index,
      total
    });

    const shippingResult =
      await fillShipping(
        wv
      );

    if (
      !shippingResult ||
      !shippingResult.ok
    ) {
      return {
        ok: false,
        reason:
          (
            shippingResult &&
            shippingResult.reason
          ) ||
          "SHIPPING_FAIL",
        meta:
          shippingResult
      };
    }

    const paymentPageResult =
      await goToPayment(
        wv
      );

    if (
      !paymentPageResult ||
      !paymentPageResult.ok
    ) {
      return {
        ok: false,
        reason:
          (
            paymentPageResult &&
            paymentPageResult.reason
          ) ||
          "GO_PAYMENT_FAIL",
        meta:
          paymentPageResult
      };
    }

    checkStop(
      stopCheck
    );

    Core.updateCurrent({
      email,
      step: "PAYMENT",
      status:
        payment === "CREDIT"
          ? "Fill credit card"
          : "Select Daibiki",
      index,
      total
    });

    let selectPaymentResult;

    if (
      payment === "DAIBIKI"
    ) {
      selectPaymentResult =
        await selectDaibiki(
          wv
        );
    } else {
      selectPaymentResult =
        await fillCreditCard(
          wv,
          cardOwner,
          credit
        );
    }

    if (
      !selectPaymentResult ||
      !selectPaymentResult.ok
    ) {
      return {
        ok: false,
        reason:
          (
            selectPaymentResult &&
            selectPaymentResult.reason
          ) ||
          "PAYMENT_FILL_FAIL",
        meta:
          selectPaymentResult
      };
    }

    checkStop(
      stopCheck
    );

    Core.updateCurrent({
      email,
      step: "CONFIRM",
      status:
        "Open order confirmation",
      index,
      total
    });

    const confirmResult =
      await goToOrderConfirm(
        wv
      );

    if (
      !confirmResult ||
      !confirmResult.ok
    ) {
      return {
        ok: false,
        reason:
          (
            confirmResult &&
            confirmResult.reason
          ) ||
          "ORDER_CONFIRM_PAGE_FAIL",
        meta:
          confirmResult
      };
    }

    checkStop(
      stopCheck
    );

    Core.updateCurrent({
      email,
      step: "SUBMIT",
      status:
        "Placing order",
      index,
      total
    });

    const orderResult =
      await submitOrder(
        wv
      );

    if (
      !orderResult ||
      !orderResult.ok
    ) {
      Core.addLog(
        "Buy failed: " +
          email +
          " / " +
          (
            orderResult &&
            orderResult.reason
              ? orderResult.reason
              : "ORDER_FAIL"
          ),
        "error"
      );

      return {
        ok: false,
        reason:
          (
            orderResult &&
            orderResult.reason
          ) ||
          "ORDER_FAIL",
        payment,
        products:
          productIds,
        quantity,
        addResults,
        meta:
          orderResult
      };
    }

    Core.addLog(
      "Buy OK: " +
        email +
        (
          orderResult.orderNo
            ? " / " +
              orderResult.orderNo
            : ""
        ),
      "success"
    );

    Core.playSuccessSound();

    await Web.showNotify(
      wv,
      orderResult.orderNo
        ? "✅ Order: " +
          orderResult.orderNo
        : "✅ Buy completed",
      3000
    );

    return {
      ok: true,
      reason:
        "BUY_OK",
      payment,
      orderNo:
        orderResult.orderNo ||
        "",
      products:
        productIds,
      quantity,
      addResults,
      meta:
        orderResult
    };

  } finally {
    try {
      await Session.cleanupAccount(
        wv,
        index,
        total,
        {
          logout: true,
          resetIP: true
        }
      );
    } catch (e) {
      Core.addLog(
        "Buy cleanup skip: " +
          String(
            e.message || e
          ),
        "warn"
      );
    }
  }
}

module.exports = {
  runAccount,
  parseCreditCard
};