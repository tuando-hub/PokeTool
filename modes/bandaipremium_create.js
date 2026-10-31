// Premium Bandai registration via the shared isolated WKWebView.
// Stops at SMS verification; never reads or submits the SMS code.
const Core = require('../core');
const Web = require('../web');
const SmsApi = require('../services/premium_sms_api');
const ACTIVE_OTP = new Set();
const START = 'https://p-bandai.jp/newregist_pre_bnid';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = (s, i) => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)[i] || '';
const parts = s => String(s || '').trim().split(/[\s　]+/).filter(Boolean);
function log(s, type) { Core.addLog('[BandaiPremium] ' + s, type || 'info'); }
function progress(acc, n, label) {
  Core.updateCurrent({ email: acc.email, step: n + '/8 · ' + label, status: 'Running' });
  log(n + '/8 · ' + label);
}
async function js(wv, body) {
  const raw = await Web.evalJS(wv, '(function(){try{' + body + '}catch(e){return "ERROR:"+e.message}})()');
  return raw == null ? '' : String(raw);
}
async function until(wv, predicate, stopCheck, ms) {
  const start = Date.now();
  while (Date.now() - start < (ms == null ? 10000 : ms)) {
    if (stopCheck) stopCheck();
    const result = await js(wv, predicate);
    if (result === 'YES') return;
    await sleep(250);
  }
  throw new Error('TIMEOUT_10S_WAITING_ELEMENT_OR_PAGE');
}
async function click(wv, selector, stopCheck) {
  await until(wv, 'var e=document.querySelector(' + JSON.stringify(selector) + ');return e&&!e.disabled&&e.getClientRects().length?"YES":"NO"', stopCheck);
  const r = await js(wv, 'var e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)return "NO_ELEMENT";e.click();return "OK";');
  if (r !== 'OK') throw new Error('CLICK_' + selector + '_' + r);
}
async function fill(wv, fields, stopCheck) {
  for (const selector of Object.keys(fields)) await until(wv, 'return document.querySelector(' + JSON.stringify(selector) + ')?"YES":"NO"', stopCheck);
  const r = await js(wv, 'var d=' + JSON.stringify(fields) + ';for(var k in d){var e=document.querySelector(k);if(!e)return "MISSING:"+k;e.value=d[k];e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}return "OK";');
  if (r !== 'OK') throw new Error('FILL_' + r);
}
// Monitor the user-entered OTP in the same live WebView. A code is submitted
// only once per distinct input cycle; clearing/retyping permits another try.
function watchOtp(wv, acc, onSuccess, smsInfo) {
  const token = {cancelled:false};
  ACTIVE_OTP.add(token);
  (async () => {
    let lastSubmitted = null;
    let armed = true;
    let awaitingResult = false;
    let submittedAt = 0;
    if (smsInfo && smsInfo.pkey) {
      (async () => {
        try {
          const otp = await SmsApi.waitOtp(smsInfo.pkey, smsInfo.phone, () => {
            if (token.cancelled || wv._destroyed) throw new Error('SMS_WATCH_CANCELLED');
          });
          if (!otp || token.cancelled || wv._destroyed) {
            log('SMS API: không nhận được OTP', 'warn'); return;
          }
          await until(wv, 'return document.querySelector("input#code[name=\"code\"]")?"YES":"NO"', () => {
            if (token.cancelled) throw new Error('SMS_WATCH_CANCELLED');
          }, 10000);
          const injected = await js(wv, 'var e=document.querySelector("input#code");if(!e)return "MISSING";e.value='+JSON.stringify(otp)+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));return "OK";');
          if (injected === 'OK') log('SMS API: đã nhập OTP, chờ tự gửi', 'success');
        } catch(e) { if (!token.cancelled) log('SMS API: '+String(e.message||e), 'error'); }
      })();
    }
    try {
      while (!token.cancelled && !wv._destroyed) {
        const state = await js(wv, `
          var heading=Array.from(document.querySelectorAll('h1,h2,h3,.complete,.complete-title'))
            .map(function(x){return x.textContent.trim()}).join(' ');
          var success=heading.indexOf('ご登録ありがとうございます')>=0 ||
            (document.body && document.body.innerText.indexOf('ご登録ありがとうございます！')>=0);
          if(success) return 'SUCCESS';
          var c=document.querySelector('input#code[name="code"]');
          var b=document.querySelector('button[type="submit"].is-submit');
          if(!c)return 'NAVIGATING';
          return 'OTP:'+JSON.stringify({value:c.value,disabled:!!(b&&b.disabled),button:!!b});
        `);
        if (state === 'SUCCESS') {
          log('Đã xác nhận trang ご登録ありがとうございます！', 'success');
          Core.updateCurrent({email:acc.email,step:'8/8 · Hoàn thành',status:'Done'});
          await onSuccess(acc);
          return;
        }
        if (state.indexOf('OTP:') === 0) {
          let info;
          try { info=JSON.parse(state.slice(4)); } catch (_) { info=null; }
          if (info) {
            const code=String(info.value||'');
            if (!/^\d{6}$/.test(code)) {
              armed=true;
              if (awaitingResult) awaitingResult=false;
            } else if (armed && !awaitingResult && info.button && !info.disabled) {
              armed=false;
              lastSubmitted=code;
              awaitingResult=true;
              submittedAt=Date.now();
              const clicked=await js(wv, `
                var c=document.querySelector('input#code[name="code"]');
                var b=document.querySelector('button[type="submit"].is-submit');
                if(!c||!b||b.disabled||!/^\\d{6}$/.test(c.value))return 'SKIPPED';
                b.click();return 'CLICKED';
              `);
              if(clicked==='CLICKED') log('Đã gửi mã SMS 6 số, chờ kết quả');
              else { awaitingResult=false; armed=true; }
            }
            // If the server rejected a code but left the same six digits in
            // the input, do not hammer the endpoint. Require a user edit.
            if (awaitingResult && Date.now()-submittedAt>10000) {
              awaitingResult=false;
              if(code!==lastSubmitted) armed=true;
            }
            if (!awaitingResult && code!==lastSubmitted) armed=true;
          }
        }
        await sleep(250);
      }
    } catch(e) { log('SMS watcher: '+String(e.message||e),'error'); }
    finally { ACTIVE_OTP.delete(token); }
  })();
}
function cancelOtpWatchers() {
  for(const token of ACTIVE_OTP) token.cancelled=true;
  ACTIVE_OTP.clear();
}
async function runAccount({acc,index,form,stopCheck}) {
  const f = form || {};
  const name = parts(pick(f.names, index - 1));
  const kana = parts(pick(f.kanas, index - 1));
  const postcode = pick(f.postcode, index - 1);
  const smsEnabled = String(f.premiumSmsEnabled) === "1";
  let phone = smsEnabled ? "" : pick(f.phones, index - 1);
  let smsInfo = null;
  const banchi = pick(f.address2, index - 1);
  if (name.length < 2 || kana.length < 2 || !postcode || (!smsEnabled && !phone) || !banchi) {
    throw new Error('PREMIUM_PROFILE_REQUIRED: NAMES, KANAS, POSTCODE, PHONES, ADDRESS');
  }
  const wv = Web.create(START);
  if (!wv) throw new Error('WEBVIEW_CREATE_FAILED');
  let atOtp = false;
  try {
    progress(acc, 1, 'Mở Premium Bandai');
    await until(wv, 'return document.querySelector(\'a[href="/newregist_bnid/?type=login"]\')?"YES":"NO"', stopCheck);
    await click(wv, 'a[href="/newregist_bnid/?type=login"]', stopCheck);
    progress(acc, 2, 'Đăng nhập Bandai Namco ID');
    await until(wv, 'return document.querySelector("#mail")&&document.querySelector("#pass")?"YES":"NO"', stopCheck);
    await fill(wv, {'#mail': acc.email, '#pass': acc.pass}, stopCheck);
    await click(wv, '#btn-idpw-login', stopCheck);
    // Only advance after login redirects to the passkey or registration page.
    await until(wv, 'return document.querySelector("#btn-next")||document.querySelector(\'[name="family_name"]\')?"YES":"NO"', stopCheck);
    progress(acc, 3, 'Bỏ qua Passkey');
    if (await js(wv, 'return document.querySelector("[name=\"family_name\"]")?"YES":"NO"') !== 'YES') {
      // The passkey screen has its own asynchronous handler. Wait for the real
      // button, click it once, then wait for the registration form (not a timer).
      await until(wv, 'var b=document.querySelector("button#btn-next");return b&&!b.disabled&&b.getClientRects().length&&b.textContent.indexOf("あとで")>=0?"YES":"NO"', stopCheck);
      const clicked = await js(wv, 'var b=document.querySelector("button#btn-next");if(!b)return "MISSING_BTN_NEXT";if(b.disabled)return "DISABLED_BTN_NEXT";b.scrollIntoView({block:"center"});b.click();return "CLICKED_BTN_NEXT";');
      log('Passkey あとで: ' + clicked);
      if (clicked !== 'CLICKED_BTN_NEXT') throw new Error('PASSKEY_' + clicked);
    }
    // Premium form can appear while WebKit is still navigating. Detect any
    // distinctive editable registration field; do not require two selectors
    // simultaneously, which can fail during dynamic form initialization.
    try {
      await until(wv, `
        var names=['family_name','family_name_kana','own_zip_code','own_addr3'];
        var count=names.filter(function(n){return !!document.querySelector('input[name="'+n+'"]')}).length;
        return count>=2?'YES':'NO';
      `, stopCheck, 10000);
    } catch (e) {
      const state = await js(wv, `
        var b=document.querySelector('#btn-next');
        var fields=Array.from(document.querySelectorAll('input[name],select[name]'))
          .map(function(x){return x.name}).filter(function(n){return /family_name|own_zip|own_addr|tel1/.test(n)}).join(',');
        return 'url='+location.pathname+';ready='+document.readyState+';passkey='+!!b+';fields='+fields+';title='+document.title.slice(0,45);
      `);
      log('Passkey transition timeout: ' + state, 'error');
      throw new Error('PASSKEY_NEXT_PAGE_TIMEOUT_10S');
    }
    progress(acc, 4, 'Điền thông tin đăng ký');
    await fill(wv, {
      '[name="family_name"]':name[0], '[name="name"]':name.slice(1).join(' '),
      '[name="family_name_kana"]':kana[0], '[name="name_kana"]':kana.slice(1).join(' '),
      '[name="own_zip_code"]':postcode
    }, stopCheck);
    await click(wv, '#BTN3', stopCheck);
    // Wait for the website's own postal lookup to populate the address.
    await until(wv, 'var a=document.querySelector(\'[name="own_addr2"]\');return a&&a.value.trim()?"YES":"NO"', stopCheck);
    if (smsEnabled) {
      SmsApi.configure(f.premiumSmsId, f.premiumSmsPass);
      progress(acc, 4, 'SMS API: đặt số điện thoại');
      smsInfo = await SmsApi.orderPhoneSafe(stopCheck);
      phone = smsInfo.phone;
      log('SMS API: nhận số cho '+acc.email+' / '+phone, 'success');
    }
    await fill(wv, {'[name="own_addr3"]':banchi, '[name="tel1"]':phone,
      '#pass':acc.pass, '#pass2':acc.pass}, stopCheck);
    // Do not change DOB, gender or opt into 2FA.
    const checkResult = await js(wv, 'var t=document.querySelector("#two_step"),a=document.querySelector("#agree");if(!a)return "NO_AGREE";if(t){t.checked=false;t.dispatchEvent(new Event("change",{bubbles:true}))}a.checked=true;a.dispatchEvent(new Event("change",{bubbles:true}));return "OK";');
    if (checkResult !== 'OK') throw new Error(checkResult);
    await click(wv, '#FormAssist_submit', stopCheck);
    await until(wv, 'return document.querySelector("#BTN2")?"YES":"NO"', stopCheck);
    progress(acc, 5, 'Trang xác nhận');
    progress(acc, 6, 'Xác nhận đăng ký');
    await click(wv, '#BTN2', stopCheck);
    await until(wv, 'return document.querySelector(\'a[href="/sms_auth_pre_jump/"]\')||document.querySelector("#code")?"YES":"NO"', stopCheck);
    progress(acc, 7, 'Chuyển tới xác minh SMS');
    if (await js(wv, 'return document.querySelector("#code")?"YES":"NO"') !== 'YES') {
      await click(wv, 'a[href="/sms_auth_pre_jump/"]', stopCheck);
    }
    await until(wv, 'return document.querySelector("#code")?"YES":"NO"', stopCheck);
    atOtp = true;
    Core.updateCurrent({email:acc.email, step:'8/8 · Chờ SMS OTP', status:'Waiting SMS OTP'});
    log('Đã tới màn hình SMS OTP. Chưa xác minh tài khoản.', 'warn');
    return {ok:true, waitingSms:true, status:'Waiting SMS OTP', webview:wv, smsInfo:smsInfo};
  } finally {
    // Keep the WebView visible so the user can complete the SMS step manually.
    if (!atOtp) Web.destroy(wv);
  }
}
module.exports = {runAccount,watchOtp,cancelOtpWatchers};
