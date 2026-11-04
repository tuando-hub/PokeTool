// Pure helpers, shared with the injected 3DS frame script. Keep this function
// self-contained: web.js serializes it into WKUserScript.
function extractReferenceCode(value) {
  const text = String(value || '').normalize('NFKC');
  const pattern = /(?:reference\s*(?:code|number|no\.?)|リファレンス\s*(?:コード|番号)|参照\s*(?:コード|番号)|照会番号)\s*[:：#]?\s*([A-Za-z0-9][A-Za-z0-9-]{2,63})(?![A-Za-z0-9-])/gi;
  const codes = [];
  let match;
  while ((match = pattern.exec(text))) {
    const code = match[1].toUpperCase();
    if (!codes.includes(code)) codes.push(code);
  }
  return codes.length === 1 ? codes[0] : '';
}

function extractEmailOtp(value, referenceCode) {
  const text = String(value || '').normalize('NFKC');
  const reference = String(referenceCode || '').normalize('NFKC').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,63}$/.test(reference)) return null;
  // Require the whole reference, not a substring of another transaction code.
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp('(^|[^A-Z0-9-])' + escaped + '(?=$|[^A-Z0-9-])', 'i').test(text)) return null;
  const referenceLabel = /reference\s*(?:code|number|no\.?)|リファレンス\s*(?:コード|番号)|参照\s*(?:コード|番号)|照会番号/i;
  const labelledReference = extractReferenceCode(text);
  // Forwarded/combined messages can contain several transactions. In that
  // case only accept an OTP from the same paragraph as exactly one reference.
  const blocks = labelledReference === reference || !referenceLabel.test(text)
    ? [text]
    : text.split(/\n\s*\n/).filter(block => extractReferenceCode(block) === reference);
  const pattern = /(?:one[\s-]*time\s*(?:password|passcode|code)|verification\s*code|authentication\s*code|security\s*code|passcode|\bOTP\b|ワンタイムパスワード|ワンタイムパスコード|ワンタイムコード|認証コード|確認コード|認証番号)\s*(?:is\b|は)?[\s:：=「」【】\[\]（）()]*(\d{4,8})(?!\d)/gi;
  const codes = [];
  for (const block of blocks) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(block))) {
      if (match[1] !== reference && !codes.includes(match[1])) codes.push(match[1]);
    }
  }
  return codes.length === 1 ? codes[0] : null;
}

module.exports = {extractReferenceCode, extractEmailOtp};
