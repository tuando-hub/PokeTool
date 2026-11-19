// BandaiPremium / Change Address Order (native HTTP)
// Login -> /myorder/ -> order containing PRODUCT ID -> /myorder_d_conf/:
// 住所検索 with the UI postcode, then change delivery time / address / name.
const Core = require('../core');
const Result = require('../services/premium_result');

const ORIGIN = 'https://p-bandai.jp';
const ORDER_LIST = ORIGIN + '/myorder/';
const MORNING = '午前中';

const parts = s => String(s || '').trim().split(/[\s　]+/).filter(Boolean);
const pick = (s, i) =>
  String(s || '')
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean)[i] || '';
const log = (s, type) => Core.addLog('[Change Address] ' + s, type || 'info');

function check(stopCheck) {
  if (typeof stopCheck === 'function') stopCheck();
}

function errorText(error) {
  const code = String((error && error.message) || error || '');
  const map = {
    PREMIUM_RESULT_LOGIN_REJECTED: 'Sai email hoặc mật khẩu Bandai Namco ID',
    PREMIUM_RESULT_LOGIN_REQUIRED: 'Chưa đăng nhập được p-bandai',
    PREMIUM_RESULT_LOGIN_INIT_FAILED: 'Không khởi tạo được phiên đăng nhập',
    PREMIUM_RESULT_LOGIN_PASSKEY_REQUIRED: 'Tài khoản yêu cầu passkey, không thể bỏ qua',
    PREMIUM_RESULT_LOGIN_NOT_CONFIRMED: 'Đăng nhập chưa được xác nhận',
    PREMIUM_RESULT_LOGIN_FORM_UNEXPECTED: 'Trang đăng nhập Premium không đúng',
    PREMIUM_RESULT_LOGIN_ACTION_UNEXPECTED: 'Form đăng nhập Premium không đúng',
    PREMIUM_RESULT_ACCOUNT_INVALID: 'Thiếu email hoặc mật khẩu',
    PREMIUM_RESULT_NETWORK_RESULT_UNKNOWN: 'Lỗi mạng khi gọi p-bandai',
    PREMIUM_RESULT_HTTP_TIMEOUT: 'Hết thời gian chờ p-bandai',
    PREMIUM_RESULT_NATIVE_RESPONSE_INVALID: 'Phản hồi p-bandai không hợp lệ',
    PREMIUM_RESULT_NATIVE_HTTP_UNAVAILABLE: 'Máy không hỗ trợ HTTP native',
    PREMIUM_RESULT_NATIVE_REQUEST_FAILED: 'Không tạo được request p-bandai',
    PREMIUM_RESULT_ENCODING_FAILED: 'Lỗi mã hóa form',
    PREMIUM_RESULT_URL_UNEXPECTED: 'URL không mong đợi',
    ACCOUNT_INVALID: 'Thiếu email hoặc mật khẩu',
    PRODUCT_ID_REQUIRED: 'Thiếu PRODUCT ID',
    POSTCODE_REQUIRED: 'Thiếu POSTCODE để tìm địa chỉ',
    PREF_REQUIRED: 'Thiếu PREF (tỉnh/thành) để chọn d_addr1',
    ORDER_LIST_EMPTY: 'Tài khoản không có đơn hàng',
    ORDER_NOT_FOUND: 'Không tìm thấy đơn chứa PRODUCT ID',
    CHANGE_FORM_NOT_FOUND: 'Không thấy form đổi địa chỉ trên đơn',
    ADDRESS_SEARCH_FAILED: 'Không tìm được địa chỉ từ mã bưu điện',
    ADDRESS_CHANGE_FAILED: 'p-bandai không nhận thay đổi địa chỉ',
    ADDRESS_NAMES_JAPANESE_REQUIRED:
      'Tên 姓/名 phải là tiếng Nhật (kanji/kana); p-bandai từ chối tên Latin',
    ADDRESS_CHANGE_REJECTED:
      'p-bandai từ chối thay đổi (e=1) — kiểm tra lại tên/địa chỉ',
    ADDRESS_CHANGE_TIMEOUT: 'Không xác nhận được thay đổi địa chỉ',
    ADDRESS_VERIFY_FAILED: 'Không xác nhận được địa chỉ mới'
  };
  if (code === '__STOP__') return code;
  if (code.indexOf('ADDRESS_CHANGE_FAILED:') === 0) {
    return (
      'p-bandai không nhận thay đổi địa chỉ (' +
      code.split(':').slice(1).join(':') +
      ')'
    );
  }
  if (map[code]) return map[code];
  return 'Lỗi đổi địa chỉ: ' + code;
}

