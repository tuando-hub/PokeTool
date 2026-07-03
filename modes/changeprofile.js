// =======================================================
// CHANGE PROFILE MODE
// Login → OTP (SDC) → Change Address → Logout → Reset IP
// =======================================================

const LOGIN_URL = "https://www.pokemoncenter-online.com/login/";

const DELAY_STEP        = 1500;
const POLL_OTP_INTERVAL = 2000;
const POLL_OTP_TIMEOUT  = 300000;

let IMAP_EMAIL = "";
let IMAP_PASS  = "";
let STOP_FLAG  = false;

function savePending(list){
  $drive.write({
    path: "pending.json",
    data: $data({ string: JSON.stringify(list, null, 2) })
  });
}

function loadPending(){
  if(!$drive.exists("pending.json")) return [];
  try{
    return JSON.parse($drive.read("pending.json").string);
  }catch{
    return [];
  }
}

function removeFromPending(acc){
  const list = loadPending().filter(a => a.email !== acc.email);
  savePending(list);
}

// =======================================================
// UTILS
// =======================================================
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

// =======================================================
// PYTO OTP — SAME AS BUY (SEEN + DELETED)
// =======================================================
async function callPytoGetOtp(imapEmail, imapPass, targetMail){
  const server = imapEmail.endsWith("@gmail.com")
    ? "imap.gmail.com"
    : "imap.mail.me.com";

  const code = `
import imaplib,email,re,time,pasteboard,webbrowser

EMAIL="${imapEmail}"
PASS="${imapPass}"
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

    m=re.search(r"(\\d{6})",body)
    if not m: return None

    imap.store(i,"+FLAGS","\\\\Seen")
    imap.store(i,"+FLAGS","\\\\Deleted")
    imap.expunge()

    return m.group(1)
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

async function waitOtp(){
  const start = Date.now();
  while(Date.now()-start < POLL_OTP_TIMEOUT){
    const t = $clipboard.text || "";
    if(/^\d{6}$/.test(t)) return t;
    await delay(POLL_OTP_INTERVAL);
  }
  return null;
}

// =======================================================
// WEBVIEW
// =======================================================
async function createWebView(title){
  return new Promise(resolve=>{
    $ui.push({
      props:{ title },
      views:[{
        type:"web",
        props:{ id:"wv", url:"about:blank" },
        layout:$layout.fill,
        events:{ didFinish: s => s._ready = true }
      }],
      events:{ appeared:()=>resolve($("wv")) }
    });
  });
}

async function waitReady(wv,timeout=20000){
  const t=Date.now();
  wv._ready=false;
  while(!wv._ready){
    await delay(50);
    if(Date.now()-t>timeout) return true;
  }
  return true;
}

async function clearSession(wv){
  try{
    wv.url="https://www.pokemoncenter-online.com/logout/";
    await delay(800);
    await wv.eval(`
      document.cookie.split(";").forEach(c=>{
        document.cookie=c.replace(/=.*/,"=;expires="+new Date(0).toUTCString()+";path=/");
      });
      localStorage.clear();
      sessionStorage.clear();
    `);
  }catch{}
}

// =======================================================
// PROCESS ONE ACCOUNT
// =======================================================
async function processAccount(acc, addr, idx, total){
  const wv = await createWebView(`Change ${idx}/${total}`);
  await clearSession(wv);

  // ===== LOGIN =====
  wv.url = LOGIN_URL;
  await waitReady(wv);

  await wv.eval(`
    document.querySelector('#login-form-email').value=${JSON.stringify(acc.email)};
    document.querySelector('#current-password').value=${JSON.stringify(acc.pass)};
    document.querySelector('#form1Button')?.click();
  `);
  await delay(3500);

  // ===== OTP =====
  await callPytoGetOtp(IMAP_EMAIL, IMAP_PASS, acc.email);
  const otp = await waitOtp();
  if(!otp) return false;

  await wv.eval(`
    document.querySelector('#authCode').value="${otp}";
    document.querySelector('#authBtn')?.click();
  `);
  await waitReady(wv);

  // ===== GO TO PROFILE CHANGE =====
  await wv.eval(`
    [...document.querySelectorAll("a")]
      .find(a => a.textContent.includes("会員情報変更"))
      ?.click();
  `);
  await waitReady(wv);

  // ===== CHANGE ADDRESS (FULL – KHÔNG BỚT) =====
  await wv.eval(`
    (function(){
      const set=(sel,v)=>{
        const e=document.querySelector(sel);
        if(!e) return;
        e.value=v;
        e.dispatchEvent(new Event("input",{bubbles:true}));
        e.dispatchEvent(new Event("change",{bubbles:true}));
      };

      set("#postal-code",   ${JSON.stringify(addr.postcode || "")});
      set("#address-level1",${JSON.stringify(addr.pref || "")});
      set("#address-level2",${JSON.stringify(addr.city || "")});
      set("#address-line1", ${JSON.stringify(addr.banchi || "")});
      set("#address-line2", ${JSON.stringify(addr.tatemono || "")});
    })();
  `);
  await delay(1200);

  // ===== SUBMIT 2 STEP (GIỮ NGUYÊN FLOW CŨ) =====
  await wv.eval(`document.querySelector("button.submitButton")?.click();`);
  await delay(2000);
  await wv.eval(`document.querySelector("button.submitButton")?.click();`);
  await waitReady(wv);

  // ===== CLEANUP =====
  await clearSession(wv);
  wv.remove();
  $ui.pop();

  $app.openURL("shortcuts://run-shortcut?name=" + encodeURIComponent("Reset IP"));
  await delay(6000);

  return true;
}

// =======================================================
// ENTRY — UI CALL
// =======================================================
async function run(ctx){
  STOP_FLAG=false;

  IMAP_EMAIL = (ctx.imapEmail || "").trim();
  IMAP_PASS  = (ctx.imapPass  || "").trim();

  const accounts = ctx.accounts || [];
  const rawLines = ctx.addresses || [];
  
  savePending(accounts);

  const postcode = (ctx.postcode || "").trim();
  const pref     = (ctx.pref     || "").trim();
  const city     = (ctx.city     || "").trim();

  for(let i=0;i<accounts.length;i++){
    if(STOP_FLAG) break;

    const line = (rawLines[i] || "").trim();

    let banchi="", tatemono="";
    const idxLife = line.indexOf("Life");
    if(idxLife>=0){
      banchi=line.slice(0,idxLife).trim();
      tatemono=line.slice(idxLife).trim();
    }else{
      const p=line.split(/\s+/);
      banchi=p[0]||"";
      tatemono=p.slice(1).join(" ")||"";
    }

    const addr = { postcode, pref, city, banchi, tatemono };
    
    const acc = accounts[i];

    const ok = await processAccount(
      accounts[i],
      addr,
      i+1,
      accounts.length
    );
    
    removeFromPending(acc);

    ctx.onProgress &&
      ctx.onProgress(
        accounts.slice(i+1).map(a=>`${a.email}:${a.pass}`).join("\n"),
        { lastEmail: accounts[i].email, pending: accounts.length-i-1 }
      );
  }

  $ui.alert("🔁 CHANGE PROFILE DONE");
}

function stop(){ STOP_FLAG=true; }

module.exports = { run, stop };