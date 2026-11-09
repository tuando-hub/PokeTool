// ================= WEB MANAGER - PokeTool V1.2 =================

const Core = require("./core");
const ThreeDsReference = require("./services/three_ds_reference");
const PAGE_TIMEOUT = 15000;

// ============================================================
// MULTI WKWEBVIEW RUNTIME
//
// Mỗi Web.create() tạo một WKWebView hoàn toàn riêng:
// - WKWebViewConfiguration riêng
// - WKProcessPool riêng
// - WKWebsiteDataStore.nonPersistentDataStore() riêng
//
// Không còn dùng một CURRENT_NATIVE_WEBVIEW global như UI cũ.
// ============================================================

const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
  "Version/26.5.2 Mobile/15E148 Safari/604.1";

const ACTIVE_WEBVIEWS = [];
let WEBVIEW_SEQ = 0;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function removeActiveWebView(wv) {
  const index = ACTIVE_WEBVIEWS.indexOf(wv);

  if (index >= 0) {
    ACTIVE_WEBVIEWS.splice(index, 1);
  }
}

function get() {
  if (!ACTIVE_WEBVIEWS.length) {
    return null;
  }

  return ACTIVE_WEBVIEWS[ACTIVE_WEBVIEWS.length - 1] || null;
}

function layoutActiveWebViews() {
  const host = $("webHost");

  if (!host) {
    return;
  }

  const width = host.frame && host.frame.width ? host.frame.width : 390;

  const height = host.frame && host.frame.height ? host.frame.height : 700;

  const list = ACTIVE_WEBVIEWS.filter(wv => wv && !wv._destroyed && wv._native);

  const count = list.length;

  if (!count) {
    return;
  }

  let columns = 1;
  let rows = 1;

  // 1 WK
  if (count === 1) {
    columns = 1;
    rows = 1;
  }

  // 2 WK
  else if (count === 2) {
    columns = 1;
    rows = 2;
  }

  // 3 - 4 WK
  else if (count <= 4) {
    columns = 2;
    rows = 2;
  }

  // 5 - 6 WK
  else if (count <= 6) {
    columns = 2;
    rows = 3;
  }

  // 7 - 8 WK
  else if (count <= 8) {
    columns = 2;
    rows = 4;
  }

  // 9 - 10 WK
  else {
    columns = 2;
    rows = 5;
  }

  const cellWidth = width / columns;

  const cellHeight = height / rows;

  list.forEach((wv, index) => {
    const col = index % columns;

    const row = Math.floor(index / columns);

    const frame = {
      x: col * cellWidth,

      y: row * cellHeight,

      width: cellWidth,

      height: cellHeight
    };

    try {
      wv._native.invoke("setFrame:", frame);
    } catch (error) {
      Core.addLog("WV layout error: " + String(error), "warn");
    }
  });
}

