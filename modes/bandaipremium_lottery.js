// Premium Bandai lottery: use the project's existing isolated WebView.
// 3-D Secure stays in the visible WebView for manual completion.
const Core = require('../core');
const Web = require('../web');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (s, type) => Core.addLog('[Premium Lottery] ' + s, type || 'info');
const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const quote = JSON.stringify;
async function evaluate(wv, script) {
  const value = await Web.evalJS(wv, '(function(){try{' + script + '}catch(e){return "JS_ERROR:"+e.message}})()');
  return value == null ? '' : String(value);
}
async function wait(wv, script, stopCheck, label, timeout=90000) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeout) {
    if (stopCheck) stopCheck();
    if (wv._destroyed) throw new Error('WEBVIEW_CLOSED_' + label);
    const state = await evaluate(wv, script);
    if (state === 'YES') return;
    if (state.startsWith('JS_ERROR:') && state !== last) {
      log(label + ' · đang chờ trang ổn định', 'warn');
    }
    last = state;
    await sleep(650);
  }
  throw new Error('TIMEOUT_' + label);
}
async function click(wv, selector, stopCheck, label) {
  await wait(wv, 'var e=document.querySelector('+quote(selector)+');return e&&e.isConnected&&!e.disabled&&e.getClientRects().length?"YES":"NO"', stopCheck, label);
  const result = await evaluate(wv, 'var e=document.querySelector('+quote(selector)+');if(!e||e.disabled)return "NOT_READY";e.click();return "OK"');
  if (result !== 'OK') throw new Error('CLICK_'+label+'_'+result);
}
async function fill(wv, data, stopCheck, label) {
  await wait(wv, 'return '+quote(Object.keys(data))+'.every(function(k){var e=document.querySelector(k);return e&&!e.disabled})?"YES":"NO"', stopCheck, label);
  // Set and verify in one evaluation; do not expose field values in logs/errors.
  const script = `var data=${quote(data)};
for(var k in data){
 var e=document.querySelector(k);if(!e)return "MISSING_FIELD_"+k.slice(1);
 var expected=String(data[k]);
 var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
 setter.call(e,expected);
 // Check the direct assignment BEFORE the gateway formats or masks the field.
 if(e.value!==expected)return "ASSIGNMENT_FAILED_"+k.slice(1);
 e.dispatchEvent(new Event("input",{bubbles:true}));
 e.dispatchEvent(new Event("change",{bubbles:true}));
 e.dispatchEvent(new Event("blur",{bubbles:true}));
 // Gateway may add spaces, mask digits or replace the input element after events.
 // A masked PAN is not evidence that assignment failed.
 if(k==="#ccNumber_disp"){
  var current=document.querySelector(k);
  if(!current)return "CARD_FIELD_DISAPPEARED";
  var visible=current.value.replace(/\D/g,"");
  var original=expected.replace(/\D/g,"");
  if(visible && visible!==original && !(visible.length<=4 && original.endsWith(visible)) && !(visible.length>=4 && original.endsWith(visible.slice(-4)))){
   return "CARD_GATEWAY_REFORMATTED";
  }
 }
}
return "OK"`;
  const result = await evaluate(wv, script);
  if (result !== 'OK') throw new Error('FILL_'+label+'_'+result);
  log(label + ' · đã xác nhận giá trị các ô nhập');
}
async function checkLogin(wv, stopCheck) {
  // A redirect alone is insufficient; ensure login form is gone and page is not an error page.
  await wait(wv, 'var p=location.pathname;var form=document.querySelector("#login_id, #btnLogin");var body=document.body?document.body.innerText:"";return !p.startsWith("/login")&&!form&&!/ログインIDまたはパスワードが正しくありません|ログインに失敗/.test(body)?"YES":"NO"', stopCheck, 'LOGIN_SUCCESS', 120000);
}
function payment(form, index) {
  const cardLine = lines(form.creditList)[index-1];
  const ownerLine = lines(form.creditOwnerList)[index-1];
  if (!cardLine || !ownerLine) throw new Error('MISSING_CARD_FOR_ACCOUNT_'+index);
  const m = cardLine.match(/^([\d\s-]{13,25})\s*[-|,]\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*[-|,]\s*(\d{3,4})$/);
  if (!m) throw new Error('CARD_FORMAT_INVALID_ACCOUNT_'+index);
  const number = m[1].replace(/\D/g,'');
  const month = m[2].padStart(2,'0');
  const year = m[3].slice(-2);
  const owner = ownerLine.trim().split(/\s+/);
  if (number.length < 13 || number.length > 19 || Number(month)<1 || Number(month)>12 || owner.length<2) throw new Error('CARD_DATA_INVALID_ACCOUNT_'+index);
  return {number,month,year,cvv:m[4],first:owner[0],last:owner.slice(1).join(' ')};
}
async function runAccount({acc,index,form,stopCheck}) {
  const product = String(form.productIds || '').split(/[,\s]+/).filter(Boolean)[0];
  if (!/^\d+$/.test(product)) throw new Error('PRODUCT_ID_INVALID');
  const card = payment(form,index);
  const id = String(acc.email||'').split('@')[0];
  if (!id || !acc.pass) throw new Error('ACCOUNT_INVALID');
  const wv = Web.create('https://p-bandai.jp/login/');
  if (!wv) throw new Error('WEBVIEW_CREATE_FAILED');
  let done = false;
  const step = (n,s) => {Core.updateCurrent({email:acc.email,step:n+'/8 · '+s,status:'Running'});log(acc.email+' · '+s);};
  try {
    step(1,'Đăng nhập');
    await fill(wv,{'#login_id':id,'#password':acc.pass},stopCheck,'LOGIN_FORM');
    await click(wv,'#btnLogin',stopCheck,'LOGIN_BUTTON');
    await checkLogin(wv,stopCheck);
    step(2,'Mở sản phẩm '+product);
    Web.load('https://p-bandai.jp/item/item-'+product+'/',wv);
    await wait(wv,'return document.querySelector("form[name=campaign_entry] button.pb24-item-btn__cart")?"YES":"NO"',stopCheck,'LOTTERY_ITEM',60000);
    await click(wv,'form[name=campaign_entry] button.pb24-item-btn__cart',stopCheck,'LOTTERY_APPLY');
    step(3,'Chọn sản phẩm lottery');
    await wait(wv,'return document.querySelector("input[type=radio][name=order_no]")?"YES":"NO"',stopCheck,'LOTTERY_RADIO',60000);
    const selected=await evaluate(wv,'var e=document.querySelector("input[type=radio][name=order_no]");if(!e)return "MISSING";e.checked=true;e.dispatchEvent(new Event("change",{bubbles:true}));return "OK"');
    if (selected!=='OK') throw new Error('LOTTERY_SELECT_'+selected);
    await wait(wv,'var e=document.querySelector("input[type=radio][name=order_no]");return e&&e.checked?"YES":"NO"',stopCheck,'LOTTERY_SELECTED');
    await click(wv,'#vote_button_id',stopCheck,'LOTTERY_REVIEW');
    step(4,'Xác nhận lottery');
    await click(wv,'#BTN2',stopCheck,'LOTTERY_REGISTER');
    // Do not click registration twice on slow connections; wait for the payment page.
    step(5,'Chờ trang thanh toán');
    await wait(wv,'return document.querySelector("#ccNumber_disp")?"YES":"NO"',stopCheck,'CARD_PAGE',90000);
    step(6,'Nhập thông tin thẻ');
    // Payment gateway may render maxlength=3 even when issuer uses a 4-digit security code.
    // Preserve the supplied value; let the gateway validate it.
    if (card.cvv.length === 4) await evaluate(wv, 'var e=document.querySelector("#securityCode");if(e)e.maxLength=4;return "OK"');
    await fill(wv,{'#ccNumber_disp':card.number,'#ccExpirationMonth':card.month,'#ccExpirationYear_disp':card.year,'#securityCode':card.cvv,'#billingFirstName':card.first,'#billingLastName':card.last},stopCheck,'CARD_FIELDS');
    // Synchronize hidden normalized values used by some versions of the payment form.
    const hiddenResult = await evaluate(wv, 'var n=document.querySelector("#ccNumber"),y=document.querySelector("#ccExpirationYear");if(n)n.value='+quote(card.number)+';if(y)y.value='+quote('20'+card.year)+';return "OK"');
    if (hiddenResult !== 'OK') throw new Error('CARD_HIDDEN_FIELDS_'+hiddenResult);
    await wait(wv,'return document.querySelector("#ccNumber_disp")&&document.querySelector("#securityCode")&&document.querySelector("#securityCode").value.length>=3?"YES":"NO"',stopCheck,'CARD_VALUES_VERIFIED');
    // Never log card data, CVV, or form contents.
    step(7,'Xác nhận thẻ');
    // The gateway may keep the Confirm anchor CSS-disabled while its own
    // input validation is still running. Never force-submit a disabled anchor.
    // Report the gateway's validation state rather than silently hanging.
    const confirmStart=Date.now();
    let lastConfirmState='';
    while(true){
      if(stopCheck)stopCheck();
      if(wv._destroyed)throw new Error('WEBVIEW_CLOSED_CARD_CONFIRM');
      const state=await evaluate(wv,`var a=document.querySelector('#exec-button');
if(!a)return 'MISSING_BUTTON';
var errors=Array.from(document.querySelectorAll('[id$="_error"],.errorBox')).map(function(e){return (e.innerText||'').trim()}).filter(Boolean);
var disabled=a.classList.contains('disabled')||a.getAttribute('aria-disabled')==='true';
return JSON.stringify({enabled:!disabled,errors:errors.slice(0,5),url:location.pathname});`);
      let info;try{info=JSON.parse(state)}catch(_){info={enabled:false,errors:[],url:'unknown'}}
      if(info.enabled){log('CARD_CONFIRM · nút 確認 đã sẵn sàng');break;}
      const signature=JSON.stringify(info);
      if(signature!==lastConfirmState){
        log('CARD_CONFIRM · đang chờ gateway xác thực'+(info.errors.length?' · '+info.errors.join(' | ').slice(0,180):''),'warn');
        lastConfirmState=signature;
      }
      if(Date.now()-confirmStart>90000)throw new Error('CARD_CONFIRM_DISABLED_CHECK_PAYMENT_FORM');
      await sleep(900);
    }
    await click(wv,'#exec-button',stopCheck,'CARD_CONFIRM');
    log('CARD_CONFIRM · đã gọi click, đang chờ trang xác nhận');
    await wait(wv,'return Array.from(document.querySelectorAll(".exec-button a")).some(function(e){return e.textContent.trim()==="登録"})?"YES":"NO"',stopCheck,'CARD_REVIEW',90000);
    const registered=await evaluate(wv,'var a=Array.from(document.querySelectorAll(".exec-button a")).find(function(e){return e.textContent.trim()==="登録"});if(!a)return "MISSING";a.click();return "OK"');
    if(registered!=='OK') throw new Error('CARD_REGISTER_'+registered);
    step(8,'Chờ 応募完了 / 3DS thủ công');
    log('Nếu trang 3DS xuất hiện, nhập thủ công trên WebView. Tool sẽ tiếp tục chờ 応募完了.', 'warn');
    // Intentionally no timeout for 3DS. The STOP control still interrupts polling.
    while (true) {
      if(stopCheck) stopCheck();
      if(wv._destroyed) throw new Error('WEBVIEW_CLOSED_BEFORE_COMPLETE');
      const result=await evaluate(wv,'return document.body&&document.body.innerText.includes("応募完了")?"YES":"NO"');
      if(result==='YES') break;
      await sleep(1000);
    }
    done=true;
    Core.updateCurrent({email:acc.email,step:'8/8 · 応募完了',status:'Done'});
    log(acc.email+' · 応募完了','success');
    return {ok:true,mode:'BandaiPremium_Lottery',productId:product,verified:true};
  } finally {
    if (!done) log(acc.email+' · Đã dừng hoặc lỗi trước 応募完了','warn');
    try {await Web.clearSession(wv);}catch(_){}
    try {Web.destroy(wv);}catch(_){}
  }
}
module.exports={runAccount};
