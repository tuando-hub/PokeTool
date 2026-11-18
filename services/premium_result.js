// Browser-free authentication and lottery history reads.
const Http=require('./premium_native_http');
const Parser=require('./premium_result_parser');
const ORIGIN='https://p-bandai.jp';
const NAV_HEADERS={
 Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
 'Accept-Language':'ja-JP,ja;q=0.9',
 'Upgrade-Insecure-Requests':'1',
 'Sec-Fetch-Dest':'document',
 'Sec-Fetch-Mode':'navigate',
 'Sec-Fetch-Site':'same-origin',
 'Sec-Fetch-User':'?1'
};
const ACTIVE=new Set();
let trace=()=>{};
function setLogger(fn){trace=typeof fn==='function'?fn:()=>{};}
function pagePath(page){
 if(!page||(page.status!==200&&!isNaN(page.status))||typeof page.text!=='string'||!/^https:\/\/p-bandai\.jp\//.test(page.url||''))throw new Error('PREMIUM_RESULT_HTTP_UNEXPECTED');
 const path=page.url.slice(ORIGIN.length).split(/[?#]/)[0];
 if(/^\/+error(?:\/|$)/.test(path))throw new Error('PREMIUM_RESULT_SERVER_ERROR');
 return path;
}
function createClient(options){
 const http=options&&options.http||Http.create();let closed=false,attempted=false,authenticated=false;
 const check=stopCheck=>{if(stopCheck)stopCheck();if(closed)throw new Error('__STOP__');};
 function close(){if(closed)return;closed=true;authenticated=false;ACTIVE.delete(client);http.close();}
 async function fetchPage(url,stopCheck,allowLogin=false){
  check(stopCheck);
  if(!/^https:\/\/p-bandai\.jp\/(?:login|login_chk|mypage|mylotsale)\/(?:\?[^#]*)?$/.test(url))throw new Error('PREMIUM_RESULT_URL_UNEXPECTED');
  const response=await http.request(url,{headers:NAV_HEADERS});check(stopCheck);const path=pagePath(response);
  trace('page '+String(url).replace(/^https?:\/\//,'').split(/[?#]/)[0]+' -> '+path+' status='+response.status+' login='+(Parser.hasLogin(response.text)?1:0));
  if(!allowLogin&&(/^\/+login(?:[\/_]|$)/.test(path)||Parser.hasLogin(response.text)))throw new Error('PREMIUM_RESULT_LOGIN_REQUIRED');
  return {...response,path};
 }
 const ACCOUNT='https://account.bandainamcoid.com',ACCOUNT_API='https://account-api.bandainamcoid.com';
 function queryParams(url){
  const out={},text=String(url||''),pos=text.indexOf('?');if(pos<0)return out;
  text.slice(pos+1).split('#')[0].split('&').forEach(part=>{
   const eq=part.indexOf('=');if(eq<0)return;
   try{out[decodeURIComponent(part.slice(0,eq))]=decodeURIComponent(part.slice(eq+1).replace(/\+/g,' '));}catch(_){}
  });
  return out;
 }
 function jsonOf(page){
  try{return JSON.parse(page.text);}catch(_){throw new Error('PREMIUM_RESULT_NATIVE_RESPONSE_INVALID');}
 }
 function paramsBody(fields){return http.formBody(Object.keys(fields).map(key=>[key,fields[key]]),'utf-8');}
 function absolute(url){const text=String(url||'');return /^https:\/\//.test(text)?text:ACCOUNT+'/'+text.replace(/^\/+/,'');}
 function mergeCookies(store,list){
  if(!list||typeof list!=='object')return store;
  for(const key of Object.keys(list)){
   const item=list[key];
   if(typeof item==='string'){store[key]=item;continue;}
   if(!item||typeof item!=='object')continue;
   const name=String(item.name||key.replace(/^delete_/,''));
   if(key.indexOf('delete_')===0||item.value===undefined){delete store[name];continue;}
   store[name]=String(item.value);
  }
  return store;
 }
 function cookieHeader(store){return Object.keys(store||{}).map(name=>name+'='+store[name]).join('; ');}
 function withCookie(headers,cookie){return cookie?Object.assign({},headers,{Cookie:cookie}):headers;}
 // The ID API may hand off to the passkey info page. Its own init endpoint
 // decides whether to skip (redirect back to the OAuth flow) or to require a
 // WebAuthn credential; without a redirect there is nothing native can click.
 async function followPasskey(next,accountPage,stopCheck,cookieStore){
  const authCookie=cookieHeader(cookieStore);
  if(!/^https:\/\/account\.bandainamcoid\.com\/passkeyInfo\.html(?:\?|$)/.test(next)){
   // The OAuth hop redirects to p-bandai: do not override its cookie store
   // with the account-side cookie header, or p-bandai sees a foreign session.
   const done=await http.request(next,{headers:NAV_HEADERS});
   trace('oauth '+done.status+' '+String(done.url).replace(/^https?:\/\//,'').split(/[?#]/)[0]);
   return;
  }
  await http.request(next,{headers:withCookie(NAV_HEADERS,authCookie)});check(stopCheck);
  const query=queryParams(next);
  const fields={client_id:query.client_id||'',backto:query.backto||'',redirect_uri:query.redirect_uri||'',customize_id:query.customize_id||'',code:query.code||'',language:'ja',cookie:JSON.stringify(cookieStore)};
  const headers=withCookie(Object.assign({},NAV_HEADERS,{Accept:'application/json, text/plain, */*',Origin:ACCOUNT,Referer:next}),authCookie);
  const info=jsonOf(await http.request(ACCOUNT_API+'/v3/passkey/info?'+paramsBody(fields),{headers}));check(stopCheck);
  mergeCookies(cookieStore,info.cookie);
  http.applyCookies(info.cookie,accountPage);
  const buttons=info.data&&info.data.btn||{};
  const passkeyRedirect=info.redirect||info['redirect_no-cache']||'';
  trace('passkey '+(info.result||'?')+' redirect='+(passkeyRedirect?String(passkeyRedirect).replace(/^https?:\/\//,'').split(/[?#]/)[0]:'0')+' btn='+(buttons['btn-next']&&buttons['btn-next'].url?1:0)+' cookies='+Object.keys(cookieStore).join(','));
  // The site's own "あとで" (later) action is the URL attached to btn-next;
  // following it skips WebAuthn and resumes the OAuth handoff.
  let redirect=info.redirect||info['redirect_no-cache']||buttons['btn-next']&&buttons['btn-next'].url||'';
  if(!redirect)for(const key of Object.keys(buttons)){if(buttons[key]&&buttons[key].url){redirect=buttons[key].url;break;}}
  if(!redirect)throw new Error('PREMIUM_RESULT_LOGIN_PASSKEY_REQUIRED');
  // The btn-next URL is the OAuth handoff; it redirects to p-bandai. Let the
  // session send its own p-bandai cookies instead of our account cookie header.
  trace('pb-cookies '+Object.keys(http.cookies(ORIGIN+'/')).join(','));
  const done=await http.request(absolute(redirect),{headers:NAV_HEADERS});check(stopCheck);
  trace('oauth '+done.status+' '+String(done.url).replace(/^https?:\/\//,'').split(/[?#]/)[0]);
 }
 // Bandai Namco ID accounts are the ones created by the Premium registration
 // mode. Its API lives on account-api.bandainamcoid.com and is not behind the
 // p-bandai STCLab BotManager gate that rejects browser-free form submits.
 async function loginBnid(acc,stopCheck){
  const entry=await http.request(ORIGIN+'/bnidlogin_red/',{headers:NAV_HEADERS});check(stopCheck);
  const entryPath=String(entry.url||'').replace(/^https?:\/\//,'').split(/[?#]/)[0];
  const query=queryParams(entry.url);
  trace('entry '+entry.status+' '+entryPath+' keys='+Object.keys(query).join(','));
  if((entry.status!==200&&!isNaN(entry.status))||entryPath!=='account.bandainamcoid.com/login.html')throw new Error('PAGE_FAIL_'+entry.status+'_'+entryPath);
  const clientId=query.client_id||'premium_bandai',redirectUri=query.redirect_uri||'';
  if(!redirectUri)throw new Error('PAGE_QUERY_'+Object.keys(query).join(','));
  const accountPage=ACCOUNT+'/login.html';
  // The API's session lives in JSON cookie payloads, not always in the native
  // cookie store on JSBox. Keep our own map and send it on every account-side
  // hop, both as the `cookie` form field and as a Cookie header.
  const cookieStore=mergeCookies({},http.cookies(accountPage));
  const apiHeaders=Object.assign({},NAV_HEADERS,{Accept:'application/json, text/plain, */*',Origin:ACCOUNT,Referer:accountPage});
  const initFields={client_id:clientId,redirect_uri:redirectUri,customize_id:query.customize_id||'',language:'ja',prompt:query.prompt||'',sns_not_found:query.sns_not_found||'',lockout_child:query.lockout_child||'',backto:query.backto||'',response_type:query.response_type||'',scope:query.scope||'',state:query.state||'',nonce:query.nonce||'',cookie:JSON.stringify(cookieStore)};
  const init=jsonOf(await http.request(ACCOUNT_API+'/v3/login/init?'+paramsBody(initFields),{headers:apiHeaders}));check(stopCheck);
  trace('init '+(init.result||'?'));
  if(init.result!=='OK')throw new Error('PREMIUM_RESULT_LOGIN_INIT_FAILED');
  mergeCookies(cookieStore,init.cookie);
  http.applyCookies(init.cookie,accountPage);
  trace('initcookies '+Object.keys(cookieStore).join(','));
  const initCookie=cookieHeader(cookieStore);
  const fields={client_id:clientId,redirect_uri:String(init.data&&init.data.redirect_uri||redirectUri),backto:initFields.backto,customize_id:initFields.customize_id,login_id:String(acc.email),password:String(acc.pass),env_info:JSON.stringify({mobile:true,platform:'iOS'}),retention:'0',language:'ja',cookie:JSON.stringify(cookieStore),prompt:initFields.prompt};
  const idpwHeaders=Object.assign({},apiHeaders,{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'});
  if(initCookie)idpwHeaders.Cookie=initCookie;
  const auth=jsonOf(await http.request(ACCOUNT_API+'/v3/login/idpw',{method:'POST',body:paramsBody(fields),headers:idpwHeaders}));check(stopCheck);
  trace('idpw '+(auth.result||'?')+' error='+(auth.input_error?1:0));
  if(auth.input_error||auth.result!=='OK')throw new Error('PREMIUM_RESULT_LOGIN_REJECTED');
  mergeCookies(cookieStore,auth.cookie);
  http.applyCookies(auth.cookie,accountPage);
  const authCookie=cookieHeader(cookieStore);
  trace('authcookies '+Object.keys(cookieStore).join(','));
  const next=auth.redirect||auth['redirect_no-cache'];
  if(!next)throw new Error('PREMIUM_RESULT_LOGIN_NOT_CONFIRMED');
  trace('next '+String(next).replace(/^https?:\/\//,'').split(/[?#]/)[0]);
  // Follow the OAuth hop back to p-bandai; the cookie store carries the new
  // p-bandai session. The final access check is the explicit /mypage/ GET.
  await followPasskey(absolute(next),accountPage,stopCheck,cookieStore);check(stopCheck);
 }
 // Fallback for legacy Premium Bandai ID accounts. Native submits can still be
 // rejected by the site's BotManager; this path exists only for accounts that
 // authenticate with the email prefix on /login_chk/.
 async function loginPremiumId(acc,stopCheck){
  trace('premium form fallback');
  const initial=await fetchPage(ORIGIN+'/login/',stopCheck,true);
  const forms=initial.text.match(/<form\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/form\s*>/gi)||[];
  const matching=forms.filter(form=>Parser.hasLogin(form));
  if(matching.length!==1)throw new Error('PREMIUM_RESULT_LOGIN_FORM_UNEXPECTED');
  const attributes=Parser.attrs(matching[0].match(/^<form\b(?:[^>"']|"[^"]*"|'[^']*')*>/i)[0]);
  if(String(attributes.method||'get').toLowerCase()!=='post'||!['/login_chk/',ORIGIN+'/login_chk/'].includes(attributes.action))throw new Error('PREMIUM_RESULT_LOGIN_ACTION_UNEXPECTED');
  const pairs=[];
  for(const tag of matching[0].match(/<input\b[^>]*>/gi)||[]){const input=Parser.attrs(tag);if(input.type==='hidden'&&input.name&&!/\bdisabled(?:\s|=|>)/i.test(tag))pairs.push([input.name,input.value||'']);}
  pairs.push(['login_id',String(acc.email).split('@')[0]],['password',String(acc.pass)]);
  const body=http.formBody(pairs,initial.charset);check(stopCheck);
  const postHeaders=Object.assign({},NAV_HEADERS,{'Content-Type':'application/x-www-form-urlencoded',Origin:ORIGIN,Referer:initial.url});
  const response=await http.request(ORIGIN+'/login_chk/',{method:'POST',body,headers:postHeaders});
  check(stopCheck);const path=pagePath(response);
  if(/^\/+login(?:[\/_]|$)/.test(path)||Parser.hasLogin(response.text))throw new Error('PREMIUM_RESULT_LOGIN_REJECTED');
 }
 async function login(acc,stopCheck){
  check(stopCheck);if(attempted)throw new Error('PREMIUM_RESULT_LOGIN_ALREADY_ATTEMPTED');attempted=true;
  if(!acc||!acc.email||!acc.pass)throw new Error('PREMIUM_RESULT_ACCOUNT_INVALID');
  try{await loginBnid(acc,stopCheck);}
  catch(error){
   if(!error||error.message!=='PREMIUM_RESULT_LOGIN_REJECTED')throw error;
   await loginPremiumId(acc,stopCheck);
  }
  trace('mypage check');
  const account=await fetchPage(ORIGIN+'/mypage/',stopCheck);
  trace('mypage '+account.status+' '+account.path);
  if(account.path!=='/mypage/')throw new Error('PREMIUM_RESULT_LOGIN_NOT_CONFIRMED');
  authenticated=true;return {verified:true};
 }
 async function readResults(ids,stopCheck){
  check(stopCheck);if(!authenticated)throw new Error('PREMIUM_RESULT_LOGIN_REQUIRED');
  const targets=Parser.productIds(ids),queue=[ORIGIN+'/mylotsale/'],visited=new Set(),records=[];
  while(queue.length){
   check(stopCheck);const url=queue.shift();if(visited.has(url))continue;
   if(visited.size>=50)throw new Error('PREMIUM_RESULT_PAGINATION_INCOMPLETE');visited.add(url);
   const page=await fetchPage(url,stopCheck);if(page.path!=='/mylotsale/')throw new Error('PREMIUM_RESULT_PAGE_UNEXPECTED');
   const parsed=Parser.parseHistory(page.text);records.push(...parsed.records);
   for(const link of parsed.pageLinks)if(!visited.has(link)&&!queue.includes(link))queue.push(link);
  }
  return targets.map(productId=>{
   const entries=records.filter(record=>record.productId===productId),statuses=Array.from(new Set(entries.map(record=>record.status)));
   const unresolved=!entries.length&&records.some(record=>record.productId===null);
   return {productId,status:!entries.length?unresolved?'UNKNOWN':'NOT_FOUND':statuses.length===1?statuses[0]:'MIXED',reason:unresolved?'HISTORY_HAS_UNLINKED_PRODUCTS':'',entries};
  });
 }
 const client={login,readResults,close};ACTIVE.add(client);return client;
}
function cancelAll(){for(const client of Array.from(ACTIVE))client.close();}
module.exports={...Parser,createClient,cancelAll,setLogger};