// Frame probe reports structural metadata and the transaction reference only.
// It never reports OTP field values or payment data.
const FRAME_PROBE_SOURCE = `(function(){
  var extractReferenceCode = ${ThreeDsReference.extractReferenceCode.toString()};
  if (window.__ptFrameProbeInstalled) return;
  window.__ptFrameProbeInstalled = true;
  if (window === window.top) {
    window.__ptFrameProbeReports = [];
    window.__ptFrameUiReports = [];
    window.__pt3dsActionStatus = null;
    window.addEventListener('message',function(event){
      if(event.origin!=='https://authentication.cardinalcommerce.com' && event.origin!=='https://fep.sps-system.com' && event.origin!=='https://emvtds.sps-system.com') return;
      var d=event.data;
      if(d && d.__pt3dsActionResult==='v1') window.__pt3dsActionStatus=d.status;
    });
    window.__pt3dsChooseMethod = function(method){
      window.__pt3dsActionStatus='REQUESTED';
      var frames=document.querySelectorAll('iframe');
      for(var i=0;i<frames.length;i++){
        try{frames[i].contentWindow.postMessage({__pt3dsAction:'choose_method_v1',method:method},'*');}catch(_){}
      }
      return 'REQUESTED';
    };
    window.__pt3dsChooseSms = function(){return window.__pt3dsChooseMethod('sms');};

    window.addEventListener('message', function(event) {
      var d = event.data;
      if (!d || d.__ptFrameProbe !== 'v1' || !d.child) return;
      var origin = String(event.origin || '');
      var arr = window.__ptFrameProbeReports;
      if (arr && !arr.some(function(x){return x.origin === origin;}))
        arr.push({origin:origin,at:Date.now()});
      if (d.ui && typeof d.ui === 'object') {
        var ui = window.__ptFrameUiReports;
        if (!ui) return;
        var entry = {origin:origin,at:Date.now(),ui:d.ui};
        var pos = ui.findIndex(function(x){return x.origin===origin;});
        if (pos >= 0) ui[pos] = entry;
        else if (ui.length < 12) ui.push(entry);
      }
    });
  } else {
    var last = '';
    window.addEventListener('message',function(event){
      var d=event.data;
      if(d && d.__pt3dsActionResult==='v1' && event.origin==='https://authentication.cardinalcommerce.com'){
        try{window.parent.postMessage(d,'*');}catch(_){}
      }
    });
    // Select only the requested delivery method, then advance to its challenge.
    window.addEventListener('message',function(event){
      if(event.origin!=='https://fep.sps-system.com' &&
         event.origin!=='https://emvtds.sps-system.com' &&
         event.origin!=='https://authentication.cardinalcommerce.com') return;
      var d=event.data;
      if(!d || (d.__pt3dsAction!=='choose_sms_v1' && d.__pt3dsAction!=='choose_method_v1')) return;
      var method=d.method==='email'?'email':'sms';
      if(location.origin!=='https://authentication.cardinalcommerce.com'){
        // Forward only to child frames if nested.
        var children=document.querySelectorAll('iframe');
        for(var i=0;i<children.length;i++){
          try{children[i].contentWindow.postMessage(d,'*');}catch(_){}
        }
        return;
      }
      var status=method==='email'?'NO_EMAIL_RADIO':'NO_SMS_RADIO';
      try {
        var radios=Array.prototype.slice.call(document.querySelectorAll('input[type=radio]'));
        var sms=radios.find(function(r){
          var label=r.closest('label');
          if(!label && r.id) label=document.querySelector('label[for="'+CSS.escape(r.id)+'"]');
          return label && (method==='email' ? /メール|E[ -]?mail/i : /SMS|ショートメッセージ/).test(label.textContent||'');
        });
        if(sms){
          if(!sms.checked){sms.click();sms.dispatchEvent(new Event('change',{bubbles:true}));}
          var buttons=Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],input[type=button]'));
          var next=buttons.find(function(b){return /次へ|Next|Continue/i.test((b.textContent||b.value||'').trim()) && !b.disabled && b.getClientRects().length;});
          if(next && sms.checked){next.click();status=method==='email'?'EMAIL_SELECTED_NEXT_CLICKED':'SMS_SELECTED_NEXT_CLICKED';}
          else status=sms.checked?'SMS_SELECTED_NEXT_NOT_FOUND':'SMS_NOT_SELECTED';
        }
      }catch(_){status='ACTION_ERROR';}
      try{window.parent.postMessage({__pt3dsActionResult:'v1',status:status},'*');}catch(_){}
    });
    function snapshot(){
      try {
        var body = document.body;
        if (!body) return {ready:document.readyState,body:false};
        // Structural metadata, plus the displayed reference on the OTP screen.
        var visible = function(el) {return !!(el && el.getClientRects().length);};
        var buttons = Array.prototype.filter.call(
          document.querySelectorAll('button,input[type=submit],input[type=button]'),visible
        );
        var radios = Array.prototype.filter.call(
          document.querySelectorAll('input[type=radio]'),visible
        );
        var textFields = Array.prototype.filter.call(
          document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=submit]):not([type=button])'),visible
        );
        // Identify the two screens without transmitting any text or input values.
        // Match only fixed UI keywords; never serialize user-entered data.
        var labels = Array.prototype.map.call(
          document.querySelectorAll('label,button,input[type=submit],input[type=button]'),
          function(e) { return visible(e) ? String(e.textContent || e.getAttribute('value') || '').slice(0,80) : ''; }
        ).join(' ');
        var hasSmsLabel = /SMS|ショートメッセージ|携帯電話/.test(labels);
        var hasEmailLabel = /メール|E.mail|Email/i.test(labels);
        var hasNextButton = /次へ|続行|Continue|Next/i.test(labels);
        var hasSubmitButton = /送信|認証|確認|Submit|Verify/i.test(labels);
        var hasOtpAutocomplete = textFields.some(function(e) {
          return e.getAttribute('autocomplete') === 'one-time-code';
        });
        var hasOtpHint = textFields.some(function(e) {
          return /otp|one.time|verification|auth.?code|認証|確認|ワンタイム/i.test(
            String(e.getAttribute('name') || '') + ' ' +
            String(e.getAttribute('id') || '') + ' ' +
            String(e.getAttribute('placeholder') || '')
          );
        });
        var screen = 'UNKNOWN';
        if (textFields.length > 0 && (hasOtpAutocomplete || hasOtpHint || (hasSubmitButton && radios.length===0))) {
          screen = 'OTP_INPUT';
        } else if (radios.length >= 2 && (hasSmsLabel || hasEmailLabel)) {
          screen = 'METHOD_SELECTION';
        } else if (textFields.length > 0 && radios.length === 0 && buttons.length > 0) {
          screen = 'POSSIBLE_OTP_INPUT';
        } else if (radios.length >= 2 && buttons.length > 0) {
          screen = 'POSSIBLE_METHOD_SELECTION';
        }
        // Describe controls without accessing input values, OTP, or card details.
        function safeSelector(e){
          // Unique CSS path, anchored at id when possible.
          var parts=[];
          for(var n=e;n&&n.nodeType===1;n=n.parentElement){
            var tag=n.tagName.toLowerCase();
            var id=n.getAttribute('id');
            if(id && /^[A-Za-z_][\w:-]{0,69}$/.test(id)){
              parts.unshift(tag+'#'+CSS.escape(id));
              break;
            }
            var parent=n.parentElement;
            if(!parent){parts.unshift(tag);break;}
            var peers=Array.prototype.filter.call(parent.children,function(x){return x.tagName===n.tagName;});
            parts.unshift(tag+':nth-of-type('+(peers.indexOf(n)+1)+')');
          }
          return parts.join(' > ');
        }
        function safeLabel(e){
          // Labels only: never serialize field contents or arbitrary page text.
          var text='';
          if (e.tagName.toLowerCase()==='input') {
            if (e.type==='radio' || e.type==='checkbox') {
              var id=e.getAttribute('id');
              var label=id ? Array.prototype.find.call(document.querySelectorAll('label'),function(l){return l.htmlFor===id;}) : null;
              if (!label) label=e.closest('label');
              text=label ? label.textContent : '';
            } else if (e.type==='submit' || e.type==='button') {
              text=e.getAttribute('value') || '';
            } else {
              text=e.getAttribute('aria-label') || '';
            }
          } else if (e.tagName.toLowerCase()==='button' || e.getAttribute('role')==='button') {
            text=e.textContent || e.getAttribute('aria-label') || '';
          }
          text=String(text).replace(/\s+/g,' ').trim().slice(0,70);
          // Avoid unexpectedly reporting numeric codes or sensitive user text.
          return /\d{4,}|@|(?:\d[\s-]*){8,}/.test(text) ? '[redacted]' : text;
        }
        function describe(e,kind){
          return {
            kind:kind,
            selector:safeSelector(e),
            type:(e.getAttribute('type')||'').slice(0,25),
            label:safeLabel(e),
            disabled:!!e.disabled,
            checked:kind==='radio' ? !!e.checked : undefined,
            maxLength:kind==='field' && e.maxLength>=0 ? e.maxLength : undefined,
            autocomplete:kind==='field' ? (e.getAttribute('autocomplete')||'').slice(0,35) : undefined
          };
        }
        var controls=[];
        buttons.slice(0,12).forEach(function(e){controls.push(describe(e,'button'));});
        radios.slice(0,12).forEach(function(e){controls.push(describe(e,'radio'));});
        textFields.slice(0,12).forEach(function(e){controls.push(describe(e,'field'));});
        Array.prototype.filter.call(document.querySelectorAll('[role=button]'),visible)
          .slice(0,8).forEach(function(e){controls.push(describe(e,'button-role'));});
        return {
          screen:screen,
          referenceCode:screen==='OTP_INPUT' && location.hostname==='authentication.cardinalcommerce.com'
            ? extractReferenceCode(body.innerText || '') : '',
          controls:controls,
          hints:{sms:hasSmsLabel,email:hasEmailLabel,next:hasNextButton,submit:hasSubmitButton,otpField:hasOtpAutocomplete||hasOtpHint},
          ready:document.readyState,
          body:true,
          visibleButtons:buttons.length,
          visibleRadios:radios.length,
          visibleFields:textFields.length,
          forms:document.forms.length,
          nestedFrames:document.querySelectorAll('iframe').length
        };
      } catch (_) {return {error:'snapshot_unavailable'};}
    }
    function report(force){
      try {
        var ui=snapshot(), sig=JSON.stringify(ui);
        if (!force && sig===last) return;
        last=sig;
        window.parent.postMessage({__ptFrameProbe:'v1',child:true,ui:ui},'*');
      } catch (_) {}
    }
    report(true);
    document.addEventListener('DOMContentLoaded',function(){report(true);},{once:true});
    window.addEventListener('load',function(){report(true);},{once:true});
    // Observe dynamic 3DS challenge rendering; report only on structural changes.
    try {
      var observer=new MutationObserver(function(){report(false);});
      observer.observe(document,{subtree:true,childList:true,attributes:true,
        attributeFilter:['style','hidden','type','class']});
    } catch (_) {}
    setInterval(function(){report(false);},3000);
  }

  // Shared automation bridge. Runs independently in each injected frame.
  (function(){
    var seenCommands=Object.create(null),commandOrder=[];
    var dispatchedClicks=Object.create(null);
    function visible(el){return !!(el && !el.disabled && el.getClientRects().length);}
    function label(el){
      var a=[el.getAttribute('aria-label'),el.getAttribute('placeholder'),el.getAttribute('name'),el.id,el.value];
      if(el.labels) for(var i=0;i<el.labels.length;i++) a.push(el.labels[i].textContent);
      a.push(el.textContent);return a.filter(Boolean).join(' ').trim();
    }
    function selector(el){
      if(el.id && document.querySelectorAll('[id="'+String(el.id).replace(/"/g,'\\"')+'"]').length===1) return '#'+CSS.escape(el.id);
      var path=[];while(el && el.nodeType===1 && path.length<15){
        var tag=el.tagName.toLowerCase(),i=1,p=el;
        while((p=p.previousElementSibling))if(p.tagName===el.tagName)i++;
        path.unshift(tag+':nth-of-type('+i+')');el=el.parentElement;
      }return path.join(' > ');
    }
    function candidates(kind){
      var q=kind==='fill'?'input:not([type=hidden]),textarea,select':kind==='select'?'input[type=radio],input[type=checkbox],option':kind==='find'?'input,textarea,select,button,a,[role=button]':'button,input[type=submit],input[type=button],a,[role=button]';
      return Array.prototype.filter.call(document.querySelectorAll(q),visible);
    }
    function match(el,target){
      if(!target)return false;
      try{if(el.matches(target))return true;}catch(_){}
      var x=label(el).toLowerCase(),t=String(target).toLowerCase();
      return x===t || x.split(/\\s+/).indexOf(t)>=0 || x.indexOf(t)>=0;
    }
    function scan(){
      var result=[];['fill','select','click'].forEach(function(kind){
        candidates(kind).slice(0,80).forEach(function(el){
          result.push({kind:kind,tag:el.tagName.toLowerCase(),type:el.type||'',label:label(el).slice(0,100),selector:selector(el)});
        });
      });return result.slice(0,120);
    }
    function relay(d){
      var children=document.querySelectorAll('iframe');
      for(var i=0;i<children.length;i++)try{children[i].contentWindow.postMessage(d,'*');}catch(_){}
    }
    window.addEventListener('message',function(event){
      var d=event.data;
      if(!d || d.__ptAutoCmd!=='v1')return;
      // Accept commands only from the parent frame; top-level requests originate locally.
      if(window!==window.top && event.source!==window.parent)return;
      if(!d.id || seenCommands[d.id])return;
      seenCommands[d.id]=true;commandOrder.push(d.id);
      if(commandOrder.length>256)delete seenCommands[commandOrder.shift()];
      var frame=String(d.frame||'all');
      if(frame!=='all' && location.hostname.indexOf(frame)<0){relay(d);return;}
      var status='NOT_FOUND',item=null,items=[];
      try{
        if(d.referenceCode && extractReferenceCode(document.body ? document.body.innerText : '')!==d.referenceCode){
          throw new Error('REFERENCE_MISMATCH');
        }
        if(d.action==='scan'){items=scan();status='OK';}
        else {
          var found=candidates(d.action).filter(function(el){return match(el,d.target);});
          if(found.length>1){status='AMBIGUOUS';items=found.slice(0,8).map(function(el){return {selector:selector(el),label:label(el).slice(0,80)};});}
          else if(found.length===1){
            item=found[0];status='FOUND';
            if(d.action==='fill'){
              if(item.type==='password' || /password|cc-|card|cvv|cvc/i.test(label(item))) status='SENSITIVE_MANUAL';
              else {item.focus();item.value=String(d.value||'');item.dispatchEvent(new Event('input',{bubbles:true}));item.dispatchEvent(new Event('change',{bubbles:true}));status='OK';}
            }else if(d.action==='select'){if(!item.checked)item.click();status='OK';}
            else if(d.action==='click'){
              if(d.onceKey && dispatchedClicks[d.onceKey])status='ALREADY_DISPATCHED';
              else {
                if(d.onceKey)dispatchedClicks[d.onceKey]=true;
                item.click();status='OK';
              }
            }else if(d.action==='find'){status='OK';}
          }
        }
      }catch(e){status=e.message==='REFERENCE_MISMATCH'?'REFERENCE_MISMATCH':'ERROR';}
      var out={__ptAutoResult:'v1',id:d.id,origin:location.origin,status:status,selector:item?selector(item):null,items:items};
      if(window===window.top){window.__ptAutoResults=window.__ptAutoResults||[];window.__ptAutoResults.push(out);}
      else try{window.parent.postMessage(out,'*');}catch(_){}
      if(status==='NOT_FOUND' || d.action==='scan' || d.action==='find')relay(d);
    });
    if(window===window.top){
      window.__ptAutoResults=[];window.__ptAutoSeq=0;
      var sessionId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
      window.__ptAutoDispatch=function(cmd){
        cmd.__ptAutoCmd='v1';cmd.id=sessionId+'-'+String(++window.__ptAutoSeq);window.postMessage(cmd,'*');
        // The local listener relays to child frames; do not also send here.
        return cmd.id;
      };
      window.addEventListener('message',function(e){
        var d=e.data;if(!d || d.__ptAutoResult!=='v1')return;
        // Only messages from direct iframe windows are accepted.
        var frames=document.querySelectorAll('iframe'),ok=false;
        for(var i=0;i<frames.length;i++)try{if(frames[i].contentWindow===e.source){ok=true;break;}}catch(_){}
        if(ok)window.__ptAutoResults.push(d);
      });
    }else{
      window.addEventListener('message',function(e){
        if(e.data && e.data.__ptAutoResult==='v1'){
          var frames=document.querySelectorAll('iframe'),ok=false;
          for(var i=0;i<frames.length;i++)try{if(frames[i].contentWindow===e.source){ok=true;break;}}catch(_){}
          if(ok)try{window.parent.postMessage(e.data,'*');}catch(_){}
        }
      });
    }
  })();
})();`;
function installFrameProbe(config) {
  try {
    const controller = $objc("WKUserContentController")
      .invoke("alloc")
      .invoke("init");
    const script = $objc("WKUserScript")
      .invoke("alloc")
      .invoke(
        "initWithSource:injectionTime:forMainFrameOnly:",
        FRAME_PROBE_SOURCE,
        0,
        false
      );
    if (!controller || !script)
      return { installed: false, error: "init_failed" };
    controller.invoke("addUserScript:", script);
    config.invoke("setUserContentController:", controller);
    return { installed: true };
  } catch (e) {
    return { installed: false, error: String(e) };
  }
}

