// ================= SESSION SERVICE - PokeTool V1.2 =================

const Core = require("../core");
const Web = require("../web");

async function cleanupAccount(wv, index, total) {
  if (!wv) return;

  try {
    await Web.showNotify(
      wv,
      "(" + index + "/" + total + ") 🚪 Logout...",
      1500
    );
  } catch (e) {
    //
  }

  try {
    await Web.tapButton(wv, "a.logout");
    await Web.waitPageReady(wv, 10000);
    Core.addLog("Logout OK", "success");
  } catch (e) {
    Core.addLog("Logout skip", "warn");
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

  try {
    $app.openURL(
      "shortcuts://run-shortcut?name=" +
        encodeURIComponent("Reset IP")
    );
    await Web.delay(6000);
  } catch (e) {
    //
  }
}

module.exports = {
  cleanupAccount
};