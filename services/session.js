// ================= SESSION SERVICE =================

const Core = require("../core");
const Web = require("../web");

// Các domain cần mở lần lượt để xóa storage theo từng origin
const CLEAR_URLS = [
  "https://shonenjumpplus.com/",
  "https://www.shonenjumpplus.com/",
  "https://api.shonenjumpplus.com/",

  "https://jumpcs.shueisha.co.jp/",
  "https://id.shueisha.co.jp/",

  "https://www.sps-system.com/",
  "https://emvtds.sps-system.com/",
  "https://centinelapi.cardinalcommerce.com/"
];

function checkStop(stopCheck) {
  if (typeof stopCheck === "function") {
    stopCheck();
  }
}

// ======================================================
// COMMON CLEANUP
// ======================================================

async function cleanupAccount(
  wv,
  index,
  total,
  opt
) {
  opt = opt || {};

  const doLogout =
    opt.logout === true;

  const resetNetwork =
    opt.resetIP !== false;

  if (!wv) return;

  if (doLogout) {
    try {
      wv.url =
        "https://www.pokemoncenter-online.com/mypage/";

      await Web.waitPageReady(
        wv,
        15000
      );

      await Web.delay(1000);

      await Web.showNotify(
        wv,
        "(" +
          index +
          "/" +
          total +
          ") 🚪 Logout...",
        1500
      );

      await Web.tapButton(
        wv,
        "a.logout"
      );

      await Web.waitPageReady(
        wv,
        10000
      );

      Core.addLog(
        "Logout OK",
        "success"
      );

    } catch (_) {
      Core.addLog(
        "Logout skip",
        "warn"
      );
    }
  }

  try {
    await Web.clearSession(wv);
  } catch (_) {
    //
  }

  try {
    Web.destroy();
  } catch (_) {
    //
  }

  if (resetNetwork) {
    await resetIP();
  }
}

// ======================================================
// JUMP+ INFO
// ======================================================

async function getJumpMyInfo(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  const resultVar =
    "__JUMP_MY_" +
    Date.now();

  await Web.evalJS(wv, `
(() => {
  window.${resultVar} = "";

  try {
    fetch(
      "https://shonenjumpplus.com/my.json",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      }
    )
    .then(res => res.text())
    .then(text => {
      window.${resultVar} =
        JSON.stringify({
          ok: true,
          text
        });
    })
    .catch(error => {
      window.${resultVar} =
        JSON.stringify({
          ok: false,
          reason:
            String(
              error.message ||
              error
            )
        });
    });

    return "STARTED";

  } catch (error) {
    window.${resultVar} =
      JSON.stringify({
        ok: false,
        reason:
          String(
            error.message ||
            error
          )
      });

    return "ERROR";
  }
})();
  `);

  const started = Date.now();

  while (
    Date.now() - started <
    10000
  ) {
    const raw =
      await Web.evalJS(
        wv,
        `window.${resultVar} || ""`
      );

    if (raw) {
      const result =
        JSON.parse(raw);

      if (!result.ok) {
        throw new Error(
          "JUMP_MY_INFO_FAILED_" +
          result.reason
        );
      }

      return JSON.parse(
        result.text
      );
    }

    await Web.delay(300);
  }

  throw new Error(
    "JUMP_MY_INFO_TIMEOUT"
  );
}

// ======================================================
// JUMP+ LOGOUT
// ======================================================

async function logoutJump(
  wv,
  csrfToken,
  stopCheck
) {
  checkStop(stopCheck);

  const token =
    String(
      csrfToken || ""
    ).trim();

  if (!token) {
    throw new Error(
      "JUMP_LOGOUT_NO_CSRF"
    );
  }

  const resultVar =
    "__JUMP_LOGOUT_" +
    Date.now();

  await Web.evalJS(wv, `
(() => {
  window.${resultVar} = "";

  try {
    const body =
      new URLSearchParams();

    body.append(
      "return_location_path",
      "/"
    );

    body.append(
      "csrf_token",
      ${JSON.stringify(token)}
    );

    fetch(
      "https://shonenjumpplus.com/user_account/logout",
      {
        method: "POST",
        credentials: "include",
        redirect: "follow",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: body.toString()
      }
    )
    .then(res => {
      window.${resultVar} =
        JSON.stringify({
          ok:
            res.ok ||
            res.status === 302,
          status:
            res.status,
          url:
            res.url || ""
        });
    })
    .catch(error => {
      window.${resultVar} =
        JSON.stringify({
          ok: false,
          reason:
            String(
              error.message ||
              error
            )
        });
    });

    return "STARTED";

  } catch (error) {
    window.${resultVar} =
      JSON.stringify({
        ok: false,
        reason:
          String(
            error.message ||
            error
          )
      });

    return "ERROR";
  }
})();
  `);

  const started = Date.now();

  while (
    Date.now() - started <
    10000
  ) {
    const raw =
      await Web.evalJS(
        wv,
        `window.${resultVar} || ""`
      );

    if (raw) {
      const result =
        JSON.parse(raw);

      if (!result.ok) {
        throw new Error(
          "JUMP_LOGOUT_FAILED_" +
          (
            result.reason ||
            result.status
          )
        );
      }

      return true;
    }

    await Web.delay(300);
  }

  throw new Error(
    "JUMP_LOGOUT_TIMEOUT"
  );
}

