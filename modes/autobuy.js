// =======================================================
// AUTO BUY MODE — dùng chung UI mới
// - giống Lottery nhưng vào thẳng mua
// - dùng productIds
// - OTP qua Pyto (y hệt Lottery)
// =======================================================

const LOGIN_URL = "https://www.pokemoncenter-online.com/login/";

const DELAY_STEP = 1500;
const POLL_OTP_INTERVAL = 2000;
const POLL_OTP_TIMEOUT  = 300000;

let IMAP_EMAIL = "";
let IMAP_PASS  = "";
let STOP_FLAG  = false;

// =======================================================
// UTILS
// =======================================================
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

// =======================================================
// PENDING STATE (GIỐNG LOTTERY / CREATE)
// =======================================================
function loadPending() {
  if (!$drive.exists("pending.json")) return [];
  try {
    return JSON.parse($drive.read("pending.json").string);
  } catch {
    return [];
  }
}

function savePending(list) {
  $drive.write({
    path: "pending.json",
    data: $data({ string: JSON.stringify(list, null, 2) })
  });
}

function removeFromPending(acc) {
  let list = loadPending();
  list = list.filter(a => a.email !== acc.email);
  savePending(list);
}

// ===============================================
// PYTO — OTP (GIỐNG LOTTERY)
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

def get_otp():
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
    _,data=imap.fetch(i,"(BODY[])")
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
  r=get_otp()
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
      props:{title},
      views:[{
        type:"web",
        props:{id:"wv",url:"about:blank"},
        layout:$layout.fill,
        events:{ didFinish: s=>s._ready=true }
      }],
      events:{ appeared:()=>resolve($("wv")) }
    });
  });
}

async function waitReady(wv,timeout=20000){
  const t=Date.now(); wv._ready=false;
  while(!wv._ready){
    await delay(50);
    if(Date.now()-t>timeout) return true;
  }
  return true;
}

async function clearSession(wv){
  try{
    wv.url="https://www.pokemoncenter-online.com/logout/";
    await delay(1000);
    await wv.eval(`
      document.cookie.split(";").forEach(c=>{
        document.cookie=c.replace(/=.*/,"=;expires="+new Date(0).toUTCString()+";path=/");
      });
      localStorage.clear(); sessionStorage.clear();
    `);
  }catch{}
}

// =======================================================
// PROCESS 1 ACCOUNT
// =======================================================
async function processAccount(acc, products, qty, idx, total){
  const wv = await createWebView(`Buy ${idx}/${total}`);
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
    document.querySelector("#authCode").value="${otp}";
    document.querySelector("#authBtn")?.click();
  `);
  await waitReady(wv);

  // ===== ADD ALL PRODUCTS (FIXED) =====
  for (let i = 0; i < products.length; i++) {
    const pid = products[i];
  
    wv.url = `https://www.pokemoncenter-online.com/${pid}.html`;
    await waitReady(wv);
    await delay(800); // chờ DOM render
  
    await wv.eval(`
      (function(){
        var qtyInput = document.querySelector('#quantity');
        if(qtyInput){
          qtyInput.value = "${qty}";
          qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
          qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
  
        var btn = document.querySelector('.add-to-cart-button a');
        if(btn){
          btn.click();
        }
      })();
    `);
  
    // ⏱ CHỜ AJAX add-to-cart (RẤT QUAN TRỌNG)
    await delay(1500);
  }

  // ==== CART + CHECKOUT ====
  wv.url = "https://www.pokemoncenter-online.com/cart/";
  await waitReady(wv);
  
  // レジに進む
  await wv.eval(`
    var go=document.querySelector('.comBtn a[href="/order/"]');
    if(go) go.click();
  `);
  await waitReady(wv);
  
  // ===== CHỌN NGÀY GIAO HÀNG + 午前中 =====
  await wv.eval(`
    var radio=document.querySelector(
      'input[name="dwfrm_shipping_shippingAddress_timetable_hasRequest"][value="true"]'
    );
    if(radio) radio.checked=true;
  `);
  await delay(1000);
  
  await wv.eval(`
    var dateSelect=document.querySelector(
      'select[name="dwfrm_shipping_shippingAddress_timetable_dateRange"]'
    );
    if(dateSelect && dateSelect.options.length>1){
      dateSelect.selectedIndex=1;
      dateSelect.dispatchEvent(new Event('change'));
    }
  `);
  await delay(1000);
  
  await wv.eval(`
    var timeSelect=document.querySelector(
      'select[name="dwfrm_shipping_shippingAddress_timetable_timeRange"]'
    );
    if(timeSelect){
      timeSelect.value="8";
      timeSelect.dispatchEvent(new Event('change'));
    }
  `);
  await delay(1000);
  
  // ===== お支払い方法選択へ進む =====
  await wv.eval(`
    var nextBtn=document.querySelector(
      'ul.linkList li.next-step-button a.submit-shipping'
    );
    if(nextBtn) nextBtn.click();
  `);
  await delay(3500);
  
  // ===== CHỌN COD =====
  await wv.eval(`
    var cod=document.querySelector(
      'input[name="radioMethodMain"][value="CASH_ON_DELIVERY"]'
    );
    if(cod) cod.checked=true;
  
    var hid=document.querySelector('#hidMethodName');
    if(hid) hid.value="CASH_ON_DELIVERY";
  `);
  await delay(1000);
  
  // ===== ご注文内容を確認する =====
  await wv.eval(`
    var checkBtn=document.querySelector(
      'ul.linkList li.next-step-button a.submit-payment'
    );
    if(checkBtn) checkBtn.click();
  `);
  await delay(3500);
  
  // ===== 注文を確定する =====
  await wv.eval(`
    var finalBtn=document.querySelector(
      'ul.linkList li.list02.next-step-button a'
    );
    if(finalBtn) finalBtn.click();
  `);
  await delay(3500);

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

  IMAP_EMAIL = ctx.imapEmail;
  IMAP_PASS  = ctx.imapPass;

  const accounts = ctx.accounts;
  const products = ctx.products;
  const qty = ctx.qty;
  
  savePending(accounts);

  for(let i=0;i<accounts.length;i++){
    if(STOP_FLAG) break;

    const acc = accounts[i];
    
    const ok = await processAccount(
      acc,
      products,
      qty,
      i+1,
      accounts.length
    );
    
    // ===== CHỈ XOÁ KHI BUY OK =====
    if (ok) {
      removeFromPending(acc);
    }
    
    // ===== LẤY LẠI PENDING THỰC =====
    const pending = loadPending();
    
    // ===== UPDATE UI + CACHE =====
    ctx.onProgress &&
      ctx.onProgress(
        pending.map(a => `${a.email}:${a.pass}`).join("\n"),
        {
          lastEmail: acc.email,
          pending: pending.length
        }
      );

    // 🔥 XOÁ MAIL KHỎI UI
    ctx.onProgress &&
      ctx.onProgress(
        accounts.slice(i+1).map(a=>`${a.email}:${a.pass}`).join("\n"),
        { lastEmail: accounts[i].email, pending: accounts.length-i-1 }
      );
  }

  $ui.alert("🛒 BUY DONE");
}

function stop(){ STOP_FLAG=true; }

module.exports = { run, stop };