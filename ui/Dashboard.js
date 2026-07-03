const State = require("../core/State");
const EventBus = require("../core/EventBus");

const sw = $device.info.screen.width;
const CARD_W = sw - 32;

const COLORS = {
  bg: "#0F172A",
  card: "#1E293B",
  card2: "#111827",
  primary: "#2563EB",
  success: "#22C55E",
  danger: "#EF4444",
  warning: "#FDE047",
  text: "#FFFFFF",
  sub: "#94A3B8",
  line: "#334155"
};

function render(root) {
  root.add({
    type: "scroll",
    props: {
      id: "dashboardScroll",
      bgcolor: $color(COLORS.bg)
    },
    layout: $layout.fill,
    views: [
      headerView(),
      modeCard(),
      progressCard(),
      statsCard(),
      currentCard(),
      actionButtons(),
      logCard()
    ]
  });

  refresh();

  EventBus.on("STATE_CHANGE", refresh);
  EventBus.on("LOG_CHANGE", refresh);
}

function headerView() {
  const s = State.get();

  const logoSize = sw < 390 ? 52 : 60;
  const titleLeft = 18 + logoSize + 14;

  return {
    type: "view",
    props: {
      id: "headerView",
      bgcolor: $color(COLORS.card2),
      radius: 22
    },
    layout: make => {
      make.top.equalTo(18);
      make.left.equalTo(16);
      make.width.equalTo(CARD_W);
      make.height.equalTo(112);
    },
    views: [
      {
        type: "image",
        props: {
          src: "assets/IMG_3233.PNG",
          radius: 30
        },
        layout: make => {
          make.left.equalTo(18);
          make.centerY.equalTo();
          make.size.equalTo($size(logoSize, logoSize));
        }
      },
      {
        type: "label",
        props: {
          text: "PokeTool",
          textColor: $color(COLORS.warning),
          font: $font("bold", 28)
        },
        layout: make => {
          make.left.equalTo(titleLeft);
          make.top.equalTo(24);
          make.right.inset(18);
          make.height.equalTo(34);
        }
      },
      {
        type: "label",
        props: {
          text: "Pokemon Automation Suite",
          textColor: $color(COLORS.sub),
          font: $font(13)
        },
        layout: make => {
          make.left.equalTo(titleLeft);
          make.top.equalTo(58);
          make.right.inset(18);
          make.height.equalTo(22);
        }
      },
      {
        type: "label",
        props: {
          id: "versionLabel",
          text: "Version " + s.version,
          textColor: $color("#CBD5E1"),
          font: $font("bold", 12)
        },
        layout: make => {
          make.left.equalTo(titleLeft);
          make.top.equalTo(80);
          make.right.inset(18);
          make.height.equalTo(20);
        }
      }
    ]
  };
}

function modeCard() {
  return {
    type: "view",
    props: {
      id: "modeCard",
      bgcolor: $color(COLORS.card),
      radius: 20
    },
    layout: make => {
      make.top.equalTo($("headerView").bottom).offset(14);
      make.left.equalTo(16);
      make.width.equalTo(CARD_W);
      make.height.equalTo(78);
    },
    views: [
      {
        type: "label",
        props: {
          text: "Mode",
          font: $font("bold", 15),
          textColor: $color(COLORS.text)
        },
        layout: make => {
          make.left.equalTo(18);
          make.centerY.equalTo();
          make.width.equalTo(90);
          make.height.equalTo(30);
        }
      },
      {
        type: "button",
        props: {
          id: "modeBtn",
          title: State.get().mode,
          bgcolor: $color(COLORS.primary),
          titleColor: $color(COLORS.text),
          radius: 14,
          font: $font("bold", 15)
        },
        layout: make => {
          make.right.inset(18);
          make.centerY.equalTo();
          make.width.equalTo(180);
          make.height.equalTo(44);
        },
        events: {
          tapped: chooseMode
        }
      }
    ]
  };
}

