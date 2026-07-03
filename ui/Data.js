const State = require("../core/State");

function render(root) {
  const state = State.get();

  root.add({
    type: "scroll",
    layout: $layout.fill,
    views: [
      {
        type: "label",
        props: {
          text: "Data Setup",
          font: $font("bold", 22)
        },
        layout: function(make) {
          make.top.left.inset(20);
          make.height.equalTo(32);
        }
      },
      {
        type: "label",
        props: {
          text: "Mode: " + state.mode,
          textColor: $color("#666")
        },
        layout: function(make) {
          make.top.equalTo(56);
          make.left.inset(20);
          make.height.equalTo(24);
        }
      },
      {
        type: "text",
        props: {
          id: "accountsText",
          text: state.data.accountsText,
          placeholder: "mail:pass\\nmail:pass",
          borderWidth: 1,
          borderColor: $color("#ddd"),
          radius: 8
        },
        layout: function(make) {
          make.top.equalTo(92);
          make.left.right.inset(16);
          make.height.equalTo(170);
        }
      },
      button("Paste Accounts", 276, pasteAccounts),
      button("Clear Accounts", 320, clearAccounts),
      input("imapEmail", "IMAP Email", state.data.imapEmail, 374),
      input("imapPass", "IMAP Pass", state.data.imapPass, 430),
      input("productIds", "Product IDs / Mode Input", state.data.productIds, 486),
      button("Save Setup", 550, saveSetup)
    ]
  });
}

function button(title, top, tapped) {
  return {
    type: "button",
    props: { title },
    layout: function(make) {
      make.top.equalTo(top);
      make.left.right.inset(16);
      make.height.equalTo(40);
    },
    events: { tapped }
  };
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

function pasteAccounts() {
  $("accountsText").text = $clipboard.text || "";
}

function clearAccounts() {
  $("accountsText").text = "";
}

function saveSetup() {
  State.saveData({
    accountsText: $("accountsText").text || "",
    imapEmail: $("imapEmail").text || "",
    imapPass: $("imapPass").text || "",
    productIds: $("productIds").text || ""
  });

  $ui.toast("Saved");
}

module.exports = {
  render
};