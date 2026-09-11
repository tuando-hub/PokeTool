// ================= WEB MANAGER - PokeTool V1.2 =================

const Core = require("./core");
const PAGE_TIMEOUT = 15000;

// ============================================================
// MULTI WKWEBVIEW RUNTIME
//
// Mỗi Web.create() tạo một WKWebView hoàn toàn riêng:
// - WKWebViewConfiguration riêng
// - WKProcessPool riêng
// - WKWebsiteDataStore.nonPersistentDataStore() riêng
//
// Không còn dùng một CURRENT_NATIVE_WEBVIEW global như UI cũ.
// ============================================================

const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
  "Version/26.5.2 Mobile/15E148 Safari/604.1";

const ACTIVE_WEBVIEWS = [];
let WEBVIEW_SEQ = 0;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function removeActiveWebView(wv) {
  const index = ACTIVE_WEBVIEWS.indexOf(wv);

  if (index >= 0) {
    ACTIVE_WEBVIEWS.splice(index, 1);
  }
}

function get() {
  if (!ACTIVE_WEBVIEWS.length) {
    return null;
  }

  return ACTIVE_WEBVIEWS[ACTIVE_WEBVIEWS.length - 1] || null;
}

function layoutActiveWebViews() {
  const host = $("webHost");

  if (!host) {
    return;
  }

  const width = host.frame && host.frame.width ? host.frame.width : 390;

  const height = host.frame && host.frame.height ? host.frame.height : 700;

  const list = ACTIVE_WEBVIEWS.filter(wv => wv && !wv._destroyed && wv._native);

  const count = list.length;

  if (!count) {
    return;
  }

  let columns = 1;
  let rows = 1;

  // 1 WK
  if (count === 1) {
    columns = 1;
    rows = 1;
  }

  // 2 WK
  else if (count === 2) {
    columns = 1;
    rows = 2;
  }

  // 3 - 4 WK
  else if (count <= 4) {
    columns = 2;
    rows = 2;
  }

  // 5 - 6 WK
  else if (count <= 6) {
    columns = 2;
    rows = 3;
  }

  // 7 - 8 WK
  else if (count <= 8) {
    columns = 2;
    rows = 4;
  }

  // 9 - 10 WK
  else {
    columns = 2;
    rows = 5;
  }

  const cellWidth = width / columns;

  const cellHeight = height / rows;

  list.forEach((wv, index) => {
    const col = index % columns;

    const row = Math.floor(index / columns);

    const frame = {
      x: col * cellWidth,

      y: row * cellHeight,

      width: cellWidth,

      height: cellHeight
    };

    try {
      wv._native.invoke("setFrame:", frame);
    } catch (error) {
      Core.addLog("WV layout error: " + String(error), "warn");
    }
  });
}