function progressCard() {
  return {
    type: "view",
    props: {
      id: "progressCard",
      bgcolor: $color(COLORS.card),
      radius: 20
    },
    layout: make => {
      make.top.equalTo($("modeCard").bottom).offset(14);
      make.left.equalTo(16);
      make.width.equalTo(CARD_W);
      make.height.equalTo(96);
    },
    views: [
      {
        type: "label",
        props: {
          text: "Progress",
          font: $font("bold", 16),
          textColor: $color(COLORS.text)
        },
        layout: make => {
          make.top.left.inset(16);
          make.height.equalTo(24);
        }
      },
      {
        type: "label",
        props: {
          id: "progressText",
          text: "0 / 0",
          align: $align.right,
          font: $font("bold", 14),
          textColor: $color(COLORS.warning)
        },
        layout: make => {
          make.top.inset(16);
          make.right.inset(16);
          make.width.equalTo(120);
          make.height.equalTo(24);
        }
      },
      {
        type: "view",
        props: {
          id: "progressBg",
          bgcolor: $color("#334155"),
          radius: 6
        },
        layout: make => {
          make.left.right.inset(16);
          make.top.equalTo(54);
          make.height.equalTo(12);
        }
      },
      {
        type: "view",
        props: {
          id: "progressFill",
          bgcolor: $color(COLORS.success),
          radius: 6
        },
        layout: make => {
          make.left.equalTo(16);
          make.top.equalTo(54);
          make.width.equalTo(1);
          make.height.equalTo(12);
        }
      }
    ]
  };
}

function statsCard() {
  return {
    type: "view",
    props: {
      id: "statsCard",
      bgcolor: $color(COLORS.card),
      radius: 20
    },
    layout: make => {
      make.top.equalTo($("progressCard").bottom).offset(14);
      make.left.equalTo(16);
      make.width.equalTo(CARD_W);
      make.height.equalTo(128);
    },
    views: [
      statItem("statTotal", "Total", 0),
      statItem("statSuccess", "Success", 1),
      statItem("statFailed", "Failed", 2),
      statItem("statRetry", "Retry", 3),
      {
        type: "label",
        props: {
          id: "remainLabel",
          text: "Remain: 0",
          align: $align.center,
          font: $font("bold", 14),
          textColor: $color(COLORS.warning)
        },
        layout: make => {
          make.left.right.inset(16);
          make.bottom.inset(10);
          make.height.equalTo(24);
        }
      }
    ]
  };
}

function statItem(id, title, index) {
  const boxW = CARD_W / 4;

  return {
    type: "view",
    layout: make => {
      make.top.equalTo(18);
      make.left.equalTo(index * boxW);
      make.width.equalTo(boxW);
      make.height.equalTo(68);
    },
    views: [
      {
        type: "label",
        props: {
          id: id + "_value",
          text: "0",
          align: $align.center,
          font: $font("bold", 25),
          textColor: $color(COLORS.text)
        },
        layout: make => {
          make.top.left.right.equalTo(0);
          make.height.equalTo(36);
        }
      },
      {
        type: "label",
        props: {
          text: title,
          align: $align.center,
          font: $font(12),
          textColor: $color(COLORS.sub)
        },
        layout: make => {
          make.top.equalTo(38);
          make.left.right.equalTo(0);
          make.height.equalTo(24);
        }
      }
    ]
  };
}

function currentCard() {
  return {
    type: "view",
    props: {
      id: "currentCard",
      bgcolor: $color(COLORS.card),
      radius: 20
    },
    layout: make => {
      make.top.equalTo($("statsCard").bottom).offset(14);
      make.left.equalTo(16);
      make.width.equalTo(CARD_W);
      make.height.equalTo(188);
    },
    views: [
      {
        type: "label",
        props: {
          text: "Current Task",
          font: $font("bold", 18),
          textColor: $color(COLORS.text)
        },
        layout: make => {
          make.top.left.inset(16);
          make.height.equalTo(28);
        }
      },
      {
        type: "label",
        props: {
          id: "currentEmail",
          text: "-",
          font: $font("bold", 15),
          textColor: $color(COLORS.warning),
          lines: 1
        },
        layout: make => {
          make.top.equalTo(50);
          make.left.right.inset(16);
          make.height.equalTo(24);
        }
      },
      infoRow("rowStep", "STEP", "Idle", 82),
      infoRow("rowStatus", "STATUS", "Ready", 112),
      infoRow("rowElapsed", "ELAPSED", "00:00", 142)
    ]
  };
}

function infoRow(id, title, value, top) {
  return {
    type: "view",
    props: {
      id
    },
    layout: make => {
      make.top.equalTo(top);
      make.left.right.inset(16);
      make.height.equalTo(26);
    },
    views: [
      {
        type: "label",
        props: {
          text: title,
          font: $font("bold", 11),
          textColor: $color(COLORS.sub)
        },
        layout: make => {
          make.left.top.bottom.equalTo(0);
          make.width.equalTo(88);
        }
      },
      {
        type: "label",
        props: {
          id: id + "_value",
          text: value,
          font: $font(14),
          textColor: $color("#CBD5E1")
        },
        layout: make => {
          make.left.equalTo(92);
          make.right.top.bottom.equalTo(0);
        }
      }
    ]
  };
}

