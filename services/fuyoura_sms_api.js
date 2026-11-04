// Independent Fuyoura provider. No API key is embedded in source.
const URL = 'https://fuyoura.com/api/otp/v1';
const TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 5000;
function sleep(ms) { return new Promise(resolve => $delay(ms / 1000, resolve)); }
function check(fn) { if (typeof fn === 'function') fn(); }
function value(x) { return x == null ? '' : String(x); }
function body(obj) { return Object.keys(obj).map(k => encodeURIComponent(k)+'='+encodeURIComponent(obj[k])).join('&'); }
function apiError(d) { return value(d && (d.message || d.msg || d.error || d.status) || 'INVALID_RESPONSE'); }
function configure(project, key, country) {
  const cfg = {project:value(project).trim(),key:value(key).trim(),country:value(country || 'jpn').trim()};
  if (!cfg.key) throw new Error('FUYOURA_API_KEY_REQUIRED');
  if (!/^\d+$/.test(cfg.project)) throw new Error('FUYOURA_PROJECT_ID_INVALID');
  if (!cfg.country) throw new Error('FUYOURA_COUNTRY_REQUIRED');
  return cfg;
}
async function request(cfg, action, params, stopCheck) {
  check(stopCheck);
  const form = Object.assign({key:cfg.key,action},params||{});
  const res = await $http.post({url:URL,header:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:body(form),timeout:25});
  const code = Number(res && res.response && res.response.statusCode || 0);
  let d = res && res.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { throw new Error('FUYOURA_BAD_JSON'); } }
  if (code !== 200 || !d || d.success === false || d.status === 'error' || d.status === 'failed') throw new Error('FUYOURA_'+action+'_FAILED_'+code+'_'+apiError(d));
  return d;
}
function findOrders(d) {
  if (Array.isArray(d)) return d;
  for (const key of ['data','orders','results','items','numbers']) {
    if (Array.isArray(d[key])) return d[key];
    if (d[key] && typeof d[key] === 'object') {
      if (Array.isArray(d[key].orders)) return d[key].orders;
      if (Array.isArray(d[key].items)) return d[key].items;
      if (d[key].order != null || d[key].number != null) return [d[key]];
    }
  }
  return [d];
}
async function orderPhoneSafe(cfg, stopCheck) {
  const d = await request(cfg,'getNumber',{country:cfg.country,project:cfg.project,qty:1},stopCheck);
  const item = findOrders(d)[0] || {};
  const order = value(item.order || item.order_id || item.id).trim();
  const phone = value(item.number || item.phone || item.sdt).trim();
  if (!order || !phone) throw new Error('FUYOURA_ORDER_RESPONSE_MISSING_ORDER_OR_PHONE');
  return {provider:'fuyoura',order,pkey:order,phone,sdt:phone,config:cfg};
}
function findCode(d, order) {
  const entries = findOrders(d);
  const item = entries.find(x => value(x.order || x.order_id || x.id) === value(order)) || entries[0] || {};
  const code = value(item.code || item.otp || '').trim();
  const status = value(item.status || d.status).toLowerCase();
  return status === 'received' && code ? code : '';
}
async function cancel(cfg, order, stopCheck) {
  const d = await request(cfg,'cancel',{order},stopCheck);
  if (d.success === false || ['failed','error'].includes(value(d.status).toLowerCase())) throw new Error('FUYOURA_CANCEL_REJECTED_'+apiError(d));
  return d;
}
async function waitOtp(info, stopCheck) {
  const start = Date.now();
  while (Date.now()-start < TIMEOUT_MS) {
    check(stopCheck);
    const d = await request(info.config,'getCode',{orders:info.order},stopCheck);
    const otp = findCode(d,info.order);
    if (otp) {
      if (!/^\d{4,8}$/.test(otp)) throw new Error('FUYOURA_INVALID_OTP_FORMAT');
      return otp;
    }
    await sleep(POLL_MS);
  }
  // Same 5-minute cancellation policy as NorthDinh. Never claim success on error.
  try { await cancel(info.config,info.order,stopCheck); }
  catch(e) { throw new Error('FUYOURA_OTP_TIMEOUT_CANCEL_FAILED_'+value(e.message||e)); }
  return null;
}
module.exports={configure,orderPhoneSafe,waitOtp,cancel};
