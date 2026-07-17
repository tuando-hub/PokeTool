// ======================================================
// OTP NORTH
// ======================================================

const API_BASE =
  "https://northdinhjpn.online/api";

const API_USERNAME =
  "Tuann1";

const API_PASSWORD =
  "123123";

const POLL_INTERVAL =
  3000;

const POLL_TIMEOUT =
  5 * 60 * 1000;

const HISTORY_LIMIT =
  5;

const ORDER_MAX_RETRY =
  3;

// Cache riêng cho từng username
const TOKEN_CACHE_KEY =
  "north_token_" +
  API_USERNAME;

// ======================================================
// TOKEN
// ======================================================

let accessToken =
  $cache.get(
    TOKEN_CACHE_KEY
  ) || "";

// Xóa cache cũ từng dùng chung
$cache.remove(
  "north_token"
);

// ======================================================
// UTILS
// ======================================================

function checkStop(fn) {
  if (
    typeof fn === "function"
  ) {
    fn();
  }
}

function delay(ms) {
  return new Promise(resolve => {
    $delay(
      ms / 1000,
      resolve
    );
  });
}

function getStatusCode(res) {
  try {
    return Number(
      res.response.statusCode
    );
  } catch (_) {
    return 0;
  }
}

function normalizePhone(value) {
  return String(
    value || ""
  )
    .replace(/\D/g, "")
    .trim();
}

function extractOtp(item) {
  if (!item) {
    return "";
  }

  const otp =
    String(
      item.otp || ""
    ).trim();

  if (
    /^\d{6}$/.test(otp)
  ) {
    return otp;
  }

  const sms =
    String(
      item.sms || ""
    );

  const match =
    sms.match(
      /(?:^|\D)(\d{6})(?:\D|$)/
    );

  return match
    ? match[1]
    : "";
}

function requestHeaders() {
  return {
    Accept: "*/*",
    "Cache-Control":
      "no-cache",
    Pragma:
      "no-cache"
  };
}

// ======================================================
// RESET TOKEN
// ======================================================

function resetToken() {
  accessToken = "";

  $cache.remove(
    TOKEN_CACHE_KEY
  );
}

// ======================================================
// LOGIN
// ======================================================

async function login(
  stopCheck,
  force = false
) {
  checkStop(stopCheck);

  if (
    accessToken &&
    !force
  ) {
    return accessToken;
  }

  if (force) {
    resetToken();
  }

  const url =
    API_BASE +
    "/login" +
    "?username=" +
    encodeURIComponent(
      API_USERNAME
    ) +
    "&password=" +
    encodeURIComponent(
      API_PASSWORD
    ) +
    "&t=" +
    Date.now();

  const res =
    await $http.get({
      url,
      timeout: 20,
      header:
        requestHeaders()
    });

  const data =
    res.data;

  if (
    getStatusCode(res) !== 200 ||
    !data ||
    data.status !== "success"
  ) {
    throw new Error(
      "OTPNORTH_LOGIN_FAILED"
    );
  }

  accessToken =
    String(
      data.token ||
      (
        data.data &&
        data.data.token
      ) ||
      ""
    ).trim();

  if (!accessToken) {
    throw new Error(
      "OTPNORTH_NO_TOKEN"
    );
  }

  $cache.set(
    TOKEN_CACHE_KEY,
    accessToken
  );

  console.log(
    "[OTPNORTH] LOGIN OK:",
    API_USERNAME
  );

  return accessToken;
}

// ======================================================
// GET HISTORY
// ======================================================

