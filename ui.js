// ================= UI - PokeTool Design V1.2 =================

const Core = require("./core");
const T = Core.THEME;

const sw = $device.info.screen.width;
const sh = $device.info.screen.height;

const TAB_H = 70;
//const STATUS_H = 34;
const CARD_X = 12;
const CARD_W = sw - CARD_X * 2;
let WEB_CREATED = false;
let WEB_URL = "about:blank";
let g_importData = null;

function modeTitle(mode) {
  if (mode === "Lottery") return "🎯 Lottery";
  if (mode === "Buy") return "🛒 Buy";
  if (mode === "Create") return "🛠 Create";
  if (mode === "ChangeProfile") return "📝 Profile";
  if (mode === "ChangeEmail") return "📧 Email";
  if (mode === "CheckResult") return "🔍 Result";
  if (mode === "ChangeProfileOrder") return "📝 ChangeProfileOrder";
  return mode || "Mode";
}

function render() {
  $ui.render({
    props: {
      title: "PokeTool",
      bgcolor: $color(T.bg)
    },
    views: [{
      type: "view",
      props: {
        id: "root",
        bgcolor: $color(T.bg)
      },
      layout: $layout.fill,
      views: [
        contentView(),
        webHost(),
        bottomTabs()
      ]
    }]
  });

  Core.onChange(refresh);
  renderCurrentTab();
  refresh();
}

// ================= ROOT =================
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
      make.bottom.inset(TAB_H);
    }
  };
}

function contentView() {
  return {
    type: "scroll",
    props: {
      id: "content",
      bgcolor: $color(T.bg),
      showsVerticalIndicator: true
    },
    layout: make => {
      make.top.left.right.equalTo(0);
      make.bottom.inset(TAB_H);
    }
  };
}

function bottomTabs() {
  const tabs = [
    ["Dashboard", "Home"],
    ["Data", "Data"],
    ["Browser", "Web"],
    ["Result", "Result"]
  ];

  const w = sw / tabs.length;

  return {
    type: "view",
    props: {
      id: "tabBar",
      bgcolor: $color("#0F172A")
    },
    layout: make => {
      make.left.right.equalTo(0);
      make.bottom.inset(0);
      make.height.equalTo(TAB_H);
    },
    views: tabs.map((t, i) => ({
      type: "button",
      props: {
        id: "tab_" + t[0],
        title: t[1],
        bgcolor: $color("clear"),
        titleColor: $color("#94A3B8"),
        font: $font("bold", 12)
      },
      layout: make => {
        make.left.equalTo(i * w);
        make.top.bottom.equalTo(0);
        make.width.equalTo(w);
      },
      events: {
        tapped() {
          Core.setTab(t[0]);
          renderCurrentTab();
        }
      }
    }))
  };
}



// ================= TAB SWITCH =================

function clearContent() {
  const c = $("content");
  if (!c) return;

  const views = c.views || [];
  for (let i = views.length - 1; i >= 0; i--) {
    views[i].remove();
  }
}

function renderCurrentTab() {
  clearContent();

  const s = Core.getState();
  const c = $("content");
  const host = $("webHost");
  
  if (host) {
    host.hidden = s.tab !== "Browser";
  }
  
  if (c) {
    c.hidden = s.tab === "Browser";
  }
  if (!c) return;

  c.contentOffset = $point(0, 0);

  let p;
  let h = 900;

  if (s.tab === "Dashboard") {
    p = dashboardPage();
    h = 910;
  }

  if (s.tab === "Data") {
    p = dataPage();
    h = dataPageHeight();
  }

  if (s.tab === "Browser") {
    p = browserPage();
    h = sh - TAB_H;
  }

  if (s.tab === "Result") {
    p = resultPage();
    h = 940;
  }

  c.add(p);
  c.contentSize = $size(sw, h);
  refresh();
}

// ================= DASHBOARD =================

function dashboardPage() {
  return page("dashboardPage", 910, [
    headerCard(12),
    statsCard(112),
    progressCard(250),
    currentTaskCard(344),
    runCard(562),
    logCard(634)
  ]);
}

