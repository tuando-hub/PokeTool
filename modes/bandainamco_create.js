
// BandaiNamco / Create Account only
// Keep Pokemon and other modes unchanged.

const Core = require('../core');
const OTP = require('../otp');
const BandaiImap = require('../services/bandai_imap_manager');

const API = 'https://account-api.bandainamcoid.com';
const CLIENT = 'premium_bandai';

const DEFAULT_AUTH =
  'https://www.bandainamcoid.com/v2/oauth2/auth' +
  '?back=v3&client_id=premium_bandai' +
  '&scope=JpGroupAll+openid+profile+email+address+phone' +
  '&redirect_uri=' +
  encodeURIComponent('https://p-bandai.jp/bnidlogin?type=reg') +
  '&text=';

const STEP_NAMES = {
  '1': 'Nhập thông tin đăng ký',
  '2': 'Tạo tài khoản Bandai Namco',
  '3': 'Gửi mã xác minh email',
  'OTP': 'Chờ mã OTP từ email',
  '4': 'Xác minh mã OTP',
  '5': 'Xác nhận tài khoản',
  '6': 'Lưu lựa chọn đồng ý',
  '7': 'Mở phần thông tin bổ sung',
  '8': 'Lưu thông tin giới tính',
  '9': 'Hoàn tất thiết lập'
};
const STEP_PATHS = {
  '/v3/signup/idpw': ['1', '2'],
  '/v3/authcode/init': ['3'],
  '/v3/authcode/input': ['4'],
  '/v3/signup/end': ['5'],
  '/v3/signup/consents': ['6'],
  '/v3/add/init': ['7'],
  '/v3/add/input': ['8'],
  '/v3/add/end': ['9']
};
let activeStep = '';
let activeAccount = '';
function log(msg, type) {
  Core.addLog('[BandaiNamco] ' + msg, type || 'info');
}
function step(n) {
  const key = String(n);
  activeStep = key;
  const label = STEP_NAMES[key] || 'Đang xử lý';
  const prefix = key === 'OTP' ? 'OTP' : key + '/9';
  log('⏳ ' + prefix + ' · ' + label, 'info');
  Core.updateCurrent({
    email: activeAccount || '-',
    step: prefix + ' · ' + label,
    status: key === 'OTP' ? 'Waiting OTP' : 'Running'
  });
}
function check(stopCheck) {
  if (typeof stopCheck === 'function') stopCheck();
}

function encode(fields) {
  return Object.keys(fields)
    .filter(k => fields[k] !== undefined && fields[k] !== null)
    .map(k =>
      encodeURIComponent(k) + '=' +
      encodeURIComponent(String(fields[k]))
    )
    .join('&');
}

function queryParams(url) {
  const result = {};
  const text = String(url || '');
  const pos = text.indexOf('?');

  if (pos < 0) return result;

  text.slice(pos + 1).split('#')[0].split('&').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;

    try {
      const key = decodeURIComponent(part.slice(0, i));
      const value = decodeURIComponent(
        part.slice(i + 1).replace(/\+/g, ' ')
      );
      result[key] = value;
    } catch (_) {}
  });

  return result;
}

function cookieValue(item) {
  if (item && typeof item === 'object') {
    return item.value;
  }
  return item;
}

// FIX 1:
// Use the cookie's actual "name", not the response object key.
function mergeCookies(data, session) {
  if (!data || typeof data !== 'object') return;

  Object.keys(data).forEach(key => {
    const item = data[key];

    const actualName =
      item && typeof item === 'object' && item.name
        ? String(item.name)
        : key === 'authcode'
          ? 'authcodeProd'
          : key;

    // Server requests deletion of an old cookie.
    if (key.indexOf('delete_') === 0) {
      delete session.cookies[actualName];
      return;
    }

    const value = cookieValue(item);

    if (value !== undefined && value !== null) {
      session.cookies[actualName] = String(value);
    }
  });
}

