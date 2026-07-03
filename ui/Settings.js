const State = require("../core/State");

function render(root) {
  const c = State.get().config;

  root.add({
    type: "scroll",
    layout: $layout.fill,
    views: [
      {
        type: "label",
        props: {
          text: "Settings",
          font: $font("bold", 22)
        },
        layout: function(make) {
          make.top.left.inset(20);
          make.height.equalTo(32);
        }
      },
      input("loginRetry", "Login Retry", String(c.loginRetry), 80),
      input("otpTimeout", "OTP Timeout", String(c.otpTimeout), 136),
      input("delayStep", "Delay Step", String(c.delayStep), 192),
      input("resetShortcutName", "Reset Shortcut", c.resetShortcutName, 248),
      {
        type: "button",
        props: {
          title: "Save Settings"
        },
        layout: function(make) {
          make.top.equalTo(312);
          make.left.right.inset(16);
          make.height.equalTo(44);
        },
        events: {
          tapped: saveSettings
        }
      }
    ]
  });
}

function input(id, placeholder, text, top) {
  return {
    type: "input",
    props: {
      id,
      placeholder,
      text
    },
    layout: function(make) {
      make.top.equalTo(top);
      make.left.right.inset(16);
      make.height.equalTo(42);
    }
  };
}

function saveSettings() {
  const s = State.get();

  s.config.loginRetry = Number($("loginRetry").text || 3);
  s.config.otpTimeout = Number($("otpTimeout").text || 300000);
  s.config.delayStep = Number($("delayStep").text || 1500);
  s.config.resetShortcutName = $("resetShortcutName").text || "Reset IP";

  $ui.toast("Saved");
}

module.exports = {
  render
};