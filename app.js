const Core = require("./core");
const UI = require("./ui");
const updater = require("./updater");

function start() {
  Core.init();
  UI.render();
  updater.check();
}

module.exports = {
  start
};