function create(url) {
  const initialUrl = String(url || "about:blank");
  const host = $("webHost");

  if (!host) {
    Core.addLog("webHost not found", "error");
    return null;
  }

  try {
    const WKWebViewConfiguration = $objc("WKWebViewConfiguration");
    const WKWebsiteDataStore = $objc("WKWebsiteDataStore");
    const WKProcessPool = $objc("WKProcessPool");
    const WKWebView = $objc("WKWebView");

    const config = WKWebViewConfiguration.invoke("alloc").invoke("init");
    const processPool = WKProcessPool.invoke("alloc").invoke("init");
    const dataStore = WKWebsiteDataStore.invoke("nonPersistentDataStore");

    if (!config || !processPool || !dataStore) {
      Core.addLog("WKWebView isolated config failed", "error");
      return null;
    }

    config.invoke("setProcessPool:", processPool);
    config.invoke("setWebsiteDataStore:", dataStore);

    const hostNative = host.runtimeValue();

    if (!hostNative) {
      Core.addLog("webHost runtimeValue failed", "error");
      return null;
    }

    const frame = {
      x: 0,
      y: 0,
      width: host.frame && host.frame.width ? host.frame.width : 390,
      height: host.frame && host.frame.height ? host.frame.height : 700
    };

    const nativeWV = WKWebView.invoke("alloc").invoke(
      "initWithFrame:configuration:",
      frame,
      config
    );

    if (!nativeWV) {
      Core.addLog("WKWebView create failed", "error");
      return null;
    }

    try {
      nativeWV.invoke("setCustomUserAgent:", SAFARI_UA);
    } catch (_) {}

    hostNative.invoke("addSubview:", nativeWV);

    const adapter = {
      _id: "WV" + ++WEBVIEW_SEQ,
      _native: nativeWV,
      _dataStore: dataStore,
      _processPool: processPool,
      _pageReady: false,
      _url: initialUrl,
      _destroyed: false,

      eval(options) {
        const opt = options || {};
        const handler =
          typeof opt.handler === "function" ? opt.handler : function () {};

        if (adapter._destroyed || !adapter._native) {
          handler(null);
          return;
        }

        try {
          const completion = $block("void, id, id", function (result, error) {
            if (error || result === null || result === undefined) {
              handler(null);
              return;
            }

            try {
              if (typeof result.rawValue === "function") {
                handler(result.rawValue());
                return;
              }
            } catch (_) {}

            handler(result);
          });

          nativeWV.invoke(
            "evaluateJavaScript:completionHandler:",
            String(opt.script || ""),
            completion
          );
        } catch (error) {
          Core.addLog("Native eval error: " + String(error), "error");
          handler(null);
        }
      },

      remove() {
        destroy(adapter);
      }
    };

    Object.defineProperty(adapter, "url", {
      get() {
        return adapter._url;
      },

      set(value) {
        if (!value || adapter._destroyed || !adapter._native) {
          return;
        }

        adapter._url = String(value);
        adapter._pageReady = false;

        try {
          const NSURL = $objc("NSURL");
          const NSURLRequest = $objc("NSURLRequest");
          const nsurl = NSURL.invoke("URLWithString:", adapter._url);
          const request = NSURLRequest.invoke("requestWithURL:", nsurl);
          nativeWV.invoke("loadRequest:", request);
        } catch (error) {
          Core.addLog("Native load error: " + String(error), "error");
        }
      }
    });

    ACTIVE_WEBVIEWS.push(adapter);

    layoutActiveWebViews();

    adapter.url = initialUrl;

    Core.addLog(
      "Native WKWebView created: " +
        adapter._id +
        " / active=" +
        ACTIVE_WEBVIEWS.length,
      "info"
    );

    return adapter;
  } catch (error) {
    Core.addLog("createWebView native error: " + String(error), "error");
    return null;
  }
}

function destroy(wv) {
  // Không truyền wv chỉ dùng cho tương thích code cũ.
  // Trong multi-worker, mọi cleanup phải truyền đúng adapter.
  const target = wv || get();

  if (!target || target._destroyed) {
    return;
  }

  target._destroyed = true;

  const nativeWV = target._native;

  try {
    if (nativeWV) {
      nativeWV.invoke("stopLoading");
    }
  } catch (_) {}

  try {
    if (nativeWV) {
      nativeWV.invoke("removeFromSuperview");
    }
  } catch (_) {}

  removeActiveWebView(target);

  target._native = null;
  target._dataStore = null;
  target._processPool = null;
  target._pageReady = false;
  target._url = "about:blank";

  layoutActiveWebViews();

  Core.addLog(
    "WebView Closed: " +
      String(target._id || "-") +
      " / active=" +
      ACTIVE_WEBVIEWS.length,
    "warn"
  );
}

function destroyAll() {
  const list = ACTIVE_WEBVIEWS.slice();

  for (const wv of list) {
    try {
      destroy(wv);
    } catch (_) {}
  }
}

function load(url, wv) {
  const target = wv || get();

  if (!target) {
    return create(url || "about:blank");
  }

  target.url = url || target.url || "about:blank";
  return target;
}

function getActiveCount() {
  return ACTIVE_WEBVIEWS.length;
}