async function getFrameProbeReports(wv) {
  const raw = await evalJS(
    wv,
    `(function(){try{return JSON.stringify({
    installed:!!window.__ptFrameProbeInstalled,
    reports:window.__ptFrameProbeReports||[],
    uiReports:window.__ptFrameUiReports||[],
    frames:document.querySelectorAll('iframe').length
  })}catch(e){return JSON.stringify({error:String(e)})}})()`
  );
  try {
    return JSON.parse(String(raw));
  } catch (e) {
    return { error: String(raw) };
  }
}

async function choose3dsSms(wv) {
  const result = await evalJS(
    wv,
    '(function(){return typeof window.__pt3dsChooseSms==="function"?window.__pt3dsChooseSms():"NOT_INSTALLED"})()'
  );
  return String(result);
}

async function choose3dsEmail(wv) {
  return String(
    await evalJS(
      wv,
      '(function(){return typeof window.__pt3dsChooseMethod==="function"?window.__pt3dsChooseMethod("email"):"NOT_INSTALLED"})()'
    )
  );
}
async function get3dsSmsActionStatus(wv) {
  const result = await evalJS(
    wv,
    '(function(){return window.__pt3dsActionStatus||"NONE"})()'
  );
  return String(result);
}

function create(url) {
  const initialUrl = String(url || "about:blank");
  const host = $("webHost");

  if (!host) {
    Core.addLog("webHost not found", "error");
    return null;
  }

  try {
    const WKWebViewConfiguration = $objc("WKWebViewConfiguration");
    const WKWebsiteDataStore = $objc("WKWebsiteDataStore");
    const WKProcessPool = $objc("WKProcessPool");
    const WKWebView = $objc("WKWebView");

    const config = WKWebViewConfiguration.invoke("alloc").invoke("init");
    const processPool = WKProcessPool.invoke("alloc").invoke("init");
    const dataStore = WKWebsiteDataStore.invoke("nonPersistentDataStore");

    if (!config || !processPool || !dataStore) {
      Core.addLog("WKWebView isolated config failed", "error");
      return null;
    }

    config.invoke("setProcessPool:", processPool);
    config.invoke("setWebsiteDataStore:", dataStore);

    const frameProbeSetup = installFrameProbe(config);
    if (!frameProbeSetup.installed)
      Core.addLog("WK FRAME PROBE INSTALL · " + frameProbeSetup.error, "warn");

    const hostNative = host.runtimeValue();

    if (!hostNative) {
      Core.addLog("webHost runtimeValue failed", "error");
      return null;
    }

    const frame = {
      x: 0,
      y: 0,
      width: host.frame && host.frame.width ? host.frame.width : 390,
      height: host.frame && host.frame.height ? host.frame.height : 700
    };

    const nativeWV = WKWebView.invoke("alloc").invoke(
      "initWithFrame:configuration:",
      frame,
      config
    );

    if (!nativeWV) {
      Core.addLog("WKWebView create failed", "error");
      return null;
    }

    try {
      nativeWV.invoke("setCustomUserAgent:", SAFARI_UA);
    } catch (_) {}

    hostNative.invoke("addSubview:", nativeWV);

    const adapter = {
      _id: "WV" + ++WEBVIEW_SEQ,
      _native: nativeWV,
      _dataStore: dataStore,
      _processPool: processPool,
      _pageReady: false,
      _url: initialUrl,
      _destroyed: false,

      eval(options) {
        const opt = options || {};
        const handler =
          typeof opt.handler === "function" ? opt.handler : function () {};

        if (adapter._destroyed || !adapter._native) {
          handler(null);
          return;
        }

        try {
          const completion = $block("void, id, id", function (result, error) {
            if (error || result === null || result === undefined) {
              handler(null);
              return;
            }

            try {
              if (typeof result.rawValue === "function") {
                handler(result.rawValue());
                return;
              }
            } catch (_) {}

            handler(result);
          });

          nativeWV.invoke(
            "evaluateJavaScript:completionHandler:",
            String(opt.script || ""),
            completion
          );
        } catch (error) {
          Core.addLog("Native eval error: " + String(error), "error");
          handler(null);
        }
      },

      remove() {
        destroy(adapter);
      }
    };

    Object.defineProperty(adapter, "url", {
      get() {
        return adapter._url;
      },

      set(value) {
        if (!value || adapter._destroyed || !adapter._native) {
          return;
        }

        adapter._url = String(value);
        adapter._pageReady = false;

        try {
          const NSURL = $objc("NSURL");
          const NSURLRequest = $objc("NSURLRequest");
          const nsurl = NSURL.invoke("URLWithString:", adapter._url);
          const request = NSURLRequest.invoke("requestWithURL:", nsurl);
          nativeWV.invoke("loadRequest:", request);
        } catch (error) {
          Core.addLog("Native load error: " + String(error), "error");
        }
      }
    });

    ACTIVE_WEBVIEWS.push(adapter);

    layoutActiveWebViews();

    adapter.url = initialUrl;

    Core.addLog(
      "Native WKWebView created: " +
        adapter._id +
        " / active=" +
        ACTIVE_WEBVIEWS.length,
      "info"
    );

    return adapter;
  } catch (error) {
    Core.addLog("createWebView native error: " + String(error), "error");
    return null;
  }
}

