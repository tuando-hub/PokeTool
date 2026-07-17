// ================= UI - PokeTool Design V1.3 =================
// Giữ nguyên bố cục V1.2
// Tối ưu animation, refresh, button feedback và visual polish

const Core = require("./core");
const T = Core.THEME;

const sw = $device.info.screen.width;
//const sh = $device.info.screen.height;

const CARD_X = 12;
const CARD_W = sw - CARD_X * 2;
const STATUS_H = 28;
const TAB_H = 62;
const BOTTOM_H = STATUS_H + TAB_H;

let refreshTimer = null;
let lastProgressWidth = 1;
let lastTab = null;

let listenerRegistered = false;

let queueDirty = true;
let dashboardDirty = true;
let tabsDirty = true;
let resultDirty = true;

let cachedQueueResult = {
  pendingText: "No pending",
  doneText: "No done",
  failedText: "No failed"
};

const UI = {
  CARD_BG: "#111827",
  CARD_BG_SOFT: "#0F172A",
  CARD_BORDER: "#1F2937",

  INPUT_BG: "#0B1220",
  INPUT_BORDER: "#243044",

  TAB_BG: "#0F172A",
  TAB_ACTIVE_BG: "#1E293B",
  TAB_ACTIVE: "#FDE047",
  TAB_INACTIVE: "#64748B",

  TEXT: "#F8FAFC",
  TEXT_SOFT: "#CBD5E1",
  MUTED: "#94A3B8",

  RUN: "#10B981",
  STOP: "#EF4444",
  RESET: "#F59E0B"
};

let WEB_URL = "about:blank";
let g_importData = null;

// ============================================================
// PERFORMANCE / ANIMATION HELPERS
// ============================================================

function scheduleRefresh(changeType) {
  const type =
    typeof changeType === "string"
      ? changeType
      : "state";

  if (
    type === "queue" ||
    type === "result" ||
    type === "reset"
  ) {
    queueDirty = true;
    resultDirty = true;
  }

  if (
    type === "tab" ||
    type === "mode"
  ) {
    tabsDirty = true;
  }

  const state = Core.getState();

  if (state.tab === "Result") {
    queueDirty = true;
    resultDirty = true;
  }

  dashboardDirty = true;

  if (refreshTimer) {
    return;
  }

  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refresh();
  }, 16);
}

function pressFeedback(sender, handler) {
  if (typeof handler === "function") {
    try {
      handler();
    } catch (error) {
      Core.addLog(
        "Button error: " +
          String(error.message || error),
        "error"
      );
    }
  }

  if (!sender) return;

  try {
    sender.userInteractionEnabled = false;

    $ui.animate({
      duration: 0.07,

      animation: () => {
        sender.alpha = 0.72;
        sender.scale(0.97);
      },

      completion: () => {
        $ui.animate({
          duration: 0.1,

          animation: () => {
            sender.alpha = 1;
            sender.scale(1);
          },

          completion: () => {
            sender.userInteractionEnabled = true;
          }
        });
      }
    });
  } catch (error) {
    sender.alpha = 1;
    sender.userInteractionEnabled = true;
  }
}

function animateProgress(percent, force) {
  const fill =
    $("progressFill");

  if (!fill) return;

  const safePercent =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent) || 0
      )
    );

  const trackWidth =
    CARD_W - 44;

  const targetWidth =
    safePercent <= 0
      ? 1
      : Math.max(
          1,
          Math.round(
            trackWidth *
              safePercent /
              100
          )
        );

  if (
    !force &&
    targetWidth ===
      lastProgressWidth
  ) {
    return;
  }

  lastProgressWidth =
    targetWidth;

  try {
    fill.updateLayout(make => {
      make.width.equalTo(
        targetWidth
      );
    });

    if (
      fill.super &&
      typeof fill.super.layoutIfNeeded ===
        "function"
    ) {
      $ui.animate({
        duration: 0.18,

        animation: () => {
          fill.super.layoutIfNeeded();
        }
      });
    }
  } catch (error) {
    try {
      fill.updateLayout(make => {
        make.width.equalTo(
          targetWidth
        );
      });
    } catch (layoutError) {
      //
    }
  }
}

function blurAllInputs() {
  const form = Core.getState().form || {};

  Object.keys(form).forEach(key => {
    const element = $(key);

    if (element) {
      try {
        element.blur();
      } catch (error) {
        //
      }
    }
  });
}

// ============================================================
// MODE HELPERS
// ============================================================

function modeTitle(mode) {
  if (mode === "Lottery") return "🎯 Lottery";
  if (mode === "Buy") return "🛒 Buy";
  if (mode === "BuyJumpPlus") return "🛍 Buy Jump+";
  if (mode === "Create") return "🛠 Create";
  if (mode === "ChangeProfile") return "📝 Profile";
  if (mode === "ChangeEmail") return "📧 Change Email";
  if (mode === "CheckResult") return "🔍 Check Result";
  if (mode === "ChangeProfileOrder") return "📦 Profile Order";

  return mode || "Mode";
}

function modeMeta(mode) {
  const map = {
    Lottery: [
      "🎯",
      "Lottery",
      "応募・抽選"
    ],

    Buy: [
      "🛒",
      "Buy",
      "購入"
    ],
    
    BuyJumpPlus: [
      "🛍",
      "Buy Jump+",
      "JUMP購入"
    ],

    Create: [
      "🛠",
      "Create",
      "新規アカウント"
    ],

    ChangeProfile: [
      "📝",
      "Change Profile",
      "プロフィール変更"
    ],

    ChangeEmail: [
      "📧",
      "Change Email",
      "メール変更"
    ],

    CheckResult: [
      "🔍",
      "Check Result",
      "結果確認"
    ],

    ChangeProfileOrder: [
      "📦",
      "Change Profile Order",
      "注文住所変更"
    ]
  };

  return map[mode] || [
    "⚙️",
    mode || "Mode",
    ""
  ];
}

// ============================================================
// RENDER
// ============================================================

function render() {
  $ui.render({
    props: {
      title: "PokeTool",
      bgcolor: $color(T.bg)
    },

    views: [
      {
        type: "view",

        props: {
          id: "root",
          bgcolor: $color(T.bg)
        },

        layout: $layout.fill,

        views: [
          contentView(),
          webHost(),
          bottomDock()
        ]
      }
    ]
  });

  if (!listenerRegistered) {
    listenerRegistered = true;

    Core.onChange(change => {
      let type = "state";

      if (
        typeof change === "string"
      ) {
        type = change;
      } else if (
        change &&
        typeof change.type ===
          "string"
      ) {
        type = change.type;
      }

      scheduleRefresh(type);
    });
  }

  lastTab = null;
  queueDirty = true;
  resultDirty = true;
  dashboardDirty = true;
  tabsDirty = true;

  renderCurrentTab();
  refresh(true);
}

// ============================================================
// ROOT
// ============================================================

function webHost() {
  return {
    type: "view",

    props: {
      id: "webHost",
      hidden: true,
      bgcolor: $color(T.bg)
    },

    layout: make => {
      make.top.left.right.equalTo(0);
      make.bottom.inset(BOTTOM_H);
    },

    views: [
    ]
  };
}

function contentView() {
  return {
    type: "scroll",

    props: {
      id: "content",
      bgcolor: $color(T.bg),

      showsVerticalIndicator: true,
      showsHorizontalIndicator: false,

      alwaysBounceVertical: true,
      bounces: true,
      pagingEnabled: false,

      keyboardDismissMode: 1
    },

    layout: make => {
      make.top.left.right.equalTo(0);
      make.bottom.inset(BOTTOM_H);
    }
  };
}