async function getHistory(
  stopCheck,
  retry = true
) {
  checkStop(stopCheck);

  try {
    const token =
      await login(
        stopCheck
      );

    const url =
      API_BASE +
      "/getHistory" +
      "?token=" +
      encodeURIComponent(
        token
      ) +
      "&t=" +
      Date.now();

    const res =
      await $http.get({
        url,
        timeout: 20,
        header:
          requestHeaders()
      });

    const data =
      res.data;

    if (
      getStatusCode(res) !== 200 ||
      !data ||
      data.status !== "success"
    ) {
      throw new Error(
        "OTPNORTH_HISTORY_RESPONSE_FAILED"
      );
    }

    return Array.isArray(
      data.history
    )
      ? data.history
      : [];

  } catch (error) {
    if (retry) {
      console.log(
        "[OTPNORTH] HISTORY RETRY"
      );

      resetToken();

      await login(
        stopCheck,
        true
      );

      return getHistory(
        stopCheck,
        false
      );
    }

    throw new Error(
      "OTPNORTH_HISTORY_FAILED_" +
      String(
        error &&
        error.message
          ? error.message
          : error
      )
    );
  }
}

// ======================================================
// ORDER — RETRY TỐI ĐA 3 LẦN
// ======================================================

async function order(
  stopCheck,
  maxRetry = ORDER_MAX_RETRY
) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= maxRetry;
    attempt++
  ) {
    checkStop(stopCheck);

    try {
      if (attempt > 1) {
        resetToken();

        await login(
          stopCheck,
          true
        );
      }

      const token =
        await login(
          stopCheck
        );

      const url =
        API_BASE +
        "/order" +
        "?token=" +
        encodeURIComponent(
          token
        ) +
        "&serviceId=335" +
        "&khoType=yma" +
        "&t=" +
        Date.now();

      console.log(
        "[OTPNORTH] ORDER " +
        attempt +
        "/" +
        maxRetry
      );

      const res =
        await $http.get({
          url,
          timeout: 20,
          header:
            requestHeaders()
        });

      const data =
        res.data;

      if (
        getStatusCode(res) === 200 &&
        data &&
        data.status === "success"
      ) {
        console.log(
          "[OTPNORTH] ORDER OK"
        );

        return data;
      }

      throw new Error(
        "ORDER_RESPONSE_FAILED_" +
        getStatusCode(res)
      );

    } catch (error) {
      lastError = error;

      console.log(
        "[OTPNORTH] ORDER ERROR:",
        String(
          error &&
          error.message
            ? error.message
            : error
        )
      );

      resetToken();

      if (
        attempt < maxRetry
      ) {
        console.log(
          "[OTPNORTH] RETRY SAU 3 GIÂY"
        );

        await delay(
          POLL_INTERVAL
        );
      }
    }
  }

  throw new Error(
    "OTPNORTH_ORDER_FAILED_AFTER_" +
    maxRetry +
    "_RETRIES_" +
    String(
      lastError &&
      lastError.message
        ? lastError.message
        : lastError ||
          "UNKNOWN"
    )
  );
}

// ======================================================
// WAIT PHONE
// ======================================================

async function waitPending(
  stopCheck
) {
  const started =
    Date.now();

  let attempt = 0;

  while (
    Date.now() - started <
    POLL_TIMEOUT
  ) {
    checkStop(stopCheck);

    attempt++;

    console.log(
      "[OTPNORTH] CHECK PHONE:",
      attempt
    );

    const history =
      await getHistory(
        stopCheck
      );

    const firstItems =
      history.slice(
        0,
        HISTORY_LIMIT
      );

    const item =
      firstItems.find(row => {
        if (!row) {
          return false;
        }

        const status =
          String(
            row.trangThai || ""
          ).trim();

        const rawPhone =
          String(
            row.sdt || ""
          ).trim();

        return (
          status ===
            "Đang chờ SMS..." &&
          rawPhone &&
          rawPhone !==
            "Đang xin số..."
        );
      });

    if (item) {
      const phone =
        normalizePhone(
          item.sdt
        );

      if (phone) {
        console.log(
          "[OTPNORTH] FOUND PHONE:",
          phone
        );

        return {
          phone,
          sdt: phone,

          pkey:
            String(
              item.pkey || ""
            ),

          item
        };
      }
    }

    const requesting =
      firstItems.find(row => {
        return (
          row &&
          String(
            row.trangThai || ""
          ).trim() ===
            "Đang chờ SMS..."
        );
      });

    if (requesting) {
      console.log(
        "[OTPNORTH] WAIT SERVER:",
        String(
          requesting.sdt || ""
        )
      );
    } else {
      console.log(
        "[OTPNORTH] ORDER CHƯA XUẤT HIỆN"
      );
    }

    await delay(
      POLL_INTERVAL
    );
  }

  return null;
}