function destroy(wv) {
  // Không truyền wv chỉ dùng cho tương thích code cũ.
  // Trong multi-worker, mọi cleanup phải truyền đúng adapter.
  const target = wv || get();

  if (!target || target._destroyed) {
    return;
  }

  target._destroyed = true;

  const nativeWV = target._native;

  try {
    if (nativeWV) {
      nativeWV.invoke("stopLoading");
    }
  } catch (_) {}

  try {
    if (nativeWV) {
      nativeWV.invoke("removeFromSuperview");
    }
  } catch (_) {}

  removeActiveWebView(target);

  target._native = null;
  target._dataStore = null;
  target._processPool = null;
  target._pageReady = false;
  target._url = "about:blank";

  layoutActiveWebViews();

  Core.addLog(
    "WebView Closed: " +
      String(target._id || "-") +
      " / active=" +
      ACTIVE_WEBVIEWS.length,
    "warn"
  );
}

function destroyAll() {
  const list = ACTIVE_WEBVIEWS.slice();

  for (const wv of list) {
    try {
      destroy(wv);
    } catch (_) {}
  }
}

function load(url, wv) {
  const target = wv || get();

  if (!target) {
    return create(url || "about:blank");
  }

  target.url = url || target.url || "about:blank";
  return target;
}

function getActiveCount() {
  return ACTIVE_WEBVIEWS.length;
}

