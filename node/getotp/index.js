const Imap = require("imap");
const { simpleParser } = require("mailparser");
const axios = require("axios");
const fs   = require("fs");
const path = require("path");

// ================= LOG =================
function log(...args) {
  console.log("[OTP]", ...args);
}

// ================= FILE =================
function appendFile(name, text) {

  try {

    const p = path.join(
      process.cwd(),
      name
    );

    fs.appendFileSync(
      p,
      text + "\n"
    );

  } catch(e) {

    log(
      "WRITE FILE ERROR:",
      e.message || e
    );
  }
}

// ================= CONFIG =================
const TIMEOUT  = 3 * 60 * 1000;
const INTERVAL = 1000;
const FETCH_TIMEOUT = 30000;

// ================= HOST =================
function getImapHost(email) {

  email = String(email || "")
    .toLowerCase();

  if (email.endsWith("@gmail.com")) {
    return "imap.gmail.com";
  }

  if (
    email.endsWith("@icloud.com") ||
    email.endsWith("@me.com")
  ) {
    return "imap.mail.me.com";
  }

  return "imap.gmail.com";
}

// ================= OTP =================
function extractOtp(text) {

  if (!text) return null;

  const m = String(text).match(
    /【パスコード】\s*(\d{6})/
  );

  return m
    ? m[1]
    : null;
}

function extractCreateLink(text) {

  if (!text) return null;

  const m = text.match(
    /https:\/\/www\.pokemoncenter-online\.com\/new-customer\/\?token=[^\s]+/i
  );

  return m ? m[0].trim() : null;
}

// Jum+
function extractJumpPlusCreateLink(text) {
  if (!text) return null;

  const m = String(text).match(
    /https:\/\/shonenjumpplus\.com\/user_account\/signup_registration\/[A-Za-z0-9_-]+/i
  );

  return m
    ? m[0]
        .replace(/&amp;/g, "&")
        .trim()
    : null;
}

function extractChangeEmail(text) {

  if (!text) return null;

  const m = text.match(
    /https?:\/\/[^\s"'<>]+\/mail-change-complete\/\?token=[^\s"'<>]+/
  );

  return m ? m[0] : null;
}

function extractJumpCSRegistered(subject) {
  const value = String(subject || "")
    .replace(/\s+/g, "")
    .trim();

  return (
    value.includes(
      "[ジャンプキャラクターズストア]会員本登録完了のお知らせ"
    ) ||
    value.includes(
      "会員本登録完了のお知らせ"
    )
  )
    ? "REGISTERED"
    : null;
}

// Jump Characters Store
function extractJumpCSOtp(text) {
  if (!text) return null;

  const value = String(text)
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ");

  let match = value.match(
    /確認コード\s*[:：]\s*(\d{6})/i
  );

  if (match) return match[1];

  match = value.match(
    /Confirmation\s*code\s*[:：]\s*(\d{6})/i
  );

  return match ? match[1] : null;
}

// ================= SEARCH =================
function search(imap, criteria) {

  return new Promise(resolve => {

    imap.search(criteria, (err, res) => {

      if (err) {

        log(
          "SEARCH ERROR:",
          err.message || err
        );

        return resolve([]);
      }

      resolve(res || []);
    });
  });
}

// ======================================================
// JUMP CHARACTERS STORE - CONBINI PAYMENT
// ======================================================

const JUMP_ORDER_SUBJECT =
  "[ジャンプキャラクターズストア] ご注文を受け付けました";

function normalizeMailText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\r/g, "")
    .trim();
}

function isJumpOrderSubject(subject) {
  const value =
    String(subject || "")
      .replace(/\s+/g, " ")
      .trim();

  return (
    value.includes(
      JUMP_ORDER_SUBJECT
    ) ||
    value.includes(
      "ご注文を受け付けました"
    )
  );
}

function extractJumpOrderId(text) {
  const value =
    normalizeMailText(text);

  const match =
    value.match(
      /【\s*オーダーID\s*】\s*[:：]?\s*(EC\d{6,8}-\d+)/i
    );

  return match
    ? match[1]
        .trim()
        .toUpperCase()
    : null;
}