function evalJS(wv, script) {
  return new Promise(resolve => {
    if (!wv) {
      resolve(null);
      return;
    }

    wv.eval({
      script,
      handler: resolve
    });
  });
}

async function waitVar(wv, varName, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 60000)) {
    const raw = await evalJS(wv, `window.${varName} || "";`);
    if (raw) return raw;
    await delay(500);
  }

  return "";
}

async function waitPageReady(wv, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || PAGE_TIMEOUT)) {
    if (wv && wv._pageReady) {
      return true;
    }

    try {
      const rs = await evalJS(wv, "document.readyState");

      if (rs === "interactive" || rs === "complete") {
        if (wv) {
          wv._pageReady = true;
        }

        return true;
      }
    } catch (e) {
      //
    }

    await delay(300);
  }

  Core.addLog("waitPageReady timeout", "warn");

  return false;
}

async function showNotify(wv, message, duration) {
  if (!wv) return;

  await evalJS(
    wv,
    `
(function(){
  let old = document.getElementById("jsbox-notify");
  if (old) old.remove();

  let div = document.createElement("div");
  div.id = "jsbox-notify";
  div.innerText = ${JSON.stringify(message)};
  div.style.cssText =
    "position:fixed;top:20px;left:50%;transform:translateX(-50%);" +
    "background:rgba(0,0,0,0.85);color:#fff;padding:12px 20px;" +
    "border-radius:10px;font-size:16px;z-index:999999;" +
    "box-shadow:0 4px 12px rgba(0,0,0,0.3);" +
    "max-width:90vw;text-align:center;";
  document.body.appendChild(div);

  setTimeout(() => {
    try { div.remove(); } catch(e) {}
  }, ${duration || 2000});
})();
  `
  );
}

async function tapButton(wv, selector) {
  return await evalJS(
    wv,
    `
(function(){
  const btn = document.querySelector(${JSON.stringify(selector)});
  if (!btn) return "NO_BUTTON";

  try {
    btn.disabled = false;
    btn.removeAttribute("disabled");
    btn.scrollIntoView({ block:"center" });
    btn.focus();
    btn.click();
  } catch(e) {}

  return "CLICKED";
})();
  `
  );
}

async function tapButton2(wv, selector, retry, wait) {
  retry = retry || 5;
  wait = wait || 3000;

  for (let i = 1; i <= retry; i++) {
    const rs = await tapButton(wv, selector);

    if (rs === "NO_BUTTON") {
      return false;
    }

    await delay(wait);

    const exists = await evalJS(
      wv,
      `
(function(){
  const btn = document.querySelector(${JSON.stringify(selector)});
  if (!btn) return false;

  const s = getComputedStyle(btn);
  const r = btn.getBoundingClientRect();

  return (
    s.display !== "none" &&
    s.visibility !== "hidden" &&
    s.opacity !== "0" &&
    r.width > 0 &&
    r.height > 0
  );
})();
    `
    );

    if (!exists) return true;
  }

  throw new Error("BUTTON_TIMEOUT");
}

async function exists(wv, selector) {
  return await evalJS(
    wv,
    `
!!document.querySelector(${JSON.stringify(selector)})
  `
  );
}

async function waitSelector(wv, selector, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 30000)) {
    const ok = await exists(wv, selector);
    if (ok) return true;
    await delay(500);
  }

  return false;
}

async function waitDisappear(wv, selector, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 30000)) {
    const ok = await exists(wv, selector);
    if (!ok) return true;
    await delay(500);
  }

  return false;
}

async function inputText(wv, selector, value) {
  return await evalJS(
    wv,
    `
(function(){
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return "NO_INPUT";

  el.focus();
  el.value = ${JSON.stringify(value || "")};

  el.dispatchEvent(new Event("input", { bubbles:true }));
  el.dispatchEvent(new Event("change", { bubbles:true }));

  return "OK";
})();
  `
  );
}