function headerCard(top) {
  const logoSize = 54;
  const modeW = sw < 390 ? 160 : 180;
  const titleLeft = 18 + logoSize + 12;

  return card("headerCard", top, 88, [
    {
      type: "image",
      props: {
        src: "assets/IMG_3233.PNG",
        radius: 27
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
        textColor: $color("#CBD5E1"),
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
        title: "Lottery",
        bgcolor: $color("#111827"),
        titleColor: $color("#F8FAFC"),
        borderWidth: 1.3,
        borderColor: $color("#6366F1"),
        radius: 21,
        font: $font("bold", 12),
        minimumScaleFactor: 0.45,
        adjustsFontSizeToFitWidth: true
      },
      layout: make => {
        make.right.inset(14);
        make.centerY.equalTo();
        make.width.equalTo(modeW);
        make.height.equalTo(42);
      },
      events: {
        tapped: showModeMenu
      }
    }
  ]);
}

function statsCard(top) {
  return card("statsCard", top, 124, [
    statBox("statTotal", "Total", 0, T.primary, "◉"),
    statBox("statWaiting", "Wait", 1, T.warning, "◔"),
    statBox("statDone", "Done", 2, T.success, "✓"),
    statBox("statFailed", "Fail", 3, T.danger, "×")
  ]);
}