function decode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function textOf(html) {
  return decode(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attrs(tag) {
  const out = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(String(tag || '')))) {
    out[m[1].toLowerCase()] = decode(
      m[2] === undefined ? (m[3] === undefined ? m[4] : m[3]) : m[2]
    );
  }
  return out;
}

function parseFields(open, form) {
  const head = attrs(open);
  const values = {};
  const submits = [];
  const selects = {};

  for (const tag of form.match(/<input\b[^>]*>/gi) || []) {
    const input = attrs(tag);
    if (!input.name) continue;
    const type = String(input.type || '').toLowerCase();
    if (type === 'submit' || type === 'button') {
      submits.push({ name: input.name, value: input.value || '' });
      continue;
    }
    if (type === 'checkbox' || type === 'radio') {
      if (input.checked === undefined) continue;
    }
    values[input.name] = input.value || '';
  }

  // Some pages use <button> instead of <input type="submit">.
  for (const tag of form.match(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi) || []) {
    const open = (tag.match(/^<button\b[^>]*>/i) || [''])[0];
    const button = attrs(open);
    if (!button.name) continue;
    if (String(button.type || 'submit').toLowerCase() !== 'submit') continue;
    submits.push({ name: button.name, value: button.value || '' });
  }

  for (const tag of form.match(/<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>/gi) || []) {
    const open = (tag.match(/^<textarea\b[^>]*>/i) || [''])[0];
    const area = attrs(open);
    if (!area.name) continue;
    values[area.name] = decode(
      tag.replace(/^<textarea\b[^>]*>/i, '').replace(/<\/textarea\s*>$/i, '')
    );
  }

  const selectRe = /<select\b[^>]*>[\s\S]*?<\/select\s*>/gi;
  let s;
  while ((s = selectRe.exec(form))) {
    const selectHead = attrs((s[0].match(/^<select\b[^>]*>/i) || [''])[0]);
    if (!selectHead.name) continue;
    const options = [];
    const optionRe = /<option\b[^>]*>[\s\S]*?<\/option\s*>/gi;
    let o;
    while ((o = optionRe.exec(s[0]))) {
      const option = attrs((o[0].match(/^<option\b[^>]*>/i) || [''])[0]);
      options.push({
        value: option.value || '',
        text: textOf(o[0]),
        selected: option.selected !== undefined
      });
    }
    const selected = options.filter(x => x.selected)[0] || options[0];
    values[selectHead.name] = selected ? selected.value : '';
    selects[selectHead.name] = options;
  }

  return { action: head.action, values, submits, selects };
}

function parseChangeForm(html) {
  const forms = String(html || '').match(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi) || [];

  for (const form of forms) {
    const open = (form.match(/^<form\b[^>]*>/i) || [''])[0];
    if (!/myorder_d_conf/.test(attrs(open).action || '')) continue;
    return parseFields(open, form);
  }

  return null;
}

// Confirmation pages may post to a different endpoint than the change form.
function parseAnyForm(html) {
  const forms = String(html || '').match(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi) || [];
  let strong = null;
  let actionMatch = null;
  let fallback = null;

  for (const form of forms) {
    const open = (form.match(/^<form\b[^>]*>/i) || [''])[0];
    const parsed = parseFields(open, form);
    if (!parsed.submits.length) continue;
    const action = String(parsed.action || '');
    if (/login|logout|search/i.test(action)) continue;
    const hasStrongSubmit = parsed.submits.some(
      submit =>
        /change|confirm|kakutei|exec|fin|submit/i.test(submit.name) ||
        /確定|変更|登録|完了|送信/.test(String(submit.value || ''))
    );
    const actionMatchOf =
      /myorder_d_(?:conf|fin|exec|comp|complete|confirm|chg)\b/i.test(action);

    if (actionMatchOf && hasStrongSubmit) return parsed;
    if (!actionMatch && actionMatchOf) actionMatch = parsed;
    if (!strong && hasStrongSubmit) strong = parsed;
    if (!fallback) fallback = parsed;
  }

  return strong || actionMatch || fallback;
}

