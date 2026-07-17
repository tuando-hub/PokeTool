// ================= BUY JUMP PLUS MODE =================

const Core = require("../core");
const JumpPlus = require("../services/jumpplus");
const JumpCS = require("../services/jumpcs");
const Session = require("../services/session");
const Web = require("../web");

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") {
    stopCheck();
  }
}

async function askJumpConfig() {
  let bearer = $cache.get("jumpcs_bearer");

  if (!bearer || !String(bearer).trim()) {
    bearer = await $input.text({
      placeholder: "Nhập Bearer"
    });

    if (!bearer) {
      throw new Error("NO_BEARER");
    }

    $cache.set(
      "jumpcs_bearer",
      String(bearer).trim()
    );
  }

  let deviceId = $cache.get("jumpcs_device_id");

  if (!deviceId || !String(deviceId).trim()) {
    deviceId = await $input.text({
      placeholder: "Nhập Device ID"
    });

    if (!deviceId) {
      throw new Error("NO_DEVICE_ID");
    }

    $cache.set(
      "jumpcs_device_id",
      String(deviceId).trim()
    );
  }
}

function updateCurrentCancel(
  acc,
  index,
  total
) {
  Core.updateCurrent({
    email: acc.email,
    step:
      "JUMPPLUS_CANCEL",
    status:
      "Cancel monthly subscription",
    index,
    total
  });
}

async function runAccount({
  acc,
  index,
  total,
  stopCheck
}) {
  checkStop(stopCheck);

  await askJumpConfig();

  let webView = null;
  let jumpPlusResult = null;
  let jumpCSResult = null;
  let cancelResult = null;

  try {
    // ==============================
    // 1. MUA GÓI JUMP+
    // ==============================

    jumpPlusResult =
      await JumpPlus.registerAccount({
        email: acc.email,
        password: acc.pass,

        imapEmail:
          acc.imapEmail,

        imapPass:
          acc.imapPass,

        credit:
          acc.creditList,

        creditOwner:
          acc.creditOwnerList,

        stopCheck,

        onStep(step, status) {
          Core.updateCurrent({
            email: acc.email,
            step,
            status,
            index,
            total
          });
        }
      });

    if (
      !jumpPlusResult ||
      !jumpPlusResult.ok ||
      !(
        jumpPlusResult.skipped ||
        (
          jumpPlusResult.purchaseResult &&
          jumpPlusResult.purchaseResult.ok
        )
      )
    ) {
      throw new Error(
        "JUMPPLUS_PURCHASE_NOT_SUCCESSFUL"
      );
    }

    webView =
      jumpPlusResult.webView;

    if (!webView) {
      throw new Error(
        "JUMPPLUS_NO_WEBVIEW"
      );
    }

    // ==============================
    // 2. MUA HÀNG JUMPCS
    // ==============================

    jumpCSResult =
      await JumpCS.run({
        email: acc.email,
        pass: acc.pass,

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

        onStep(step, status) {
          Core.updateCurrent({
            email: acc.email,
            step,
            status,
            index,
            total
          });
        }
      });

    if (
      !jumpCSResult ||
      (
        !jumpCSResult.ok &&
        !jumpCSResult.pending
      )
    ) {
      throw new Error(
        "JUMPCS_PURCHASE_NOT_SUCCESSFUL"
      );
    }

    // ==============================
    // 3. QUAY LẠI JUMP+ HUỶ GÓI
    // ==============================

    updateCurrentCancel(
      acc,
      index,
      total
    );

    cancelResult =
      await JumpPlus.cancelSubscription(
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

    Core.updateCurrent({
      email: acc.email,
      step: "DONE",
      status:
        "JumpCS purchased and subscription cancelled",
      index,
      total
    });

    Core.addLog(
      "JumpCS mua hàng và huỷ gói thành công: " +
        acc.email,
      "success"
    );

    Core.playSuccessSound();

    return {
      ok: true,
      reason:
        "JUMPCS_PURCHASE_AND_CANCEL_COMPLETED",

      meta: {
        jumpPlusResult,
        jumpCSResult,
        cancelResult
      }
    };

  } finally {
    // ==============================
    // 4. LOGOUT + CLEAR + CLOSE WV
    // ==============================

    if (webView) {
      Core.updateCurrent({
        email: acc.email,
        step: "CLEANUP",
        status:
          "Logout and clear session",
        index,
        total
      });

      try {
        await Session.clearJumpSession(
          webView,
          stopCheck
        );
      } catch (error) {
        Core.addLog(
          "Clear Jump session lỗi: " +
            String(
              error.message ||
              error
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

      Core.addLog(
        "WebView Closed và session đã clear",
        "success"
      );
    }
  }
}

module.exports = {
  runAccount
};