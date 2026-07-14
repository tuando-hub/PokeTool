const Core = require("../core");
const Web = require("../web");

async function cleanupAccount(wv, index, total, opt) {
  opt = opt || {};

  const doLogout = opt.logout === true;
  const resetIP = opt.resetIP !== false;

  if (!wv) return;

  if (doLogout) {
    try {
      wv.url = "https://www.pokemoncenter-online.com/mypage/";
      await Web.waitPageReady(wv, 15000);
      await Web.delay(1000);

      await Web.showNotify(
        wv,
        "(" + index + "/" + total + ") 🚪 Logout...",
        1500
      );

      await Web.tapButton(wv, "a.logout");
      await Web.waitPageReady(wv, 10000);

      Core.addLog("Logout OK", "success");
    } catch (e) {
      Core.addLog("Logout skip", "warn");
    }
  }

  try {
    await Web.clearSession(wv);
  } catch (e) {
    //
  }

  try {
    Web.destroy();
  } catch (e) {
    //
  }

  if (resetIP) {
    try {
      $app.openURL(
        "shortcuts://run-shortcut?name=" +
          encodeURIComponent("Reset IP")
      );
      await Web.delay(7500);
    } catch (e) {
      //
    }
  }
}

module.exports = {
  cleanupAccount
};