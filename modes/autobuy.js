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
    // ========================================================
    // STEP 1: CHỌN NHẬP THẺ MỚI
    // ========================================================

    const checkResult = await Web.evalJS(
      wv,
      `
(() => {
  try {
    const checkbox =
      document.querySelector("#checkNewCard");

    if (!checkbox) {
      return {
        ok: false,
        reason: "CHECK_NEW_CARD_NOT_FOUND",
        url: location.href
      };
    }

    checkbox.disabled = false;
    checkbox.removeAttribute("disabled");

    if (!checkbox.checked) {
      checkbox.click();
    }

    checkbox.checked = true;

    checkbox.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    checkbox.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    return {
      ok: checkbox.checked === true,
      checked: checkbox.checked,
      url: location.href
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(
        error.message || error
      )
    };
  }
})();
`
    );

    if (
      !checkResult ||
      checkResult.ok !== true
    ) {
      return {
        ok: false,
        reason:
          (
            checkResult &&
            checkResult.reason
          ) ||
          "CHECK_NEW_CARD_FAIL",
        meta: checkResult || null
      };
    }

    await Web.delay(1000);

    // ========================================================
    // STEP 2: KIỂM TRA FIELD
    // ========================================================

    const fieldCheck = await Web.evalJS(
      wv,
      `
(() => {
  const owner =
    document.querySelector("#cardOwner");

  const number =
    document.querySelector("#cardNumber");

  const month =
    document.querySelector("#expirationMonth");

  const year =
    document.querySelector("#expirationYear");

  const cvv =
    document.querySelector("#securityCode");

  return {
    ok:
      !!owner &&
      !!number &&
      !!month &&
      !!year &&
      !!cvv,

    ownerFound: !!owner,
    numberFound: !!number,
    monthFound: !!month,
    yearFound: !!year,
    cvvFound: !!cvv,

    url: location.href
  };
})();
`
    );

    if (
      !fieldCheck ||
      fieldCheck.ok !== true
    ) {
      Core.addLog(
        "Credit fields not found: " +
          JSON.stringify(
            fieldCheck || {}
          ),
        "error"
      );

      return {
        ok: false,
        reason:
          "CREDIT_FIELDS_NOT_FOUND",
        meta: fieldCheck || null
      };
    }

    // ========================================================
    // STEP 3: NHẬP CHỦ THẺ VÀ SỐ THẺ
    // ========================================================

    const identityResult = await Web.evalJS(
      wv,
      `
(() => {
  try {
    function prepare(element) {
      if (!element) return;

      element.disabled = false;
      element.removeAttribute("disabled");
      element.removeAttribute("readonly");
    }

    function setValue(element, value) {
      prepare(element);

      element.focus();
      element.value = "";

      element.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );

      element.value = value;

      element.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );

      element.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    }

    const ownerElement =
      document.querySelector("#cardOwner");

    const numberElement =
      document.querySelector("#cardNumber");

    if (
      !ownerElement ||
      !numberElement
    ) {
      return {
        ok: false,
        reason:
          "CARD_IDENTITY_FIELDS_NOT_FOUND",
        ownerFound:
          !!ownerElement,
        numberFound:
          !!numberElement
      };
    }

    setValue(
      ownerElement,
      ${JSON.stringify(owner)}
    );

    setValue(
      numberElement,
      ${JSON.stringify(credit.number)}
    );

    return {
      ok:
        String(
          ownerElement.value || ""
        ).trim() !== "" &&
        String(
          numberElement.value || ""
        ).trim() !== "",

      ownerValue:
        String(
          ownerElement.value || ""
        ),

      numberLength:
        String(
          numberElement.value || ""
        ).replace(/\\s+/g, "").length
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(
        error.message || error
      )
    };
  }
})();
`
    );

    if (
      !identityResult ||
      identityResult.ok !== true
    ) {
      return {
        ok: false,
        reason:
          (
            identityResult &&
            identityResult.reason
          ) ||
          "CARD_IDENTITY_FILL_FAIL",
        meta:
          identityResult || null
      };
    }

    await Web.delay(500);

    // ========================================================
    // STEP 4: NHẬP THÁNG
    // ========================================================

    const monthResult = await Web.evalJS(
      wv,
      `
(() => {
  try {
    const element =
      document.querySelector(
        "#expirationMonth"
      );

    if (!element) {
      return {
        ok: false,
        reason:
          "EXPIRATION_MONTH_NOT_FOUND"
      };
    }

    element.disabled = false;
    element.removeAttribute("disabled");
    element.removeAttribute("readonly");

    element.focus();
    element.value = "";

    element.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    element.value =
      ${JSON.stringify(
        String(credit.expMonth).padStart(2, "0")
      )};

    element.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    element.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    return {
      ok:
        String(
          element.value || ""
        ).trim() !== "",

      value:
        String(
          element.value || ""
        )
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(
        error.message || error
      )
    };
  }
})();
`
    );

    if (
      !monthResult ||
      monthResult.ok !== true
    ) {
      return {
        ok: false,
        reason:
          (
            monthResult &&
            monthResult.reason
          ) ||
          "EXPIRATION_MONTH_FILL_FAIL",
        meta:
          monthResult || null
      };
    }

    await Web.delay(500);

    // ========================================================
    // STEP 5: NHẬP NĂM
    // ========================================================

    const yearResult = await Web.evalJS(
      wv,
      `
(() => {
  try {
    const element =
      document.querySelector(
        "#expirationYear"
      );

    if (!element) {
      return {
        ok: false,
        reason:
          "EXPIRATION_YEAR_NOT_FOUND"
      };
    }

    element.disabled = false;
    element.removeAttribute("disabled");
    element.removeAttribute("readonly");

    element.focus();
    element.value =
      ${JSON.stringify(
        String(credit.expYear).padStart(2, "0")
      )};

    element.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    element.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    element.dispatchEvent(
      new Event("blur", {
        bubbles: true
      })
    );

    return {
      ok:
        String(
          element.value || ""
        ).trim() !== "",

      value:
        String(
          element.value || ""
        )
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(
        error.message || error
      )
    };
  }
})();
`
    );

    if (
      !yearResult ||
      yearResult.ok !== true
    ) {
      return {
        ok: false,
        reason:
          (
            yearResult &&
            yearResult.reason
          ) ||
          "EXPIRATION_YEAR_FILL_FAIL",
        meta:
          yearResult || null
      };
    }

    await Web.delay(500);

    // ========================================================
    // STEP 6: NHẬP CVV
    // ========================================================

    const cvvResult = await Web.evalJS(
      wv,
      `
(() => {
  try {
    const element =
      document.querySelector(
        "#securityCode"
      );

    if (!element) {
      return {
        ok: false,
        reason:
          "SECURITY_CODE_NOT_FOUND"
      };
    }

    element.disabled = false;
    element.removeAttribute("disabled");
    element.removeAttribute("readonly");

    element.focus();
    element.value =
      ${JSON.stringify(credit.cvv)};

    element.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    element.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    element.dispatchEvent(
      new Event("blur", {
        bubbles: true
      })
    );

    return {
      ok:
        String(
          element.value || ""
        ).trim() !== "",

      valueLength:
        String(
          element.value || ""
        ).length
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(
        error.message || error
      )
    };
  }
})();
`
    );

    if (
      !cvvResult ||
      cvvResult.ok !== true
    ) {
      return {
        ok: false,
        reason:
          (
            cvvResult &&
            cvvResult.reason
          ) ||
          "SECURITY_CODE_FILL_FAIL",
        meta:
          cvvResult || null
      };
    }

    await Web.delay(1500);

    // ========================================================
    // STEP 7: KIỂM TRA KẾT QUẢ CUỐI
    // ========================================================

    const verifyResult = await Web.evalJS(
      wv,
      `
(() => {
  try {
    const owner =
      document.querySelector("#cardOwner");

    const number =
      document.querySelector("#cardNumber");

    const month =
      document.querySelector("#expirationMonth");

    const year =
      document.querySelector("#expirationYear");

    const cvv =
      document.querySelector("#securityCode");

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

    const result = {
      ownerFound: !!owner,
      numberFound: !!number,
      monthFound: !!month,
      yearFound: !!year,
      cvvFound: !!cvv,

      ownerFilled:
        !!owner &&
        String(
          owner.value || ""
        ).trim() !== "",

      numberFilled:
        !!number &&
        String(
          number.value || ""
        ).trim() !== "",

      monthFilled:
        !!month &&
        String(
          month.value || ""
        ).trim() !== "",

      yearFilled:
        !!year &&
        String(
          year.value || ""
        ).trim() !== "",

      cvvFilled:
        !!cvv &&
        String(
          cvv.value || ""
        ).trim() !== "",

      error:
        errorElement
          ? String(
              errorElement.innerText ||
              errorElement.textContent ||
              ""
            ).trim()
          : ""
    };

    result.ok =
      result.ownerFilled &&
      result.numberFilled &&
      result.monthFilled &&
      result.yearFilled &&
      result.cvvFilled &&
      !result.error;

    if (!result.ok) {
      result.reason =
        result.error
          ? "CREDIT_VALIDATION_ERROR"
          : "CREDIT_FIELD_EMPTY";
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      reason: String(
        error.message || error
      )
    };
  }
})();
`
    );

    if (
      !verifyResult ||
      verifyResult.ok !== true
    ) {
      Core.addLog(
        "Credit verify failed: " +
          JSON.stringify(
            verifyResult || {}
          ),
        "error"
      );

      return {
        ok: false,
        reason:
          (
            verifyResult &&
            verifyResult.reason
          ) ||
          "CREDIT_VERIFY_FAIL",
        meta:
          verifyResult || null
      };
    }

    Core.addLog(
      "Credit card filled",
      "success"
    );

    return {
      ok: true,
      reason: "CREDIT_FILLED",
      meta: {
        ownerFilled:
          verifyResult.ownerFilled,
        numberFilled:
          verifyResult.numberFilled,
        monthFilled:
          verifyResult.monthFilled,
        yearFilled:
          verifyResult.yearFilled,
        cvvFilled:
          verifyResult.cvvFilled
      }
    };
  } catch (error) {
    Core.addLog(
      "Credit fill exception: " +
        String(
          error.message || error
        ),
      "error"
    );

    return {
      ok: false,
      reason:
        String(
          error.message || error
        )
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

async function getOrderPaymentState(wv) {
  return await Web.evalJS(
    wv,
    `
(() => {
  const url = String(location.href || "");
  const title = String(document.title || "");

  const text = String(
    document.body
      ? document.body.innerText || ""
      : ""
  );

  const html = String(
    document.documentElement
      ? document.documentElement.innerHTML || ""
      : ""
  );

  const normalized = text
    .replace(/\\s+/g, "")
    .trim();

  const lowerUrl = url.toLowerCase();
  const lowerHtml = html.toLowerCase();

  const orderElement =
    document.querySelector(".order-number") ||
    document.querySelector(".number span") ||
    document.querySelector("[data-order-number]");

  const orderText = orderElement
    ? String(
        orderElement.innerText ||
        orderElement.textContent ||
        orderElement.getAttribute("data-order-number") ||
        ""
      ).trim()
    : "";

  const orderMatch = text.match(
    /注文番号[^0-9]*([0-9]{8,})/
  );

  const orderNo =
    orderText ||
    (orderMatch ? orderMatch[1] : "");

  // Đặt hàng thành công
  const success =
    lowerUrl.includes("order-confirmation") ||
    lowerUrl.includes("order-complete") ||
    lowerUrl.includes("order-success") ||
    normalized.includes("ご注文ありがとうございます") ||
    normalized.includes("ご注文を承りました") ||
    normalized.includes("注文が完了しました") ||
    Boolean(orderNo);

  // Lỗi thanh toán hoặc đặt hàng
  const failed =
    normalized.includes("決済に失敗") ||
    normalized.includes("注文に失敗") ||
    normalized.includes("カードが利用できません") ||
    normalized.includes("本人認証に失敗") ||
    normalized.includes("認証に失敗しました");

  const errorElement =
    document.querySelector(".error-message") ||
    document.querySelector(".alert-danger") ||
    document.querySelector(".invalid-feedback");

  const error = errorElement
    ? String(
        errorElement.innerText ||
        errorElement.textContent ||
        ""
      ).trim()
    : "";

  // Form/input đặc trưng của 3DS
  const has3dsForm = Boolean(
    document.querySelector(
      [
        'form[action*="PaymentInfoAuthenticate"]',
        'form[action*="StepUp"]',
        'form[action*="tds2"]',
        'form[action*="challenge"]',
        'form[name*="3d"]',
        'form[name*="authenticate"]'
      ].join(",")
    )
  );

  const has3dsFields = Boolean(
    document.querySelector(
      [
        'input[name="creq"]',
        'input[name="CReq"]',
        'input[name="PaReq"]',
        'input[name="MD"]',
        'input[name="JWT"]',
        "#responseForm",
        "#resSumbitButtonId"
      ].join(",")
    )
  );

  const has3dsIframe = Boolean(
    document.querySelector(
      [
        'iframe[src*="3ds"]',
        'iframe[src*="emvtds"]',
        'iframe[src*="cardinal"]',
        'iframe[src*="challenge"]',
        'iframe[name*="challenge"]',
        'iframe[id*="challenge"]'
      ].join(",")
    )
  );

  const has3dsUrl =
    lowerUrl.includes("3ds") ||
    lowerUrl.includes("authenticate") ||
    lowerUrl.includes("stepup") ||
    lowerUrl.includes("challenge") ||
    lowerUrl.includes("emvtds") ||
    lowerUrl.includes("cardinal") ||
    lowerUrl.includes("/acs");

  const has3dsHtml =
    lowerHtml.includes("emvtds") ||
    lowerHtml.includes("cardinalcommerce") ||
    lowerHtml.includes("sendstepup") ||
    lowerHtml.includes("afterstepup") ||
    lowerHtml.includes("creq") ||
    lowerHtml.includes("pareq");

  const has3dsText =
    normalized.includes("3Dセキュア") ||
    normalized.includes("本人認証") ||
    normalized.includes("SMS認証") ||
    normalized.includes("ワンタイムパスワード") ||
    normalized.includes("認証コード");

  const need3ds =
    !success &&
    !failed &&
    (
      has3dsForm ||
      has3dsFields ||
      has3dsIframe ||
      has3dsUrl ||
      has3dsHtml ||
      has3dsText
    );

  return {
    url,
    title,
    success,
    failed,
    need3ds,
    orderNo,
    error,

    signals: {
      form: has3dsForm,
      fields: has3dsFields,
      iframe: has3dsIframe,
      url: has3dsUrl,
      html: has3dsHtml,
      text: has3dsText
    },

    preview: normalized.slice(0, 500)
  };
})();
`
  );
}

async function waitOrderPaymentResult(
  wv,
  stopCheck,
  timeout
) {
  const started = Date.now();
  const limit =
    timeout || 5 * 60 * 1000;

  let announced3ds = false;
  let lastUrl = "";
  let stableSince = Date.now();

  while (
    Date.now() - started < limit
  ) {
    checkStop(stopCheck);

    let currentUrl = "";

    try {
      currentUrl = String(
        await getCurrentUrl(wv) || ""
      );
    } catch (_) {
      await Web.delay(300);
      continue;
    }

    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      stableSince = Date.now();

      Core.addLog(
        "Payment URL: " + currentUrl,
        "info"
      );

      await Web.delay(300);
      continue;
    }

    // Tránh đọc DOM khi trang đang redirect
    if (
      Date.now() - stableSince < 700
    ) {
      await Web.delay(200);
      continue;
    }

    let state;

    try {
      state =
        await getOrderPaymentState(wv);
    } catch (_) {
      await Web.delay(300);
      continue;
    }

    if (!state) {
      await Web.delay(300);
      continue;
    }

    if (state.success) {
      return {
        ok: true,
        reason: "BUY_OK",
        orderNo: state.orderNo || "",
        url: state.url || "",
        meta: state
      };
    }

    if (
      state.failed ||
      state.error
    ) {
      return {
        ok: false,
        reason: state.error
          ? "ORDER_SUBMIT_ERROR"
          : "PAYMENT_FAILED",
        error: state.error || "",
        meta: state
      };
    }

    if (
      state.need3ds &&
      !announced3ds
    ) {
      announced3ds = true;

      Core.addLog(
        "Phát hiện 3DS, hãy hoàn tất xác thực trên WebView",
        "warn"
      );

      Core.updateCurrent({
        step: "3DS",
        status:
          "Waiting for 3DS authentication"
      });
    }

    await Web.delay(500);
  }

  return {
    ok: false,
    reason: announced3ds
      ? "3DS_NOT_COMPLETED"
      : "ORDER_RESULT_TIMEOUT"
  };
}

// ============================================================
// FINAL ORDER
// ============================================================

async function submitOrder(
  wv,
  stopCheck
) {
  Core.addLog(
    "Submit order",
    "info"
  );

  const submitSelectors = [
    "#submitOrder",
    "button.submit-order",
    "a.submit-order",
    ".place-order",
    "button[name='submitOrder']",
    "form[name='dwfrm_placeOrder'] button[type='submit']",

    // Selector thực tế trên trang hiện tại
    "li.list02.next-step-button > a",
    "li.next-step-button > a",
    "ul.linkList li.list02 a",
    "ul.linkList li.next-step-button a"
  ];

  const before = await Web.evalJS(
    wv,
    `
(() => {
  const selectors =
    ${JSON.stringify(submitSelectors)};

  let button = null;
  let matchedSelector = "";

  for (const selector of selectors) {
    const element =
      document.querySelector(selector);

    if (element) {
      button = element;
      matchedSelector = selector;
      break;
    }
  }

  // Fallback theo nội dung chữ Nhật
  if (!button) {
    const candidates = [
      ...document.querySelectorAll(
        "a, button, input[type='submit']"
      )
    ];

    button = candidates.find(element => {
      const text = String(
        element.innerText ||
        element.textContent ||
        element.value ||
        ""
      ).trim();

      return (
        text.includes("注文を確定する") ||
        text.includes("注文確定")
      );
    }) || null;

    if (button) {
      matchedSelector =
        "TEXT:注文を確定する";
    }
  }

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

  return {
    hasButton: !!button,

    matchedSelector,

    buttonText:
      button
        ? String(
            button.innerText ||
            button.textContent ||
            button.value ||
            ""
          ).trim()
        : "",

    buttonTag:
      button
        ? button.tagName
        : "",

    href:
      button &&
      typeof button.getAttribute === "function"
        ? String(
            button.getAttribute("href") ||
            ""
          )
        : "",

    error:
      errorElement
        ? String(
            errorElement.innerText ||
            errorElement.textContent ||
            ""
          ).trim()
        : "",

    url:
      location.href
  };
})();
`
  );

  Core.addLog(
    "Submit button check: " +
      JSON.stringify(before || {}),
    "info"
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
        before.error,
      meta:
        before
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
        before || {}
    };
  }

  const oldUrl =
    await getCurrentUrl(wv);

  const tapped = await Web.evalJS(
    wv,
    `
(() => {
  const selectors =
    ${JSON.stringify(submitSelectors)};

  let element = null;
  let matchedSelector = "";

  for (const selector of selectors) {
    const candidate =
      document.querySelector(selector);

    if (candidate) {
      element = candidate;
      matchedSelector = selector;
      break;
    }
  }

  if (!element) {
    const candidates = [
      ...document.querySelectorAll(
        "a, button, input[type='submit']"
      )
    ];

    element = candidates.find(candidate => {
      const text = String(
        candidate.innerText ||
        candidate.textContent ||
        candidate.value ||
        ""
      ).trim();

      return (
        text.includes("注文を確定する") ||
        text.includes("注文確定")
      );
    }) || null;

    if (element) {
      matchedSelector =
        "TEXT:注文を確定する";
    }
  }

  if (!element) {
    return {
      ok: false,
      reason:
        "SUBMIT_ORDER_BUTTON_NOT_FOUND"
    };
  }

  try {
    element.disabled = false;
    element.removeAttribute(
      "disabled"
    );

    element.style.pointerEvents =
      "auto";

    element.scrollIntoView({
      block: "center",
      behavior: "auto"
    });

    element.focus();

    element.click();

    return {
      ok: true,
      matchedSelector,
      text: String(
        element.innerText ||
        element.textContent ||
        element.value ||
        ""
      ).trim()
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        String(
          error.message || error
        ),
      matchedSelector
    };
  }
})();
`
  );

  Core.addLog(
    "Submit button click: " +
      JSON.stringify(tapped || {}),
    tapped && tapped.ok
      ? "success"
      : "error"
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
        tapped || {}
    };
  }

  // Sau khi click có thể:
  //
  // 1. Redirect sang order complete
  // 2. Redirect sang trang 3DS
  // 3. Mở iframe 3DS
  // 4. Redirect nhiều lần
  //
  // Vì vậy không được verify ngay.
  
  await Web.delay(1500);
  
  return await waitOrderPaymentResult(
    wv,
    stopCheck,
    5 * 60 * 1000
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
        wv,
        stopCheck
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