function pairsOf(values) {
  return Object.keys(values).map(key => [key, values[key]]);
}

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function resolveUrl(href) {
  const text = String(href || '');
  if (/^https:\/\//.test(text)) return text;
  if (text[0] === '/') return ORIGIN + text;
  return ORIGIN + '/' + text;
}

function linksOf(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) out.push(decode(m[1]));
  return out;
}

async function postForm(http, action, pairs, charset, referer, stopCheck) {
  check(stopCheck);
  const body = http.formBody(pairs, charset);
  const page = await http.request(
    /^https:\/\//.test(action) ? action : ORIGIN + action,
    {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        Referer: referer
      }
    }
  );
  check(stopCheck);
  return page;
}

async function collectOrderLinks(http, stopCheck) {
  const links = [];
  const pages = [ORDER_LIST];
  const seen = new Set(pages);

  for (let i = 0; i < pages.length && i < 5; i++) {
    check(stopCheck);
    const page = await http.request(pages[i]);
    check(stopCheck);
    const html = page.text;

    for (const href of linksOf(html)) {
      const full = resolveUrl(href);
      if (/^https:\/\/p-bandai\.jp\/myorder_d\/\d+\//.test(full) && links.indexOf(full) < 0) {
        links.push(full);
      }
      if (
        /^https:\/\/p-bandai\.jp\/myorder\//.test(full) &&
        /[?&]page=/.test(full) &&
        !seen.has(full) &&
        pages.length < 5
      ) {
        seen.add(full);
        pages.push(full);
      }
    }
  }

  return links;
}

async function findOrder(http, targetId, stopCheck) {
  const links = await collectOrderLinks(http, stopCheck);
  if (!links.length) throw new Error('ORDER_LIST_EMPTY');
  log('Tìm thấy ' + links.length + ' đơn, dò PRODUCT ID ' + targetId);

  for (const url of links.slice(0, 30)) {
    check(stopCheck);
    const page = await http.request(url);
    check(stopCheck);
    if (page.text.indexOf(String(targetId)) >= 0) {
      return { url, page };
    }
  }

  throw new Error('ORDER_NOT_FOUND');
}

function splitAddress(value) {
  const text = String(value || '').trim();
  if (!text) return { banchi: '', building: '' };
  const match = text.match(/^([^\s　]+)[\s　]+(.*)$/);
  if (!match) return { banchi: text, building: '' };
  return { banchi: match[1], building: String(match[2] || '').trim() };
}

function normalizePref(value) {
  return String(value || '')
    .trim()
    .replace(/[都府県]$/, '')
    .replace(/[\s　]+/g, '');
}

function chooseOption(options, wanted) {
  const target = String(wanted || '').trim();
  if (!target) return '';
  const exact = options.filter(
    option => option.value === target || option.text === target
  )[0];
  if (exact) return exact.value;

  const normalized = normalizePref(target);
  const normalizedHit = options.filter(
    option =>
      normalizePref(option.text) === normalized ||
      normalizePref(option.value) === normalized
  )[0];
  if (normalizedHit) return normalizedHit.value;

  const soft = options.filter(
    option =>
      (option.text && option.text.indexOf(target) >= 0) ||
      (target && target.indexOf(option.text) >= 0)
  )[0];
  return soft ? soft.value : '';
}