function evalJS(wv, script) {
  return new Promise(resolve => {
    if (!wv || wv._destroyed) return resolve(null);
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve("__EVAL_TIMEOUT__");
      }
    }, 5000);
    try {
      wv.eval({
        script,
        handler: value => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        }
      });
    } catch (e) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve("__EVAL_ERROR__");
      }
    }
  });
}

// Read-only iframe capability diagnostic. Never inspect field values or tokens.
async function diagnoseFrames(wv) {
  const script = `(function(){
    var result={mainUrl:location.origin,frameCount:0,frames:[]};
    var frames=document.querySelectorAll('iframe');
    result.frameCount=frames.length;
    for(var i=0;i<frames.length;i++){
      var f=frames[i],item={index:i,id:f.id||'',srcOrigin:'',access:'unknown'};
      try {item.srcOrigin=new URL(f.getAttribute('src')||'',location.href).origin;}catch(e){}
      try {
        var d=f.contentDocument;
        if(!d){item.access='null_document';}
        else {var n=d.documentElement;item.access=n?'accessible':'empty_document';}
      } catch(e) {item.access=e.name==='SecurityError'?'cross_origin_blocked':'blocked_'+e.name;}
      result.frames.push(item);
    }
    return JSON.stringify(result);
  })()`;
  try {
    const raw = await evalJS(wv, script);
    return raw
      ? JSON.parse(String(raw))
      : { error: "MAIN_FRAME_EVAL_UNAVAILABLE" };
  } catch (e) {
    return { error: "FRAME_DIAGNOSTIC_FAILED" };
  }
}

