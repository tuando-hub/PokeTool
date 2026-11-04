// Per-account 3DS source selection and reference-bound email request lifecycle.
const OTP = require('../otp');

function create(form, options) {
  const enabled = String(form.payment3dsEnabled || '0') === '1';
  const sms = enabled && String(form.payment3dsSmsEnabled || '0') === '1';
  const mail = String(form.payment3dsImapMail || '').trim();
  const password = String(form.payment3dsImapPass || '');
  if (enabled && !sms && (!mail || !password.trim())) {
    throw new Error('THREEDS_IMAP_MAIL_PASS_REQUIRED');
  }
  const startEmail = options.startEmail || OTP.start3dsEmail;
  let active = null;
  let cancelled = false;
  let warned = false;
  const log = options.log || function() {};
  return {
    enabled,
    sms,
    method:enabled ? (sms ? 'sms' : 'email') : null,
    read(challenge) {
      if (cancelled || !enabled || !challenge || challenge.screen !== 'OTP_INPUT') return null;
      if (sms) {
        const value = String(options.clipboard() || '').trim();
        return /^\d{4,8}$/.test(value) ? {otp:value} : null;
      }
      const reference = String(challenge.referenceCode || '').trim();
      if (!/^[A-Z0-9][A-Z0-9-]{2,63}$/.test(reference)) {
        if (active) { active.request.cancel(); active = null; }
        if (!warned) log('3DS Email · Chờ Reference Code trên màn hình OTP', 'warn');
        warned = true;
        return null;
      }
      if (!active || active.reference !== reference) {
        if (active) active.request.cancel();
        const request = startEmail(mail,password,reference,options.since,options.deadline,
          status => log(status,'warn'));
        const state = {reference,request,otp:null,error:null};
        active = state;
        log('3DS Email · Đã đọc Reference Code, đang tìm đúng email');
        request.promise.then(otp => {
          if (!cancelled && active === state) state.otp = otp;
        },error => {
          if (!cancelled && active === state) state.error = error;
        });
      }
      if (active.error) throw active.error;
      return active.otp ? {otp:active.otp,referenceCode:reference} : null;
    },
    cancel() {
      cancelled = true;
      if (active) active.request.cancel();
      active = null;
    }
  };
}

module.exports = {create};