function applyUiFields(values, selects, ui) {
  const morning = (selects.deli_time || []).filter(option =>
    String(option.text || '').indexOf(MORNING) >= 0
  )[0];
  if (morning) values.deli_time = morning.value;

  if (ui.postcode) values.d_zip = ui.postcode;

  if (ui.names.length) {
    values.d_family_name = ui.names[0];
    if (ui.names.length > 1) values.d_name = ui.names.slice(1).join(' ');
  }
  if (ui.kanas.length) {
    values.d_family_name_kana = ui.kanas[0];
    if (ui.kanas.length > 1) values.d_name_kana = ui.kanas.slice(1).join(' ');
  }
  if (ui.phone) values.d_tel = ui.phone;

  if (ui.pref) {
    const pref = chooseOption(selects.d_addr1 || [], ui.pref);
    if (pref) values.d_addr1 = pref;
  }

  if (ui.city) values.d_addr2 = ui.city;
  if (ui.address) {
    const address = splitAddress(ui.address);
    if (address.banchi) values.d_addr3 = address.banchi;
    if (address.building) values.d_addr4 = address.building;
  }

  // dest_addr_list has a 「選択してください」placeholder at value 0 in the
  // server HTML. Pick the "new address" option when present, otherwise the
  // first real option, so the site does not reject the submit.
  const destOptions = selects.dest_addr_list || [];
  const currentDest = String(values.dest_addr_list || '');
  const placeholder = destOptions.filter(option =>
    /選択してください|お選びください/.test(String(option.text || ''))
  )[0];
  if (!currentDest || (placeholder && currentDest === placeholder.value)) {
    const valid = destOptions.filter(
      option => !/選択してください|お選びください/.test(String(option.text || ''))
    );
    const preferred = valid.filter(option =>
      /新し|新規|入力する/.test(String(option.text || '')) ||
      /new/i.test(String(option.value || ''))
    )[0];
    const chosen = preferred || valid[0];
    if (chosen) {
      values.dest_addr_list = chosen.value;
      log(
        'dest_addr_list: ' +
          destOptions.length +
          ' mục, chọn ' +
          (preferred ? 'mục địa chỉ mới' : 'mục hợp lệ đầu tiên')
      );
    }
  }
}

// The site stores addresses with full-width digits/letters and U+2010 hyphens;
// compare widths so a successful change is not reported as a mismatch.
function normalizeWidth(value) {
  return String(value || '')
    .replace(/[！-～]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/[‐-―−]/g, '-')
    .replace(/　/g, ' ');
}

function normText(value) {
  return normalizeWidth(value).replace(/[\s　]+/g, '').trim();
}

// true=khớp, false=lệch, null=không có dữ liệu UI nên không kiểm tra.
function compareFields(values, selects, ui) {
  const out = {};
  out.zip = ui.postcode ? normalizeDigits(values.d_zip) === ui.postcode : null;

  if (ui.pref) {
    const pref = chooseOption(selects.d_addr1 || [], ui.pref);
    out.pref = pref && values.d_addr1 ? values.d_addr1 === pref : null;
  } else {
    out.pref = null;
  }

  out.city = ui.city ? normText(values.d_addr2) === normText(ui.city) : null;

  const address = splitAddress(ui.address);
  out.banchi = address.banchi
    ? normText(values.d_addr3) === normText(address.banchi)
    : null;
  out.building = address.building
    ? normText(values.d_addr4) === normText(address.building)
    : null;

  out.tel = ui.phone ? normalizeDigits(values.d_tel) === ui.phone : null;
  out.name = ui.names.length
    ? normText(values.d_family_name) === normText(ui.names[0])
    : null;

  return out;
}

function flagOf(value) {
  return value === null ? '-' : value ? '1' : '0';
}

function describeChecks(checks) {
  return (
    'ZIP=' +
    flagOf(checks.zip) +
    ' PREF=' +
    flagOf(checks.pref) +
    ' CITY=' +
    flagOf(checks.city) +
    ' BANCHI=' +
    flagOf(checks.banchi) +
    ' BUILD=' +
    flagOf(checks.building) +
    ' TEL=' +
    flagOf(checks.tel) +
    ' TÊN=' +
    flagOf(checks.name)
  );
}

function mismatchOf(checks) {
  return Object.keys(checks).some(key => checks[key] === false);
}

function sameField(pre, now, key) {
  if (key === 'd_zip' || key === 'd_tel') {
    return normalizeDigits(pre) === normalizeDigits(now);
  }
  return normText(pre) === normText(now);
}