function statBox(id, title, index, color, icon) {
  const w = CARD_W / 4;

  return {
    type: "view",
    layout: make => {
      make.left.equalTo(index * w);
      make.top.bottom.equalTo(0);
      make.width.equalTo(w);
    },
    views: [
      index > 0 ? {
        type: "view",
        props: { bgcolor: $color("#1F2937") },
        layout: make => {
          make.left.equalTo(0);
          make.top.inset(24);
          make.bottom.inset(24);
          make.width.equalTo(1);
        }
      } : { type: "view" },
      {
        type: "label",
        props: {
          text: icon,
          bgcolor: $color(color),
          textColor: $color("#fff"),
          align: $align.center,
          radius: 18,
          font: $font("bold", 16)
        },
        layout: make => {
          make.centerX.equalTo();
          make.top.equalTo(18);
          make.size.equalTo($size(36, 36));
        }
      },
      {
        type: "label",
        props: {
          id: id + "_value",
          text: "0",
          align: $align.center,
          font: $font("bold", 30),
          textColor: $color(color)
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
          textColor: $color("#CBD5E1")
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
  return card("progressCard", top, 82, [
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
        bgcolor: $color("#334155"),
        radius: 7
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
  ]);
}

function currentTaskCard(top) {
  return card("currentCard", top, 200, [
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
        id: "curEmail",
        text: "-",
        textColor: $color("#FDE047"),
        font: $font("bold", 14)
      },
      layout: make => {
        make.left.equalTo(18);
        make.top.equalTo(52);
        make.right.inset(18);
        make.height.equalTo(22);
      }
    },

    infoLine("curMode", "MODE", 86),
    infoLine("curStep", "STEP", 122),
    infoLine("curStatus", "STATUS", 158)
  ]);
}

function infoLine(id, label, top) {
  return {
    type: "view",
    layout: make => {
          make.left.right.inset(18);
          make.top.equalTo(top);
          make.height.equalTo(24);
        },
    views: [
      {
        type: "label",
        props: {
          text: label,
          textColor: $color("#CBD5E1"),
          font: $font("bold", 12)
        },
        layout: make => {
          make.left.top.bottom.equalTo(0);
          make.width.equalTo(70);
        }
      },
      {
        type: "label",
        props: {
          id,
          text: "-",
          textColor: $color("#F8FAFC"),
          font: $font(13),
          lines: id === "curStatus" ? 2 : 1,
          minimumScaleFactor: 0.55,
          adjustsFontSizeToFitWidth: true
        },
        layout: make => {
          make.left.equalTo(82);
          make.right.equalTo(0);
          make.centerY.equalTo();
          make.height.equalTo(id === "curStatus" ? 40 : 24);
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
      actionButton("▶ RUN", T.success, 0, 3, () => {
        try { require("./runner").run(); }
        catch (e) {
          Core.addLog("Runner error: " + e.message, "error");
          $ui.alert(String(e.message || e));
        }
      }),
      actionButton("■ STOP", T.danger, 1, 3, () => {
        try { require("./runner").stop(); }
        catch (e) {
          Core.setRunning(false);
          Core.addLog("Stop clicked", "warn");
        }
      }),
      actionButton("RESET", T.warning, 2, 3, () => {
        Core.resetAll();
        renderCurrentTab();
      })
    ]
  };
}

function actionButton(title, color, index, count, handler) {
  const gap = 10;
  const w = (sw - 24 - gap * (count - 1)) / count;

  return {
    type: "button",
    props: {
      title,
      bgcolor: $color(color),
      titleColor: $color("#fff"),
      radius: 15,
      font: $font("bold", 14)
    },
    layout: make => {
      make.left.equalTo(index * (w + gap));
      make.top.bottom.equalTo(0);
      make.width.equalTo(w);
    },
    events: { tapped: handler }
  };
}

function logCard(top) {
  return card("logCard", top, 190, [
    {
      type: "label",
      props: {
        text: "Realtime Log",
        textColor: $color(T.text),
        font: $font("bold", 21)
      },
      layout: make => {
        make.left.equalTo(18);
        make.top.equalTo(16);
        make.height.equalTo(28);
      }
    },
    {
      type: "button",
      props: {
        title: "Clear  🗑",
        bgcolor: $color("#1E293B"),
        titleColor: $color("#E5E7EB"),
        radius: 14,
        font: $font("bold", 12)
      },
      layout: make => {
        make.right.inset(18);
        make.top.equalTo(16);
        make.width.equalTo(96);
        make.height.equalTo(32);
      },
      events: {
        tapped() {
          Core.getState().logs = [];
          refresh();
        }
      }
    },
    {
      type: "label",
      props: {
        id: "dashLog",
        text: "No logs",
        textColor: $color("#CBD5E1"),
        font: $font(13),
        lines: 0
      },
      layout: make => {
        make.top.equalTo(58);
        make.left.right.inset(22);
        make.bottom.inset(12);
      }
    }
  ]);
}

// ================= DATA / OTHER TABS =================

function dataPage() {
  const sec = getModeSections(Core.getState().mode);

  const views = [
    sectionHeader("Data", 18),
    dataActions(58)
  ];

  let top = 128;

  views.push(
    dataSection("sectionAccount", "Account / IMAP", top, [
      field("imapEmail", "IMAP EMAIL", "imap@gmail.com", 18, false),
      field("imapPass", "IMAP PASSWORD", "App Password", 92, true),
      area("mailList", "MAIL LIST", "mail:pass", 166, 150)
    ], 340)
  );

  top += 360;

  if (sec.product) {
    views.push(
      dataSection("sectionProduct", "Product", top, [
        field("productIds", "PRODUCT IDS", "452132...,452...", 18, false),
        field("buyQty", "BUY QTY", "1", 92, false)
      ], 210)
    );

    top += 230;
  }

  if (sec.profile) {
    views.push(
      dataSection("sectionProfile", "Profile Data", top, [
        area("names", "NAMES", "Yamada Taro", 18, 95),
        area("kanas", "KANAS", "ヤマダ タロウ", 138, 95),
        area("phones", "PHONES", "090...", 258, 95),
        area("postcode", "POSTCODE", "1440000", 378, 95),
        area("pref", "PREF", "東京都", 498, 95),
        area("address1", "CITY", "大田区", 618, 95),
        area("address2", "ADDRESS", "1-2-3", 738, 95),
        area("birthdate", "BIRTHDATE", "1997-12-11", 858, 95)
      ], 980)
    );

    top += 1000;
  }

  if (sec.payment) {
    views.push(
      dataSection("sectionPayment", "Payment", top, [
        area("creditOwnerList", "CARD OWNER", "YAMADA TARO", 18, 110),
        area("creditList", "CARD LIST", "number-mm/yy-cvv", 158, 130)
      ], 330)
    );

    top += 350;
  }

  return page("dataPage", top + 30, views);
}

function dataPageHeight() {
  const sec = getModeSections(Core.getState().mode);

  let top = 128;
  top += 360;

  if (sec.product) top += 230;
  if (sec.profile) top += 1000;
  if (sec.payment) top += 350;

  return top + 30;
}

function createWebView(url) {
  WEB_CREATED = true;
  WEB_URL = url || "about:blank";

  const host = $("webHost");
  if (!host) {
    Core.addLog("webHost not found", "error");
    return null;
  }

  const old = $("mainWebView");
  if (old) {
    try { old.remove(); } catch (e) {}
  }

  host.add({
    type: "web",
    props: {
      id: "mainWebView",
      url: WEB_URL
    },
    layout: make => {
      make.top.left.right.bottom.equalTo(0);
    },
    events: {
      didStart(sender) {
        sender._pageReady = false;
        //Core.addLog("WebView loading", "info");
      },
    
      didFinish(sender) {
        sender._pageReady = true;
        WEB_URL = sender.url || WEB_URL;
        //Core.addLog("WebView loaded: " + WEB_URL, "success");
      },
    
      didReceiveResponse(sender, resp) {
        try {
          const url = resp.URL || "";
    
          if (
            url.includes("/auth/login-status") ||
            url.includes("/cart/get") ||
            url.includes("/order/") ||
            url.includes("/mypage") ||
            url.includes("/lottery") ||
            url.includes("/login-mfa")
          ) {
            sender._pageReady = true;
          }
        } catch (e) {}
      },
    
      didFail(sender, error) {
        Core.addLog("WebView error: " + String(error), "error");
      }
    }
  });

  //Core.addLog("WebView created", "info");

  return $("mainWebView");
}

function destroyWebView() {
  WEB_CREATED = false;
  WEB_URL = "about:blank";

  const wv = $("mainWebView");
  if (wv) {
    try { wv.remove(); } catch (e) {}
  }

  Core.addLog("WebView destroyed", "warn");
}

function reloadWebView(url) {
  let wv = $("mainWebView");

  if (!wv) {
    wv = createWebView(url || "about:blank");
    return wv;
  }

  WEB_URL = url || WEB_URL || "about:blank";
  wv.url = WEB_URL;

  return wv;
}

function getWebView() {
  return $("mainWebView");
}

function webViewBlock() {
  return {
    type: "web",
    props: {
      id: "mainWebView",
      url: WEB_URL || "about:blank"
    },
    layout: make => {
      make.top.left.right.bottom.equalTo(0);
    },
    events: {
      didStart(sender) {
        Core.addLog("WebView loading", "info");
      },
      didFinish(sender) {
        WEB_URL = sender.url || WEB_URL;
        Core.addLog("WebView loaded: " + WEB_URL, "success");
      },
      didFail(sender, error) {
        Core.addLog("WebView error: " + String(error), "error");
      }
    }
  };
}

function emptyBrowserBlock() {
  return {
    type: "view",
    props: {
      bgcolor: $color(T.bg)
    },
    layout: make => {
      make.top.left.right.bottom.equalTo(0);
    },
    views: [
      {
        type: "label",
        props: {
          text: "WebView chưa được tạo\nBấm RUN để bắt đầu",
          textColor: $color("#94A3B8"),
          align: $align.center,
          font: $font("bold", 15),
          lines: 2
        },
        layout: make => {
          make.center.equalTo();
          make.left.right.inset(24);
          make.height.equalTo(80);
        }
      }
    ]
  };
}

function dataActions(top) {
  return {
    type: "view",
    layout: make => {
      make.top.equalTo(top);
      make.left.right.inset(16);
      make.height.equalTo(50);
    },
    views: [
      dataActionBtn("📥 IMPORT", T.primary, 0, importData),
      dataActionBtn("💾 SAVE", T.success, 1, () => {
        syncFormToCore();
      
        const total = Core.saveQueueFromForm(
          Core.getState().form,
          Core.getState().mode
        );
        Core.refreshStats();
      
        Core.addLog("Data saved: " + total + " accounts", "success");
        renderCurrentTab();
      
        $ui.toast("Saved: " + total);
      })
    ]
  };
}

function dataActionBtn(title, color, index, handler) {
  const gap = 12;
  const w = (sw - 32 - gap) / 2;

  return {
    type: "button",
    props: {
      title,
      bgcolor: $color(color),
      titleColor: $color("#fff"),
      radius: 16,
      font: $font("bold", 14)
    },
    layout: make => {
      make.left.equalTo(index * (w + gap));
      make.top.bottom.equalTo(0);
      make.width.equalTo(w);
    },
    events: {
      tapped: handler
    }
  };
}

function syncFormToCore() {
  Object.keys(Core.getState().form).forEach(k => {
    const el = $(k);
    if (el) {
      Core.updateForm(k, el.text || "");
    }
  });

  Core.refreshStats();
}

function dataSection(id, title, top, children, height) {
  return card(id, top, height, [
    titleLabel(title, 16, 12)
  ].concat(children));
}

function field(id, title, ph, top, secure) {
  return {
    type: "view",
    layout: make => {
      make.top.equalTo(top + 32);
      make.left.right.inset(16);
      make.height.equalTo(64);
    },
    views: [
      miniLabel(title, 0),
      {
        type: "text",
        props: {
          id,
          text: Core.getState().form[id] || "",
          placeholder: ph,
          secure,
          bgcolor: $color(T.input),
          textColor: $color(T.text),
          radius: 12,
          font: $font(14),
          accessoryView: doneBar()
        },
        layout: make => {
          make.left.right.bottom.equalTo(0);
          make.height.equalTo(38);
        },
        events: {
          changed(sender) {
            Core.updateForm(id, sender.text || "");
          }
        }
      }
    ]
  };
}

function area(id, title, ph, top, h) {
  return {
    type: "view",
    layout: make => {
      make.top.equalTo(top + 32);
      make.left.right.inset(16);
      make.height.equalTo(h + 26);
    },
    views: [
      miniLabel(title, 0),
      {
        type: "text",
        props: {
          id,
          text: Core.getState().form[id] || "",
          placeholder: ph,
          bgcolor: $color(T.input),
          textColor: $color(T.text),
          radius: 12,
          font: $font(13),
          inset: $insets(8, 8, 8, 8),
          accessoryView: doneBar()
        },
        layout: make => {
          make.left.right.bottom.equalTo(0);
          make.height.equalTo(h);
        },
        events: {
          changed(sender) {
            Core.updateForm(id, sender.text || "");
          }
        }
      }
    ]
  };
}

function browserPage() {
  return page("browserPage", sh - TAB_H, [
    emptyBrowserBlock()
  ]);
}

function resultPage() {
  return page("resultPage", 900, [
    sectionHeader("Result", 18),

    rowButtons(58, [
      ["Copy Done", T.success, copyDone],
      ["Retry Fail", T.warning, importFailToPending],
      ["Copy Fail", T.primary, copyFail]
    ]),

    textBox("Done Accounts", "resultDone", 128),
    textBox("Failed Accounts", "resultFailed", 378),
    textBox("Logs", "resultLogs", 628)
  ]);
}

// ================= REFRESH =================

function refresh() {
  const s = Core.getState();

  refreshTabs(s);
  refreshDashboard(s);
  refreshStatus(s);
  refreshQueueResult(s);
}

function refreshTabs(s) {
  Core.TABS.forEach(tab => {
    const btn = $("tab_" + tab);
    if (!btn) return;

    btn.titleColor =
      s.tab === tab
        ? $color("#FDE047")
        : $color("#94A3B8");
  });
}

function refreshDashboard(s) {
  setText("versionText", "Version " + s.version);
  setTitle("modeBtn", modeTitle(s.mode) + "  ▼");
  setText("curBadge", s.running ? "●  Running" : "●  Ready");

  setText("statTotal_value", String(s.stats.total));
  setText("statWaiting_value", String(s.stats.waiting));
  setText("statDone_value", String(s.stats.done));
  setText("statFailed_value", String(s.stats.failed));

  setText(
    "progressText",
    s.stats.percent + "%  •  " +
      (s.stats.done + s.stats.failed) +
      "/" +
      s.stats.total
  );

  const fill = $("progressFill");
  if (fill) {
    const width = Math.max(1, Math.floor((sw - 68) * s.stats.percent / 100));
    fill.updateLayout(make => {
      make.width.equalTo(width);
    });
  }

  const c = s.current;

  setText("curEmail", c.email || "-");
  setText("curMode", s.mode || "-");
  setText("curStep", c.step || "-");
  setText("curStatus", c.status || "-");
  setText(
    "curIndex",
    (c.index || 0) + " / " + (c.total || 0) + "   •   " + (c.elapsed || "00:00")
  );

  const logs = (s.logs || [])
    .slice(0, 4)
    .map(x => logIcon(x.type) + " " + x.time + "  " + x.text)
    .join("\n");

  setText("dashLog", logs || "No logs");
}

function refreshStatus(s) {
  const c = s.current;

  setText(
    "bottomStatusText",
    (s.running ? "🟢 Running" : "🟢 Ready") +
      " • " +
      s.mode +
      " • " +
      (c.index || 0) +
      "/" +
      (c.total || 0) +
      " • " +
      (c.status || "Idle")
  );
}

function refreshQueueResult(s) {
  const pending = Core.loadJSON(Core.FILE_PENDING, []);
  const done = Core.loadJSON(Core.FILE_DONE, []);
  const failed = Core.loadJSON(Core.FILE_FAILED, []);

  const pendingText =
   Core.listToAccountText(
     pending,
     Core.getState().mode
   ) || "No pending";
  const doneText = Array.isArray(done)
    ? done.map(x => x.text || `${x.email || ""}:${x.pass || ""}`).filter(Boolean).join("\n")
    : "";
  const failedText = Array.isArray(failed)
    ? failed.map(x => x.text || `${x.email || ""}:${x.pass || ""}\t${x.reason || ""}`).filter(Boolean).join("\n")
    : "";

  setText("queuePending", pendingText);
  setText("queueDone", doneText || "No done");
  setText("queueFailed", failedText || "No failed");

  setText("resultDone", doneText || "No done");
  setText("resultFailed", failedText || "No failed");

  const logs = (s.logs || [])
    .map(x => logIcon(x.type) + " " + x.time + "  " + x.text)
    .join("\n");

  setText("resultLogs", logs || "No logs");
}

// ================= ACTIONS =================

function showModeMenu() {
  $ui.menu({
    items: Core.MODES,
    handler(title) {
      Core.setMode(title);
      Core.addLog("Mode changed: " + title, "info");
    }
  });
}

function copyDone() {
  const done = Core.loadJSON(Core.FILE_DONE, []);
  const text = Array.isArray(done)
    ? done.map(x => x.email || "").filter(Boolean).join("\n")
    : "";

  if (!text) return $ui.toast("No done");

  $clipboard.text = text;
  $ui.toast("Copied done");
}

function copyFail() {
  const failed = Core.loadJSON(Core.FILE_FAILED, []);

  const text = Array.isArray(failed)
    ? failed
        .map(x =>
          `${x.email || ""}:${x.pass || ""}\t${x.reason || ""}`
        )
        .filter(x => x.trim())
        .join("\n")
    : "";

  if (!text) {
    $ui.toast("No failed");
    return;
  }

  $clipboard.text = text;
  $ui.toast("Copied fail");
}

function normalizeHeader(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function findColumn(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").toLowerCase();

    for (const k of keywords) {
      if (h.includes(k)) return i;
    }
  }

  return -1;
}

function getImportColumnMap(headers) {
  return {
    productIds: findColumn(headers, ["product_ids", "productids", "product", "sku"]),
    buyQty: findColumn(headers, ["buy_qty", "buyqty", "qty", "quantity"]),

    imapEmail: findColumn(headers, ["imap_email", "imapemail"]),
    imapPass: findColumn(headers, ["imap_pass", "imappass"]),

    mailList: findColumn(headers, ["mail_list", "maillist"]),

    name: findColumn(headers, ["full_name", "fullname", "name"]),
    kana: findColumn(headers, ["kana"]),

    postcode: findColumn(headers, ["postcode", "zip"]),
    pref: findColumn(headers, ["pref"]),
    city: findColumn(headers, ["city"]),
    banchi: findColumn(headers, ["banchi", "address"]),

    phone: findColumn(headers, ["phone", "tel"]),
    birthdate: findColumn(headers, ["birthdate", "dob"]),

    creditOwner: findColumn(headers, ["card_owner", "cardowner"]),
    creditNumber: findColumn(headers, ["card_number", "cardnumber"]),
    creditExpire: findColumn(headers, ["card_expire", "cardexpire"]),
    creditCsv: findColumn(headers, ["card_csv", "cardcsv", "cvv", "cvc"])
  };
}

function parseSheetText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];

    if (c === '"' && quote && n === '"') {
      cell += '"';
      i++;
      continue;
    }

    if (c === '"') {
      quote = !quote;
      continue;
    }

    if ((c === "\t" || c === "," || c === ";") && !quote) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && n === "\n") i++;

      row.push(cell.trim());

      if (row.some(v => v !== "")) rows.push(row);

      row = [];
      cell = "";
      continue;
    }

    cell += c;
  }

  row.push(cell.trim());

  if (row.some(v => v !== "")) rows.push(row);

  return rows;
}

