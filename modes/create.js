// =======================================================
// CREATE MODE — Auto Create Accounts (JSBox)
// FAST FILL VERSION (NO LOGIC CUT)
// =======================================================

const LOGIN_URL = "https://www.pokemoncenter-online.com/login/";

// ===== SPEED CONFIG =====
const DELAY_EMAIL_STEP   = 200;   // email input
const DELAY_FILL_DONE    = 300;   // sau fill all
const POLL_LINK_INTERVAL = 2000;
const POLL_LINK_TIMEOUT  = 300000;

let IMAP_EMAIL = "";
let IMAP_PASS  = "";
let STOP_FLAG  = false;

// =======================================================
// UTILS
// =======================================================
const delay = ms => new Promise(r => setTimeout(r, ms));

function parseMailPass(list) {
  return (list || [])
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const [email, pass] = l.split(":");
      if (!email || !pass) return null;
      return { email: email.trim(), pass: pass.trim() };
    })
    .filter(Boolean);
}

// =======================================================
// FILE STATE (ANTI DUP)
// =======================================================
function savePending(list) {
  $drive.write({
    path: "pending.json",
    data: $data({ string: JSON.stringify(list, null, 2) })
  });
}

function loadPending() {
  if (!$drive.exists("pending.json")) return [];
  try {
    return JSON.parse($drive.read("pending.json").string);
  } catch {
    return [];
  }
}

function removeFromPending(acc) {
  const list = loadPending().filter(a => a.email !== acc.email);
  savePending(list);
}

function saveDone(acc) {
  let list = [];
  if ($drive.exists("done.json")) {
    try { list = JSON.parse($drive.read("done.json").string); } catch {}
  }
  list.push(acc);
  $drive.write({
    path: "done.json",
    data: $data({ string: JSON.stringify(list, null, 2) })
  });
}

// =======================================================
// WEBVIEW
// =======================================================
async function createWebView(title) {
  return new Promise(resolve => {
    $ui.push({
      props: { title },
      views: [{
        type: "web",
        props: { id: "wv", url: "about:blank" },
        layout: $layout.fill,
        events: { didFinish: s => s._ready = true }
      }],
      events: { appeared: () => resolve($("wv")) }
    });
  });
}

async function waitPageReady(wv, timeout = 20000) {
  const start = Date.now();
  wv._ready = false;
  while (!wv._ready) {
    if (STOP_FLAG) return false;
    if (Date.now() - start > timeout) return true;
    await delay(50);
  }
  return true;
}

async function clearSession(wv) {
  try {
    wv.url = "https://www.pokemoncenter-online.com/logout/";
    await delay(800);
    await wv.eval({
      script: `
        try{
          document.cookie.split(";").forEach(c=>{
            document.cookie=c.replace(/=.*/,"=;expires="+new Date(0).toUTCString()+";path=/");
          });
          localStorage.clear();
          sessionStorage.clear();
        }catch(e){}
      `
    });
  } catch {}
}

// =======================================================
// PYTO — GET CREATE LINK (MARK SEEN + DELETE)
// =======================================================
async function callPytoGetCreateLink(targetMail) {
  const server = IMAP_EMAIL.endsWith("@gmail.com")
    ? "imap.gmail.com"
    : "imap.mail.me.com";

  const code = `
import imaplib,email,re,time,pasteboard,webbrowser

EMAIL="${IMAP_EMAIL}"
PASS="${IMAP_PASS}"
SERVER="${server}"
TARGET="${targetMail}"

def fetch():
  imap=None
  try:
    imap=imaplib.IMAP4_SSL(SERVER)
    imap.login(EMAIL,PASS)
    imap.select("INBOX")

    _,to_ids=imap.search(None,f'TO "{TARGET}"')
    _,unseen=imap.search(None,"UNSEEN")

    ids=set(to_ids[0].split()) & set(unseen[0].split())
    if not ids: return None

    i=sorted(ids,key=lambda x:int(x))[-1]
    _,data=imap.fetch(i,"(BODY.PEEK[])")
    msg=email.message_from_bytes(data[0][1])

    body=""
    for p in msg.walk():
      if p.get_content_type()=="text/plain":
        body=p.get_payload(decode=True).decode(errors="ignore")
        break

    m=re.search(r"https?://[^\\s\\\"'<>]*new-customer[^\\s\\\"'<>]*",body)
    if not m: return None

    imap.store(i,"+FLAGS","\\\\Seen")
    imap.store(i,"+FLAGS","\\\\Deleted")
    imap.expunge()

    return m.group(0)
  except:
    return None
  finally:
    try: imap.close(); imap.logout()
    except: pass

t=time.time()
while time.time()-t<300:
  r=fetch()
  if r:
    pasteboard.set_string(r)
    print(r,end="")
    break
  time.sleep(5)

webbrowser.open("jsbox://")
`;

  $clipboard.text = "";
  $app.openURL("pyto://x-callback/?code=" + encodeURIComponent(code));
}

async function waitCreateLink() {
  const start = Date.now();
  while (Date.now() - start < POLL_LINK_TIMEOUT) {
    const t = $clipboard.text || "";
    if (t.startsWith("http") && t.includes("new-customer")) return t;
    await delay(POLL_LINK_INTERVAL);
  }
  return null;
}