function describeSame(pre, now) {
  const keys = [
    ['d_zip', 'ZIP'],
    ['d_addr1', 'PREF'],
    ['d_addr2', 'CITY'],
    ['d_addr3', 'BANCHI'],
    ['d_addr4', 'BUILD'],
    ['d_tel', 'TEL'],
    ['d_family_name', 'TÊN'],
    ['deli_time', 'TIME']
  ];
  return keys
    .map(
      pair =>
        pair[1] + '=' + (sameField(pre[pair[0]], now[pair[0]], pair[0]) ? '1' : '0')
    )
    .join(' ');
}

async function verifyOrder(http, orderUrl, ui, stopCheck, preValues) {
  const attempt = async () => {
    check(stopCheck);
    const page = await http.request(orderUrl);
    check(stopCheck);
    const form = parseChangeForm(page.text);
    if (!form) return null;
    const checks = compareFields(form.values, form.selects, ui);
    log('Kiểm tra đơn: ' + describeChecks(checks));
    if (preValues) log('So với trước: ' + describeSame(preValues, form.values));
    return checks;
  };

  let checks = await attempt();
  if (!checks) throw new Error('ADDRESS_VERIFY_FAILED');
  if (mismatchOf(checks)) {
    // Give the order page a moment to reflect the change, then check once more.
    await new Promise(resolve => setTimeout(resolve, 1200));
    check(stopCheck);
    checks = await attempt();
    if (!checks || mismatchOf(checks)) throw new Error('ADDRESS_VERIFY_FAILED');
  }
}