async function ensureJumpLoggedOut(
  wv,
  stopCheck
) {
  const my =
    await getJumpMyInfo(
      wv,
      stopCheck
    );

  if (!my.logged_in) {
    return {
      loggedIn: false,
      loggedOut: false
    };
  }

  await logoutJump(
    wv,
    my.csrf_token,
    stopCheck
  );

  const after =
    await getJumpMyInfo(
      wv,
      stopCheck
    );

  if (
    after &&
    after.logged_in
  ) {
    throw new Error(
      "JUMP_LOGOUT_VERIFY_FAILED"
    );
  }

  return {
    loggedIn: true,
    loggedOut: true
  };
}

// ======================================================
// CLEAR CURRENT ORIGIN
// ======================================================

async function clearCurrentOrigin(
  wv,
  stopCheck
) {
  checkStop(stopCheck);

  return await Web.evalJS(wv, `
(async () => {
  const result = {
    origin:
      location.origin || "",
    localStorage: false,
    sessionStorage: false,
    cookies: 0,
    caches: 0,
    serviceWorkers: 0,
    indexedDB: 0
  };

  try {
    localStorage.clear();
    result.localStorage = true;
  } catch (_) {}

  try {
    sessionStorage.clear();
    result.sessionStorage = true;
  } catch (_) {}

  try {
    const cookies =
      document.cookie
        .split(";")
        .map(item =>
          item.trim()
        )
        .filter(Boolean);

    const host =
      location.hostname || "";

    const parts =
      host.split(".");

    const domains = [
      "",
      host,
      "." + host
    ];

    if (parts.length >= 2) {
      const root =
        parts.slice(-2).join(".");

      domains.push(
        root,
        "." + root
      );
    }

    const paths = [
      "/",
      location.pathname || "/"
    ];

    for (const item of cookies) {
      const name =
        item.split("=")[0].trim();

      for (const domain of domains) {
        for (const path of paths) {
          document.cookie =
            name +
            "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=" +
            path +
            (
              domain
                ? "; domain=" +
                  domain
                : ""
            );
        }
      }

      result.cookies++;
    }
  } catch (_) {}

  try {
    if (window.caches) {
      const keys =
        await caches.keys();

      for (const key of keys) {
        await caches.delete(key);
        result.caches++;
      }
    }
  } catch (_) {}

  try {
    if (
      navigator.serviceWorker &&
      navigator.serviceWorker
        .getRegistrations
    ) {
      const registrations =
        await navigator
          .serviceWorker
          .getRegistrations();

      for (
        const registration
        of registrations
      ) {
        await registration.unregister();
        result.serviceWorkers++;
      }
    }
  } catch (_) {}

  try {
    if (
      indexedDB &&
      typeof indexedDB.databases ===
        "function"
    ) {
      const databases =
        await indexedDB.databases();

      for (const database of databases) {
        if (!database.name) continue;

        await new Promise(resolve => {
          const request =
            indexedDB.deleteDatabase(
              database.name
            );

          request.onsuccess =
            resolve;

          request.onerror =
            resolve;

          request.onblocked =
            resolve;
        });

        result.indexedDB++;
      }
    }
  } catch (_) {}

  return result;
})();
  `);
}

// ======================================================
// CLEAR MULTIPLE DOMAINS
// ======================================================

async function clearJumpSession(
  wv,
  stopCheck
) {
  if (!wv) return;

  checkStop(stopCheck);

  // Logout Jump+ trước nếu session còn tồn tại
  try {
    wv.url =
      "https://shonenjumpplus.com/";

    await Web.waitPageReady(
      wv,
      15000
    );

    await Web.delay(500);

    const my =
      await getJumpMyInfo(
        wv,
        stopCheck
      );

    if (
      my &&
      my.logged_in &&
      my.csrf_token
    ) {
      await logoutJump(
        wv,
        my.csrf_token,
        stopCheck
      );
    }
  } catch (error) {
    console.log(
      "[SESSION] JUMP LOGOUT SKIP:",
      String(
        error.message ||
        error
      )
    );
  }

  // Xóa từng origin
  for (
    const url
    of CLEAR_URLS
  ) {
    checkStop(stopCheck);

    try {
      wv.url = url;

      await Web.waitPageReady(
        wv,
        12000
      );

      await Web.delay(400);

      const result =
        await clearCurrentOrigin(
          wv,
          stopCheck
        );

      console.log(
        "[SESSION] CLEARED:",
        JSON.stringify(result)
      );

    } catch (error) {
      console.log(
        "[SESSION] CLEAR SKIP:",
        url,
        String(
          error.message ||
          error
        )
      );
    }
  }

  /*
   * Xóa bằng hàm native của Web.
   * Phần này quan trọng vì JavaScript không thể
   * trực tiếp xóa cookie HttpOnly.
   */
  try {
    await Web.clearSession(wv);
  } catch (error) {
    console.log(
      "[SESSION] NATIVE CLEAR ERROR:",
      String(
        error.message ||
        error
      )
    );
  }

  try {
    wv.url = "about:blank";
    await Web.delay(500);
  } catch (_) {
    //
  }

  console.log(
    "[SESSION] MULTI DOMAIN CLEAR COMPLETE"
  );

  return true;
}

// ======================================================
// RESET IP
// ======================================================

async function resetIP() {
  console.log(
    "[SESSION] RESET IP START"
  );

  try {
    $app.openURL(
      "shortcuts://run-shortcut?name=" +
        encodeURIComponent(
          "Reset IP"
        )
    );

    await Web.delay(7500);

    console.log(
      "[SESSION] RESET IP OK"
    );

    return true;

  } catch (error) {
    console.log(
      "[SESSION] RESET IP ERROR:",
      String(
        error.message ||
        error
      )
    );

    return false;
  }
}

module.exports = {
  cleanupAccount,
  getJumpMyInfo,
  logoutJump,
  ensureJumpLoggedOut,
  clearCurrentOrigin,
  clearJumpSession,
  resetIP
};