function bottomDock() {
  return {
    type: "view",

    props: {
      id: "bottomDock",
      bgcolor: $color(UI.TAB_BG),

      borderWidth: 1,
      borderColor: $color(
        UI.CARD_BORDER
      )
    },

    layout: make => {
      make.left.right.bottom.equalTo(0);
      make.height.equalTo(BOTTOM_H);
    },

    views: [
      {
        type: "view",

        props: {
          bgcolor: $color("#0B1220")
        },

        layout: make => {
          make.top.left.right.equalTo(0);
          make.height.equalTo(STATUS_H);
        },

        views: [
          {
            type: "view",

            props: {
              id: "bottomStatusDot",
              bgcolor: $color(UI.RUN),
              radius: 4
            },

            layout: make => {
              make.left.equalTo(14);
              make.centerY.equalTo();
              make.size.equalTo(
                $size(8, 8)
              );
            }
          },

          {
            type: "label",

            props: {
              id: "bottomStatusText",

              text: "Ready",

              textColor: $color(
                UI.TEXT_SOFT
              ),

              font: $font(
                "bold",
                10
              ),

              minimumScaleFactor: 0.5,
              adjustsFontSizeToFitWidth: true
            },

            layout: make => {
              make.left.equalTo(28);
              make.right.inset(12);
              make.top.bottom.equalTo(0);
            }
          }
        ]
      },

      {
        type: "view",

        layout: make => {
          make.top.equalTo(STATUS_H);
          make.left.right.bottom.equalTo(0);
        },

        views: createTabButtons()
      }
    ]
  };
}

function createTabButtons() {
  const tabs = [
    ["Dashboard", "house.fill", "Home"],
    ["Data", "tray.full.fill", "Data"],
    ["Browser", "globe", "Web"],
    ["Result", "checkmark.circle.fill", "Result"]
  ];

  const width =
    sw / tabs.length;

  return tabs.map(
    (tab, index) => {
      return {
        type: "view",

        props: {
          id:
            "tabContainer_" +
            tab[0]
        },

        layout: make => {
          make.left.equalTo(
            index * width
          );

          make.top.bottom.equalTo(0);
          make.width.equalTo(width);
        },

        views: [
          {
            type: "view",

            props: {
              id:
                "tabIndicator_" +
                tab[0],

              bgcolor: $color(
                UI.TAB_ACTIVE
              ),

              radius: 1.5,
              hidden: true
            },

            layout: make => {
              make.top.equalTo(0);
              make.centerX.equalTo();
              make.width.equalTo(30);
              make.height.equalTo(3);
            }
          },

          {
            type: "image",

            props: {
              id:
                "tabIcon_" +
                tab[0],

              symbol: tab[1],
              tintColor: $color(
                UI.TAB_INACTIVE
              )
            },

            layout: make => {
              make.top.equalTo(8);
              make.centerX.equalTo();
              make.size.equalTo(
                $size(23, 23)
              );
            }
          },

          {
            type: "label",

            props: {
              id:
                "tabLabel_" +
                tab[0],

              text: tab[2],

              align: $align.center,

              textColor: $color(
                UI.TAB_INACTIVE
              ),

              font: $font(
                "bold",
                10
              )
            },

            layout: make => {
              make.top.equalTo(34);
              make.left.right.equalTo(0);
              make.height.equalTo(18);
            }
          },

          {
            type: "button",

            props: {
              id: "tab_" + tab[0],
              title: "",
              bgcolor: $color("clear")
            },

            layout: $layout.fill,

            events: {
              tapped(sender) {
                if (
                  Core.getState().tab ===
                  tab[0]
                ) {
                  return;
                }

                try {
                  sender.super.alpha =
                    0.65;

                  $ui.animate({
                    duration: 0.12,

                    animation: () => {
                      sender.super.alpha =
                        1;
                    }
                  });
                } catch (error) {
                  //
                }

                Core.setTab(tab[0]);

                tabsDirty = true;
                dashboardDirty = true;

                renderCurrentTab();
              }
            }
          }
        ]
      };
    }
  );
}

// ============================================================
// TAB SWITCH
// ============================================================

function clearContent() {
  const content = $("content");

  if (!content) return;

  const views = content.views || [];

  for (let index = views.length - 1; index >= 0; index--) {
    try {
      views[index].remove();
    } catch (error) {
      //
    }
  }
}

function renderCurrentTab() {
  const state =
    Core.getState();

  const content =
    $("content");

  const host =
    $("webHost");

  const browserSelected =
    state.tab === "Browser";

  if (host) {
    host.hidden =
      !browserSelected;
  }

  if (content) {
    content.hidden =
      browserSelected;
  }

  if (!content) {
    scheduleRefresh("tab");
    return;
  }

  if (browserSelected) {
    lastTab = "Browser";
    tabsDirty = true;
    scheduleRefresh("tab");
    return;
  }

  if (lastTab === state.tab) {
    tabsDirty = true;
    scheduleRefresh("tab");
    return;
  }

  blurAllInputs();

  lastTab = state.tab;

  clearContent();

  content.contentOffset =
    $point(0, 0);

  let pageView = null;
  let height = 900;

  switch (state.tab) {
    case "Dashboard":
      lastProgressWidth = -1;
    
      pageView =
        dashboardPage();
    
      height = 660;
      break;

    case "Data":
      pageView = dataPage();
      height = dataPageHeight();
      break;

    case "Result":
      pageView = resultPage();
      height = 940;
      resultDirty = true;
      queueDirty = true;
      break;
  }

  if (pageView) {
    content.add(pageView);

    content.contentSize =
      $size(sw, height);
  }

  dashboardDirty = true;
  tabsDirty = true;

  refresh(true);
}

// ============================================================
// DASHBOARD
// ============================================================

function dashboardPage() {
  return page(
    "dashboardPage",
    660,
    [
      headerCard(12),
      statsCard(112),
      progressCard(250),
      currentTaskCard(344),
      runCard(572)
    ]
  );
}

function headerCard(top) {
  const logoSize = 54;
  const titleLeft =
    18 + logoSize + 12;

  return card(
    "headerCard",
    top,
    88,
    [
      {
        type: "view",

        props: {
          bgcolor: $rgba(99, 102, 241, 0.12),
          radius: 31,

          borderWidth: 1,
          borderColor: $rgba(
            99,
            102,
            241,
            0.35
          )
        },

        layout: make => {
          make.left.equalTo(14);
          make.centerY.equalTo();
          make.size.equalTo(
            $size(62, 62)
          );
        }
      },

      {
        type: "image",

        props: {
          src: "assets/IMG_3233.PNG",
          radius: 27
        },

        layout: make => {
          make.left.equalTo(18);
          make.centerY.equalTo();
          make.size.equalTo(
            $size(
              logoSize,
              logoSize
            )
          );
        }
      },

      {
        type: "label",

        props: {
          text: "PokeTool",

          textColor: $color("#FDE047"),
          font: $font("bold", 25),

          lines: 1
        },

        layout: make => {
          make.left.equalTo(titleLeft);
          make.top.equalTo(20);

          make.width.equalTo(130);
          make.height.equalTo(30);
        }
      },

      {
        type: "label",

        props: {
          id: "versionText",

          text: "Version 3.0.0",

          textColor: $color(UI.TEXT_SOFT),
          font: $font("bold", 12)
        },

        layout: make => {
          make.left.equalTo(titleLeft);
          make.top.equalTo(52);

          make.width.equalTo(130);
          make.height.equalTo(18);
        }
      },

      {
        type: "button",

        props: {
          id: "modeBtn",

          title:
            modeTitle(
              Core.getState().mode
            ) + "  ▼",

          bgcolor: $color(
            UI.CARD_BG_SOFT
          ),

          titleColor: $color(
            UI.TEXT
          ),

          borderWidth: 1.2,
          borderColor: $color(
            "#6366F1"
          ),

          radius: 21,

          font: $font(
            "bold",
            sw < 390 ? 10 : 12
          ),

          minimumScaleFactor: 0.35,
          adjustsFontSizeToFitWidth: true
        },

        layout: make => {
          make.right.inset(14);
          make.centerY.equalTo();

          make.width.equalTo(
            sw < 390 ? 135 : 180
          );

          make.height.equalTo(42);
        },

        events: {
          tapped(sender) {
            pressFeedback(
              sender,
              showModeMenu
            );
          }
        }
      }
    ]
  );
}