async function waitVar(wv, varName, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 60000)) {
    const raw = await evalJS(wv, `window.${varName} || "";`);
    if (raw) return raw;
    await delay(500);
  }

  return "";
}

async function waitPageReady(wv, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || PAGE_TIMEOUT)) {
    if (wv && wv._pageReady) {
      return true;
    }

    try {
      const rs = await evalJS(wv, "document.readyState");

      if (rs === "interactive" || rs === "complete") {
        if (wv) {
          wv._pageReady = true;
        }

        return true;
      }
    } catch (e) {
      //
    }

    await delay(300);
  }

  Core.addLog("waitPageReady timeout", "warn");

  return false;
}

async function showNotify(wv, message, duration) {
  if (!wv) return;

  await evalJS(
    wv,
    `
(function(){
  let old = document.getElementById("jsbox-notify");
  if (old) old.remove();

  let div = document.createElement("div");
  div.id = "jsbox-notify";
  div.innerText = ${JSON.stringify(message)};
  div.style.cssText =
    "position:fixed;top:20px;left:50%;transform:translateX(-50%);" +
    "background:rgba(0,0,0,0.85);color:#fff;padding:12px 20px;" +
    "border-radius:10px;font-size:16px;z-index:999999;" +
    "box-shadow:0 4px 12px rgba(0,0,0,0.3);" +
    "max-width:90vw;text-align:center;";
  document.body.appendChild(div);

  setTimeout(() => {
    try { div.remove(); } catch(e) {}
  }, ${duration || 2000});
})();
  `
  );
}

async function tapButton(wv, selector) {
  return await evalJS(
    wv,
    `
(function(){
  const btn = document.querySelector(${JSON.stringify(selector)});
  if (!btn) return "NO_BUTTON";

  try {
    btn.disabled = false;
    btn.removeAttribute("disabled");
    btn.scrollIntoView({ block:"center" });
    btn.focus();
    btn.click();
  } catch(e) {}

  return "CLICKED";
})();
  `
  );
}