// =======================================================
// FAST FORM FILL (🔥 CORE)
// =======================================================
async function fillAll(wv, d) {
  await wv.eval({
    script: `
    (function(){

      const setVal = (sel, val) => {
        const e = document.querySelector(sel);
        if (!e) return;
        e.value = val;
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.dispatchEvent(new Event("change", { bubbles: true }));
      };

      // ===== TEXT =====
      setVal("#registration-form-fname", ${JSON.stringify(d.name)});
      setVal("#registration-form-kana", ${JSON.stringify(d.kana)});
      setVal("#registration-form-birthdayyear", "1992");
      setVal("#registration-form-birthdaymonth", "11");
      setVal("#registration-form-birthdayday", "24");
      setVal("#registration-form-postcode", ${JSON.stringify(d.postcode)});
      setVal("#registration-form-address-level1", ${JSON.stringify(d.pref)});
      setVal("#registration-form-address-level2", ${JSON.stringify(d.city)});
      setVal("#registration-form-address-line1", ${JSON.stringify(d.line1)});
      setVal("#registration-form-address-line2", ${JSON.stringify(d.line2)});
      setVal("[name='dwfrm_profile_customer_phone']", ${JSON.stringify(d.phone)});
      setVal("[name='dwfrm_profile_login_password']", ${JSON.stringify(d.pass)});
      setVal("[name='dwfrm_profile_login_passwordconfirm']", ${JSON.stringify(d.pass)});

      // ===== ❌ KHÔNG NHẬN MAIL =====
      const mailOff = document.querySelector(
        "input[name='dwfrm_profile_customer_addtoemaillist'][value='false']"
      );
      if (mailOff) {
        mailOff.checked = true;
        mailOff.dispatchEvent(new Event("input",  { bubbles: true }));
        mailOff.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // ===== CHECKBOX =====
      const terms = document.querySelector(
        "[name='dwfrm_profile_customer_agreetotheterms']"
      );
      if (terms) {
        terms.checked = true;
        terms.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const privacy = document.querySelector(
        "[name='dwfrm_profile_customer_agreetotheprivacypolicy']"
      );
      if (privacy) {
        privacy.checked = true;
        privacy.dispatchEvent(new Event("change", { bubbles: true }));
      }

      return true;
    })();
    `
  });

  // delay rất ngắn
  await delay(500);
}

async function submit(wv) {
  await wv.eval({ script:`document.querySelector("#registration_button")?.click();` });
  await delay(2500);
  await wv.eval({ script:`document.querySelector(".submitButton")?.click();` });
  await delay(3500);
}

// =======================================================
// PROCESS ONE ACCOUNT
// =======================================================
async function processAccount(acc, data, idx, total) {
  const wv = await createWebView(`Create ${idx}/${total}`);
  await clearSession(wv);

  wv.url = LOGIN_URL;
  await waitPageReady(wv);

  // 🔥 FAST EMAIL INPUT
  await wv.eval({
    script: `
      const e=document.querySelector("#login-form-regist-email");
      if(e){
        e.value=${JSON.stringify(acc.email)};
        e.dispatchEvent(new Event('input',{bubbles:true}));
        e.dispatchEvent(new Event('change',{bubbles:true}));
      }
    `
  });
  await delay(DELAY_EMAIL_STEP);

  await wv.eval({ script:`document.querySelector('#form2Button')?.click();` });
  await waitPageReady(wv);
  await wv.eval({ script:`document.querySelector('#send-confirmation-email')?.click();` });
  await waitPageReady(wv);

  await callPytoGetCreateLink(acc.email);
  const link = await waitCreateLink();
  if (!link) return false;

  wv.url = link;
  await waitPageReady(wv);

  await fillAll(wv, { ...data, pass: acc.pass });
  await submit(wv);

  // ✅ SAVE STATE
  saveDone(acc);
  removeFromPending(acc);

  await clearSession(wv);
  wv.remove();
  $ui.pop();
  
  $app.openURL("shortcuts://run-shortcut?name=" + encodeURIComponent("Reset IP"));
  await delay(6000);

  return true;
}

// =======================================================
// ENTRY
// =======================================================
async function run(ctx) {
  STOP_FLAG = false;
  IMAP_EMAIL = ctx.imapEmail;
  IMAP_PASS  = ctx.imapPass;

  const accounts = parseMailPass(ctx.accounts.map(a => `${a.email}:${a.pass}`));
  if (!accounts.length) return;

  savePending(accounts);

  for (let i = 0; i < accounts.length; i++) {
    if (STOP_FLAG) break;

    await processAccount(
      accounts[i],
      {
        name: ctx.names[i % ctx.names.length],
        kana: ctx.kanas[i % ctx.kanas.length],
        line1: ctx.addresses[i % ctx.addresses.length],
        line2: "",
        phone: ctx.phones[i % ctx.phones.length],
        postcode: ctx.postcode,
        pref: ctx.pref,
        city: ctx.address1
      },
      i + 1,
      accounts.length
    );

    ctx.onProgress &&
      ctx.onProgress(
        loadPending().map(a => `${a.email}:${a.pass}`).join("\n"),
        { lastEmail: accounts[i].email, pending: loadPending().length }
      );
  }

  $ui.alert("🎉 CREATE DONE");
}

function stop(){ STOP_FLAG = true; }

module.exports = { run, stop };