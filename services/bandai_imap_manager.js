// Isolated BandaiNamco IMAP wave manager. Other OTP modes are untouched.
const Legacy = require('../otp');
let wave = null;
let seq = 0;
function key(s) { return String(s || '').trim().toLowerCase(); }
function startWave(user, pass, emails) {
  endWave();
  const targets = [...new Set((emails || []).map(key).filter(Boolean))];
  if (!user || !pass || !targets.length) return Promise.reject(new Error('Missing IMAP credentials or targets'));
  const eventId = 'BN_IMAP_WAVE_' + Date.now() + '_' + (++seq);
  const state = {eventId, user, pass, targets, waiters: new Map(), results: new Map(), ended:false, ready:false, readyResolve:null, readyReject:null};
  const readyPromise = new Promise((resolve,reject)=>{state.readyResolve=resolve;state.readyReject=reject;});
  const readyTimer=setTimeout(()=>{if(!state.ready){state.readyReject(new Error('IMAP READY timeout'));endWave();}},25000);
  wave = state;
  $nodejs.listen(eventId, msg => {
    if (state.ended || !msg) return;
    if (msg.ready && !state.ready) {state.ready=true;clearTimeout(readyTimer);state.readyResolve(true);return;}
    if (msg.error && !state.ready) {clearTimeout(readyTimer);state.readyReject(new Error(String(msg.error)));endWave();return;}
    if (msg.email) {
      const email = key(msg.email);
      if (!state.targets.includes(email)) return;
      const value = /^\d{6}$/.test(String(msg.otp || '')) ? String(msg.otp) : null;
      state.results.set(email, value);
      const fn = state.waiters.get(email);
      if (fn) { state.waiters.delete(email); fn(value); }
    }
    if (msg.error) console.log('[Bandai IMAP] ' + msg.error);
  });
  $nodejs.run({name:'PokeTool/node/bandai_imap', argv:[user,pass,eventId,JSON.stringify(targets)]});
  return readyPromise;
}
function endWave() {
  if (!wave) return;
  wave.ended = true;
  for (const resolve of wave.waiters.values()) resolve(null);
  wave.waiters.clear();
  wave = null;
}
function getOtp(user, pass, email) {
  email = key(email);
  const w = wave;
  if (!w || key(user) !== key(w.user) || pass !== w.pass || !w.targets.includes(email)) {
    return Legacy.getOtpDirect(user, pass, email, 'BandaiNamcoOTP');
  }
  if (w.results.has(email)) return Promise.resolve(w.results.get(email));
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      if (w.waiters.get(email) === finish) w.waiters.delete(email);
      resolve(null);
    }, 185000);
    function finish(value) { clearTimeout(timer); resolve(value); }
    w.waiters.set(email, finish);
  });
}
module.exports = {startWave,endWave,getOtp};
