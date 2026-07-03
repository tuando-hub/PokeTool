const Dashboard = require("./Dashboard");
const Data = require("./Data");
const Queue = require("./Queue");
const Browser = require("./Browser");
const Result = require("./Result");
const Settings = require("./Settings");

const TABS = ["Home", "Data", "Queue", "Browser", "Result", "Set"];
let CURRENT = 0;

function render() {
  $ui.render({
    props: {
      title: "PokeTool",
      bgcolor: $color("#0F172A")
    },
    views: [
      {
        type: "view",
        props: {
          id: "content",
          bgcolor: $color("#0F172A")
        },
        layout: make => {
          make.top.left.right.equalTo(0);
          make.bottom.inset(62);
        }
      },
      {
        type: "view",
        props: {
          id: "tabBar",
          bgcolor: $color("#111827")
        },
        layout: make => {
          make.left.right.bottom.equalTo(0);
          make.height.equalTo(62);
        }
      }
    ]
  });

  buildTabBar();
  renderTab(0);
}

function buildTabBar() {
  const bar = $("tabBar");

  for (let i = 0; i < TABS.length; i++) {
    bar.add({
      type: "button",
      props: {
        id: "tab_" + i,
        title: TABS[i],
        bgcolor: $color("clear"),
        titleColor: i === CURRENT ? $color("#FDE047") : $color("#94A3B8"),
        font: $font("bold", 11)
      },
      layout: make => {
        make.top.bottom.equalTo(0);
        make.left.equalTo(bar).offset(i * ($device.info.screen.width / TABS.length));
        make.width.equalTo($device.info.screen.width / TABS.length);
      },
      events: {
        tapped: () => renderTab(i)
      }
    });
  }
}

function clearContent() {
  const content = $("content");
  const views = content.views || [];

  for (let i = views.length - 1; i >= 0; i--) {
    views[i].remove();
  }
}

function refreshTabColor() {
  for (let i = 0; i < TABS.length; i++) {
    const btn = $("tab_" + i);
    if (!btn) continue;

    btn.titleColor =
      i === CURRENT
        ? $color("#FDE047")
        : $color("#94A3B8");
  }
}

function renderTab(index) {
  CURRENT = index;

  clearContent();
  refreshTabColor();

  const root = $("content");

  if (index === 0) Dashboard.render(root);
  if (index === 1) Data.render(root);
  if (index === 2) Queue.render(root);
  if (index === 3) Browser.render(root);
  if (index === 4) Result.render(root);
  if (index === 5) Settings.render(root);
}

module.exports = {
  render
};