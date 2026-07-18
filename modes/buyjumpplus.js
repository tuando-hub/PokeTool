// ================= BUY JUMP MODE =================

const Core = require("../core");
const JumpPlus = require("../services/jumpplus");
const JumpCS = require("../services/jumpcs");
const Session = require("../services/session");
const Web = require("../web");

let SELECTED_MODE = null;

function checkStop(stopCheck) {
  if (
    typeof stopCheck ===
    "function"
  ) {
    stopCheck();
  }
}

async function askJumpConfig() {
  let bearer =
    $cache.get(
      "jumpcs_bearer"
    );

  if (
    !bearer ||
    !String(bearer).trim()
  ) {
    bearer =
      await $input.text({
        placeholder:
          "Nhập Bearer"
      });

    if (!bearer) {
      throw new Error(
        "NO_BEARER"
      );
    }

    $cache.set(
      "jumpcs_bearer",
      String(
        bearer
      ).trim()
    );
  }

  let deviceId =
    $cache.get(
      "jumpcs_device_id"
    );

  if (
    !deviceId ||
    !String(deviceId).trim()
  ) {
    deviceId =
      await $input.text({
        placeholder:
          "Nhập Device ID"
      });

    if (!deviceId) {
      throw new Error(
        "NO_DEVICE_ID"
      );
    }

    $cache.set(
      "jumpcs_device_id",
      String(
        deviceId
      ).trim()
    );
  }
}

async function askMode() {
  const result =
    await $ui.menu({
      items: [
        "Create Jump+",
        "Buy Jump+"
      ]
    });

  console.log(
    "[JUMP MODE RAW]",
    JSON.stringify(result)
  );

  if (
    result === undefined ||
    result === null
  ) {
    throw new Error(
      "MODE_CANCELLED"
    );
  }

  let index = -1;

  // Trường hợp JSBox trả thẳng index
  if (
    typeof result ===
    "number"
  ) {
    index = result;
  }

  // Trường hợp trả object
  else if (
    typeof result ===
    "object"
  ) {
    if (
      typeof result.index ===
      "number"
    ) {
      index =
        result.index;
    } else if (
      typeof result.selectedIndex ===
      "number"
    ) {
      index =
        result.selectedIndex;
    }
  }

  // Trường hợp trả text
  else if (
    typeof result ===
    "string"
  ) {
    const value =
      result.trim()
        .toLowerCase();

    if (
      value.includes(
        "create"
      )
    ) {
      return "create";
    }

    if (
      value.includes(
        "buy"
      )
    ) {
      return "buy";
    }

    if (
      /^\d+$/.test(value)
    ) {
      index =
        Number(value);
    }
  }

  console.log(
    "[JUMP MODE INDEX]",
    index
  );

  if (index === 0) {
    return "create";
  }

  if (index === 1) {
    return "buy";
  }

  throw new Error(
    "INVALID_MODE_RESULT_" +
    JSON.stringify(result)
  );
}

function updateCurrent(
  acc,
  index,
  total,
  step,
  status
) {
  Core.updateCurrent({
    email:
      acc.email,

    step,
    status,
    index,
    total
  });
}

function createStepHandler(
  acc,
  index,
  total
) {
  return (
    step,
    status
  ) => {
    updateCurrent(
      acc,
      index,
      total,
      step,
      status
    );
  };
}

// ======================================================
// CREATE FLOW
// ======================================================