function extractJumpPaymentCode(text) {
  const value =
    normalizeMailText(text);

  const match =
    value.match(
      /払込票番号\s*[:：]\s*(\d{10,20})/
    );

  return match
    ? match[1].trim()
    : null;
}

// ================= FETCH =================
function fetchMail(imap, uid) {

  return new Promise(resolve => {

    let done = false;
    let timer = null;
    let raw = "";

    const finish = value => {
      if (done) return;

      done = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      resolve(value || null);
    };

    log("FETCH START:", uid);

    const f = imap.fetch(
      uid,
      {
        bodies: "",
        markSeen: true
      }
    );

    f.on("message", msg => {

      msg.on("body", stream => {

        stream.on("data", chunk => {
          raw += chunk.toString("utf8");
        });

        stream.once("error", err => {
          log(
            "BODY ERROR:",
            err.message || err
          );
        });
      });

      msg.once("end", async () => {

        try {

          if (!raw) {
            log("EMPTY BODY:", uid);
            return finish(null);
          }

          const parsed =
            await simpleParser(raw);

          log("PARSE OK:", uid);

          finish(parsed);

        } catch (err) {

          log(
            "PARSE ERROR:",
            err.message || err
          );

          finish(null);
        }
      });
    });

    f.once("error", err => {

      log(
        "FETCH ERROR:",
        err.message || err
      );

      finish(null);
    });

    f.once("end", () => {
      log("FETCH END:", uid);
    });

    timer = setTimeout(() => {

      log(
        "FETCH TIMEOUT:",
        uid
      );

      finish(null);

    }, 30000);
  });
}

const SUBJECT_KEYWORDS = [
  "当選のご案内「ポケモンセンターオンライン」",
  "抽選結果のご案内「ポケモンセンターオンライン」"
];

const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycby_gFcyaNuYcwsZdIcl753_UJYPDDNGC_2FIiOsbOySM_stU8Gt8HvsMKLzBPEF5CHyGQ/exec";

async function postJSON(url, data) {
  try {
    const res = await axios.post(url, data, {
      maxRedirects: 5,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      },
      validateStatus: () => true
    });

    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      body:
        typeof res.data === "string"
          ? res.data
          : JSON.stringify(res.data)
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: String(e.message || e)
    };
  }
}

function fetchMailNoSeen(imap, uids) {
  return new Promise(resolve => {
    const mails = [];
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      resolve(mails);
    };

    if (!uids || !uids.length) {
      resolve([]);
      return;
    }

    const f = imap.fetch(uids, {
      bodies: "",
      markSeen: false
    });

    f.on("message", msg => {
      msg.on("body", stream => {
        simpleParser(stream)
          .then(parsed => mails.push(parsed))
          .catch(() => {});
      });
    });

    f.once("error", err => {
      log("FETCH ERROR:", err.message || err);
      finish();
    });

    f.once("end", finish);

    setTimeout(finish, FETCH_TIMEOUT);
  });
}

function fetchPokemonOtpMail(
  imap,
  uid
) {

  return new Promise(resolve => {

    let done = false;
    const chunks = [];

    const finish = value => {

      if (done) return;

      done = true;

      resolve(value || null);
    };

    log(
      "OTP FETCH START:",
      uid
    );

    const f = imap.fetch(
      uid,
      {
        bodies: "",
        markSeen: true
      }
    );

    f.on(
      "message",
      msg => {

        msg.on(
          "body",
          stream => {

            stream.on(
              "data",
              chunk => {
                chunks.push(
                  chunk
                );
              }
            );

            stream.once(
              "error",
              err => {

                log(
                  "OTP BODY ERROR:",
                  err.message || err
                );
              }
            );
          }
        );

        msg.once(
          "end",
          async () => {

            try {

              const raw =
                Buffer.concat(
                  chunks
                );

              const parsed =
                await simpleParser(
                  raw
                );

              log(
                "OTP FETCH OK:",
                uid
              );

              finish(parsed);

            } catch (err) {

              log(
                "OTP PARSE ERROR:",
                err.message || err
              );

              finish(null);
            }
          }
        );
      }
    );

    f.once(
      "error",
      err => {

        log(
          "OTP FETCH ERROR:",
          err.message || err
        );

        finish(null);
      }
    );

    f.once(
      "end",
      () => {

        log(
          "OTP FETCH END:",
          uid
        );
      }
    );
  });
}

