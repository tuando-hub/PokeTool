// One ephemeral NSURLSession/cookie store per account; no WebKit dependency.
const RETAINED=new Map();let sequence=0;
function raw(v){return v&&typeof v.rawValue==='function'?v.rawValue():v;}
function objNumber(value){
 try{
  if(value===null||value===undefined)return NaN;
  if(typeof value==='number')return value;
  if(typeof value==='string')return Number(value);
  let v=value;
  if(typeof v.rawValue==='function')v=v.rawValue();
  if(typeof v==='number')return v;
  if(typeof v==='string')return Number(v);
  if(v&&typeof v.doubleValue==='function')return Number(v.doubleValue());
  if(v&&typeof v.intValue==='function')return Number(v.intValue());
  if(v&&typeof v.invoke==='function'){try{const n=Number(raw(v.invoke('intValue')));if(!isNaN(n))return n;}catch(_){}}
  return Number(String(v));
 }catch(_){return NaN;}
}
function encoding(name){
 const n=String(name||'utf-8').toLowerCase().replace(/[_-]/g,'');
 if(['shiftjis','sjis','windows31j','cp932','mskanji'].includes(n))return 8;
 if(['utf8','ascii','usascii'].includes(n))return 4;
 if(n==='eucjp')return 3;
 throw new Error('PREMIUM_RESULT_CHARSET_UNSUPPORTED');
}
function bytes(base64){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let bits=0,count=0;const result=[];
 for(const c of String(base64)){if(c==='=')break;const n=alphabet.indexOf(c);if(n<0)continue;bits=(bits<<6)|n;count+=6;if(count>=8){count-=8;result.push((bits>>>count)&255);}}
 return result;
}
function escapeBytes(values){return values.map(n=>n===32?'+':n>=65&&n<=90||n>=97&&n<=122||n>=48&&n<=57||[42,45,46,95].includes(n)?String.fromCharCode(n):'%'+n.toString(16).toUpperCase().padStart(2,'0')).join('');}
function create(){
 if(typeof $objc!=='function'||typeof $block!=='function')throw new Error('PREMIUM_RESULT_NATIVE_HTTP_UNAVAILABLE');
 const config=$objc('NSURLSessionConfiguration').invoke('ephemeralSessionConfiguration');
 config.invoke('setTimeoutIntervalForRequest:',30);config.invoke('setTimeoutIntervalForResource:',45);config.invoke('setHTTPShouldSetCookies:',true);
 let configJar=null;try{configJar=config.invoke('HTTPCookieStorage');if(configJar)configJar.invoke('setCookieAcceptPolicy:',0);}catch(_){}
 const session=$objc('NSURLSession').invoke('sessionWithConfiguration:',config);
 let jar=configJar,jarTrusted=false;try{const sessionJar=session.invoke('configuration').invoke('HTTPCookieStorage');if(sessionJar){jar=sessionJar;jarTrusted=true;}}catch(_){}
 const pending=new Map();let closed=false;
 const nsurl=value=>$objc('NSURL').invoke('URLWithString:',String(value));
 function data(value,charset){const d=$objc('NSString').invoke('stringWithString:',String(value)).invoke('dataUsingEncoding:allowLossyConversion:',encoding(charset),false);if(!d)throw new Error('PREMIUM_RESULT_ENCODING_FAILED');return d;}
 function formBody(pairs,charset){const escape=value=>escapeBytes(bytes(raw(data(value,charset).invoke('base64EncodedStringWithOptions:',0))));return pairs.map(p=>escape(p[0])+'='+escape(p[1])).join('&');}
 function cookies(url){
  const out={};
  try{
   if(!jar)return out;
   const list=jar.invoke('cookiesForURL:',nsurl(url));const count=Number(raw(list.invoke('count')))||0;
   for(let i=0;i<count;i++){const c=list.invoke('objectAtIndex:',i);if(raw(c.invoke('isHTTPOnly')))continue;out[String(raw(c.invoke('name')))]=String(raw(c.invoke('value')));}
  }catch(_){}
  return out;
 }
 function applyCookies(list,baseUrl){
  if(!jar||!list||typeof list!=='object')return;
  const host=String(baseUrl||'').replace(/^https?:\/\//,'').split(/[\/?#]/)[0];
  function remove(name,domain){
   try{const items=jar.invoke('cookiesForURL:',nsurl(baseUrl));const count=Number(raw(items.invoke('count')))||0;
    for(let i=0;i<count;i++){const c=items.invoke('objectAtIndex:',i);if(String(raw(c.invoke('name')))===name&&String(raw(c.invoke('domain')))===domain){jar.invoke('deleteCookie:',c);return;}}
   }catch(_){}
  }
  for(const key of Object.keys(list)){
   const item=list[key];if(!item||typeof item!=='object')continue;
   const name=String(item.name||key.replace(/^delete_/,'')),domain=String(item.domain||host),path=String(item.path||'/');
   if(key.indexOf('delete_')===0||item.value===undefined){remove(name,domain);continue;}
   try{
    const props=$objc('NSMutableDictionary').invoke('dictionary');
    props.invoke('setObject:forKey:',name,'Name');props.invoke('setObject:forKey:',String(item.value),'Value');
    props.invoke('setObject:forKey:',domain,'Domain');props.invoke('setObject:forKey:',path,'Path');
    const days=Number(item.expires);if(days>0)props.invoke('setObject:forKey:',$objc('NSDate').invoke('dateWithTimeIntervalSinceNow:',days*86400),'Expires');
    const cookie=$objc('NSHTTPCookie').invoke('cookieWithProperties:',props);if(cookie)jar.invoke('setCookie:',cookie);
   }catch(_){}
  }
 }
 function close(){if(closed)return;closed=true;for(const item of pending.values()){clearTimeout(item.timer);item.task.invoke('cancel');item.reject(new Error('__STOP__'));}session.invoke('invalidateAndCancel');}
 function headerValue(response,name){
  try{const fields=response.invoke('allHeaderFields');let value=fields.invoke('objectForKey:',name);if(!value)value=fields.invoke('objectForKey:',String(name).toLowerCase());if(!value)value=fields.invoke('objectForKey:',String(name).toUpperCase());return value?String(raw(value)):'';}catch(_){return '';}
 }
 function resolveRedirect(base,location){
  const text=String(location||'').trim();if(/^https:\/\//.test(text))return text;if(text.indexOf('//')===0)return 'https:'+text;
  const origin=(String(base).match(/^https:\/\/[^/]+/)||[''])[0];if(text[0]==='/')return origin+text;
  return origin+'/'+text.replace(/^\.?\//,'');
 }
 function request(url,options){
  if(closed)return Promise.reject(new Error('__STOP__'));
  if(!/^https:\/\/p-bandai\.jp\//.test(url)&&!/^https:\/\/account-api\.bandainamcoid\.com\/v3\/login\/(?:init|idpw)(?:\?|$)/.test(url)&&!/^https:\/\/account-api\.bandainamcoid\.com\/v3\/passkey\/info(?:\?|$)/.test(url)&&!/^https:\/\/account\.bandainamcoid\.com\/(?:login|passkeyInfo)\.html(?:\?|$)/.test(url)&&!/^https:\/\/www\.bandainamcoid\.com\/v2\/oauth2\/auth(?:\?|$)/.test(url))return Promise.reject(new Error('PREMIUM_RESULT_URL_UNEXPECTED'));
  const opt=options||{};
  return new Promise((resolve,reject)=>{
   let key;
   try{
    const req=$objc('NSMutableURLRequest').invoke('requestWithURL:',nsurl(url));
    req.invoke('setHTTPMethod:',opt.method||'GET');req.invoke('setHTTPShouldHandleCookies:',true);req.invoke('setMainDocumentURL:',nsurl('https://p-bandai.jp/'));
    if((opt.method||'GET')==='GET'){
     // Order pages change after POST; never read a cached copy when verifying.
     try{req.invoke('setCachePolicy:',1);}catch(_){}
     req.invoke('setValue:forHTTPHeaderField:','no-cache','Cache-Control');
     req.invoke('setValue:forHTTPHeaderField:','no-cache','Pragma');
    }
    req.invoke('setValue:forHTTPHeaderField:','Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_16 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6.2 Mobile/15E148 Safari/604.1','User-Agent');
    req.invoke('setValue:forHTTPHeaderField:','ja-JP,ja;q=0.9','Accept-Language');
    for(const name of Object.keys(opt.headers||{}))req.invoke('setValue:forHTTPHeaderField:',String(opt.headers[name]),name);
    if(opt.body!==undefined)req.invoke('setHTTPBody:',data(opt.body,'utf-8'));
    key=++sequence;
    const callback=$block('void, id, id, id',function(responseData,response,error){
     const item=pending.get(key);
     try{
      if(closed){reject(new Error('__STOP__'));return;}
      if(error||!response){reject(new Error('PREMIUM_RESULT_NETWORK_RESULT_UNKNOWN'));return;}
      let status=objNumber(response.invoke('statusCode'));
      if(isNaN(status)){try{status=objNumber(response.invoke('valueForKey:','statusCode'));}catch(_){}}
      const finalURL=String(raw(response.invoke('URL').invoke('absoluteString')));
      if(!/^https:\/\/p-bandai\.jp\//.test(finalURL)&&!/^https:\/\/account\.bandainamcoid\.com\/(?:login|passkeyInfo)\.html(?:\?|$)/.test(finalURL)&&!/^https:\/\/account-api\.bandainamcoid\.com\/v3\/(?:login|passkey)\//.test(finalURL)&&!/^https:\/\/www\.bandainamcoid\.com\//.test(finalURL))throw new Error('Unexpected host');
      // Some JSBox/iOS combinations expose the redirect response instead of
      // following it. Follow Location manually, with the same host allowlist.
      if(isNaN(status)||(status>=300&&status<400)){
       const location=headerValue(response,'Location');
       if(location&&(Number(opt._hops)||0)<5){const next=resolveRedirect(finalURL,location),nextOpt=Object.assign({},opt,{_hops:(Number(opt._hops)||0)+1});if(status===301||status===302||status===303){nextOpt.method='GET';delete nextOpt.body;}resolve(request(next,nextOpt));return;}
      }
      let charset=String(raw(response.invoke('textEncodingName'))||'');
      if(!charset&&responseData){const preview=$objc('NSString').invoke('alloc').invoke('initWithData:encoding:',responseData,5);const m=/charset\s*=\s*["']?([\w-]+)/i.exec(String(raw(preview)||''));charset=m?m[1]:'utf-8';}
      const decoded=responseData?$objc('NSString').invoke('alloc').invoke('initWithData:encoding:',responseData,encoding(charset)):null;
      if(responseData&&!decoded)throw new Error('Invalid response encoding');
      resolve({status,url:finalURL,charset:charset||'utf-8',text:decoded?String(raw(decoded)):''});
     }catch(_){reject(new Error('PREMIUM_RESULT_NATIVE_RESPONSE_INVALID'));}
     finally{if(item)clearTimeout(item.timer);pending.delete(key);RETAINED.delete(key);}
    });
    const task=session.invoke('dataTaskWithRequest:completionHandler:',req,callback);
    const timer=setTimeout(()=>{task.invoke('cancel');reject(new Error('PREMIUM_RESULT_HTTP_TIMEOUT'));},45000);
    pending.set(key,{task,timer,reject});RETAINED.set(key,{callback,session});task.invoke('resume');
   }catch(_){const item=pending.get(key);if(item)clearTimeout(item.timer);pending.delete(key);RETAINED.delete(key);reject(new Error('PREMIUM_RESULT_NATIVE_REQUEST_FAILED'));}
  });
 }
 return {request,formBody,cookies,applyCookies,close,trusted:()=>jarTrusted};
}
module.exports={create,bytes,escapeBytes,encoding};