async function runCreateFlow({
  acc,
  index,
  total,
  stopCheck
}) {
  let webView = null;

  let jumpPlusResult = null;
  let cancelResult = null;
  let jumpCSResult = null;

  try {
    checkStop(
      stopCheck
    );

    // ==========================================
    // 1. TẠO ACCOUNT JUMP+ + MUA GÓI
    // ==========================================

    jumpPlusResult =
      await JumpPlus.registerAccount({
        email:
          acc.email,

        password:
          acc.pass,

        imapEmail:
          acc.imapEmail,

        imapPass:
          acc.imapPass,

        credit:
          acc.creditList,

        creditOwner:
          acc.creditOwnerList,

        stopCheck,

        onStep:
          createStepHandler(
            acc,
            index,
            total
          )
      });

    if (
      !jumpPlusResult ||
      !jumpPlusResult.ok
    ) {
      throw new Error(
        "JUMPPLUS_CREATE_FAILED"
      );
    }

    webView =
      jumpPlusResult.webView;

    if (!webView) {
      throw new Error(
        "JUMPPLUS_NO_WEBVIEW"
      );
    }

    // ==========================================
    // 2. HUỶ GÓI JUMP+
    // ==========================================

    updateCurrent(
      acc,
      index,
      total,
      "JUMPPLUS_CANCEL",
      "Cancel subscription"
    );

    cancelResult =
      await JumpPlus
        .cancelSubscription(
          webView,
          stopCheck
        );

    if (
      !cancelResult ||
      !cancelResult.ok
    ) {
      throw new Error(
        "JUMPPLUS_CANCEL_FAILED"
      );
    }

    

    // ==========================================
    // 4. TẠO ACCOUNT JUMPCS
    // LẤY TOÀN BỘ DATA TỪ PENDING
    // ==========================================

    updateCurrent(
      acc,
      index,
      total,
      "JUMPCS_CREATE",
      "Create JumpCS account"
    );

    jumpCSResult =
      await JumpCS.createAccount({
        email:
          acc.email,

        pass:
          acc.pass,

        imapEmail:
          acc.imapEmail,

        imapPass:
          acc.imapPass,

        names:
          acc.names,

        kanas:
          acc.kanas,

        phones:
          acc.phones,

        postcode:
          acc.postcode,

        pref:
          acc.pref,

        address1:
          acc.address1,

        address2:
          acc.address2,

        birthdate:
          acc.birthdate,

        webView,
        stopCheck,

        onStep:
          createStepHandler(
            acc,
            index,
            total
          )
      });

    if (
      !jumpCSResult ||
      !jumpCSResult.ok
    ) {
      throw new Error(
        "JUMPCS_CREATE_FAILED"
      );
    }

    updateCurrent(
      acc,
      index,
      total,
      "DONE",
      "Create Jump+ completed"
    );

    Core.addLog(
      "Create Jump+ thành công: " +
        acc.email,
      "success"
    );

    Core.playSuccessSound();

    return {
      ok: true,

      mode:
        "create",

      jumpPlusResult,
      cancelResult,
      jumpCSResult
    };

  } finally {
    if (webView) {
      updateCurrent(
        acc,
        index,
        total,
        "CLEANUP",
        "Clear session"
      );

      try {
        await Session
          .clearJumpSession(
            webView,
            stopCheck
          );
      } catch (error) {
        Core.addLog(
          "Clear session lỗi: " +
            String(
              error &&
              error.message
                ? error.message
                : error
            ),
          "warn"
        );
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

      webView = null;
    }
  }
}

// ======================================================
// BUY FLOW
// ======================================================

async function runBuyFlow({
  acc,
  index,
  total,
  stopCheck
}) {
  let webView = null;
  let jumpCSResult = null;

  try {
    checkStop(
      stopCheck
    );

    // BUY FLOW cần Bearer + Device ID
    await askJumpConfig();

    // ==========================================
    // 1. TẠO WEBVIEW CHO JUMPCS
    // KHÔNG LOGIN JUMP+ BẰNG WEBVIEW
    // ==========================================

    updateCurrent(
      acc,
      index,
      total,
      "WEBVIEW",
      "Create WebView"
    );

    webView = Web.create(
      "https://jumpcs.shueisha.co.jp/shop/customer/menu.aspx"
    );
    
    if (!webView) {
      throw new Error(
        "JUMPCS_WEBVIEW_CREATE_FAILED"
      );
    }
    
    await Web.waitPageReady(
      webView,
      30000
    );
    
    await Web.delay(
      1500
    );
    
    checkStop(
      stopCheck
    );

    // ==========================================
    // 2. LOGIN API + LẤY STORE URL
    // 3. LOGIN JUMPCS
    // 4. MỞ STORE URL + MUA HÀNG
    // ==========================================

    updateCurrent(
      acc,
      index,
      total,
      "JUMPCS_BUY",
      "Login JumpCS and purchase"
    );

    jumpCSResult =
      await JumpCS.buyAccount({
        email:
          acc.email,

        pass:
          acc.pass,

        productIds:
          acc.productIds,

        buyQty:
          acc.buyQty || "1",

        creditList:
          acc.creditList,

        creditOwnerList:
          acc.creditOwnerList,

        webView,
        stopCheck,

        onStep:
          createStepHandler(
            acc,
            index,
            total
          )
      });

    if (
      !jumpCSResult ||
      (
        !jumpCSResult.ok &&
        !jumpCSResult.pending
      )
    ) {
      throw new Error(
        "JUMPCS_PURCHASE_FAILED"
      );
    }

    updateCurrent(
      acc,
      index,
      total,
      jumpCSResult.ok
        ? "DONE"
        : "PENDING",

      jumpCSResult.ok
        ? "Buy completed"
        : "Order result pending"
    );

    if (
      jumpCSResult.ok
    ) {
      Core.addLog(
        "Buy Jump+ thành công: " +
          acc.email,
        "success"
      );

      Core.playSuccessSound();
    } else {
      Core.addLog(
        "Đã gửi đơn nhưng chưa xác định kết quả: " +
          acc.email,
        "warn"
      );
    }

    return {
      ok:
        Boolean(
          jumpCSResult.ok
        ),

      pending:
        Boolean(
          jumpCSResult.pending
        ),

      mode:
        "buy",

      orderId:
        jumpCSResult.orderId ||
        "",

      jumpCSResult
    };

  } finally {
    if (webView) {
      updateCurrent(
        acc,
        index,
        total,
        "CLEANUP",
        "Logout and clear session"
      );

      try {
        await Session
          .clearJumpSession(
            webView,
            stopCheck
          );
      } catch (error) {
        Core.addLog(
          "Clear session lỗi: " +
            String(
              error &&
              error.message
                ? error.message
                : error
            ),
          "warn"
        );
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

      webView = null;
    }
  }
}

// ======================================================
// MAIN
// ======================================================

async function runAccount({
  acc,
  index,
  total,
  stopCheck,
  mode
}) {
  checkStop(
    stopCheck
  );

  let selectedMode =
    String(
      mode || ""
    )
      .trim()
      .toLowerCase();
  
  if (
    selectedMode !== "create" &&
    selectedMode !== "buy"
  ) {
  
    if (!SELECTED_MODE) {
      SELECTED_MODE =
        await askMode();
    }
  
    selectedMode =
      SELECTED_MODE;
  }

  console.log(
    "[JUMP MODE SELECTED]",
    selectedMode
  );

  Core.addLog(
    "Selected mode: " +
      selectedMode,
    "info"
  );

  checkStop(
    stopCheck
  );

  if (
    selectedMode ===
    "create"
  ) {
    return await runCreateFlow({
      acc,
      index,
      total,
      stopCheck
    });
  }

  if (
    selectedMode ===
    "buy"
  ) {
    return await runBuyFlow({
      acc,
      index,
      total,
      stopCheck
    });
  }

  throw new Error(
    "INVALID_JUMP_MODE_" +
    selectedMode
  );
}

module.exports = {
  runAccount,
  askMode
};