// ======================================================
// JUMP CONBINI MAIL CHECK
// ======================================================

async function runJumpConbini(
  imap,
  targetMail,
  orderId,
  done
) {
  const expectedOrderId =
    String(orderId || "")
      .trim()
      .toUpperCase();

  const checkedUids =
    new Set();

  const start =
    Date.now();

  while (
    Date.now() - start <
    TIMEOUT
  ) {
    try {
      const toIds =
        await search(
          imap,
          [
            [
              "TO",
              targetMail
            ]
          ]
        );
      
      const unseen =
        await search(
          imap,
          [
            "UNSEEN"
          ]
        );
      
      const unseenSet =
        new Set(
          unseen.map(Number)
        );
      
      const latestIds =
        toIds
          .map(Number)
          .filter(
            uid =>
              Number.isFinite(uid) &&
              unseenSet.has(uid) &&
              !checkedUids.has(uid)
          )
          .sort(
            (a, b) =>
              b - a
          )
          .slice(0, 10);

      for (
        const uid of latestIds
      ) {
        if (
          checkedUids.has(uid)
        ) {
          continue;
        }

        checkedUids.add(uid);
        
        const mail =
          await fetchMail(
            imap,
            uid
          );
        
        if (!mail) {
          continue;
        }

        const subject =
          String(
            mail.subject || ""
          );

        if (
          !isJumpOrderSubject(
            subject
          )
        ) {
          continue;
        }

        const content = `
${subject}
${mail.text || ""}
${mail.html || ""}
`;

        const mailOrderId =
          extractJumpOrderId(
            content
          );

        const paymentCode =
          extractJumpPaymentCode(
            content
          );

        log(
          "JUMP MAIL PARSED:",
          JSON.stringify({
            uid,
            expectedOrderId,
            mailOrderId,
            paymentCode
          })
        );

        if (
          mailOrderId &&
          String(mailOrderId)
            .toUpperCase() ===
            expectedOrderId &&
          paymentCode
        ) {
          return done(
            paymentCode
          );
        }
      }
    } catch (error) {
      log(
        "JUMP CONBINI LOOP ERROR:",
        error.message || error
      );
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          INTERVAL
        )
    );
  }

  return done(null);
}

async function runCheckMail(imap, imapEmail, imapPass, eventId, extraRaw) {
  let cfg = {};

  try {
    cfg = extraRaw ? JSON.parse(extraRaw) : {};
  } catch (e) {
    cfg = {};
  }

  const mails = Array.isArray(cfg.mails)
    ? cfg.mails.map(x => String(x || "").trim()).filter(Boolean)
    : [];

  const targetDate = String(cfg.date || "").trim();
  const checker = String(cfg.checker || "").trim();
  //const limit = Number(cfg.limit || 1);
  const productId = String(cfg.productId || "").trim();

  const WIN = [];
  const LOST = [];
  const NOTMAIL = [];

  log("CHECKMAIL START");
  log("DATE:", targetDate);
  log("MAILS:", mails.length);

  if (!mails.length) {
    $jsbox.notify(eventId, {
      ok: false,
      reason: "NO_MAIL_LIST",
      win: [],
      lost: [],
      notmail: []
    });
    return;
  }

  if (!targetDate) {
    $jsbox.notify(eventId, {
      ok: false,
      reason: "NO_DATE",
      win: [],
      lost: [],
      notmail: []
    });
    return;
  }
  
  if (!productId) {
    $jsbox.notify(eventId, {
      ok: false,
      reason: "NO_PRODUCT_ID",
      win: [],
      lost: [],
      notmail: []
    });
    return;
  }

  const ids = await search(imap, [
    ["SINCE", targetDate]
  ]);

  log("SEARCH IDS:", ids.length);

  if (!ids.length) {
    NOTMAIL.push(...mails);
  } else {
    const resultMap = {};

    for (const m of mails) {
      resultMap[m.toLowerCase()] = {
        mail: m,
        win: false,
        lostCount: 0,
        foundCount: 0
      };
    }

    log("BATCH FETCH START:", ids.length);
    
    const messages = await fetchMailNoSeen(imap, ids);
    
    log("BATCH FETCH DONE:", messages.length);
    
    for (const msg of messages) {
    
      const toField = String(
        msg.to?.text || ""
      ).toLowerCase();
    
      const sub = String(msg.subject || "");
    
      if (!SUBJECT_KEYWORDS.some(k => sub.includes(k))) {
        continue;
      }
    
      const body = `
    ${sub}
    ${msg.text || ""}
    ${msg.html || ""}
    `;
    
      // chỉ lấy mail của đúng product đang check
      if (
        productId &&
        !body.includes(productId)
      ) {
        continue;
      }
    
      for (const m of mails) {
    
        const key = m.toLowerCase();
    
        if (!toField.includes(key))
          continue;
    
        resultMap[key].foundCount++;
    
        if (body.includes("当選")) {
          resultMap[key].win = true;
        }
        else if (body.includes("落選")) {
          resultMap[key].lostCount++;
        }
    
        break;
      }
    }

    for (const m of mails) {
      const key = m.toLowerCase();
      const r = resultMap[key];
    
      if (!r || r.foundCount === 0) {
        NOTMAIL.push(m);
      } else if (r.win) {
        WIN.push(m);
      } else if (r.lostCount > 0) {
        LOST.push(m);
      } else {
        NOTMAIL.push(m);
      }
    }
  }

  log(
    "RESULT:",
    "WIN", WIN.length,
    "LOST", LOST.length,
    "NOTMAIL", NOTMAIL.length
  );

  const post = await postJSON(WEB_APP_URL, {
    mailimap: imapEmail,
    passimap: imapPass,
    checker,
    win: WIN,
    lost: LOST,
    notmail: NOTMAIL
  });

  log("POST:", post.status, post.ok);

  $jsbox.notify(eventId, {
    ok: post.ok,
    reason: post.ok ? "OK" : "SHEET_POST_FAIL_" + post.status,
    win: WIN,
    lost: LOST,
    notmail: NOTMAIL
  });
}

