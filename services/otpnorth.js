// ======================================================
// OTP NORTH
// ======================================================

const API_BASE =
  "https://northdinhjpn.online/api";

const API_USERNAME =
  "Hongden";

const API_PASSWORD =
  "111111";

const POLL_INTERVAL =
  3000;

const POLL_TIMEOUT =
  5 * 60 * 1000;

const HISTORY_LIMIT = 5;

// ======================================================
// TOKEN
// ======================================================

let accessToken =
  $cache.get(
    "north_token"
  ) || "";

// ======================================================

function checkStop(fn) {
  if (
    typeof fn === "function"
  ) {
    fn();
  }
}

function delay(ms) {
  return new Promise(
    resolve => {
      $delay(
        ms / 1000,
        resolve
      );
    }
  );
}

function getStatusCode(
  res
) {
  try {
    return Number(
      res.response
        .statusCode
    );
  } catch (_) {
    return 0;
  }
}

function normalizePhone(
  phone
) {
  return String(
    phone || ""
  )
    .replace(/\D/g, "")
    .trim();
}

function extractOtp(
  item
) {
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
      timeout: 20
    });

  const data =
    res.data;

  if (
    getStatusCode(
      res
    ) !== 200 ||
    !data ||
    data.status !==
      "success"
  ) {
    throw new Error(
      "OTPNORTH_LOGIN_FAILED"
    );
  }

  accessToken =
    String(
      data.token || ""
    ).trim();

  if (!accessToken) {
    throw new Error(
      "OTPNORTH_NO_TOKEN"
    );
  }

  $cache.set(
    "north_token",
    accessToken
  );

  return accessToken;
}

// ======================================================
// HISTORY
// ======================================================

async function getHistory(
  stopCheck,
  retry = true
) {
  checkStop(stopCheck);

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
      timeout: 20
    });

  const data =
    res.data;

  if (
    getStatusCode(
      res
    ) !== 200 ||
    !data ||
    data.status !==
      "success"
  ) {
    if (retry) {
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
      "OTPNORTH_HISTORY_FAILED"
    );
  }

  return Array.isArray(
    data.history
  )
    ? data.history
    : [];
}

// ======================================================
// ORDER
// ======================================================

async function order(
  stopCheck,
  retry = true
) {
  checkStop(stopCheck);

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

  const res =
    await $http.get({
      url,
      timeout: 20
    });

  const data =
    res.data;

  if (
    getStatusCode(
      res
    ) !== 200 ||
    !data ||
    data.status !==
      "success"
  ) {
    if (retry) {
      resetToken();

      await login(
        stopCheck,
        true
      );

      return order(
        stopCheck,
        false
      );
    }

    throw new Error(
      "OTPNORTH_ORDER_FAILED"
    );
  }

  return data;
}

// ======================================================
// WAIT PENDING
// ======================================================

async function waitPending(
  stopCheck
) {
  const started =
    Date.now();

  while (
    Date.now() -
      started <
    POLL_TIMEOUT
  ) {
    checkStop(stopCheck);

    const history =
      await getHistory(
        stopCheck
      );

    const item =
      history
        .slice(
          0,
          HISTORY_LIMIT
        )
        .find(row => {
          if (!row) {
            return false;
          }
    
          const status =
            String(
              row.trangThai || ""
            ).trim();
    
          const phone =
            normalizePhone(
              row.sdt
            );
    
          return (
            status ===
              "Đang chờ SMS..." &&
            /^\d{11}$/.test(phone)
          );
        });

    if (
      item &&
      item.sdt
    ) {
      return {
        pkey:
          String(
            item.pkey ||
              ""
          ),
        sdt:
          normalizePhone(
            item.sdt
          ),
        item
      };
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

  phone =
    normalizePhone(
      phone
    );

  while (
    Date.now() -
      started <
    POLL_TIMEOUT
  ) {
    checkStop(stopCheck);

    const history =
      await getHistory(
        stopCheck
      );

    const item =
      history
        .slice(
          0,
          HISTORY_LIMIT
        )
        .find(row => {
          if (!row) {
            return false;
          }

          if (
            pkey &&
            String(
              row.pkey ||
                ""
            ) === pkey
          ) {
            return true;
          }

          return (
            normalizePhone(
              row.sdt
            ) === phone
          );
        });

    if (item) {
      const otp =
        extractOtp(
          item
        );

      if (otp) {
        return otp;
      }

      const status =
        String(
          item.trangThai ||
            ""
        ).trim();

      if (
        status ===
          "Đã hủy" ||
        status ===
          "Hết hạn"
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
  await order(
    stopCheck
  );

  // Order xong chờ server cấp số
  await delay(
    POLL_INTERVAL
  );

  const pending =
    await waitPending(
      stopCheck
    );

  if (
    !pending ||
    !pending.sdt
  ) {
    throw new Error(
      "OTPNORTH_NO_PHONE"
    );
  }

  const phone =
    normalizePhone(
      pending.sdt
    );

  if (!/^\d{11}$/.test(phone)) {
    throw new Error(
      "OTPNORTH_INVALID_PHONE_" +
      phone
    );
  }

  return {
    phone,
    pkey:
      String(
        pending.pkey || ""
      )
  };
}

// ======================================================
// GET PHONE + OTP
// ======================================================

async function getPhoneAndOtp(
  stopCheck
) {
  await order(
    stopCheck
  );

  // order xong đợi 3 giây
  await delay(
    POLL_INTERVAL
  );

  const pending =
    await waitPending(
      stopCheck
    );

  if (!pending) {
    throw new Error(
      "OTPNORTH_NO_PHONE"
    );
  }

  const otp =
    await waitOtp(
      pending.pkey,
      pending.sdt,
      stopCheck
    );

  if (!otp) {
    throw new Error(
      "OTPNORTH_OTP_TIMEOUT"
    );
  }

  return {
    phone:
      pending.sdt,
    otp,
    pkey:
      pending.pkey
  };
}

// ======================================================

function resetToken() {
  accessToken = "";
  $cache.remove(
    "north_token"
  );
}

module.exports = {
  login,
  order,
  orderPhone,
  getHistory,
  waitPending,
  waitOtp,
  getPhoneAndOtp,
  resetToken
};