function statsCard(top) {
  return card(
    "statsCard",
    top,
    124,
    [
      statBox(
        "statTotal",
        "Total",
        0,
        T.primary,
        "◉"
      ),

      statBox(
        "statWaiting",
        "Wait",
        1,
        T.warning,
        "◔"
      ),

      statBox(
        "statDone",
        "Done",
        2,
        T.success,
        "✓"
      ),

      statBox(
        "statFailed",
        "Fail",
        3,
        T.danger,
        "×"
      )
    ]
  );
}

function statBox(
  id,
  title,
  index,
  color,
  icon
) {
  const width = CARD_W / 4;

  return {
    type: "view",

    layout: make => {
      make.left.equalTo(
        index * width
      );

      make.top.bottom.equalTo(0);
      make.width.equalTo(width);
    },

    views: [
      index > 0
        ? {
            type: "view",

            props: {
              bgcolor: $color(
                UI.CARD_BORDER
              )
            },

            layout: make => {
              make.left.equalTo(0);
              make.top.inset(24);
              make.bottom.inset(24);
              make.width.equalTo(1);
            }
          }
        : {
            type: "view"
          },

      {
        type: "label",

        props: {
          text: icon,

          bgcolor: $color(color),
          textColor: $color("#FFFFFF"),

          align: $align.center,

          radius: 18,

          borderWidth: 1,
          borderColor: $rgba(
            255,
            255,
            255,
            0.15
          ),

          font: $font("bold", 16)
        },

        layout: make => {
          make.centerX.equalTo();
          make.top.equalTo(18);

          make.size.equalTo(
            $size(36, 36)
          );
        }
      },

      {
        type: "label",

        props: {
          id: id + "_value",

          text: "0",

          align: $align.center,

          font: $font("bold", 30),
          textColor: $color(color),

          minimumScaleFactor: 0.55,
          adjustsFontSizeToFitWidth: true
        },

        layout: make => {
          make.top.equalTo(56);
          make.left.right.equalTo(0);
          make.height.equalTo(36);
        }
      },

      {
        type: "label",

        props: {
          text: title,

          align: $align.center,

          font: $font("bold", 12),
          textColor: $color(
            UI.TEXT_SOFT
          )
        },

        layout: make => {
          make.top.equalTo(92);
          make.left.right.equalTo(0);
          make.height.equalTo(22);
        }
      }
    ]
  };
}

function progressCard(top) {
  return card(
    "progressCard",
    top,
    82,
    [
      {
        type: "label",

        props: {
          text: "Progress",

          textColor: $color(T.text),
          font: $font("bold", 21)
        },

        layout: make => {
          make.left.equalTo(18);
          make.top.equalTo(14);
          make.height.equalTo(26);
        }
      },

      {
        type: "label",

        props: {
          id: "progressText",

          text: "0%  •  0/0",

          align: $align.right,

          font: $font("bold", 18),
          textColor: $color("#FDE047")
        },

        layout: make => {
          make.top.equalTo(14);
          make.right.inset(20);

          make.width.equalTo(150);
          make.height.equalTo(26);
        }
      },

      {
        type: "view",

        props: {
          bgcolor: $color("#273449"),
          radius: 7,

          borderWidth: 1,
          borderColor: $rgba(
            148,
            163,
            184,
            0.1
          )
        },

        layout: make => {
          make.left.right.inset(22);
          make.top.equalTo(56);
          make.height.equalTo(14);
        }
      },

      {
        type: "view",

        props: {
          id: "progressFill",

          bgcolor: $color(T.success),
          radius: 7
        },

        layout: make => {
          make.left.equalTo(22);
          make.top.equalTo(56);

          make.width.equalTo(1);
          make.height.equalTo(14);
        }
      }
    ]
  );
}

function currentTaskCard(top) {
  return card(
    "currentCard",
    top,
    210,
    [
      {
        type: "label",

        props: {
          text: "Current Task",

          textColor: $color(T.text),
          font: $font("bold", 21)
        },

        layout: make => {
          make.left.equalTo(18);
          make.top.equalTo(14);
          make.height.equalTo(28);
        }
      },

      {
        type: "label",

        props: {
          id: "curIndex",

          text: "0 / 0  •  00:00",

          align: $align.right,

          textColor: $color(
            UI.MUTED
          ),

          font: $font(
            "bold",
            11
          )
        },

        layout: make => {
          make.right.inset(18);
          make.top.equalTo(17);
          make.width.equalTo(150);
          make.height.equalTo(22);
        }
      },

      {
        type: "label",

        props: {
          id: "curEmail",
          text: "-",

          textColor: $color(
            "#FDE047"
          ),

          font: $font(
            "bold",
            14
          ),

          minimumScaleFactor: 0.45,
          adjustsFontSizeToFitWidth: true
        },

        layout: make => {
          make.left.equalTo(18);
          make.top.equalTo(48);
          make.right.inset(18);
          make.height.equalTo(24);
        }
      },

      infoLine(
        "curMode",
        "MODE",
        78
      ),

      infoLine(
        "curStep",
        "STEP",
        114
      ),

      infoLine(
        "curStatus",
        "STATUS",
        150
      )
    ]
  );
}

function infoLine(
  id,
  label,
  top
) {
  const isStatus =
    id === "curStatus";

  return {
    type: "view",

    props: {
      bgcolor: $color(
        UI.CARD_BG_SOFT
      ),

      radius: 10,

      borderWidth: 1,
      borderColor: $rgba(
        148,
        163,
        184,
        0.08
      )
    },

    layout: make => {
      make.left.right.inset(16);
      make.top.equalTo(top);

      make.height.equalTo(
        isStatus ? 34 : 30
      );
    },

    views: [
      {
        type: "label",

        props: {
          text: label,

          textColor: $color(
            UI.MUTED
          ),

          font: $font("bold", 11)
        },

        layout: make => {
          make.left.equalTo(12);
          make.centerY.equalTo();

          make.width.equalTo(64);
          make.height.equalTo(22);
        }
      },

      {
        type: "view",

        props: {
          bgcolor: $color(
            UI.CARD_BORDER
          )
        },

        layout: make => {
          make.left.equalTo(76);
          make.centerY.equalTo();

          make.width.equalTo(1);
          make.height.equalTo(16);
        }
      },

      {
        type: "label",

        props: {
          id: id,

          text: "-",

          textColor: $color(
            UI.TEXT
          ),

          font: $font(
            isStatus ? 12 : 13
          ),

          lines: isStatus ? 2 : 1,

          minimumScaleFactor: 0.5,
          adjustsFontSizeToFitWidth: true
        },

        layout: make => {
          make.left.equalTo(88);
          make.right.inset(10);
          make.centerY.equalTo();

          make.height.equalTo(
            isStatus ? 30 : 24
          );
        }
      }
    ]
  };
}