async function tapButton2(wv, selector, retry, wait) {
  retry = retry || 5;
  wait = wait || 3000;

  for (let i = 1; i <= retry; i++) {
    const rs = await tapButton(wv, selector);

    if (rs === "NO_BUTTON") {
      return false;
    }

    await delay(wait);

    const exists = await evalJS(
      wv,
      `
(function(){
  const btn = document.querySelector(${JSON.stringify(selector)});
  if (!btn) return false;

  const s = getComputedStyle(btn);
  const r = btn.getBoundingClientRect();

  return (
    s.display !== "none" &&
    s.visibility !== "hidden" &&
    s.opacity !== "0" &&
    r.width > 0 &&
    r.height > 0
  );
})();
    `
    );

    if (!exists) return true;
  }

  throw new Error("BUTTON_TIMEOUT");
}

async function exists(wv, selector) {
  return await evalJS(
    wv,
    `
!!document.querySelector(${JSON.stringify(selector)})
  `
  );
}

async function waitSelector(wv, selector, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 30000)) {
    const ok = await exists(wv, selector);
    if (ok) return true;
    await delay(500);
  }

  return false;
}

async function waitDisappear(wv, selector, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 30000)) {
    const ok = await exists(wv, selector);
    if (!ok) return true;
    await delay(500);
  }

  return false;
}

async function inputText(wv, selector, value) {
  return await evalJS(
    wv,
    `
(function(){
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return "NO_INPUT";

  el.focus();
  el.value = ${JSON.stringify(value || "")};

  el.dispatchEvent(new Event("input", { bubbles:true }));
  el.dispatchEvent(new Event("change", { bubbles:true }));

  return "OK";
})();
  `
  );
}

async function clearSession(wv) {
  if (!wv) return;

  Core.addLog("Clear session: " + String(wv._id || "-"), "warn");

  // Clear storage chỉ trong WKWebView hiện tại.
  try {
    await evalJS(
      wv,
      `
(async () => {
  try { localStorage.clear(); } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        try { await caches.delete(key); } catch (_) {}
      }
    }
  } catch (_) {}

  try {
    if (
      navigator.serviceWorker &&
      typeof navigator.serviceWorker.getRegistrations === "function"
    ) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try { await reg.unregister(); } catch (_) {}
      }
    }
  } catch (_) {}

  try {
    if (
      window.indexedDB &&
      typeof indexedDB.databases === "function"
    ) {
      const dbs = await indexedDB.databases();

      for (const db of dbs) {
        if (!db || !db.name) continue;

        await new Promise(resolve => {
          try {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          } catch (_) {
            resolve();
          }
        });
      }
    }
  } catch (_) {}

  return true;
})();
    `
    );
  } catch (_) {}

  // Quan trọng cho multi-worker:
  // clear đúng nonPersistentDataStore của wv này.
  // Không dùng defaultDataStore và không $http.clearCookies().
  try {
    const dataStore = wv._dataStore;

    if (dataStore) {
      const WKWebsiteDataStore = $objc("WKWebsiteDataStore");
      const NSDate = $objc("NSDate");
      const allTypes = WKWebsiteDataStore.invoke("allWebsiteDataTypes");
      const fromDate = NSDate.invoke("dateWithTimeIntervalSince1970:", 0);

      await new Promise(resolve => {
        let finished = false;

        const done = () => {
          if (finished) return;
          finished = true;
          resolve();
        };

        try {
          const completion = $block("void", done);

          dataStore.invoke(
            "removeDataOfTypes:modifiedSince:completionHandler:",
            allTypes,
            fromDate,
            completion
          );
        } catch (_) {
          done();
        }

        setTimeout(done, 5000);
      });
    }
  } catch (error) {
    console.log("[WEB] CLEAR WK DATA:", String(error));
  }

  try {
    if (wv._native && !wv._destroyed) {
      wv._native.invoke("stopLoading");
    }
  } catch (_) {}

  try {
    if (!wv._destroyed) {
      wv.url = "about:blank";
      await delay(200);
    }
  } catch (_) {}
}

async function hasTermsButton(wv) {
  return await evalJS(
    wv,
    `
(function(){
  const title = document.title || "";
  const btn = document.querySelector("#terms_button");
  return title.includes("利用規約再同意") || !!btn;
})();
  `
  );
}

async function acceptTermsIfNeeded(wv) {
  await evalJS(
    wv,
    `
(function(){
  const terms = document.querySelector("#terms");
  if (terms && !terms.checked) {
    terms.checked = true;
    terms.dispatchEvent(new Event("change", { bubbles:true }));
  }

  const privacy = document.querySelector("#privacyPolicy");
  if (privacy && !privacy.checked) {
    privacy.checked = true;
    privacy.dispatchEvent(new Event("change", { bubbles:true }));
  }

  const btn = document.querySelector("#terms_button");
  if (btn) {
    btn.disabled = false;
    btn.classList.remove("disabled");
    btn.click();
  }

  return true;
})();
  `
  );

  await waitPageReady(wv, 30000);
  await delay(1500);
}

