// ================= WEB MANAGER - PokeTool V1.2 =================

const Core = require("./core");
const UI = require("./ui");

const PAGE_TIMEOUT = 15000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function get() {
  return UI.getWebView();
}

function create(url) {
  return UI.createWebView(url || "about:blank");
}

function destroy() {
  return UI.destroyWebView();
}

function load(url) {
  return UI.reloadWebView(url);
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

  if (wv) {
    wv._pageReady = false;
  }

  while (Date.now() - start < (timeout || PAGE_TIMEOUT)) {
    if (wv && wv._pageReady) {
      return true;
    }

    try {
      const rs = await evalJS(wv, "document.readyState");

      if (rs === "interactive" || rs === "complete") {
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

  await evalJS(wv, `
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
  `);
}

async function tapButton(wv, selector) {
  return await evalJS(wv, `
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
  `);
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

    const exists = await evalJS(wv, `
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
    `);

    if (!exists) return true;
  }

  throw new Error("BUTTON_TIMEOUT");
}

async function exists(wv, selector) {
  return await evalJS(wv, `
!!document.querySelector(${JSON.stringify(selector)})
  `);
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
  return await evalJS(wv, `
(function(){
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return "NO_INPUT";

  el.focus();
  el.value = ${JSON.stringify(value || "")};

  el.dispatchEvent(new Event("input", { bubbles:true }));
  el.dispatchEvent(new Event("change", { bubbles:true }));

  return "OK";
})();
  `);
}

async function clearSession(wv) {
  if (!wv) return;

  Core.addLog("Clear session start", "warn");

  try {
    wv.url = "https://www.pokemoncenter-online.com/logout/";
    await delay(2000);
  } catch (e) {
    //
  }

  await evalJS(wv, `
(async () => {
  try { localStorage.clear(); } catch(e) {}
  try { sessionStorage.clear(); } catch(e) {}

  try {
    document.cookie.split(";").forEach(c => {
      const name = c.split("=")[0].trim();

      ["", ".pokemoncenter-online.com", "www.pokemoncenter-online.com"]
        .forEach(domain => {
          document.cookie =
            name +
            "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" +
            (domain ? "; domain=" + domain : "");
        });
    });
  } catch(e) {}

  try {
    if (window.caches) {
      const keys = await caches.keys();
      for (const k of keys) {
        await caches.delete(k);
      }
    }
  } catch(e) {}

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        await r.unregister();
      }
    }
  } catch(e) {}

  return true;
})();
  `);

  await delay(1000);

  try {
    wv.url = "about:blank";
  } catch (e) {
    //
  }

  await delay(1000);

  Core.addLog("Clear session done", "success");
}

async function hasTermsButton(wv) {
  return await evalJS(wv, `
(function(){
  const title = document.title || "";
  const btn = document.querySelector("#terms_button");
  return title.includes("利用規約再同意") || !!btn;
})();
  `);
}

async function acceptTermsIfNeeded(wv) {
  await evalJS(wv, `
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
  `);

  await waitPageReady(wv, 30000);
  await delay(1500);
}

async function waitVisible(wv, selector, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 30000)) {
    const ok = await evalJS(wv, `
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
    `);

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
  load,

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