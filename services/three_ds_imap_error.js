// Safe diagnostic text: server errors can contain login names or credentials.
function describeImapError(error, user, password, phase) {
  error = error || {};
  let message = String(error.message || 'Unknown IMAP error');
  for (const secret of [password,user]) {
    if (secret) message = message.split(String(secret)).join('[redacted]');
  }
  message = message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
    .replace(/\s+/g,' ').slice(0,200);
  const code = String(error.code || '').replace(/[^A-Za-z0-9_-]/g,'').slice(0,60);
  const source = String(error.source || '').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40);
  let kind = 'IMAP';
  let retryable = false;
  if (source === 'authentication' || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|Application-specific password|AUTHENTICATION_FAILED/i.test(message)) {
    kind = 'AUTH';
  } else if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|CERTIFICATE/i.test(code+' '+message)) {
    kind = 'TLS';
  } else if (/^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE)$/.test(code) ||
      /timeout|timed out|connection closed/i.test(message+' '+source)) {
    kind = 'NETWORK';
    retryable = true;
  } else if (code === 'ENOTFOUND') {
    kind = 'DNS';
    retryable = true;
  }
  return {error:'THREEDS_EMAIL_'+kind+'_ERROR ['+[phase,code,source].filter(Boolean).join('/')+'] '+message,
    retryable,kind};
}

module.exports = {describeImapError};