function runCard(top) {
  return {
    type: "view",

    layout: make => {
      make.top.equalTo(top);
      make.left.right.inset(12);
      make.height.equalTo(58);
    },

    views: [
      actionButton(
        "▶ RUN",
        UI.RUN,
        0,
        3,
        () => {
          try {
            syncFormToCore();
        
            const form =
              Core.getState().form || {};
        
            const mailList =
              String(
                form.mailList || ""
              ).trim();
        
            if (!mailList) {
              $ui.alert(
                "MAIL LIST đang trống"
              );
        
              return;
            }
        
            const total =
              Core.saveQueueFromForm(
                form,
                Core.getState().mode
              );
        
            if (!total) {
              $ui.alert(
                "Không tạo được task"
              );
        
              return;
            }
        
            queueDirty = true;
            resultDirty = true;
            dashboardDirty = true;
        
            require("./runner").run();
          } catch (error) {
            Core.addLog(
              "Runner error: " +
                String(
                  error.message || error
                ),
              "error"
            );
        
            $ui.alert(
              String(
                error.message || error
              )
            );
          }
        }
      ),

      actionButton(
        "■ STOP",
        UI.STOP,
        1,
        3,
        () => {
          try {
            require("./runner").stop();
          } catch (error) {
            Core.setRunning(false);

            Core.addLog(
              "Stop clicked",
              "warn"
            );
          }
        }
      ),

      actionButton(
        "RESET",
        UI.RESET,
        2,
        3,
        () => {
          $ui.alert({
            title: "Reset progress?",
        
            message:
              "Pending, Done, Failed và Logs sẽ được xoá.\nDữ liệu trong form vẫn được giữ lại.",
        
            actions: [
              {
                title: "Cancel",
                style: "cancel"
              },
        
              {
                title: "Reset",
                style: "destructive",
        
                handler: () => {
                  const form = Object.assign(
                    {},
                    Core.getState().form || {}
                  );
        
                  Core.resetAll();
        
                  Object.keys(form).forEach(
                    key => {
                      Core.updateForm(
                        key,
                        form[key]
                      );
                    }
                  );
        
                  queueDirty = true;
                  resultDirty = true;
                  dashboardDirty = true;
        
                  Core.addLog(
                    "Progress reset",
                    "warn"
                  );
        
                  refresh(true);
                }
              }
            ]
          });
        }
      )
    ]
  };
}

function actionButton(
  title,
  color,
  index,
  count,
  handler
) {
  const gap = 10;

  const width =
    (
      sw -
      24 -
      gap * (count - 1)
    ) / count;

  return {
    type: "button",

    props: {
      title: title,

      bgcolor: $color(color),
      titleColor: $color("#FFFFFF"),

      radius: 17,

      borderWidth: 1,
      borderColor: $rgba(
        255,
        255,
        255,
        0.14
      ),

      font: $font("bold", 14)
    },

    layout: make => {
      make.left.equalTo(
        index * (width + gap)
      );

      make.top.bottom.equalTo(0);
      make.width.equalTo(width);
    },

    events: {
      tapped(sender) {
        pressFeedback(
          sender,
          handler
        );
      }
    }
  };
}

// ============================================================
// DATA PAGE
// ============================================================

function dataPage() {
  const sec = getModeSections(Core.getState().mode);

  const views = [
    sectionHeader("Data", 18),
    dataActions(58)
  ];

  let top = 128;

  // Account / IMAP
  views.push(
    dataSection(
      "sectionAccount",
      "Account / IMAP",
      top,
      [
        field(
          "imapEmail",
          "IMAP EMAIL",
          "imap@gmail.com",
          18,
          false
        ),
    
        field(
          "imapPass",
          "IMAP PASSWORD",
          "App Password",
          92,
          true
        ),
    
        area(
          "mailList",
          "MAIL LIST",
          "mail:pass",
          166,
          170
        )
      ],
      396
      )
    );
    
    top += 416;
    

  // Product
  if (sec.product) {
    views.push(
      dataSection(
        "sectionProduct",
        "Product",
        top,
        [
          field(
            "productIds",
            "PRODUCT IDS",
            "452132...,452...",
            12,
            false
          ),

          field(
            "buyQty",
            "BUY QTY",
            "1",
            78,
            false
          )
        ],
        196
      )
    );

    top += 216;
  }

  // Profile Data
  if (sec.profile) {
    views.push(
      dataSection(
        "sectionProfile",
        "Profile Data",
        top,
        [
          area("names", "NAMES", "Yamada Taro", 14, 88),
          area("kanas", "KANAS", "ヤマダ タロウ", 130, 88),
          area("phones", "PHONES", "090...", 246, 88),
          area("postcode", "POSTCODE", "1440000", 362, 88),
          area("pref", "PREF", "東京都", 478, 88),
          area("address1", "CITY", "大田区", 594, 88),
          area("address2", "ADDRESS", "1-2-3", 710, 88),
          area(
            "birthdate",
            "BIRTHDATE",
            "1997-12-11",
            826,
            88
          )
        ],
        974
      )
    );
  
    top += 994;
  }

  // Payment
  if (sec.payment) {
    views.push(
      dataSection(
        "sectionPayment",
        "Payment",
        top,
        [
          area(
            "creditOwnerList",
            "CARD OWNER",
            "YAMADA TARO",
            12,
            94
          ),

          area(
            "creditList",
            "CARD LIST",
            "number-mm/yy-cvv",
            130,
            108
          )
        ],
        292
      )
    );

    top += 312;
  }

  return page(
    "dataPage",
    top + 30,
    views
  );
}

function dataPageHeight() {
  const sec =
    getModeSections(
      Core.getState().mode
    );

  let top = 128;

  top += 416;

  if (sec.product) {
    top += 216;
  }

  if (sec.profile) {
    top += 994;
  }

  if (sec.payment) {
    top += 312;
  }

  return top + 30;
}

// ============================================================
// WEBVIEW
// ============================================================

function createWebView(url) {
  WEB_URL =
    url || "about:blank";

  const host = $("webHost");

  if (!host) {
    Core.addLog(
      "webHost not found",
      "error"
    );

    return null;
  }

  const old = $("mainWebView");

  if (old) {
    try {
      old.remove();
    } catch (error) {
      //
    }
  }

  host.add({
    type: "web",

    props: {
      id: "mainWebView",
      url: WEB_URL,

      bgcolor: $color("#FFFFFF")
    },

    layout: make => {
      make.top.left.right.bottom.equalTo(0);
    },

    events: {
      didStart(sender) {
        sender._pageReady = false;
      },

      didFinish(sender) {
        sender._pageReady = true;

        WEB_URL =
          sender.url ||
          WEB_URL;
      },

      didReceiveResponse(
        sender,
        response
      ) {
        try {
          const url =
            response.URL || "";

          if (
            url.includes(
              "/auth/login-status"
            ) ||
            url.includes(
              "/cart/get"
            ) ||
            url.includes(
              "/order/"
            ) ||
            url.includes(
              "/mypage"
            ) ||
            url.includes(
              "/lottery"
            ) ||
            url.includes(
              "/login-mfa"
            )
          ) {
            sender._pageReady = true;
          }
        } catch (error) {
          //
        }
      },

      didFail(sender, error) {
        sender._pageReady = false;

        Core.addLog(
          "WebView error: " +
            String(error),
          "error"
        );
      }
    }
  });

  return $("mainWebView");
}

function destroyWebView() {
  WEB_URL = "about:blank";

  const webView =
    $("mainWebView");

  if (webView) {
    try {
      webView.remove();
    } catch (error) {
      //
    }
  }

  Core.addLog(
    "WebView Closed",
    "warn"
  );
}

function reloadWebView(url) {
  let webView =
    $("mainWebView");

  if (!webView) {
    return createWebView(
      url || "about:blank"
    );
  }

  WEB_URL =
    url ||
    WEB_URL ||
    "about:blank";

  webView.url = WEB_URL;

  return webView;
}

function getWebView() {
  return $("mainWebView");
}

// ============================================================
// DATA ACTIONS
// ============================================================

function dataActions(top) {
  return {
    type: "view",

    layout: make => {
      make.top.equalTo(top);
      make.left.right.inset(16);
      make.height.equalTo(50);
    },

    views: [
      dataActionBtn(
        "📥 IMPORT",
        T.primary,
        0,
        importData
      ),

      dataActionBtn(
        "💾 SAVE",
        UI.RUN,
        1,
        () => {
          syncFormToCore();

          const total =
            Core.saveQueueFromForm(
              Core.getState().form,
              Core.getState().mode
            );

          Core.refreshStats();
          queueDirty = true;
          resultDirty = true;
          dashboardDirty = true;

          Core.addLog(
            "Data saved: " +
              total +
              " accounts",
            "success"
          );

          refresh();

          $ui.toast(
            "Saved: " + total
          );
        }
      )
    ]
  };
}

