// Runs on the existing getotp connection and reuses its search/fetch/parser.
const {extractEmailOtp} = require('../../services/three_ds_reference');

async function run(imap, cfg, done, stopped, search, fetchMail, delay) {
  const checked = new Set();
  while (!stopped() && Date.now() < cfg.deadline) {
    const ids = (await search(imap,[['SINCE',new Date(cfg.since-60000)]]))
      .map(Number).sort((a,b) => b-a);
    for (const uid of ids) {
      if (stopped()) return;
      if (checked.has(uid)) continue;
      const mail = await fetchMail(imap,uid,false);
      if (stopped()) return;
      if (!mail) continue;
      checked.add(uid);
      const receivedAt = new Date(mail._imapReceivedAt || mail.date).getTime();
      if (!Number.isFinite(receivedAt) || receivedAt < cfg.since-60000) continue;
      const content = [mail.subject || '',mail.text || '',
        String(mail.html || '').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|div|tr)>/gi,'\n\n')
          .replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ')].join('\n');
      const otp = extractEmailOtp(content,cfg.referenceCode);
      if (otp) return done({value:otp,referenceCode:cfg.referenceCode});
    }
    await delay(1000);
  }
  if (!stopped()) done({error:'THREEDS_EMAIL_TIMEOUT'});
}

module.exports = {run};