async function waitVisible(wv, selector, timeout) {
  const start = Date.now();

  while (Date.now() - start < (timeout || 30000)) {
    const ok = await evalJS(
      wv,
      `
(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;

  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();

  return (
    s.display !== "none" &&
    s.visibility !== "hidden" &&
    s.opacity !== "0" &&
    r.width > 0 &&
    r.height > 0
  );
})()
    `
    );

    if (ok) return true;

    await delay(300);
  }

  return false;
}

/**
 * PokeTool - WKWebView Frame Capability Diagnostic
 *
 * Kiểm tra khả năng tạo WKUserScript cho mọi frame.
 * Không đọc OTP, cookie, token hoặc dữ liệu biểu mẫu.
 * Không thay đổi nội dung trang web.
 */
function checkFrameScriptSupport() {
  const result = {
    wkUserScript: false,
    wkContentController: false,
    allFramesSupported: false,
    mainFrameOnly: null,
    errors: []
  };

  try {
    const WKUserScript = $objc("WKUserScript");
    const WKUserContentController = $objc("WKUserContentController");

    result.wkUserScript = !!WKUserScript;
    result.wkContentController = !!WKUserContentController;

    if (!WKUserScript) {
      result.errors.push("WKUserScript unavailable");
      return result;
    }

    const source = "window.__poketoolFrameProbe = true;";

    const script = WKUserScript.invoke("alloc").invoke(
      "initWithSource:injectionTime:forMainFrameOnly:",
      source,
      0,
      false
    );

    if (!script) {
      result.errors.push("WKUserScript init failed");
      return result;
    }

    result.allFramesSupported = true;

    try {
      const flag = script.invoke("isForMainFrameOnly");

      result.mainFrameOnly =
        typeof flag.rawValue === "function" ? flag.rawValue() : flag;
    } catch (error) {
      result.errors.push("Cannot read mainFrameOnly: " + String(error));
    }
  } catch (error) {
    result.errors.push(String(error));
  }

  return result;
}

/**
 * Ghi log kết quả kiểm tra.
 */
function logFrameScriptSupport() {
  const result = checkFrameScriptSupport();

  Core.addLog(
    "WK FRAME SUPPORT · " + JSON.stringify(result),
    result.allFramesSupported ? "info" : "warn"
  );

  return result;
}

// Generic frame-aware automation. Does not expose field values in logs.
async function autoCommand(wv, action, target, options) {
  options = options || {};
  const command = {
    action: action,
    target: target || "",
    frame: options.frame || "all"
  };
  if (options.referenceCode)
    command.referenceCode = String(options.referenceCode);
  if (options.onceKey) command.onceKey = String(options.onceKey);
  if (action === "fill")
    command.value = String(options.value == null ? "" : options.value);
  const id = await evalJS(
    wv,
    "window.__ptAutoDispatch(" + JSON.stringify(command) + ")"
  );
  if (!id) return { status: "BRIDGE_UNAVAILABLE" };
  const timeout = options.timeout || 4000,
    started = Date.now();
  let all = [];
  while (Date.now() - started < timeout) {
    await delay(200);
    const raw = await evalJS(
      wv,
      "JSON.stringify((window.__ptAutoResults||[]).filter(x=>x.id===" +
        JSON.stringify(String(id)) +
        "))"
    );
    try {
      all = JSON.parse(String(raw || "[]"));
    } catch (_) {}
    const good = all.find(
      x =>
        x.status === "OK" ||
        x.status === "AMBIGUOUS" ||
        x.status === "SENSITIVE_MANUAL" ||
        x.status === "REFERENCE_MISMATCH" ||
        x.status === "ALREADY_DISPATCHED"
    );
    if (good) return good;
  }
  return (
    all.find(x => x.status === "FOUND") || {
      status: "NOT_FOUND",
      results: all.length
    }
  );
}
async function autoScan(wv, options) {
  return autoCommand(wv, "scan", "", options);
}
async function autoClick(wv, target, options) {
  return autoCommand(wv, "click", target, options);
}
async function autoSelect(wv, target, options) {
  return autoCommand(wv, "select", target, options);
}
async function autoFill(wv, target, value, options) {
  return autoCommand(
    wv,
    "fill",
    target,
    Object.assign({}, options || {}, { value: value })
  );
}
async function autoWait(wv, target, options) {
  options = options || {};
  const until = Date.now() + (options.timeout || 15000);
  while (Date.now() < until) {
    const result = await autoCommand(
      wv,
      "find",
      target,
      Object.assign({}, options, { timeout: 800 })
    );
    if (result.status === "OK" || result.status === "FOUND") return result;
    await delay(400);
  }
  return { status: "TIMEOUT" };
}

module.exports = {
  autoScan,
  autoClick,
  autoSelect,
  autoFill,
  autoWait,
  delay,
  get,
  create,
  destroy,
  destroyAll,
  load,

  getActiveCount,
  layoutActiveWebViews,

  evalJS,
  diagnoseFrames,
  getFrameProbeReports,
  choose3dsSms,
  choose3dsEmail,
  get3dsSmsActionStatus,
  waitVar,
  waitPageReady,
  waitVisible,

  showNotify,
  tapButton,
  tapButton2,
  exists,
  waitSelector,
  waitDisappear,
  inputText,

  clearSession,
  hasTermsButton,
  acceptTermsIfNeeded,
  checkFrameScriptSupport,
  logFrameScriptSupport
};