function updateSession(data, session, path) {
  mergeCookies(data.cookie, session);

  if (data.redirect) {
    session.lastRedirect = String(data.redirect);

    const params = queryParams(data.redirect);

    Object.keys(params).forEach(key => {
      session.route[key] = params[key];
    });

    // Keep the redirect_uri supplied by the service.
    if (params.redirect_uri) {
      session.auth = params.redirect_uri;
    }
  }

  // Chỉ ghi tiến độ dễ hiểu, không đưa API/cookie vào log thường.
  const keys = STEP_PATHS[path] || [];
  if (keys.indexOf(activeStep) >= 0) {
    const prefix = activeStep + '/9';
    log('✓ ' + prefix + ' · ' + STEP_NAMES[activeStep], 'success');
  }

}

function request(method, path, fields, session) {
  return new Promise((resolve, reject) => {
    const url = API + path +
      (method === 'GET' ? '?' + encode(fields) : '');

    $http.request({
      method,
      url,
      timeout: 30,
      header: {
        Accept: 'application/json',
        'Content-Type':
          'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://account.bandainamcoid.com',
        Referer: 'https://account.bandainamcoid.com/',
        'Accept-Language': 'ja'
      },
      body: method === 'POST'
        ? encode(fields)
        : undefined,
      handler: r => {
        if (
          r.error ||
          !r.response ||
          r.response.statusCode !== 200
        ) {
          const status = r.response
            ? r.response.statusCode
            : 'NETWORK';

          return reject(
            new Error(path + ': HTTP_' + status)
          );
        }

        let data = r.data;

        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (_) {
            return reject(
              new Error(path + ': INVALID_JSON')
            );
          }
        }

        if (!data || data.result !== 'OK') {
          const msg =
            data && data.data && data.data.msg
              ? data.data.msg
              : 'API_RESULT_' + (data && data.result);

          return reject(
            new Error(path + ': ' + msg)
          );
        }

        updateSession(data, session, path);
        resolve(data);
      }
    });
  });
}

// FIX 2:
// Use the current session's redirect URI.
function common(session) {
  return {
    client_id: CLIENT,
    redirect_uri: session.auth,
    customize_id: session.route.customize_id || '',
    language: 'ja',
    cookie: JSON.stringify(session.cookies)
  };
}