// ======================================================
// WAIT OTP
// ======================================================

async function waitOtp(
  pkey,
  phone,
  stopCheck
) {
  const started =
    Date.now();

  const targetPhone =
    normalizePhone(
      phone
    );

  let attempt = 0;

  while (
    Date.now() - started <
    POLL_TIMEOUT
  ) {
    checkStop(stopCheck);

    attempt++;

    console.log(
      "[OTPNORTH] CHECK OTP:",
      attempt
    );

    const history =
      await getHistory(
        stopCheck
      );

    let item = null;

    if (pkey) {
      item =
        history.find(row => {
          return (
            row &&
            String(
              row.pkey || ""
            ) ===
              String(pkey)
          );
        });
    }

    if (!item) {
      item =
        history.find(row => {
          return (
            row &&
            normalizePhone(
              row.sdt
            ) === targetPhone
          );
        });
    }

    if (item) {
      const otp =
        extractOtp(
          item
        );

      if (otp) {
        console.log(
          "[OTPNORTH] FOUND OTP:",
          otp
        );

        return otp;
      }

      const status =
        String(
          item.trangThai || ""
        ).trim();

      if (
        status === "Đã hủy" ||
        status === "Hết hạn"
      ) {
        throw new Error(
          "OTPNORTH_" +
          status
        );
      }
    }

    await delay(
      POLL_INTERVAL
    );
  }

  return null;
}

// ======================================================
// ORDER + GET PHONE
// ======================================================

async function orderPhone(
  stopCheck
) {
  checkStop(stopCheck);

  console.log(
    "[OTPNORTH] START ORDER PHONE"
  );

  await order(
    stopCheck
  );

  console.log(
    "[OTPNORTH] ORDER DONE"
  );

  await delay(
    POLL_INTERVAL
  );

  console.log(
    "[OTPNORTH] START WAIT PHONE"
  );

  const pending =
    await waitPending(
      stopCheck
    );

  if (
    !pending ||
    !pending.phone
  ) {
    throw new Error(
      "OTPNORTH_NO_PHONE"
    );
  }

  console.log(
    "[OTPNORTH] PHONE READY:",
    pending.phone
  );

  return {
    phone:
      pending.phone,

    pkey:
      String(
        pending.pkey || ""
      )
  };
}

// ======================================================
// ORDER + GET PHONE + OTP
// ======================================================

async function getPhoneAndOtp(
  stopCheck
) {
  const phoneInfo =
    await orderPhone(
      stopCheck
    );

  const otp =
    await waitOtp(
      phoneInfo.pkey,
      phoneInfo.phone,
      stopCheck
    );

  if (!otp) {
    throw new Error(
      "OTPNORTH_OTP_TIMEOUT"
    );
  }

  return {
    phone:
      phoneInfo.phone,

    otp,

    pkey:
      phoneInfo.pkey
  };
}

async function getSms2(
  pkey,
  stopCheck,
  retry = true
) {
  checkStop(stopCheck);

  const targetPkey =
    String(pkey || "")
      .trim();

  if (!targetPkey) {
    throw new Error(
      "OTPNORTH_SMS2_PKEY_EMPTY"
    );
  }

  try {
    const token =
      await login(stopCheck);

    const url =
      API_BASE +
      "/getSms2" +
      "?token=" +
      encodeURIComponent(token) +
      "&pkey=" +
      encodeURIComponent(
        targetPkey
      ) +
      "&t=" +
      Date.now();

    const res =
      await $http.get({
        url,
        timeout: 20,
        header:
          requestHeaders()
      });

    const data =
      res.data;

    if (
      getStatusCode(res) !== 200 ||
      !data ||
      data.status !== "success"
    ) {
      throw new Error(
        "GET_SMS2_FAILED"
      );
    }

    console.log(
      "[OTPNORTH] GET SMS2 OK"
    );

    return true;

  } catch (error) {
    if (retry) {
      resetToken();

      await login(
        stopCheck,
        true
      );

      return getSms2(
        pkey,
        stopCheck,
        false
      );
    }

    throw new Error(
      "OTPNORTH_GET_SMS2_FAILED_" +
      String(
        error &&
        error.message
          ? error.message
          : error
      )
    );
  }
}

