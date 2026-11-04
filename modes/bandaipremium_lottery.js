// Premium Bandai lottery: use the project's existing isolated WebView.
// 3DS uses the configured SMS clipboard or reference-bound email source.
const Core = require('../core');
const Web = require('../web');
const ThreeDs = require('../services/premium_3ds');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (s, type) => Core.addLog('[Premium Lottery] ' + s, type || 'info');
const debug = s => Core.debugLog('[Premium Lottery] ' + s);
const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const quote = JSON.stringify;

async function evaluate(wv, script) {
  const value = await Web.evalJS(
    wv,
    '(function(){try{' + script + '}catch(e){return "JS_ERROR:"+e.message}})()'
  );
  return value == null ? '' : String(value);
}

async function wait(wv, script, stopCheck, label, timeout=90000) {
  const start = Date.now();
  let last = '';

  while (Date.now() - start < timeout) {
    if (stopCheck) stopCheck();

    if (wv._destroyed) {
      throw new Error('WEBVIEW_CLOSED_' + label);
    }

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
  await wait(
    wv,
    'var e=document.querySelector('+quote(selector)+');return e&&e.isConnected&&!e.disabled&&e.classList.contains("disabled")===false&&e.getAttribute("aria-disabled")!=="true"&&e.getClientRects().length?"YES":"NO"',
    stopCheck,
    label
  );

  const result = await evaluate(
    wv,
    'var e=document.querySelector('+quote(selector)+');if(!e||e.disabled||e.classList.contains("disabled")||e.getAttribute("aria-disabled")==="true")return "NOT_READY";e.click();return "OK"'
  );

  if (result !== 'OK') {
    throw new Error('CLICK_'+label+'_'+result);
  }
}

async function fill(wv, data, stopCheck, label) {
  await wait(
    wv,
    'return '+quote(Object.keys(data))+'.every(function(k){var e=document.querySelector(k);return e&&!e.disabled})?"YES":"NO"',
    stopCheck,
    label
  );

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
 if(k==="#ccNumber_disp"){
  var current=document.querySelector(k);
  if(!current)return "CARD_FIELD_DISAPPEARED";
  var visible=current.value.replace(/\\D/g,"");
  var original=expected.replace(/\\D/g,"");
  if(visible && visible!==original && !(visible.length<=4 && original.endsWith(visible)) && !(visible.length>=4 && original.endsWith(visible.slice(-4)))){
   return "CARD_GATEWAY_REFORMATTED";
  }
 }
}
return "OK"`;

  const result = await evaluate(wv, script);

  if (result !== 'OK') {
    throw new Error('FILL_'+label+'_'+result);
  }

  log(label + ' · đã xác nhận giá trị các ô nhập');
}

async function checkLogin(wv, stopCheck) {
  await wait(
    wv,
    'var p=location.pathname;var form=document.querySelector("#login_id, #btnLogin");var body=document.body?document.body.innerText:"";return !p.startsWith("/login")&&!form&&!/ログインIDまたはパスワードが正しくありません|ログインに失敗/.test(body)?"YES":"NO"',
    stopCheck,
    'LOGIN_SUCCESS',
    120000
  );
}

function payment(form, index) {
  const cardLine = lines(form.creditList)[index-1];
  const ownerLine = lines(form.creditOwnerList)[index-1];

  if (!cardLine || !ownerLine) {
    throw new Error('MISSING_CARD_FOR_ACCOUNT_'+index);
  }

  const m = cardLine.match(
    /^([\d\s-]{13,25})\s*[-|,]\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*[-|,]\s*(\d{3,4})$/
  );

  if (!m) {
    throw new Error('CARD_FORMAT_INVALID_ACCOUNT_'+index);
  }

  const number = m[1].replace(/\D/g,'');
  const month = m[2].padStart(2,'0');
  const year = m[3].slice(-2);
  const owner = ownerLine.trim().split(/\s+/);

  if (
    number.length < 13 ||
    number.length > 19 ||
    Number(month)<1 ||
    Number(month)>12 ||
    owner.length<2
  ) {
    throw new Error('CARD_DATA_INVALID_ACCOUNT_'+index);
  }

  return {
    number,
    month,
    year,
    cvv:m[4],
    first:owner[0],
    last:owner.slice(1).join(' ')
  };
}

async function runAccount({acc,index,form,stopCheck}) {
  const threeDsStarted = Date.now();
  const threeDsOptions = {
    since:threeDsStarted,
    deadline:threeDsStarted + 15 * 60 * 1000,
    clipboard() { try { return $clipboard.text; } catch (_) { return ''; } },
    log
  };
  const threeDs = ThreeDs.create(form,threeDsOptions);
  const product = String(form.productIds || '')
    .split(/[,\s]+/)
    .filter(Boolean)[0];

  if (!/^\d+$/.test(product)) {
    throw new Error('PRODUCT_ID_INVALID');
  }

  const card = payment(form,index);
  const id = String(acc.email||'').split('@')[0];

  if (!id || !acc.pass) {
    throw new Error('ACCOUNT_INVALID');
  }

  const wv = Web.create('https://p-bandai.jp/login/');

  if (!wv) {
    throw new Error('WEBVIEW_CREATE_FAILED');
  }

  let done = false;

  const step = (n,s) => {
    Core.updateCurrent({
      email:acc.email,
      step:n+'/8 · '+s,
      status:'Running'
    });

    log(acc.email+' · '+s);
  };

  try {
    step(1,'Đăng nhập');

    await fill(
      wv,
      {
        '#login_id':id,
        '#password':acc.pass
      },
      stopCheck,
      'LOGIN_FORM'
    );
    
    await sleep(1200);

    await click(wv,'#btnLogin',stopCheck,'LOGIN_BUTTON');
    await checkLogin(wv,stopCheck);

    step(2,'Mở sản phẩm '+product);

    Web.load(
      'https://p-bandai.jp/item/item-'+product+'/',
      wv
    );
    
    await sleep(2000);

    await wait(
      wv,
      'return document.querySelector("form[name=campaign_entry] button.pb24-item-btn__cart")?"YES":"NO"',
      stopCheck,
      'LOTTERY_ITEM',
      60000
    );

    await click(
      wv,
      'form[name=campaign_entry] button.pb24-item-btn__cart',
      stopCheck,
      'LOTTERY_APPLY'
    );

    step(3,'Chọn sản phẩm lottery');

    await wait(
      wv,
      'return document.querySelector("input[type=radio][name=order_no]")?"YES":"NO"',
      stopCheck,
      'LOTTERY_RADIO',
      60000
    );

    const selected = await evaluate(
      wv,
      'var e=document.querySelector("input[type=radio][name=order_no]");if(!e)return "MISSING";e.checked=true;e.dispatchEvent(new Event("change",{bubbles:true}));return "OK"'
    );

    if (selected !== 'OK') {
      throw new Error('LOTTERY_SELECT_'+selected);
    }

    await wait(
      wv,
      'var e=document.querySelector("input[type=radio][name=order_no]");return e&&e.checked?"YES":"NO"',
      stopCheck,
      'LOTTERY_SELECTED'
    );

    await click(
      wv,
      '#vote_button_id',
      stopCheck,
      'LOTTERY_REVIEW'
    );

    step(4,'Xác nhận lottery');

    await click(
      wv,
      '#BTN2',
      stopCheck,
      'LOTTERY_REGISTER'
    );

    step(5,'Chờ trang thanh toán');

    await wait(
      wv,
      'return document.querySelector("#ccNumber_disp")?"YES":"NO"',
      stopCheck,
      'CARD_PAGE',
      90000
    );

    step(6,'Nhập thông tin thẻ');

    if (card.cvv.length === 4) {
      await evaluate(
        wv,
        'var e=document.querySelector("#securityCode");if(e)e.maxLength=4;return "OK"'
      );
    }

    await fill(
      wv,
      {
        '#ccNumber_disp':card.number,
        '#ccExpirationMonth':card.month,
        '#ccExpirationYear_disp':card.year,
        '#securityCode':card.cvv,
        '#billingFirstName':card.first,
        '#billingLastName':card.last
      },
      stopCheck,
      'CARD_FIELDS'
    );

    const hiddenResult = await evaluate(
      wv,
      'var n=document.querySelector("#ccNumber"),y=document.querySelector("#ccExpirationYear");if(n)n.value='+quote(card.number)+';if(y)y.value='+quote('20'+card.year)+';return "OK"'
    );

    if (hiddenResult !== 'OK') {
      throw new Error('CARD_HIDDEN_FIELDS_'+hiddenResult);
    }

    await wait(
      wv,
      'return document.querySelector("#ccNumber_disp")&&document.querySelector("#securityCode")&&document.querySelector("#securityCode").value.length>=3?"YES":"NO"',
      stopCheck,
      'CARD_VALUES_VERIFIED'
    );

    step(7,'Xác nhận thẻ');

    if (stopCheck) stopCheck();

    await sleep(500);

    if (stopCheck) stopCheck();

    const confirmResult = await evaluate(wv, `
var btn=document.querySelector('#exec-button');
if(!btn)return 'BUTTON_NOT_FOUND';
btn.click();
return 'CLICK_DISPATCHED';
`);

    log('CARD_CONFIRM · '+confirmResult);

    if (confirmResult !== 'CLICK_DISPATCHED') {
      throw new Error('CARD_CONFIRM_'+confirmResult);
    }

    await wait(
      wv,
      'return Array.from(document.querySelectorAll(".exec-button a")).some(function(e){return e.textContent.trim()==="登録"})?"YES":"NO"',
      stopCheck,
      'CARD_REVIEW',
      90000
    );

    if (stopCheck) stopCheck();
    if (threeDs.sms) try {
      $clipboard.text = '';
      log('CLIPBOARD · Đã xóa nội dung văn bản trước 登録');
    } catch (e) {
      log('CLIPBOARD · Không thể xóa clipboard: ' + String(e), 'warn');
    }

    threeDsOptions.since = Date.now();
    threeDsOptions.deadline = threeDsOptions.since + 5 * 60 * 1000;
    const registered = await evaluate(
      wv,
      'var a=Array.from(document.querySelectorAll(".exec-button a")).find(function(e){return e.textContent.trim()==="登録"});if(!a)return "MISSING";a.click();return "OK"'
    );

    if (registered !== 'OK') {
      throw new Error('CARD_REGISTER_'+registered);
    }

    step(8, 'Theo dõi xác thực và 応募完了');

    let lastPhase = '';
    let frameDiagnosed = false;
    let lastHeartbeat = 0;
    let completed = false;
    let last3dsScreen = '';
    let smsActionRequested = false;
    let smsActionLogged = false;
    let otpClipboardStart = 0;
    let lastClipboardCheck = 0;
    let clipboardCheckCount = 0;
    let clipboardPollingDone = false;
    let signatureOtpSelectors = '';
    let lastFrameUiSignature = '';
    let lastFrameUiCheck = 0;
    // Lock before dispatch: a missing acknowledgement must never resubmit OTP.
    let otpSubmitted = false;
    let otpSubmitStarted = false;
    let emailAutomationFailed = false;

    const started = Date.now();
    const maxWaitMs = 5 * 60 * 1000;

    while (Date.now() - started < maxWaitMs) {
      if (stopCheck) stopCheck();

      if (wv._destroyed) {
        throw new Error('WEBVIEW_CLOSED_BEFORE_COMPLETE');
      }

      const rawState = await Web.evalJS(wv, `(function(){
        try {
          return JSON.stringify({
            url: location.href,
            ready: document.readyState,
            complete: !!(
              document.body &&
              document.body.innerText.includes('応募完了')
            ),
            frames: document.querySelectorAll('iframe').length
          });
        } catch(e) {
          return JSON.stringify({
            error: String(e)
          });
        }
      })()`);

      let state = 'WAITING';
      let snapshot = null;

      try {
        snapshot = JSON.parse(String(rawState));
      } catch (_) {}

      if (snapshot && snapshot.error) {
        state = 'JS_ERROR';
      } else if (snapshot && snapshot.complete) {
        state = 'COMPLETE';
      } else if (
        snapshot &&
        /\/campaign_end\/lotsale/.test(snapshot.url || '')
      ) {
        state = 'RESULT_PENDING';
      } else if (
        snapshot &&
        (
          /FepCustomerPaymentInfoLookupResult\.do/.test(
            snapshot.url || ''
          ) ||
          snapshot.frames > 0
        )
      ) {
        state = 'THREEDS';
      } else if (!snapshot) {
        state = 'EVAL_EMPTY';
      }

      if (Date.now() - lastHeartbeat >= 30000) {
        lastHeartbeat = Date.now();
        debug('3DS · ' + state + ' · elapsed=' + Math.round((Date.now() - started) / 1000) + 's');
      }

      if (state === 'COMPLETE') {
        completed = true;
        break;
      }

      if (state === 'THREEDS' && !frameDiagnosed) {
        frameDiagnosed = true;

        if (typeof Web.logFrameScriptSupport === 'function') {
          const support = Web.logFrameScriptSupport();

          if (!support.allFramesSupported) {
            log('WKUserScript all-frame unavailable', 'warn');
          }
        } else {
          log('Chưa có logFrameScriptSupport trong web.js', 'warn');
        }

        if (typeof Web.getFrameProbeReports === 'function') {
          await sleep(1500);
          const probe = await Web.getFrameProbeReports(wv);
          debug('FRAME INJECTION PROBE · ' + JSON.stringify(probe));
        }

        if (typeof Web.diagnoseFrames === 'function') {
          const diag = await Web.diagnoseFrames(wv);
          debug('FRAME CHECK · ' + JSON.stringify(diag));

          if (
            diag.frames &&
            diag.frames.some(f => f.access === 'cross_origin_blocked')
          ) {
            log('FRAME CHECK · iframe khác origin: main-frame evalJS không đọc được DOM iframe.', 'warn');
          }
        }
      }

      if (state === 'THREEDS' &&
          typeof Web.getFrameProbeReports === 'function' &&
          Date.now() - lastFrameUiCheck >= 5000) {
        lastFrameUiCheck = Date.now();
        const frameProbe = await Web.getFrameProbeReports(wv);
        const ui = frameProbe && frameProbe.uiReports || [];
        const challenge = ui.find(x =>
          /authentication\.cardinalcommerce\.com/.test(x.origin || '')
        );
        if (challenge && challenge.ui && challenge.ui.screen) {
          const screen = challenge.ui.screen;
          if (screen !== last3dsScreen) {
            last3dsScreen = screen;
            if (screen === 'METHOD_SELECTION')
              log('3DS · Đã nhận diện lựa chọn SMS/Email');
            else if (screen === 'OTP_INPUT')
              log('3DS · Đã mở màn hình OTP');
            else if (screen === 'POSSIBLE_METHOD_SELECTION')
              log('3DS SCREEN · POSSIBLE_METHOD_SELECTION · Có radio và nút, cần xác nhận bằng giao diện', 'warn');
            else if (screen === 'POSSIBLE_OTP_INPUT')
              log('3DS SCREEN · POSSIBLE_OTP_INPUT · Có ô nhập và nút, chưa xác nhận OTP', 'warn');
            else
              log('3DS SCREEN · UNKNOWN · Đang chờ giao diện 3DS ổn định');
          }
        }
        if (threeDs.enabled && challenge && challenge.ui && challenge.ui.screen === 'METHOD_SELECTION' &&
            !smsActionRequested) {
          smsActionRequested = true;
          const result = threeDs.sms ? await Web.choose3dsSms(wv) : await Web.choose3dsEmail(wv);
          debug('3DS '+threeDs.method+' AUTO · '+result);
        }
        if (smsActionRequested && !smsActionLogged &&
            typeof Web.get3dsSmsActionStatus === 'function') {
          const action = await Web.get3dsSmsActionStatus(wv);
          if (action !== 'REQUESTED' && action !== 'NONE') {
            smsActionLogged = true;
            const selected = action === 'SMS_SELECTED_NEXT_CLICKED' || action === 'EMAIL_SELECTED_NEXT_CLICKED';
            log('3DS · '+(selected ? 'Đã chọn '+(threeDs.sms?'SMS':'Email')+' → 次へ' : action),
                selected ? 'success' : 'warn');
          }
        }
        if (challenge && challenge.ui &&
            /OTP_INPUT/.test(challenge.ui.screen || '')) {
          if (threeDs.sms && !otpClipboardStart && challenge.ui.screen === 'OTP_INPUT') {
            otpClipboardStart = Date.now();
            lastClipboardCheck = 0;
            clipboardCheckCount = 0;
            clipboardPollingDone = false;
            log('OTP · Đang chờ clipboard (2s × 15)' );
          }
          const controls = challenge.ui.controls || [];
          const field = controls.find(x => x.kind === 'field');
          const submit = controls.find(x => x.kind === 'button' && x.label === '送信');
          if (signatureOtpSelectors !== (field ? field.selector : 'NOT_FOUND') + '|' + (submit ? submit.selector : 'NOT_FOUND')) {
            signatureOtpSelectors = (field ? field.selector : 'NOT_FOUND') + '|' + (submit ? submit.selector : 'NOT_FOUND');
            log('3DS · Ô OTP '+(field?'✓':'✗')+' · Nút 送信 '+(submit?'✓':'✗'));
            debug('3DS SELECTORS · frame='+challenge.origin+' · input='+(field?field.selector:'NOT_FOUND')+' · submit='+(submit?submit.selector:'NOT_FOUND'));
          }

          // =========================================================
          // TỰ ĐỘNG NHẬP OTP + BẤM 送信 (dùng Web.autoFill / autoClick
          // để thao tác xuyên iframe cross-origin CardinalCommerce)
          // =========================================================
          if (threeDs.enabled && field && submit && !otpSubmitStarted && !emailAutomationFailed) {
            let code = null;
            try {
              code = threeDs.read(challenge.ui);
            } catch (error) {
              if (threeDs.sms) throw error;
              emailAutomationFailed = true;
              threeDs.cancel();
              log('3DS Email · '+String(error.message || error),'error');
              log('3DS Email · Tự lấy mail đã dừng; hãy nhập OTP và bấm 送信 thủ công trong WebView (vẫn chờ kết quả thanh toán)', 'warn');
            }
            const otp = code ? code.otp : '';

            if (/^\d{4,8}$/.test(otp)) {
              otpSubmitStarted = true;

              // Bước 1: nhập OTP vào ô trong iframe
              const frameOptions = {frame:'authentication.cardinalcommerce.com',referenceCode:code.referenceCode,
                onceKey:'premium-otp-submit'};
              const fillRes = await Web.autoFill(wv, field.selector, otp, frameOptions);
              debug('3DS OTP FILL · ' + JSON.stringify(fillRes));

              if (fillRes && fillRes.status === 'OK') {
                await sleep(300);
                if (stopCheck) stopCheck();

                // Bước 2: click nút 送信 trong iframe
                const clickRes = await Web.autoClick(wv, submit.selector, frameOptions);
                debug('3DS OTP SUBMIT · ' + JSON.stringify(clickRes));

                if (clickRes && (clickRes.status === 'OK' || clickRes.status === 'ALREADY_DISPATCHED')) {
                  otpSubmitted = true;
                  clipboardPollingDone = true;
                  log('OTP · Đã gửi lệnh bấm 送信 một lần; chờ kết quả, không tự bấm lại', 'success');
                } else {
                  log('OTP · Chưa xác nhận kết quả bấm 送信: ' + (clickRes && clickRes.status || '?') + '; không tự gửi lại', 'warn');
                }
              } else {
                log('OTP · Không ghi được vào ô: ' + (fillRes && fillRes.status || '?'), 'warn');
              }

              if (!otpSubmitted) {
                log('OTP · Đã dừng tự động để tránh gửi lặp. Hãy kiểm tra màn hình 3DS trước khi thao tác thủ công.', 'warn');
              }
            }
          }
        }
        const signature = JSON.stringify(ui.map(x => ({
          origin:x.origin,ui:x.ui
        })));
        if (signature !== lastFrameUiSignature) {
          lastFrameUiSignature = signature;
        }
      }

      // Polling clipboard
      if (otpClipboardStart && !clipboardPollingDone) {
        const now = Date.now();
        const elapsed = now - otpClipboardStart;
        if (elapsed >= 30000 || clipboardCheckCount >= 15) {
          clipboardPollingDone = true;
          log('OTP · Hết 30s · Không có dữ liệu', 'warn');
        } else if (now - lastClipboardCheck >= 2000) {
          lastClipboardCheck = now;
          clipboardCheckCount++;
          let status = 'EMPTY';
          try {
            status = String($clipboard.text || '').trim() ? 'HAS_DATA' : 'EMPTY';
          } catch (_) {
            status = 'READ_ERROR';
          }
          debug('OTP · '+clipboardCheckCount+'/15 · '+status+
              ' · elapsed='+Math.round(elapsed/1000)+'s');
          if (status === 'HAS_DATA') {
            clipboardPollingDone = true;
            log('OTP · Clipboard có dữ liệu ('+clipboardCheckCount+'/15)', 'success');
          }
        }
      }
      if (state !== lastPhase) {
        lastPhase = state;

        if (state === 'THREEDS') {
          log('Đã phát hiện iframe 3DS. Hoàn tất xác thực trong WebView.', 'warn');
        } else if (state === 'RESULT_PENDING') {
          log('Đã tới trang kết quả, đang chờ 応募完了.');
        } else if (state === 'JS_ERROR') {
          log('JavaScript trang hiện tại báo lỗi.', 'warn');
        } else if (state === 'EVAL_EMPTY') {
          log('Không nhận được trạng thái WebView.', 'warn');
        }
      }

      await sleep(1000);
    }

    if (!completed) {
      throw new Error('TIMEOUT_WAITING_FOR_応募完了');
    }

    done = true;

    Core.updateCurrent({
      email:acc.email,
      step:'8/8 · 応募完了',
      status:'Done'
    });

    log(acc.email+' · 応募完了','success');

    return {
      ok:true,
      mode:'BandaiPremium_Lottery',
      productId:product,
      verified:true
    };

  } finally {
    threeDs.cancel();
    if (!done) {
      log(acc.email+' · Đã dừng hoặc lỗi trước 応募完了', 'warn');
    }

    try {
      await Web.clearSession(wv);
    } catch (_) {}

    try {
      Web.destroy(wv);
    } catch (_) {}
  }
}

module.exports = {runAccount};