function birthdayFor(form, acc, index) {
  const lines = String(form.birthdate || '')
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  return String(
    acc.birthdate ||
    lines[index - 1] ||
    (lines.length === 1 ? lines[0] : '')
  ).trim();
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function getGender(form, acc) {
  const raw =
    acc.gender !== undefined ? acc.gender :
    form.gender !== undefined ? form.gender : '-1';

  const gender = String(raw).trim();

  if (!['1', '2', '-1'].includes(gender)) {
    throw new Error('INVALID_GENDER');
  }

  return gender;
}

function getConsent(form, acc) {
  const config = acc.consent || form.consent || {};

  function flag(value, fallback) {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (value === true || value === 1 || value === '1') {
      return 1;
    }

    if (value === false || value === 0 || value === '0') {
      return 0;
    }

    throw new Error('INVALID_CONSENT_VALUE');
  }

  // Optional purposes default to disabled.
  return {
    bnid: {
      Analytics: flag(config.analytics, 0),
      'Ad-Targeting': flag(config.ads, 0)
    },
    pp: {
      '1': flag(config.pp1, 0),
      '2': flag(config.pp2, 0)
    }
  };
}

async function runAccount({
  acc,
  index,
  form,
  stopCheck
}) {
  const email = String(acc.email || '').trim();
  const password = String(acc.pass || '');
  const birthday = birthdayFor(form, acc, index);
  activeAccount = email;
  activeStep = '';

  if (!email || !password) {
    throw new Error('MAIL_LIST_REQUIRED_EMAIL_PASS');
  }

  if (!validDate(birthday)) {
    throw new Error('INVALID_BIRTHDATE_' + index);
  }

  // A genuine session-specific OAuth URL may be supplied
  // by the existing application. Do not reuse captured usdata.
  const auth = String(
    acc.authUrl || form.authUrl || DEFAULT_AUTH
  ).trim();

  const session = {
    auth,
    cookies: {
      language: 'ja',
      retention_tmp: '1'
    },
    route: {},
    lastRedirect: ''
  };

  const base = {
    client_id: CLIENT,
    redirect_uri: session.auth,
    backto: '',
    customize_id: '',
    login_id: email,
    password,
    password_r: password,
    language: 'ja',
    retention: '1',
    cookie: '{}',
    mail_skey: '',
    env_info: JSON.stringify({
      mobile: true,
      platform: 'iOS'
    })
  };

  // STEP 1
  check(stopCheck);
  step(1, 'signup/idpw');

  await request(
    'POST',
    '/v3/signup/idpw',
    base,
    session
  );

  // STEP 2
  check(stopCheck);
  step(2, 'signup/idpw execute');

  await request(
    'POST',
    '/v3/signup/idpw',
    Object.assign({}, base, {
      execute: '1',
      country: 'JP',
      birthday
    }),
    session
  );

  if (!session.cookies.authcodeProd) {
    throw new Error('MISSING_AUTHCODE_COOKIE');
  }

  // STEP 3
  check(stopCheck);
  step(3, 'authcode/init');

  await request(
    'GET',
    '/v3/authcode/init',
    {
      client_id: CLIENT,
      backto: session.route.backto || '',
      permit_token: session.route.permit_token || '',
      mode: session.route.mode || '',
      customize_id: session.route.customize_id || '',
      language: 'ja',
      cookie: JSON.stringify(session.cookies)
    },
    session
  );

  // OTP - unchanged
  check(stopCheck);

  const imapEmail = String(form.imapEmail || '').trim();
  const imapPass = String(form.imapPass || '').trim();

  if (!imapEmail || !imapPass) {
    throw new Error(
      'BANDAI_IMAP_CREDENTIALS_REQUIRED'
    );
  }

  step('OTP', 'waiting for Bandai Namco verification email');

  const otp = await BandaiImap.getOtp(imapEmail, imapPass, email);

  log('✓ Đã nhận OTP hợp lệ', 'success');

  if (!/^\d{6}$/.test(String(otp || '').trim())) {
    throw new Error(
      'BANDAI_OTP_TIMEOUT_OR_INVALID'
    );
  }

  // STEP 4
  check(stopCheck);
  step(4, 'authcode/input');

  await request(
    'POST',
    '/v3/authcode/input',
    {
      client_id: CLIENT,
      backto: session.route.backto || '',
      customize_id: session.route.customize_id || '',
      authcode: String(otp).trim(),
      authcode_key: '',
      language: 'ja',
      permit_token: session.route.permit_token || '',
      cookie: JSON.stringify(session.cookies)
    },
    session
  );

  // STEP 5
  check(stopCheck);
  step(5, 'signup/end');

  const signupEnd = await request(
    'GET',
    '/v3/signup/end',
    common(session),
    session
  );

  const input = signupEnd.data &&
    signupEnd.data.input;


  // STEP 6
  // Same signup endpoint confirmed in the capture.
  const consent = getConsent(form, acc);

  check(stopCheck);
  step(6, 'signup/consents');

  await request(
    'POST',
    '/v3/signup/consents',
    Object.assign(common(session), {
      consent_data: JSON.stringify(consent)
    }),
    session
  );

  // STEP 7
  check(stopCheck);
  step(7, 'add/init');

  const addInit = await request(
    'GET',
    '/v3/add/init',
    Object.assign(common(session), {
      input_type: 'gender'
    }),
    session
  );

  const gender = getGender(form, acc);

  log('Giới tính: ' + ({'1':'Nam','2':'Nữ','-1':'Không trả lời'}[gender] || 'Chưa xác định'));

  // STEP 8
  check(stopCheck);
  step(8, 'add/input');

  await request(
    'POST',
    '/v3/add/input',
    Object.assign(common(session), {
      input_type: 'gender',
      gender
    }),
    session
  );

  // STEP 9
  check(stopCheck);
  step(9, 'add/end');

  const addEnd = await request(
    'GET',
    '/v3/add/end',
    Object.assign(common(session), {
      input_type: 'gender'
    }),
    session
  );

  // API success is not necessarily final website completion.
  const finalInput = addEnd.data &&
    addEnd.data.input;

  log('🎉 Hoàn tất 9 bước API cho ' + email, 'success');
  Core.updateCurrent({
    email,
    step: '9/9 · Hoàn tất thiết lập',
    status: 'Done'
  });

  return {
    gender,
    apiCompleted: true,
    websiteCompletionVerified: false,
    consent,
    finalGenderStatus: finalInput
      ? finalInput.gender
      : null
  };
}

module.exports = { runAccount };