function actionButtons() {
  return {
    type: "view",
    props: {
      id: "actionBox"
    },
    layout: make => {
      make.top.equalTo($("currentCard").bottom).offset(16);
      make.left.equalTo(16);
      make.width.equalTo(CARD_W);
      make.height.equalTo(50);
    },
    views: [
      {
        type: "button",
        props: {
          title: "▶ RUN",
          bgcolor: $color(COLORS.success),
          titleColor: $color(COLORS.text),
          radius: 14,
          font: $font("bold", 16)
        },
        layout: make => {
          make.left.top.bottom.inset(0);
          make.width.equalTo((CARD_W - 14) / 2);
        },
        events: {
          tapped: runTapped
        }
      },
      {
        type: "button",
        props: {
          title: "■ STOP",
          bgcolor: $color(COLORS.danger),
          titleColor: $color(COLORS.text),
          radius: 14,
          font: $font("bold", 16)
        },
        layout: make => {
          make.right.top.bottom.inset(0);
          make.width.equalTo((CARD_W - 14) / 2);
        },
        events: {
          tapped: stopTapped
        }
      }
    ]
  };
}

function logCard() {
  return {
    type: "view",
    props: {
      id: "logCard",
      bgcolor: $color(COLORS.card),
      radius: 20
    },
    layout: make => {
      make.top.equalTo($("actionBox").bottom).offset(16);
      make.left.equalTo(16);
      make.width.equalTo(CARD_W);
      make.height.equalTo(230);
      make.bottom.inset(24);
    },
    views: [
      {
        type: "label",
        props: {
          text: "Recent Log",
          font: $font("bold", 18),
          textColor: $color(COLORS.text)
        },
        layout: make => {
          make.top.left.inset(16);
          make.height.equalTo(28);
        }
      },
      {
        type: "label",
        props: {
          id: "logText",
          text: "",
          lines: 0,
          font: $font(13),
          textColor: $color("#CBD5E1")
        },
        layout: make => {
          make.top.equalTo(52);
          make.left.right.inset(16);
          make.bottom.inset(12);
        }
      }
    ]
  };
}

function chooseMode() {
  const modes = [
    "create",
    "changeprofile",
    "changemail",
    "checkresult",
    "lottery",
    "changeprofileorder"
  ];

  $ui.menu({
    items: modes,
    handler: title => {
      State.setMode(title);
      State.addLog("Mode changed: " + title, "info");
      refresh();
    }
  });
}

function runTapped() {
  State.setRunning(true);

  State.updateStats({
    total: 0,
    success: 0,
    failed: 0,
    retry: 0,
    remain: 0
  });

  State.updateCurrent({
    index: 0,
    total: 0,
    email: "-",
    step: "Ready",
    status: "Run clicked",
    elapsed: "00:00"
  });

  State.addLog("RUN clicked", "success");
}

function stopTapped() {
  State.setRunning(false);

  State.updateCurrent({
    step: "Stopped",
    status: "Stop requested"
  });

  State.addLog("STOP clicked", "warn");
}

function refresh() {
  const s = State.get();

  setTitle("modeBtn", s.mode);
  setText("versionLabel", "Version " + s.version);

  setText("statTotal_value", String(s.stats.total));
  setText("statSuccess_value", String(s.stats.success));
  setText("statFailed_value", String(s.stats.failed));
  setText("statRetry_value", String(s.stats.retry));
  setText("remainLabel", "Remain: " + s.stats.remain);

  const total = s.stats.total || 0;
  const done = (s.stats.success || 0) + (s.stats.failed || 0);
  const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
  const fillW = Math.max(1, Math.floor((CARD_W - 32) * percent / 100));

  setText("progressText", done + " / " + total + " (" + percent + "%)");

  const fill = $("progressFill");
  if (fill) {
    fill.updateLayout(make => {
      make.width.equalTo(fillW);
    });
  }

  const c = s.current;

  setText("currentEmail", c.email || "-");
  setText("rowStep_value", c.step || "-");
  setText("rowStatus_value", c.status || "-");
  setText("rowElapsed_value", c.elapsed || "00:00");

  const logs = s.logs
    .slice(0, 8)
    .map(x => iconFor(x.type) + " " + x.time + "  " + x.text)
    .join("\n");

  setText("logText", logs || "No logs");
}

function iconFor(type) {
  if (type === "success") return "🟢";
  if (type === "warn") return "🟡";
  if (type === "error") return "🔴";
  return "🔵";
}

function setText(id, text) {
  const v = $(id);
  if (v) v.text = text;
}

function setTitle(id, text) {
  const v = $(id);
  if (v) v.title = text;
}

module.exports = {
  render
};