function dataActionBtn(
  title,
  color,
  index,
  handler
) {
  const gap = 12;

  const width =
    (
      sw -
      32 -
      gap
    ) / 2;

  return {
    type: "button",

    props: {
      title: title,

      bgcolor: $color(color),
      titleColor: $color("#FFFFFF"),

      radius: 16,

      borderWidth: 1,
      borderColor: $rgba(
        255,
        255,
        255,
        0.12
      ),

      font: $font("bold", 14)
    },

    layout: make => {
      make.left.equalTo(
        index * (width + gap)
      );

      make.top.bottom.equalTo(0);
      make.width.equalTo(width);
    },

    events: {
      tapped(sender) {
        pressFeedback(
          sender,
          handler
        );
      }
    }
  };
}

function syncFormToCore() {
  const form =
    Core.getState().form || {};

  Object.keys(form).forEach(key => {
    const element = $(key);

    if (element) {
      Core.updateForm(
        key,
        element.text || ""
      );
    }
  });

  Core.refreshStats();
}

function dataSection(
  id,
  title,
  top,
  children,
  height
) {
  return card(
    id,
    top,
    height,
    [
      titleLabel(
        title,
        16,
        12
      )
    ].concat(children)
  );
}

function field(id, title, placeholder, top, secure) {
  return {
    type: "view",

    layout: make => {
      make.top.equalTo(top + 30);
      make.left.right.inset(16);
      make.height.equalTo(58);
    },

    views: [
      {
        type: "label",

        props: {
          text: title,
          textColor: $color("#94A3B8"),
          font: $font("bold", 11)
        },

        layout: make => {
          make.left.equalTo(0);
          make.top.equalTo(0);
          make.height.equalTo(18);
        }
      },

      {
        type: "text",

        props: {
          id: id,
          text: Core.getState().form[id] || "",
          placeholder: placeholder,
          secure: secure,

          bgcolor: $color(UI.INPUT_BG),
          textColor: $color(T.text),

          radius: 13,
          borderWidth: 1,
          borderColor: $color(UI.INPUT_BORDER),

          font: $font(14),

          inset: $insets(
            6,
            12,
            6,
            12
          ),

          accessoryView: doneBar()
        },

        layout: make => {
          make.left.right.bottom.equalTo(0);
          make.height.equalTo(40);
        },

        events: {
          changed(sender) {
            Core.updateForm(
              id,
              sender.text || ""
            );
          },

          didBeginEditing(sender) {
            sender.borderColor =
              $color("#6366F1");
          },

          didEndEditing(sender) {
            sender.borderColor =
              $color(UI.INPUT_BORDER);
          }
        }
      }
    ]
  };
}

function area(id, title, placeholder, top, height) {
  return {
    type: "view",

    layout: make => {
      make.top.equalTo(top + 30);
      make.left.right.inset(16);
      make.height.equalTo(height + 24);
    },

    views: [
      {
        type: "label",

        props: {
          text: title,
          textColor: $color("#94A3B8"),
          font: $font("bold", 11),
          lines: 1
        },

        layout: make => {
          make.left.equalTo(0);
          make.top.equalTo(0);
          make.right.equalTo(0);
          make.height.equalTo(18);
        }
      },

      {
        type: "text",

        props: {
          id: id,
          text: Core.getState().form[id] || "",
          placeholder: placeholder,

          bgcolor: $color(UI.INPUT_BG),
          textColor: $color(T.text),

          radius: 13,
          borderWidth: 1,
          borderColor: $color(UI.INPUT_BORDER),

          font: $font("Menlo", 12),

          inset: $insets(
            9,
            12,
            9,
            12
          ),

          accessoryView: doneBar()
        },

        layout: make => {
          make.left.right.equalTo(0);
          make.top.equalTo(22);
          make.height.equalTo(height);
        },

        events: {
          changed(sender) {
            Core.updateForm(
              id,
              sender.text || ""
            );
          },

          didBeginEditing(sender) {
            sender.borderColor =
              $color("#6366F1");
          },

          didEndEditing(sender) {
            sender.borderColor =
              $color(UI.INPUT_BORDER);
          }
        }
      }
    ]
  };
}

// ============================================================
// BROWSER / RESULT
// ============================================================

function resultPage() {
  return page(
    "resultPage",
    900,
    [
      sectionHeader(
        "Result",
        18
      ),

      rowButtons(
        58,
        [
          [
            "Copy Done",
            UI.RUN,
            copyDone
          ],

          [
            "Retry Fail",
            UI.RESET,
            importFailToPending
          ],

          [
            "Copy Fail",
            T.primary,
            copyFail
          ]
        ]
      ),

      textBox(
        "Done Accounts",
        "resultDone",
        128
      ),

      textBox(
        "Failed Accounts",
        "resultFailed",
        378
      ),

      textBox(
        "Logs",
        "resultLogs",
        628
      )
    ]
  );
}

// ============================================================
// REFRESH
// ============================================================

function refresh(force) {
  const state =
    Core.getState();

  if (
    force ||
    tabsDirty
  ) {
    refreshTabs(state);
    tabsDirty = false;
  }

  if (
    force ||
    dashboardDirty
  ) {
    refreshDashboard(state);
    refreshStatus(state);
    dashboardDirty = false;
  }

  if (
    force ||
    (
      state.tab === "Result" &&
      (
        queueDirty ||
        resultDirty
      )
    )
  ) {
    refreshQueueResult(state);

    queueDirty = false;
    resultDirty = false;
  }
}

function refreshTabs(state) {
  const tabs = [
    "Dashboard",
    "Data",
    "Browser",
    "Result"
  ];

  tabs.forEach(tab => {
    const selected =
      state.tab === tab;

    const container =
      $("tabContainer_" + tab);

    const indicator =
      $("tabIndicator_" + tab);

    const icon =
      $("tabIcon_" + tab);

    const label =
      $("tabLabel_" + tab);

    if (container) {
      container.bgcolor =
        selected
          ? $color(
              UI.TAB_ACTIVE_BG
            )
          : $color("clear");
    }

    if (indicator) {
      indicator.hidden =
        !selected;
    }

    if (icon) {
      icon.tintColor =
        $color(
          selected
            ? UI.TAB_ACTIVE
            : UI.TAB_INACTIVE
        );
    }

    if (label) {
      label.textColor =
        $color(
          selected
            ? UI.TAB_ACTIVE
            : UI.TAB_INACTIVE
        );
    }
  });
}

function refreshDashboard(state) {
  setText(
    "versionText",
    "Version " + state.version
  );

  setTitle(
    "modeBtn",
    modeTitle(state.mode) +
      "  ▼"
  );

  setText(
    "statTotal_value",
    String(state.stats.total)
  );

  setText(
    "statWaiting_value",
    String(state.stats.waiting)
  );

  setText(
    "statDone_value",
    String(state.stats.done)
  );

  setText(
    "statFailed_value",
    String(state.stats.failed)
  );

  setText(
    "progressText",
    state.stats.percent +
      "%  •  " +
      (
        state.stats.done +
        state.stats.failed
      ) +
      "/" +
      state.stats.total
  );

  animateProgress(
    state.stats.percent,
    false
  );

  const current =
    state.current || {};

  setText(
    "curEmail",
    current.email || "-"
  );

  setText(
    "curMode",
    state.mode || "-"
  );

  setText(
    "curStep",
    current.step || "-"
  );

  setText(
    "curStatus",
    current.status || "-"
  );

  setText(
    "curIndex",
    (
      current.index || 0
    ) +
      " / " +
      (
        current.total || 0
      ) +
      "   •   " +
      (
        current.elapsed ||
        "00:00"
      )
  );
}