async function clearSession(wv) {
  if (!wv) return;

  Core.addLog("Clear session: " + String(wv._id || "-"), "warn");

  // Clear storage chỉ trong WKWebView hiện tại.
  try {
    await evalJS(
      wv,
      `
(async () => {
  try { localStorage.clear(); } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        try { await caches.delete(key); } catch (_) {}
      }
    }
  } catch (_) {}

  try {
    if (
      navigator.serviceWorker &&
      typeof navigator.serviceWorker.getRegistrations === "function"
    ) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try { await reg.unregister(); } catch (_) {}
      }
    }
  } catch (_) {}

  try {
    if (
      window.indexedDB &&
      typeof indexedDB.databases === "function"
    ) {
      const dbs = await indexedDB.databases();

      for (const db of dbs) {
        if (!db || !db.name) continue;

        await new Promise(resolve => {
          try {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          } catch (_) {
            resolve();
          }
        });
      }
    }
  } catch (_) {}

  return true;
})();
    `
    );
  } catch (_) {}

  // Quan trọng cho multi-worker:
  // clear đúng nonPersistentDataStore của wv này.
  // Không dùng defaultDataStore và không $http.clearCookies().
  try {
    const dataStore = wv._dataStore;

    if (dataStore) {
      const WKWebsiteDataStore = $objc("WKWebsiteDataStore");
      const NSDate = $objc("NSDate");
      const allTypes = WKWebsiteDataStore.invoke("allWebsiteDataTypes");
      const fromDate = NSDate.invoke("dateWithTimeIntervalSince1970:", 0);

      await new Promise(resolve => {
        let finished = false;

        const done = () => {
          if (finished) return;
          finished = true;
          resolve();
        };

        try {
          const completion = $block("void", done);

          dataStore.invoke(
            "removeDataOfTypes:modifiedSince:completionHandler:",
            allTypes,
            fromDate,
            completion
          );
        } catch (_) {
          done();
        }

        setTimeout(done, 5000);
      });
    }
  } catch (error) {
    console.log("[WEB] CLEAR WK DATA:", String(error));
  }

  try {
    if (wv._native && !wv._destroyed) {
      wv._native.invoke("stopLoading");
    }
  } catch (_) {}

  try {
    if (!wv._destroyed) {
      wv.url = "about:blank";
      await delay(200);
    }
  } catch (_) {}
}

async function hasTermsButton(wv) {
  return await evalJS(
    wv,
    `
(function(){
  const title = document.title || "";
  const btn = document.querySelector("#terms_button");
  return title.includes("利用規約再同意") || !!btn;
})();
  `
  );
}

async function acceptTermsIfNeeded(wv) {
  await evalJS(
    wv,
    `
(function(){
  const terms = document.querySelector("#terms");
  if (terms && !terms.checked) {
    terms.checked = true;
    terms.dispatchEvent(new Event("change", { bubbles:true }));
  }

  const privacy = document.querySelector("#privacyPolicy");
  if (privacy && !privacy.checked) {
    privacy.checked = true;
    privacy.dispatchEvent(new Event("change", { bubbles:true }));
  }

  const btn = document.querySelector("#terms_button");
  if (btn) {
    btn.disabled = false;
    btn.classList.remove("disabled");
    btn.click();
  }

  return true;
})();
  `
  );

  await waitPageReady(wv, 30000);
  await delay(1500);
}

async function waitVisible(wv, selector, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 30000)) {
    const ok = await evalJS(
      wv,
      `
(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;

  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();

  return (
    s.display !== "none" &&
    s.visibility !== "hidden" &&
    s.opacity !== "0" &&
    r.width > 0 &&
    r.height > 0
  );
})()
    `
    );

    if (ok) return true;

    await delay(300);
  }

  return false;
}

module.exports = {
  delay,
  get,
  create,
  destroy,
  destroyAll,
  load,

  getActiveCount,
  layoutActiveWebViews,

  evalJS,
  waitVar,
  waitPageReady,
  waitVisible,

  showNotify,
  tapButton,
  tapButton2,
  exists,
  waitSelector,
  waitDisappear,
  inputText,

  clearSession,
  hasTermsButton,
  acceptTermsIfNeeded
};