async function waitOtpSms2(
  pkey,
  stopCheck
) {
  await getSms2(
    pkey,
    stopCheck
  );

  return await waitOtp(
    pkey,
    "",
    stopCheck
  );
}

async function waitOtpNew(
  pkey,
  phone,
  oldOtp,
  stopCheck
) {
  const started =
    Date.now();

  const targetPkey =
    String(pkey || "")
      .trim();

  const targetPhone =
    normalizePhone(phone);

  const previousOtp =
    String(oldOtp || "")
      .trim();

  let attempt = 0;

  while (
    Date.now() - started <
    POLL_TIMEOUT
  ) {
    checkStop(stopCheck);

    attempt++;

    console.log(
      "[OTPNORTH] CHECK SMS2 OTP:",
      attempt
    );

    try {
      const history =
        await getHistory(
          stopCheck
        );

      let item = null;

      if (targetPkey) {
        item =
          history.find(row => {
            return (
              row &&
              String(
                row.pkey || ""
              ).trim() ===
                targetPkey
            );
          });
      }

      if (!item && targetPhone) {
        item =
          history.find(row => {
            return (
              row &&
              normalizePhone(
                row.sdt
              ) === targetPhone
            );
          });
      }

      if (item) {
        const otp =
          extractOtp(item);

        console.log(
          "[OTPNORTH] SMS2 HISTORY:",
          JSON.stringify({
            pkey:
              item.pkey || "",
            phone:
              item.sdt || "",
            status:
              item.trangThai || "",
            otp:
              otp || ""
          })
        );

        // Chỉ nhận OTP đủ 6 số
        // và khác OTP lần đầu
        if (
          /^\d{6}$/.test(otp) &&
          (
            !previousOtp ||
            otp !== previousOtp
          )
        ) {
          console.log(
            "[OTPNORTH] FOUND SMS2 OTP:",
            otp
          );

          return otp;
        }

        const status =
          String(
            item.trangThai || ""
          ).trim();

        if (
          status === "Đã hủy" ||
          status === "Hết hạn"
        ) {
          throw new Error(
            "OTPNORTH_" +
            status
          );
        }

        if (!otp) {
          console.log(
            "[OTPNORTH] SMS2 OTP CHƯA CẬP NHẬT"
          );
        } else if (
          otp === previousOtp
        ) {
          console.log(
            "[OTPNORTH] VẪN LÀ OTP CŨ:",
            otp
          );
        } else {
          console.log(
            "[OTPNORTH] OTP CHƯA HỢP LỆ:",
            otp
          );
        }
      } else {
        console.log(
          "[OTPNORTH] CHƯA TÌM THẤY SMS2 HISTORY"
        );
      }

    } catch (error) {
      const reason =
        String(
          error &&
          error.message
            ? error.message
            : error
        );

      // Stop hoặc trạng thái kết thúc thì ném lỗi
      if (
        reason.includes("Đã hủy") ||
        reason.includes("Hết hạn") ||
        reason === "__STOP__"
      ) {
        throw error;
      }

      // History chưa cập nhật hoặc request tạm lỗi:
      // không dừng flow, tiếp tục poll
      console.log(
        "[OTPNORTH] SMS2 HISTORY RETRY:",
        reason
      );
    }

    await delay(
      POLL_INTERVAL
    );
  }

  return null;
}


// ======================================================
// EXPORT
// ======================================================

module.exports = {
  login,
  order,
  orderPhone,
  getHistory,
  waitPending,
  waitOtp,
  waitOtpNew,
  getSms2,
  getPhoneAndOtp,
  resetToken
};