function refreshStatus(state) {
  const current =
    state.current || {};

  const finished =
    (
      state.stats.done || 0
    ) +
    (
      state.stats.failed || 0
    );

  const total =
    state.stats.total || 0;

  const status =
    current.status ||
    (
      state.running
        ? "Working"
        : "Idle"
    );

  setText(
    "bottomStatusText",

    (
      state.running
        ? "Running"
        : "Ready"
    ) +
      "  •  " +
      state.mode +
      "  •  " +
      finished +
      "/" +
      total +
      "  •  " +
      status
  );

  const dot =
    $("bottomStatusDot");

  if (dot) {
    dot.bgcolor =
      $color(
        state.running
          ? UI.RUN
          : "#64748B"
      );
  }
}

function refreshQueueResult(state) {
  const pending =
    Core.loadJSON(
      Core.FILE_PENDING,
      []
    );

  const done =
    Core.loadJSON(
      Core.FILE_DONE,
      []
    );

  const failed =
    Core.loadJSON(
      Core.FILE_FAILED,
      []
    );

  cachedQueueResult.pendingText =
    Core.listToAccountText(
      pending,
      state.mode
    ) || "No pending";

  cachedQueueResult.doneText =
    Array.isArray(done)
      ? done
          .map(item => {
            return (
              item.text ||
              [
                item.email || "",
                item.pass || ""
              ]
                .filter(Boolean)
                .join(":")
            );
          })
          .filter(Boolean)
          .join("\n") ||
        "No done"
      : "No done";

  cachedQueueResult.failedText =
    Array.isArray(failed)
      ? failed
          .map(item => {
            const account =
              [
                item.email || "",
                item.pass || ""
              ]
                .filter(Boolean)
                .join(":");

            const reason =
              item.reason || "";

            return (
              item.text ||
              (
                account +
                (
                  reason
                    ? "\t" + reason
                    : ""
                )
              )
            );
          })
          .filter(Boolean)
          .join("\n") ||
        "No failed"
      : "No failed";

  setText(
    "queuePending",
    cachedQueueResult.pendingText
  );

  setText(
    "queueDone",
    cachedQueueResult.doneText
  );

  setText(
    "queueFailed",
    cachedQueueResult.failedText
  );

  setText(
    "resultDone",
    cachedQueueResult.doneText
  );

  setText(
    "resultFailed",
    cachedQueueResult.failedText
  );

  const logs =
    (
      state.logs || []
    )
      .map(log => {
        return (
          logIcon(log.type) +
          " " +
          log.time +
          "  " +
          log.text
        );
      })
      .join("\n");

  setText(
    "resultLogs",
    logs || "No logs"
  );
}

// ============================================================
// MODE MENU
// ============================================================

function showModeMenu() {
  const modes =
    Core.MODES || [];

  const rowHeight = 66;

  $ui.push({
    props: {
      title: "Select Mode",
      bgcolor: $color(T.bg)
    },

    views: [
      {
        type: "label",

        props: {
          text: "Choose Mode",

          textColor: $color(
            T.text
          ),

          font: $font(
            "bold",
            24
          )
        },

        layout: make => {
          make.top.equalTo(18);
          make.left.equalTo(18);
          make.height.equalTo(32);
        }
      },

      {
        type: "view",

        props: {
          bgcolor: $color(
            UI.CARD_BG
          ),

          radius: 22,

          borderWidth: 1,
          borderColor: $color(
            UI.CARD_BORDER
          )
        },

        layout: make => {
          make.top.equalTo(64);
          make.left.right.inset(14);

          make.height.equalTo(
            modes.length *
              rowHeight +
              12
          );
        },

        views: modes.map(
          (mode, index) => {
            const metadata =
              modeMeta(mode);

            const selected =
              Core.getState().mode ===
              mode;

            return {
              type: "button",

              props: {
                title:
                  metadata[0] +
                  "  " +
                  metadata[1] +
                  (
                    selected
                      ? "   ✓"
                      : ""
                  ) +
                  "\n" +
                  metadata[2],

                bgcolor: $color(
                  selected
                    ? UI.TAB_ACTIVE_BG
                    : "clear"
                ),

                titleColor: $color(
                  selected
                    ? UI.TAB_ACTIVE
                    : "#E5E7EB"
                ),

                font: $font(
                  "bold",
                  14
                ),

                align: $align.left,
                radius: 14,

                borderWidth:
                  selected ? 1 : 0,

                borderColor:
                  selected
                    ? $rgba(
                        253,
                        224,
                        71,
                        0.16
                      )
                    : $color(
                        "clear"
                      ),

                contentEdgeInsets:
                  $insets(
                    8,
                    14,
                    8,
                    14
                  )
              },

              layout: make => {
                make.left.right.inset(
                  10
                );

                make.top.equalTo(
                  8 +
                    index *
                      rowHeight
                );

                make.height.equalTo(
                  rowHeight - 8
                );
              },

              events: {
                tapped(sender) {
                  pressFeedback(
                    sender,
                    () => {
                      Core.setMode(mode);
                      
                      queueDirty = true;
                      resultDirty = true;
                      dashboardDirty = true;
                      tabsDirty = true;
                      
                      Core.addLog(
                        "Mode changed: " +
                          mode,
                        "info"
                      );

                      $ui.pop();

                      lastTab = null;
                      renderCurrentTab();
                    }
                  );
                }
              }
            };
          }
        )
      }
    ]
  });
}

// ============================================================
// RESULT ACTIONS
// ============================================================

function copyDone() {
  const done =
    Core.loadJSON(
      Core.FILE_DONE,
      []
    );

  const text =
    Array.isArray(done)
      ? done
          .map(item => {
            return (
              item.email || ""
            );
          })
          .filter(Boolean)
          .join("\n")
      : "";

  if (!text) {
    $ui.toast("No done");
    return;
  }

  $clipboard.text = text;
  $ui.toast("Copied done");
}

function copyFail() {
  const failed =
    Core.loadJSON(
      Core.FILE_FAILED,
      []
    );

  const text =
    Array.isArray(failed)
      ? failed
          .map(item => {
            return (
              (
                item.email ||
                ""
              ) +
              ":" +
              (
                item.pass ||
                ""
              ) +
              "\t" +
              (
                item.reason ||
                ""
              )
            );
          })
          .filter(item => {
            return item.trim();
          })
          .join("\n")
      : "";

  if (!text) {
    $ui.toast("No failed");
    return;
  }

  $clipboard.text = text;
  $ui.toast("Copied fail");
}

// ============================================================
// IMPORT HELPERS
// ============================================================

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function findColumn(
  headers,
  keywords
) {
  for (
    let index = 0;
    index < headers.length;
    index++
  ) {
    const header =
      String(
        headers[index] ||
        ""
      ).toLowerCase();

    for (
      const keyword of keywords
    ) {
      if (
        header.includes(keyword)
      ) {
        return index;
      }
    }
  }

  return -1;
}

function getImportColumnMap(headers) {
  return {
    productIds: findColumn(
      headers,
      [
        "product_ids",
        "productids",
        "product",
        "sku"
      ]
    ),

    buyQty: findColumn(
      headers,
      [
        "buy_qty",
        "buyqty",
        "qty",
        "quantity"
      ]
    ),

    imapEmail: findColumn(
      headers,
      [
        "imap_email",
        "imapemail"
      ]
    ),

    imapPass: findColumn(
      headers,
      [
        "imap_pass",
        "imappass"
      ]
    ),

    mailList: findColumn(
      headers,
      [
        "mail_list",
        "maillist"
      ]
    ),

    name: findColumn(
      headers,
      [
        "full_name",
        "fullname",
        "name"
      ]
    ),

    kana: findColumn(
      headers,
      ["kana"]
    ),

    postcode: findColumn(
      headers,
      [
        "postcode",
        "zip"
      ]
    ),

    pref: findColumn(
      headers,
      ["pref"]
    ),

    city: findColumn(
      headers,
      ["city"]
    ),

    banchi: findColumn(
      headers,
      [
        "banchi",
        "address"
      ]
    ),

    phone: findColumn(
      headers,
      [
        "phone",
        "tel"
      ]
    ),

    birthdate: findColumn(
      headers,
      [
        "birthdate",
        "dob"
      ]
    ),

    creditOwner: findColumn(
      headers,
      [
        "card_owner",
        "cardowner"
      ]
    ),

    creditNumber: findColumn(
      headers,
      [
        "card_number",
        "cardnumber"
      ]
    ),

    creditExpire: findColumn(
      headers,
      [
        "card_expire",
        "cardexpire"
      ]
    ),

    creditCsv: findColumn(
      headers,
      [
        "card_csv",
        "cardcsv",
        "cvv",
        "cvc"
      ]
    )
  };
}

