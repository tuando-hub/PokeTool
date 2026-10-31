// BandaiNamco: original OTP search/parse/delete behavior, one IMAP per worker wave.
const Imap=require('imap');
const {simpleParser}=require('mailparser');
const user=process.argv[2],pass=process.argv[3],eventId=process.argv[4];
const targets=[...new Set(JSON.parse(process.argv[5]||'[]').map(x=>String(x).trim().toLowerCase()).filter(Boolean))];
const completed=new Set();
const started=Date.now(),TIMEOUT=180000,INTERVAL=1000;
const host=/@(icloud\.com|me\.com)$/i.test(user)?'imap.mail.me.com':'imap.gmail.com';
const imap=new Imap({user,password:pass,host,port:993,tls:true,tlsOptions:{rejectUnauthorized:false},connTimeout:20000,authTimeout:20000,keepalive:true});
let closed=false,busy=false,interval=null;
function notify(data){try{$jsbox.notify(eventId,data);}catch(e){console.log('[BN IMAP] notify error',e.message);}}
function close(){if(closed)return;closed=true;if(interval)clearInterval(interval);try{imap.end();}catch(e){}}
function search(criteria){return new Promise((resolve,reject)=>imap.search(criteria,(e,ids)=>e?reject(e):resolve(ids||[])));}
function fetch(uid){return new Promise(resolve=>{
 let finished=false,timer=null,chunks=[];
 const finish=v=>{if(finished)return;finished=true;if(timer)clearTimeout(timer);resolve(v||null);};
 timer=setTimeout(()=>finish(null),30000);
 try{const f=imap.fetch(uid,{bodies:'',markSeen:true});
  f.on('message',m=>{m.on('body',s=>{s.on('data',c=>chunks.push(c));s.once('error',()=>finish(null));});m.once('end',async()=>{try{finish(await simpleParser(Buffer.concat(chunks)));}catch(e){finish(null);}});});
  f.once('error',()=>finish(null));
 }catch(e){finish(null);}
});}
function otpFrom(mail){
 const subject=String(mail.subject||'').replace(/\s+/g,' ').trim();
 if(!subject.includes('バンダイナムコID')||!subject.includes('認証コード確認'))return null;
 const body=[subject,mail.text||'',mail.html||''].join('\n').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&');
 const match=body.match(/認証コード\s*\*+\s*(\d{6})\s*\*+/m)||body.match(/認証コード[\s\S]{0,100}?(\d{6})/);
 return match?match[1]:null;
}
function deleteOtp(uid){return new Promise(resolve=>{
 try{imap.addFlags(uid,'\\Deleted',e=>{
  if(e){console.log('[BN IMAP] DELETE FLAG',e.message);return resolve();}
  imap.expunge(err=>{if(err)console.log('[BN IMAP] EXPUNGE',err.message);resolve();});
 });}catch(e){console.log('[BN IMAP] DELETE',e.message);resolve();}
});}
async function tick(){if(busy||closed)return;busy=true;try{
 if(Date.now()-started>=TIMEOUT){for(const email of targets)if(!completed.has(email))notify({email,otp:null});close();return;}
 // Same logic as original getotp: search TO and UNSEEN, intersect, fetch newest.
 // The connection and polling loop are shared by every worker in this wave.
 const unseenSet=new Set((await search(['UNSEEN'])).map(Number));
 for(const email of targets){
  if(closed||completed.has(email))continue;
  const toIds=await search([['TO',email]]);
  const ids=toIds.map(Number).filter(uid=>unseenSet.has(uid)&&Number.isFinite(uid));
  if(!ids.length)continue;
  const uid=Math.max(...ids);
  const mail=await fetch(uid);
  if(!mail)continue;
  const otp=otpFrom(mail);
  if(!otp)continue;
  // Original code removes successfully matched OTP email.
  await deleteOtp(uid);
  completed.add(email);
  console.log('[BN IMAP] OTP FOUND',email,'UID',uid);
  notify({email,otp});
  if(completed.size===targets.length){close();return;}
 }
}catch(e){console.log('[BN IMAP] poll',e.message||e);}finally{busy=false;}}
imap.once('error',e=>{if(!closed)notify({error:String(e.message||e)});close();});
imap.once('ready',()=>imap.openBox('INBOX',false,e=>{
 if(e){notify({error:String(e.message||e)});close();return;}
 console.log('[BN IMAP] READY shared mailbox, targets',targets.length);
 notify({ready:true});interval=setInterval(tick,INTERVAL);tick();
}));
imap.connect();setTimeout(close,190000);