function parseImportData(text) {
  const rows = parseSheetText(text);

  if (rows.length < 2) return [];

  const headers = rows[0].map(x => normalizeHeader(x));
  const map = getImportColumnMap(headers);

  const data = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const row = {};

    Object.keys(map).forEach(key => {
      const idx = map[key];
      row[key] =
        idx >= 0 && cells[idx]
          ? String(cells[idx]).trim()
          : "";
    });

    if (Object.values(row).some(v => v)) {
      data.push(row);
    }
  }

  return data;
}

function googleSheetCsvUrl(url) {
  const m = String(url || "").match(/\/spreadsheets\/d\/([^/]+)/);

  if (!m) return "";

  return (
    "https://docs.google.com/spreadsheets/d/" +
    m[1] +
    "/gviz/tq?tqx=out:csv&sheet=import"
  );
}

function httpGetText(url) {
  return new Promise(resolve => {
    $http.get({
      url,
      handler: resp => {
        if (resp.error) {
          resolve("");
          return;
        }

        const text =
          resp.data?.string ||
          resp.rawData?.string ||
          "";

        resolve(String(text || "").replace(/^\uFEFF/, ""));
      }
    });
  });
}

function setValue(id, text) {
  Core.updateForm(id, text == null ? "" : String(text));

  const el = $(id);
  if (el) {
    el.text = text == null ? "" : String(text);
  }
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function importData() {
  $input.text({
    type: $kbType.url,
    placeholder: "Dán link Google Sheet",
    handler: async url => {
      if (!url) return;

      const csvUrl = googleSheetCsvUrl(url.trim());

      if (!csvUrl) {
        $ui.alert("Link Google Sheet không hợp lệ");
        return;
      }

      $ui.toast("Đang tải sheet import...");

      const text = await httpGetText(csvUrl);

      if (!text.trim()) {
        $ui.alert("Không đọc được dữ liệu từ sheet import");
        return;
      }

      const data = parseImportData(text);

      if (!data.length) {
        $ui.alert("Sheet không có dữ liệu hợp lệ");
        return;
      }

      g_importData = data;

      $ui.alert({
        title: "📥 Import dữ liệu",
        message:
          "Import " +
          data.length +
          " dòng?\nPending/done/failed sẽ được xoá.",
        actions: [
          {
            title: "Huỷ",
            style: "cancel"
          },
          {
            title: "Import",
            handler: () => {
              importAllColumns(true);
            }
          }
        ]
      });
    }
  });
}

function importAllColumns(clearProgress) {
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
    if (row.productIds) lists.productIds.push(row.productIds);
    if (row.mailList) lists.mailList.push(row.mailList);

    if (row.name) lists.names.push(row.name);
    if (row.kana) lists.kanas.push(row.kana);

    if (row.postcode) lists.postcode.push(row.postcode);
    if (row.pref) lists.pref.push(row.pref);
    if (row.city) lists.address1.push(row.city);
    if (row.banchi) lists.address2.push(row.banchi);

    if (row.phone) lists.phones.push(row.phone);
    if (row.birthdate) lists.birthdate.push(row.birthdate);

    if (row.creditOwner) lists.creditOwnerList.push(row.creditOwner);

    if (row.creditNumber) {
      lists.creditList.push(
        `${row.creditNumber}-${row.creditExpire || ""}-${row.creditCsv || ""}`
      );
    }

    if (!buyQty && row.buyQty) buyQty = row.buyQty;
    if (!imapEmail && row.imapEmail) imapEmail = row.imapEmail;
    if (!imapPass && row.imapPass) imapPass = row.imapPass;
  });

  setValue("buyQty", buyQty);
  setValue("imapEmail", imapEmail);
  setValue("imapPass", imapPass);

  setValue("productIds", unique(lists.productIds).join(", "));
  setValue("mailList", lists.mailList.join("\n"));

  setValue("names", lists.names.join("\n"));
  setValue("kanas", lists.kanas.join("\n"));

  setValue("postcode", lists.postcode.join("\n"));
  setValue("pref", lists.pref.join("\n"));
  setValue("address1", lists.address1.join("\n"));
  setValue("address2", lists.address2.join("\n"));

  setValue("phones", lists.phones.join("\n"));
  setValue("birthdate", lists.birthdate.join("\n"));

  setValue("creditOwnerList", lists.creditOwnerList.join("\n"));
  setValue("creditList", lists.creditList.join("\n"));

  if (clearProgress) {
    Core.saveJSON(Core.FILE_DONE, []);
    Core.saveJSON(Core.FILE_FAILED, []);
  }

  const total = Core.saveQueueFromForm(
    Core.getState().form,
    Core.getState().mode
  );

  Core.refreshStats();
  renderCurrentTab();

  Core.addLog("Imported: " + total + " accounts", "success");
  $ui.toast("Import OK: " + total);
}