function parseSheetText(text) {
  const rows = [];

  let row = [];
  let cell = "";
  let quote = false;

  for (
    let index = 0;
    index < text.length;
    index++
  ) {
    const character =
      text[index];

    const next =
      text[index + 1];

    if (
      character === '"' &&
      quote &&
      next === '"'
    ) {
      cell += '"';
      index++;
      continue;
    }

    if (character === '"') {
      quote = !quote;
      continue;
    }

    if (
      (
        character === "\t" ||
        character === "," ||
        character === ";"
      ) &&
      !quote
    ) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (
      (
        character === "\n" ||
        character === "\r"
      ) &&
      !quote
    ) {
      if (
        character === "\r" &&
        next === "\n"
      ) {
        index++;
      }

      row.push(cell.trim());

      if (
        row.some(value => {
          return value !== "";
        })
      ) {
        rows.push(row);
      }

      row = [];
      cell = "";

      continue;
    }

    cell += character;
  }

  row.push(cell.trim());

  if (
    row.some(value => {
      return value !== "";
    })
  ) {
    rows.push(row);
  }

  return rows;
}

function parseImportData(text) {
  const rows =
    parseSheetText(text);

  if (rows.length < 2) {
    return [];
  }

  const headers =
    rows[0].map(value => {
      return normalizeHeader(value);
    });

  const map =
    getImportColumnMap(
      headers
    );

  const data = [];

  for (
    let rowIndex = 1;
    rowIndex < rows.length;
    rowIndex++
  ) {
    const cells =
      rows[rowIndex];

    const row = {};

    Object.keys(map).forEach(
      key => {
        const columnIndex =
          map[key];

        row[key] =
          columnIndex >= 0 &&
          cells[columnIndex]
            ? String(
                cells[
                  columnIndex
                ]
              ).trim()
            : "";
      }
    );

    if (
      Object.values(row).some(
        value => value
      )
    ) {
      data.push(row);
    }
  }

  return data;
}

function googleSheetCsvUrl(url) {
  const match =
    String(url || "").match(
      /\/spreadsheets\/d\/([^/]+)/
    );

  if (!match) {
    return "";
  }

  return (
    "https://docs.google.com/spreadsheets/d/" +
    match[1] +
    "/gviz/tq?tqx=out:csv&sheet=import"
  );
}

function httpGetText(url) {
  return new Promise(resolve => {
    $http.get({
      url: url,

      handler: response => {
        if (response.error) {
          resolve("");
          return;
        }

        let text = "";

        try {
          text =
            response.data &&
            response.data.string
              ? response.data.string
              : "";
        } catch (error) {
          //
        }

        if (!text) {
          try {
            text =
              response.rawData &&
              response.rawData.string
                ? response.rawData.string
                : "";
          } catch (error) {
            //
          }
        }

        if (
          !text &&
          typeof response.data ===
            "string"
        ) {
          text = response.data;
        }

        resolve(
          String(text || "")
            .replace(
              /^\uFEFF/,
              ""
            )
        );
      }
    });
  });
}

function setValue(id, text) {
  const value =
    text == null
      ? ""
      : String(text);

  Core.updateForm(id, value);

  const element = $(id);

  if (element) {
    element.text = value;
  }
}

function unique(list) {
  return [
    ...new Set(
      (list || []).filter(Boolean)
    )
  ];
}

function importData() {
  $input.text({
    type: $kbType.url,

    placeholder:
      "Dán link Google Sheet",

    handler: async url => {
      if (!url) return;

      const csvUrl =
        googleSheetCsvUrl(
          url.trim()
        );

      if (!csvUrl) {
        $ui.alert(
          "Link Google Sheet không hợp lệ"
        );

        return;
      }

      $ui.loading(true);

      try {
        const text =
          await httpGetText(csvUrl);

        if (!text.trim()) {
          $ui.alert(
            "Không đọc được dữ liệu từ sheet import"
          );

          return;
        }

        const data =
          parseImportData(text);

        if (!data.length) {
          $ui.alert(
            "Sheet không có dữ liệu hợp lệ"
          );

          return;
        }

        g_importData = data;

        $ui.alert({
          title:
            "📥 Import dữ liệu",

          message:
            "Import " +
            data.length +
            " dòng?\n" +
            "Pending/done/failed sẽ được xoá.",

          actions: [
            {
              title: "Huỷ",
              style: "cancel"
            },

            {
              title: "Import",

              handler: () => {
                importAllColumns(
                  true
                );
              }
            }
          ]
        });
      } finally {
        $ui.loading(false);
      }
    }
  });
}

function importAllColumns(
  clearProgress
) {
  if (
    !Array.isArray(
      g_importData
    ) ||
    !g_importData.length
  ) {
    $ui.toast(
      "No import data"
    );

    return;
  }

  const lists = {
    productIds: [],
    mailList: [],

    names: [],
    kanas: [],

    postcode: [],
    pref: [],
    address1: [],
    address2: [],

    phones: [],
    birthdate: [],

    creditOwnerList: [],
    creditList: []
  };

  let buyQty = "";
  let imapEmail = "";
  let imapPass = "";

  g_importData.forEach(row => {
    if (row.productIds) {
      lists.productIds.push(
        row.productIds
      );
    }

    if (row.mailList) {
      lists.mailList.push(
        row.mailList
      );
    }

    if (row.name) {
      lists.names.push(
        row.name
      );
    }

    if (row.kana) {
      lists.kanas.push(
        row.kana
      );
    }

    if (row.postcode) {
      lists.postcode.push(
        row.postcode
      );
    }

    if (row.pref) {
      lists.pref.push(
        row.pref
      );
    }

    if (row.city) {
      lists.address1.push(
        row.city
      );
    }

    if (row.banchi) {
      lists.address2.push(
        row.banchi
      );
    }

    if (row.phone) {
      lists.phones.push(
        row.phone
      );
    }

    if (row.birthdate) {
      lists.birthdate.push(
        row.birthdate
      );
    }

    if (row.creditOwner) {
      lists.creditOwnerList.push(
        row.creditOwner
      );
    }

    if (row.creditNumber) {
      lists.creditList.push(
        row.creditNumber +
          "-" +
          (
            row.creditExpire ||
            ""
          ) +
          "-" +
          (
            row.creditCsv ||
            ""
          )
      );
    }

    if (
      !buyQty &&
      row.buyQty
    ) {
      buyQty = row.buyQty;
    }

    if (
      !imapEmail &&
      row.imapEmail
    ) {
      imapEmail =
        row.imapEmail;
    }

    if (
      !imapPass &&
      row.imapPass
    ) {
      imapPass =
        row.imapPass;
    }
  });

  setValue(
    "buyQty",
    buyQty
  );

  setValue(
    "imapEmail",
    imapEmail
  );

  setValue(
    "imapPass",
    imapPass
  );

  setValue(
    "productIds",
    unique(
      lists.productIds
    ).join(", ")
  );

  setValue(
    "mailList",
    lists.mailList.join("\n")
  );

  setValue(
    "names",
    lists.names.join("\n")
  );

  setValue(
    "kanas",
    lists.kanas.join("\n")
  );

  setValue(
    "postcode",
    lists.postcode.join("\n")
  );

  setValue(
    "pref",
    lists.pref.join("\n")
  );

  setValue(
    "address1",
    lists.address1.join("\n")
  );

  setValue(
    "address2",
    lists.address2.join("\n")
  );

  setValue(
    "phones",
    lists.phones.join("\n")
  );

  setValue(
    "birthdate",
    lists.birthdate.join("\n")
  );

  setValue(
    "creditOwnerList",
    lists.creditOwnerList.join(
      "\n"
    )
  );

  setValue(
    "creditList",
    lists.creditList.join("\n")
  );

  if (clearProgress) {
    Core.saveJSON(
      Core.FILE_DONE,
      []
    );

    Core.saveJSON(
      Core.FILE_FAILED,
      []
    );
  }

  const total =
    Core.saveQueueFromForm(
      Core.getState().form,
      Core.getState().mode
    );

  Core.refreshStats();
  
  queueDirty = true;
  resultDirty = true;
  dashboardDirty = true;
  
  Core.addLog(
    "Imported: " +
      total +
      " accounts",
    "success"
  );
  
  refresh();
  
  $ui.toast(
    "Import OK: " + total
  );
}