// ================= ENTRY =================
(async function () {

  const imapEmail = process.argv[2];
  const imapPass  = process.argv[3];
  const target    = process.argv[4];
  const eventId   = process.argv[5];
  const mode      = process.argv[6];
  const extraRaw  = process.argv[7];

  const imap = new Imap({
    user: imapEmail,
    password: imapPass,
    host: getImapHost(imapEmail),
    port: 993,
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false
    }
  });

  let finished = false;

  // ================= DONE =================
  function done(data) {

    if (finished) return;

    finished = true;

    log("DONE:", data);

    try {

      $jsbox.notify(
        eventId,
        data
      );

    } catch (e) {

      log(
        "NOTIFY ERROR:",
        e
      );
    }

    closeImap(imap);
  }

  // ================= CLOSE =================
  function closeImap(imap) {

    try {

      if (!imap) return;

      try {

        imap.end();

        log("IMAP END SENT");

      } catch (e) {

        log(
          "IMAP END ERROR:",
          e.message || e
        );
      }

    } catch (e) {

      log(
        "CLOSE IMAP ERROR:",
        e.message || e
      );
    }
  }

  // ================= ERROR =================
  imap.once("error", err => {

    log(
      "IMAP ERROR:",
      err.message || err
    );

    done(null);
  });

  // ================= READY =================
  imap.once("ready", () => {

    log("IMAP READY");

    imap.openBox(
      "INBOX",
      false,
      async (err, box) => {
    
        if (err) {
    
          log(
            "OPENBOX ERROR:",
            err.message || err
          );
    
          return done(null);
        }
        
        if (mode === "CheckMail") {
          await runCheckMail(
            imap,
            imapEmail,
            imapPass,
            eventId,
            extraRaw
          );
        
          closeImap(imap);
          return;
        }
        
        if (
          mode ===
          "JumpConbini"
        ) {
          await runJumpConbini(
            imap,
            target,
            extraRaw,
            done
          );
        
          return;
        }

        const start = Date.now();

        while (
          Date.now() - start < TIMEOUT
        ) {
        
          if (finished) return;
        
          log("CHECK EMAIL...");
        
          try {
        
            const OTP_SUBJECT =
              "[ポケモンセンターオンライン]ログイン用パスコードのお知らせ";
        
            let ids = [];
        
            if (mode === "JumpCSRegistered") {
        
              ids = await search(
                imap,
                [
                  ["TO", target]
                ]
              );
        
            } else if (
              mode !== "Create" &&
              mode !== "JumpPlusCreate" &&
              mode !== "JumpCSCreate" &&
              mode !== "ChangeEmail"
            ) {
        
              ids = await search(
                imap,
                [
                  ["TO", target],
                  "UNSEEN",
                  ["SUBJECT", OTP_SUBJECT]
                ]
              );
        
            } else {
        
              ids = await search(
                imap,
                [
                  ["TO", target],
                  "UNSEEN"
                ]
              );
            }
        
            ids = ids
              .map(Number)
              .filter(
                uid =>
                  Number.isFinite(uid)
              );
        
            log("MATCH IDS:", ids);
        
            if (ids.length) {
        
              const uid =
                Math.max(...ids);
        
              // phần dưới giữ nguyên

              log(
                "FETCH UID:",
                uid
              );
              
              const isPokemonOtp =
                mode !== "Create" &&
                mode !== "JumpPlusCreate" &&
                mode !== "JumpCSCreate" &&
                mode !== "JumpCSRegistered" &&
                mode !== "ChangeEmail";
              
              const mail =
                isPokemonOtp
                  ? await fetchPokemonOtpMail(
                      imap,
                      uid
                    )
                  : await fetchMail(
                      imap,
                      uid
                    );

              if (mail) {

                const subject =
                  mail.subject || "";

                log(
                  "MAIL SUBJECT:",
                  subject
                );

                const content = `
${subject}
${mail.text || ""}
${mail.html || ""}
`;

                // =========================
                // ĐÃ ĐĂNG KÝ
                // =========================
                if (
                  subject.includes(
                    "メールアドレスは既に登録済みです"
                  )
                ) {

                  log(
                    "⚠️ REGISTERED MAIL"
                  );

                  appendFile(
                    "created.txt",
                    target
                  );

                  return done(
                    "REGISTERED_MAIL"
                  );
                }

                // =========================
                // GET VALUE
                // =========================
                let value = null;
                
                if (mode === "Create") {
                  value =
                    extractCreateLink(content);
                
                } else if (
                  mode === "JumpPlusCreate"
                ) {
                  value =
                    extractJumpPlusCreateLink(
                      content
                    );
                
                } else if (
                  mode === "JumpCSCreate"
                ) {
                  value =
                    extractJumpCSOtp(content);
                
                } else if (
                  mode === "JumpCSRegistered"
                ) {
                  value =
                    extractJumpCSRegistered(
                      subject
                    );
                
                } else if (
                  mode === "ChangeEmail"
                ) {
                  value =
                    extractChangeEmail(content);
                
                } else {
                  const OTP_SUBJECT =
                    "[ポケモンセンターオンライン]ログイン用パスコードのお知らせ";
                
                  if (
                    String(subject || "")
                      .trim() === OTP_SUBJECT
                  ) {
                    value =
                      extractOtp(content);
                  } else {
                    log(
                      "SKIP OTP - WRONG SUBJECT:",
                      subject
                    );
                
                    value = null;
                  }
                }

                // =========================
                // FOUND
                // =========================
                if (value) {
                  log(
                    "FOUND:",
                    value
                  );
                
                  if (
                    mode ===
                    "JumpCSRegistered"
                  ) {
                    // Chỉ check trạng thái,
                    // không xóa mail hoàn tất.
                    return done(value);
                  }
                
                  imap.addFlags(
                    uid,
                    "\\Deleted",
                    err => {
                      if (err) {
                        log(
                          "DELETE FLAG ERROR:",
                          err.message || err
                        );
                      }
                
                      imap.expunge(() => {
                        done(value);
                      });
                    }
                  );
                
                  return;
                }
              }
            }

          } catch (e) {

            log(
              "LOOP ERROR:",
              e.message || e
            );
          }

          log(
            "NO OTP → WAIT",
            INTERVAL / 1000,
            "s"
          );

          await new Promise(r =>
            setTimeout(
              r,
              INTERVAL
            )
          );
        }

        // =========================
        // TIMEOUT
        // =========================
        log(
          "TIMEOUT - NO OTP FOUND"
        );
        return done(null);
      }
    );
  });

  imap.connect();

})();