function importFailToPending() {
  const failed = Core.loadJSON(Core.FILE_FAILED, []);

  if (!Array.isArray(failed) || !failed.length) {
    $ui.toast("No failed");
    return;
  }

  let retryAccounts = failed;

  if (Core.getState().mode === "CheckResult") {
    retryAccounts = failed.filter(x =>
      String(x.reason || "").toUpperCase() === "NOTMAIL"
    );
  }

  if (!retryAccounts.length) {
    $ui.toast("No retry target");
    return;
  }

  const retryTasks = Core.buildTasksFromForm(
    Core.getState().form,
    Core.getState().mode,
    retryAccounts
  );

  const mailText = Core.listToAccountText(
    retryTasks,
    Core.getState().mode
  );

  Core.saveJSON(Core.FILE_PENDING, retryTasks);
  Core.saveJSON(Core.FILE_DONE, []);
  Core.saveJSON(Core.FILE_FAILED, []);

  Core.updateForm("mailList", mailText);

  const mailList = $("mailList");
  if (mailList) {
    mailList.text = mailText;
  }

  Core.refreshStats();
  refresh();

  Core.addLog(
    "Failed imported to pending: " + retryTasks.length,
    "warn"
  );

  $ui.toast("Imported: " + retryTasks.length);
}

function getModeSections(mode) {
  return {
    account: true,
    product:
      mode === "Lottery" ||
      mode === "Buy" ||
      mode === "CheckResult" ||
      mode === "ChangeProfileOrder",
    profile:
      mode === "Create" ||
      mode === "ChangeProfile" ||
      mode === "ChangeProfileOrder",
    payment:
      mode === "Buy"
  };
}

