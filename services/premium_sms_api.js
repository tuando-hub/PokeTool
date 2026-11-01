// Premium Bandai SMS: NorthDinhJPN External API (Api.html).
// Only this module is changed; keep the existing UI and mode interface.
const API_BASE = 'https://gsmcloudjpn.online/api/ext';
const POLL_MS = 4000;
const OTP_TIMEOUT = 10 * 60 * 1000;
let serviceId = '';
let smsServer = 2;
let apiKey = '';
let orderQueue = Promise.resolve();
let smsQueue = Promise.resolve();
let nextSmsRequestAt = 0;
function stop(fn) { if (typeof fn === 'function') fn(); }
function sleep(ms) { return new Promise(r => $delay(ms / 1000, r)); }
function status(res) { return Number(res && res.response && res.response.statusCode || 0); }
function msg(d) { return String(d && (d.msg || d.message || d.error) || 'UNKNOWN'); }
function configure(requestedServiceId, suppliedKey, requestedServer) {
  const sid = String(requestedServiceId == null ? '' : requestedServiceId).trim();
  const k = String(suppliedKey || '').trim();
  if (!/^[1-9]\d*$/.test(sid)) throw new Error('PREMIUM_EXT_SERVICE_ID_REQUIRED_OR_INVALID');
  if (!k) throw new Error('PREMIUM_EXT_API_KEY_REQUIRED');
  const selectedServer = String(requestedServer == null || requestedServer === '' ? '2' : requestedServer).trim();
  if (selectedServer !== '1' && selectedServer !== '2') throw new Error('PREMIUM_EXT_SERVER_MUST_BE_1_OR_2');
  serviceId = sid;
  apiKey = k;
  smsServer = Number(selectedServer);
}
function login(stopCheck) {
  stop(stopCheck);
  if (!apiKey) throw new Error('PREMIUM_EXT_API_KEY_REQUIRED');
  return Promise.resolve(apiKey);
}
async function get(path, params, stopCheck) {
  stop(stopCheck);
  const apikey = await login(stopCheck);
  const q = Object.assign({apikey}, params || {});
  const query = Object.keys(q).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(q[k])).join('&');
  const res = await $http.get({url:API_BASE + '/' + path + '?' + query,timeout:20,header:{Accept:'application/json'}});
  const d = res && res.data;
  if (status(res) === 200 && d && d.status === 'success') return d;
  // Never refresh the key automatically: it is supplied by the user in HOME.
  throw new Error('PREMIUM_EXT_' + path.toUpperCase() + '_FAILED_HTTP_' + status(res) + '_' + msg(d));
}
function resetToken() { /* Manual API key is owned by the UI; do not delete it. */ }
function normalizePhone(v) {
  let phone = String(v == null ? '' : v).replace(/\D/g, '');
  if (phone.startsWith('81') && phone.length === 12) phone = '0' + phone.slice(2);
  else if (phone && !phone.startsWith('0')) phone = '0' + phone;
  return phone;
}
// Server 1 supplies the number immediately. Server 2 may first return
// phone="Đang xin số..." with a valid PKEY. Never create a second order.
async function order(stopCheck) {
  stop(stopCheck);
  if (!serviceId) throw new Error('PREMIUM_EXT_SERVICE_ID_REQUIRED');
  const server = smsServer;
  const d = await get('order',{serviceId:serviceId,server:server,country:'jpn'},stopCheck);
  const pkey = String(d.pkey == null ? '' : d.pkey).trim();
  const phone = normalizePhone(d.phone);
  if (!pkey) throw new Error('PREMIUM_EXT_ORDER_MISSING_PKEY');
  if (server === 1 && !phone) throw new Error('PREMIUM_EXT_SERVER1_MISSING_PHONE');
  return {phone,pkey,sdt:phone,server:server,waitingPhone:!phone,expires_at:d.expires_at};
}
// For server 2, reuse the SAME PKEY while waiting for a real phone.
// The documented getSms endpoint may or may not include a phone field.
// If it does not, report this explicitly rather than re-ordering.
async function waitForPhone(info,stopCheck) {
  if (!info || !info.pkey) throw new Error('PREMIUM_EXT_PKEY_REQUIRED');
  if (info.phone) return info;
  if (Number(info.server) !== 2) throw new Error('PREMIUM_EXT_PHONE_MISSING');
  const deadline = Date.now() + 60 * 60 * 1000;
  let checks = 0;
  while (Date.now() < deadline) {
    stop(stopCheck);
    const d = await pollOnce(info.pkey,stopCheck);
    const phone = normalizePhone(d.phone);
    if (phone) {
      info.phone = phone;
      info.sdt = phone;
      info.waitingPhone = false;
      console.log('[PREMIUM EXT SMS] Server 2 phone assigned');
      return info;
    }
    if (++checks === 1) {
      console.log('[PREMIUM EXT SMS] Server 2 waiting phone; getSms fields: ' + Object.keys(d).join(','));
    }
    await sleep(POLL_MS);
  }
  throw new Error('PREMIUM_EXT_SERVER2_PHONE_WAIT_TIMEOUT_CHECK_GETSMS_RESPONSE');
}
// Serialize order calls to respect the documented 10 orders/min/account limit.
function orderPhoneSafe(stopCheck) {
  const task = orderQueue.catch(() => {}).then(async () => {
    stop(stopCheck);
    const d = await order(stopCheck);
    console.log('[PREMIUM EXT SMS] Order ready, pkey assigned to worker');
    return d;
  });
  orderQueue = task.catch(() => {});
  return task;
}
function orderPhone(stopCheck) { return orderPhoneSafe(stopCheck); }
// Globally serialize getSms requests to avoid exceeding 30/min/IP across workers.
function pollOnce(pkey, stopCheck) {
  const task = smsQueue.catch(() => {}).then(async () => {
    stop(stopCheck);
    const delay = Math.max(0, nextSmsRequestAt - Date.now());
    if (delay) await sleep(delay);
    nextSmsRequestAt = Date.now() + 2100;
    return get('getSms',{pkey},stopCheck);
  });
  smsQueue = task.catch(() => {});
  return task;
}
async function waitOtp(pkey, phone, stopCheck) {
  pkey = String(pkey || '').trim();
  if (!pkey) throw new Error('PREMIUM_EXT_PKEY_REQUIRED');
  const start = Date.now();
  const timeout = OTP_TIMEOUT; // Both servers: max 10 minutes for OTP
  while (Date.now() - start < timeout) {
    stop(stopCheck);
    const d = await pollOnce(pkey,stopCheck);
    const otp = String(d.otp || '').trim();
    if (otp && String(d.state || '') === 'Hoàn thành') {
      if (!/^\d{6}$/.test(otp)) throw new Error('PREMIUM_EXT_INVALID_OTP_FORMAT');
      console.log('[PREMIUM EXT SMS] OTP received for worker');
      return otp;
    }
    await sleep(POLL_MS);
  }
  return null;
}
async function getSms2(pkey, stopCheck) {
  pkey = String(pkey || '').trim();
  if (!pkey) throw new Error('PREMIUM_EXT_SMS2_PKEY_REQUIRED');
  return get('getSms2',{pkey},stopCheck);
}
async function waitOtpSms2(pkey, stopCheck) {
  await getSms2(pkey,stopCheck);
  return waitOtp(pkey,'',stopCheck);
}
async function getPhoneAndOtp(stopCheck) {
  const info = await orderPhoneSafe(stopCheck);
  await waitForPhone(info,stopCheck);
  const otp = await waitOtp(info.pkey,info.phone,stopCheck);
  if (!otp) throw new Error('PREMIUM_EXT_OTP_TIMEOUT');
  return Object.assign({},info,{otp});
}
function waitSms2(stopCheck) {
  const pkey = String($cache.get('north_sms2_pkey') || '');
  if (!pkey) throw new Error('PREMIUM_EXT_SMS2_PKEY_REQUIRED');
  return waitOtpSms2(pkey,stopCheck);
}
function getHistory() { throw new Error('PREMIUM_EXT_GET_HISTORY_NOT_SUPPORTED'); }
function waitPending() { throw new Error('PREMIUM_EXT_WAIT_PENDING_NOT_REQUIRED'); }
async function cancel(pkey,stopCheck) {
  pkey = String(pkey || '').trim();
  if (!pkey) throw new Error('PREMIUM_EXT_CANCEL_PKEY_REQUIRED');
  return get('cancel',{pkey},stopCheck);
}
module.exports = {configure,login,order,orderPhoneSafe,orderPhone,waitForPhone,waitOtp,
  getSms2,waitOtpSms2,waitSms2,getPhoneAndOtp,getHistory,waitPending,cancel,resetToken};