function importFailToPending() {
  const failed =
    Core.loadJSON(
      Core.FILE_FAILED,
      []
    );

  if (
    !Array.isArray(failed) ||
    !failed.length
  ) {
    $ui.toast("No failed");
    return;
  }

  let retryAccounts = failed;

  if (
    Core.getState().mode ===
    "CheckResult"
  ) {
    retryAccounts =
      failed.filter(item => {
        return (
          String(
            item.reason || ""
          ).toUpperCase() ===
          "NOTMAIL"
        );
      });
  }

  if (!retryAccounts.length) {
    $ui.toast(
      "No retry target"
    );

    return;
  }

  const retryTasks =
    Core.buildTasksFromForm(
      Core.getState().form,
      Core.getState().mode,
      retryAccounts
    );

  const mailText =
    Core.listToAccountText(
      retryTasks,
      Core.getState().mode
    );

  Core.saveJSON(
    Core.FILE_PENDING,
    retryTasks
  );

  Core.saveJSON(
    Core.FILE_DONE,
    []
  );

  Core.saveJSON(
    Core.FILE_FAILED,
    []
  );

  Core.updateForm(
    "mailList",
    mailText
  );

  const mailList =
    $("mailList");

  if (mailList) {
    mailList.text = mailText;
  }

  Core.refreshStats();
  
  queueDirty = true;
  resultDirty = true;
  dashboardDirty = true;
  
  refresh();
  
  Core.addLog(
    "Failed imported to pending: " +
      retryTasks.length,
    "warn"
  );

  $ui.toast(
    "Imported: " +
      retryTasks.length
  );
}

function getModeSections(mode) {
  return {
    account: true,

    product:
      mode === "Lottery" ||
      mode === "Buy" ||
      mode === "CheckResult" ||
      mode === "BuyJumpPlus" ||
      mode === "ChangeProfileOrder",

    profile:
      mode === "Create" ||
      mode === "ChangeProfile" ||
      mode === "BuyJumpPlus" ||
      mode === "ChangeProfileOrder",

    payment:
      mode === "Buy" ||
      mode === "BuyJumpPlus",
  };
}

// ============================================================
// GENERIC UI HELPERS
// ============================================================

function page(
  id,
  height,
  views
) {
  return {
    type: "view",

    props: {
      id: id,
      bgcolor: $color(T.bg)
    },

    layout: make => {
      make.top.left.equalTo(0);
      make.width.equalTo(sw);
      make.height.equalTo(height);
    },

    views: views
  };
}

function card(
  id,
  top,
  height,
  views
) {
  return {
    type: "view",

    props: {
      id: id,

      bgcolor: $color(
        UI.CARD_BG
      ),

      radius: 20,

      borderWidth: 1,
      borderColor: $color(
        UI.CARD_BORDER
      )
    },

    layout: make => {
      make.top.equalTo(top);
      make.left.right.inset(
        CARD_X
      );

      make.height.equalTo(height);
    },

    views: views
  };
}

function titleLabel(
  text,
  left,
  top
) {
  return {
    type: "label",

    props: {
      text: text,

      textColor: $color(T.text),
      font: $font("bold", 17)
    },

    layout: make => {
      make.left.equalTo(left);
      make.top.equalTo(top);
      make.height.equalTo(26);
    }
  };
}

function sectionHeader(
  text,
  top
) {
  return {
    type: "label",

    props: {
      text: text,

      textColor: $color(T.text),
      font: $font("bold", 24)
    },

    layout: make => {
      make.top.equalTo(top);
      make.left.equalTo(18);
      make.height.equalTo(32);
    }
  };
}

function rowButtons(
  top,
  buttons
) {
  return {
    type: "view",

    layout: make => {
      make.top.equalTo(top);
      make.left.right.inset(16);
      make.height.equalTo(52);
    },

    views: buttons.map(
      (button, index) => {
        return smallBtn(
          button[0],
          button[1],
          index,
          button[2]
        );
      }
    )
  };
}

function smallBtn(
  title,
  color,
  index,
  handler
) {
  const gap = 10;

  const width =
    (
      sw -
      32 -
      gap * 2
    ) / 3;

  return {
    type: "button",

    props: {
      title: title,

      bgcolor: $color(color),
      titleColor: $color("#FFFFFF"),

      radius: 14,

      borderWidth: 1,
      borderColor: $rgba(
        255,
        255,
        255,
        0.12
      ),

      font: $font("bold", 12)
    },

    layout: make => {
      make.left.equalTo(
        index * (width + gap)
      );

      make.top.bottom.equalTo(0);
      make.width.equalTo(width);
    },

    events: {
      tapped(sender) {
        pressFeedback(
          sender,
          handler
        );
      }
    }
  };
}

function textBox(
  title,
  id,
  top
) {
  return card(
    id + "Card",
    top,
    220,
    [
      titleLabel(
        title,
        16,
        14
      ),

      {
        type: "text",

        props: {
          id: id,

          text: "",

          editable: false,
          selectable: true,

          bgcolor: $color(
            UI.INPUT_BG
          ),

          textColor: $color(
            UI.TEXT_SOFT
          ),

          font: $font(
            "Menlo",
            11
          ),

          radius: 13,

          borderWidth: 1,
          borderColor: $color(
            UI.INPUT_BORDER
          ),

          inset: $insets(
            9,
            10,
            9,
            10
          )
        },

        layout: make => {
          make.top.equalTo(46);
          make.left.right.inset(16);
          make.bottom.inset(14);
        }
      }
    ]
  );
}

function doneBar() {
  return {
    type: "view",

    props: {
      height: 44,

      bgcolor: $color(
        UI.TAB_BG
      )
    },

    views: [
      {
        type: "button",

        props: {
          title: "Done",

          titleColor: $color(
            T.primary
          ),

          font: $font(
            "bold",
            16
          )
        },

        layout: make => {
          make.right.equalTo(-16);
          make.centerY.equalTo();
        },

        events: {
          tapped(sender) {
            pressFeedback(
              sender,
              blurAllInputs
            );
          }
        }
      }
    ]
  };
}

function logIcon(type) {
  if (type === "success") {
    return "🟢";
  }

  if (type === "warn") {
    return "🟡";
  }

  if (type === "error") {
    return "🔴";
  }

  return "🔵";
}

function setText(id, text) {
  const view = $(id);

  if (!view) return;

  const value =
    text == null
      ? ""
      : String(text);

  if (view.text !== value) {
    view.text = value;
  }
}

function setTitle(id, text) {
  const view = $(id);

  if (!view) return;

  const value =
    text == null
      ? ""
      : String(text);

  if (view.title !== value) {
    view.title = value;
  }
}

function markDataDirty() {
  queueDirty = true;
  resultDirty = true;
  dashboardDirty = true;

  scheduleRefresh("result");
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  render,
  refresh,

  createWebView,
  destroyWebView,
  reloadWebView,
  getWebView,

  markDataDirty
};