// ================= HELPERS =================

function page(id, height, views) {
  return {
    type: "view",
    props: {
      id,
      bgcolor: $color(T.bg)
    },
    layout: make => {
      make.top.left.equalTo(0);
      make.width.equalTo(sw);
      make.height.equalTo(height);
    },
    views
  };
}

function card(id, top, height, views) {
  return {
    type: "view",
    props: {
      id,
      bgcolor: $color("#0B1220"),
      radius: 18,
      borderWidth: 1,
      borderColor: $color("#1E293B")
    },
    layout: make => {
      make.top.equalTo(top);
      make.left.right.inset(CARD_X);
      make.height.equalTo(height);
    },
    views
  };
}

function titleLabel(text, left, top) {
  return {
    type: "label",
    props: {
      text,
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

function sectionHeader(text, top) {
  return {
    type: "label",
    props: {
      text,
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

function miniLabel(text, top) {
  return {
    type: "label",
    props: {
      text,
      textColor: $color(T.muted),
      font: $font("bold", 11)
    },
    layout: make => {
      make.left.equalTo(0);
      make.top.equalTo(top);
      make.height.equalTo(20);
    }
  };
}

function rowButtons(top, buttons) {
  return {
    type: "view",
    layout: make => {
      make.top.equalTo(top);
      make.left.right.inset(16);
      make.height.equalTo(52);
    },
    views: buttons.map((b, i) => smallBtn(b[0], b[1], i, b[2]))
  };
}

function smallBtn(title, color, index, handler) {
  const gap = 10;
  const w = (sw - 32 - gap * 2) / 3;

  return {
    type: "button",
    props: {
      title,
      bgcolor: $color(color),
      titleColor: $color("#fff"),
      radius: 14,
      font: $font("bold", 12)
    },
    layout: make => {
      make.left.equalTo(index * (w + gap));
      make.top.bottom.equalTo(0);
      make.width.equalTo(w);
    },
    events: { tapped: handler }
  };
}

function textBox(title, id, top) {
  return card(id + "Card", top, 220, [
    titleLabel(title, 16, 14),
    {
      type: "text",
      props: {
        id,
        text: "",
        editable: false,
        selectable: true,
        bgcolor: $color(T.input),
        textColor: $color("#CBD5E1"),
        font: $font(12),
        radius: 12,
        inset: $insets(8, 8, 8, 8)
      },
      layout: make => {
        make.top.equalTo(46);
        make.left.right.inset(16);
        make.bottom.inset(14);
      }
    }
  ]);
}

function doneBar() {
  return {
    type: "view",
    props: {
      height: 44,
      bgcolor: $color("#0F172A")
    },
    views: [{
      type: "button",
      props: {
        title: "Done",
        titleColor: $color(T.primary),
        font: $font("bold", 16)
      },
      layout: make => {
        make.right.equalTo(-16);
        make.centerY.equalTo();
      },
      events: {
        tapped() {
          Object.keys(Core.getState().form).forEach(k => {
            const el = $(k);
            if (el) el.blur();
          });
        }
      }
    }]
  };
}

function logIcon(type) {
  if (type === "success") return "🟢";
  if (type === "warn") return "🟡";
  if (type === "error") return "🔴";
  return "🔵";
}

function setText(id, text) {
  const v = $(id);
  if (v) v.text = text == null ? "" : String(text);
}

function setTitle(id, text) {
  const v = $(id);
  if (v) v.title = text == null ? "" : String(text);
}

module.exports = {
  render,
  refresh,
  createWebView,
  destroyWebView,
  reloadWebView,
  getWebView
};