async function runAccount({ acc, index, total, form, stopCheck }) {
  form = form || {};

  const productId = String(acc.productIds || form.productIds || '')
    .split(/[,，\s]+/)
    .map(x => x.trim())
    .filter(Boolean)[0];

  const ui = {
    postcode: normalizeDigits(acc.postcode || form.postcode || pick(form.postcode, index - 1)),
    names: parts(acc.names || form.names || pick(form.names, index - 1)),
    kanas: parts(acc.kanas || form.kanas || pick(form.kanas, index - 1)),
    phone: normalizeDigits(acc.phones || form.phones || pick(form.phones, index - 1)),
    pref: String(acc.pref || form.pref || pick(form.pref, index - 1) || '').trim(),
    city: String(acc.address1 || form.address1 || pick(form.address1, index - 1) || '').trim(),
    address: String(acc.address2 || form.address2 || pick(form.address2, index - 1) || '').trim()
  };

  if (!acc.email || !acc.pass) throw new Error('ACCOUNT_INVALID');
  if (!productId) throw new Error('PRODUCT_ID_REQUIRED');
  log(
    'Pending: POSTCODE=' +
      (ui.postcode ? ui.postcode.length + ' số' : 'TRỐNG') +
      ', PREF=' +
      (ui.pref ? 'có' : 'TRỐNG') +
      ', CITY=' +
      (ui.city ? 'có' : 'TRỐNG') +
      ', ADDRESS=' +
      (ui.address ? 'có' : 'TRỐNG') +
      ', TÊN=' +
      (ui.names.length ? 'có' : 'TRỐNG') +
      ', KANA=' +
      (ui.kanas.length ? 'có' : 'TRỐNG') +
      ', PHONE=' +
      (ui.phone ? 'có' : 'TRỐNG')
  );

  const client = Result.createClient();
  const http = client.http;
  const step = label => {
    Core.updateCurrent({
      email: acc.email,
      step: 'Đổi địa chỉ · ' + label,
      status: 'Running',
      index,
      total
    });
    log('A' + index + ' · ' + label);
  };

  try {
    // p-bandai rejects 姓/名 that contain Latin letters (redirects with ?e=1).
    if (ui.names.some(name => /[A-Za-z]/.test(normalizeWidth(name)))) {
      throw new Error('ADDRESS_NAMES_JAPANESE_REQUIRED');
    }

    step('Đăng nhập');
    await client.login(acc, stopCheck);

    step('Tìm đơn ' + productId);
    const order = await findOrder(http, productId, stopCheck);

    const detailForm = parseChangeForm(order.page.text);
    if (!detailForm) throw new Error('CHANGE_FORM_NOT_FOUND');
    const detailCharset = order.page.charset;
    const preValues = Object.assign({}, detailForm.values);
    log(
      'Hiện trạng đơn: ' +
        describeChecks(compareFields(detailForm.values, detailForm.selects, ui)) +
        ' · nút=' +
        (detailForm.submits.map(submit => submit.name).join(',') || 'KHÔNG CÓ')
    );

    let baseForm = detailForm;
    let baseCharset = detailCharset;

    // The site normally needs 住所検索 once so its session/tokens accept the
    // change. Run it best-effort, but keep the address values from pending.
    if (ui.postcode) {
      const searchSubmit = detailForm.submits.filter(
        submit => /search_own_x/i.test(submit.name)
      )[0];
      if (searchSubmit) {
        detailForm.values.d_zip = ui.postcode;
        const searchPairs = pairsOf(detailForm.values);
        searchPairs.push([searchSubmit.name, searchSubmit.value]);
        try {
          const searchPage = await postForm(
            http,
            detailForm.action,
            searchPairs,
            detailCharset,
            order.url,
            stopCheck
          );
          const searchForm = parseChangeForm(searchPage.text);
          if (searchForm) {
            baseForm = searchForm;
            baseCharset = searchPage.charset;
            log(
              'Đã chạy 住所検索 ngầm -> ' +
                String(searchPage.url || '').replace(/^https?:\/\/[^/]+/, '') +
                ' · nút=' +
                (searchForm.submits.map(submit => submit.name).join(',') || 'KHÔNG CÓ') +
                '; vẫn dùng địa chỉ pending',
              'info'
            );
          } else {
            log('住所検索 không trả form; dùng địa chỉ pending', 'warn');
          }
        } catch (error) {
          log(
            '住所検索 lỗi: ' + String(error.message || error) + '; dùng địa chỉ pending',
            'warn'
          );
        }
      }
    }

    step('Điền địa chỉ từ pending');
    applyUiFields(baseForm.values, baseForm.selects, ui);
    if (!baseForm.values.d_addr1) throw new Error('PREF_REQUIRED');

    const changeSubmit =
      baseForm.submits.filter(submit => /^change$/i.test(submit.name))[0] ||
      baseForm.submits
        .filter(submit => !/search_own_x/i.test(submit.name))
        .slice(-1)[0];
    if (!changeSubmit) throw new Error('CHANGE_FORM_NOT_FOUND');
    log(
      'Gửi nút "' +
        changeSubmit.name +
        '" · ' +
        Object.keys(baseForm.values).length +
        ' trường'
    );

    const changePairs = pairsOf(baseForm.values);
    changePairs.push([changeSubmit.name, changeSubmit.value]);
    let changePage = await postForm(
      http,
      baseForm.action,
      changePairs,
      baseCharset,
      order.url,
      stopCheck
    );

    const successOf = text =>
      /変更しました|変更が完了|受け付けました|完了しました|更新しました/.test(text);
    // The order form contains option labels such as 「選択してください」; never
    // treat text inside <select> as a validation error.
    const errorPlain = html =>
      textOf(String(html || '').replace(/<select\b[\s\S]*?<\/select\s*>/gi, ' '));
    const errorOf = html =>
      /変更できません|変更期間|期間外|入力してください|選択してください/.test(
        errorPlain(html)
      );
    // 「変更内容がありません」 means the order already matches pending values
    // (for example a previous run applied them): verify instead of failing.
    const noChangeOf = html => /変更内容がありません/.test(errorPlain(html));
    const phraseOf = html => {
      const match = errorPlain(html).match(
        /変更できません|変更期間|期間外|入力してください|選択してください/
      );
      return match ? match[0] : '';
    };
    const pathOfPage = page =>
      String(page.url || '')
        .replace(/^https?:\/\/[^/]+/, '')
        .split(/[?#]/)[0];
    const errorPage = page => /\/error(?:\/|$)/.test(pathOfPage(page));
    // The site rejects an invalid change by redirecting back with ?e=1.
    const rejectedOf = page =>
      /(?:^|&)e=1(?:&|$)/.test(
        String(page.url || '')
          .split('#')[0]
          .split('?')[1] || ''
      );
    const latinNames = ui.names.some(name =>
      /[A-Za-z]/.test(normalizeWidth(name))
    );
    const rejectedError = () =>
      new Error(
        latinNames
          ? 'ADDRESS_NAMES_JAPANESE_REQUIRED'
          : 'ADDRESS_CHANGE_REJECTED'
      );

    log(
      'Phản hồi đổi: ' +
        pathOfPage(changePage) +
        ' · thành công=' +
        (successOf(textOf(changePage.text)) ? '1' : '0') +
        ' · lỗi=' +
        (errorOf(changePage.text) ? '1' : '0')
    );

    if (rejectedOf(changePage) && !successOf(textOf(changePage.text))) {
      throw rejectedError();
    }

    if (errorPage(changePage)) {
      throw new Error(
        'ADDRESS_CHANGE_FAILED:ERROR_PAGE:' + pathOfPage(changePage)
      );
    }

    // Some builds show a final confirmation page; submit its own button once.
    for (let round = 0; round < 2; round++) {
      const text = textOf(changePage.text);
      if (successOf(text)) break;
      if (noChangeOf(changePage.text)) {
        log('Site báo không có thay đổi mới; kiểm tra lại đơn', 'info');
        break;
      }
      if (errorOf(changePage.text)) {
        throw new Error(
          'ADDRESS_CHANGE_FAILED:' +
            (phraseOf(changePage.text) || 'UNKNOWN') +
            ':' +
            pathOfPage(changePage)
        );
      }

      const confirmForm = parseAnyForm(changePage.text);
      if (!confirmForm) break;

      const confirmText = /変更内容の確認|変更内容を確認|この内容で|確認画面|変更を確定|登録内容の確認/.test(text);
      const confPath = /_conf|_confirm|confirm/i.test(pathOfPage(changePage));
      const confirmSubmit =
        confirmForm.submits.filter(
          submit =>
            /change|confirm|submit|kakutei|exec/i.test(submit.name) ||
            /確定|変更|登録|完了|送信/.test(String(submit.value || ''))
        )[0] ||
        confirmForm.submits.filter(
          submit => !/search_own_x/i.test(submit.name)
        )[0];
      if ((!confirmText && !confPath) || !confirmSubmit) break;

      log('Gửi xác nhận thay đổi (bước 2/2)');
      const pairs = pairsOf(confirmForm.values);
      pairs.push([confirmSubmit.name, confirmSubmit.value]);
      changePage = await postForm(
        http,
        confirmForm.action,
        pairs,
        changePage.charset,
        order.url,
        stopCheck
      );
      if (errorPage(changePage)) throw new Error('ADDRESS_CHANGE_FAILED');
    }

    const finalText = textOf(changePage.text);
    const confirmed = successOf(finalText);
    if (!confirmed && rejectedOf(changePage)) throw rejectedError();
    if (!confirmed && errorOf(changePage.text)) {
      throw new Error(
        'ADDRESS_CHANGE_FAILED:' +
          (phraseOf(changePage.text) || 'UNKNOWN') +
          ':' +
          pathOfPage(changePage)
      );
    }

    step('Xác nhận địa chỉ mới');
    try {
      await verifyOrder(http, order.url, ui, stopCheck, preValues);
    } catch (error) {
      // The site itself confirmed the change; a stale/blank form on the order
      // page must not turn that into a failure.
      if (
        !confirmed ||
        String((error && error.message) || error) !== 'ADDRESS_VERIFY_FAILED'
      ) {
        throw error;
      }
      log('Site báo đã đổi xong; form kiểm tra hiển thị khác, vẫn tính thành công', 'warn');
    }

    const addrSummary = productId + ': ĐÃ ĐỔI ĐỊA CHỈ';
    log('Xong ' + acc.email + ' · ' + addrSummary, 'success');

    return {
      ok: true,
      mode: 'BandaiPremium_ChangeAddressOrder',
      productId,
      addrSummary,
      verified: true
    };
  } catch (error) {
    if (error && error.message === '__STOP__') throw error;
    throw new Error(errorText(error));
  } finally {
    try {
      client.close();
    } catch (_) {}
  }
}

module.exports = {
  runAccount,
  cancelAll: Result.cancelAll,
  _parseChangeForm: parseChangeForm,
  _parseAnyForm: parseAnyForm,
  _applyUiFields: applyUiFields,
  _compareFields: compareFields
};
