const Core = require('../core');
const Result = require('../services/premium_result');

const STATUS_VN = {
  WON: 'TRÚNG',
  LOST: 'TRƯỢT',
  PENDING: 'CHỜ KẾT QUẢ',
  CANCELLED: 'ĐÃ HỦY',
  NOT_FOUND: 'KHÔNG THẤY',
  UNKNOWN: 'KHÔNG RÕ',
  MIXED: 'NHIỀU KẾT QUẢ'
};

const ERROR_VN = {
  PREMIUM_RESULT_LOGIN_REJECTED: 'Sai email hoặc mật khẩu Bandai Namco ID',
  PREMIUM_RESULT_LOGIN_REQUIRED: 'Chưa đăng nhập được p-bandai',
  PREMIUM_RESULT_LOGIN_INIT_FAILED: 'Không khởi tạo được phiên đăng nhập',
  PREMIUM_RESULT_LOGIN_PASSKEY_REQUIRED: 'Tài khoản yêu cầu passkey, không thể bỏ qua',
  PREMIUM_RESULT_LOGIN_NOT_CONFIRMED: 'Đăng nhập chưa được xác nhận',
  PREMIUM_RESULT_LOGIN_FORM_UNEXPECTED: 'Trang đăng nhập Premium không đúng',
  PREMIUM_RESULT_LOGIN_ACTION_UNEXPECTED: 'Form đăng nhập Premium không đúng',
  PREMIUM_RESULT_ACCOUNT_INVALID: 'Thiếu email hoặc mật khẩu',
  PREMIUM_RESULT_PRODUCT_ID_INVALID: 'PRODUCT ID không hợp lệ',
  PREMIUM_RESULT_PAGINATION_INCOMPLETE: 'Không đọc hết các trang lịch sử',
  PREMIUM_RESULT_PAGE_UNEXPECTED: 'Trang lottery history không đúng',
  PREMIUM_RESULT_EMPTY_PAGE_UNCONFIRMED: 'Không xác nhận được lịch sử trống',
  PREMIUM_RESULT_SERVER_ERROR: 'p-bandai báo lỗi máy chủ',
  PREMIUM_RESULT_NETWORK_RESULT_UNKNOWN: 'Lỗi mạng khi gọi p-bandai',
  PREMIUM_RESULT_HTTP_TIMEOUT: 'Hết thời gian chờ p-bandai',
  PREMIUM_RESULT_URL_UNEXPECTED: 'URL không mong đợi',
  PREMIUM_RESULT_NATIVE_RESPONSE_INVALID: 'Phản hồi p-bandai không hợp lệ',
  PREMIUM_RESULT_NATIVE_HTTP_UNAVAILABLE: 'Máy không hỗ trợ HTTP native',
  PREMIUM_RESULT_NATIVE_REQUEST_FAILED: 'Không tạo được request p-bandai',
  PREMIUM_RESULT_ENCODING_FAILED: 'Lỗi mã hóa form',
  PREMIUM_RESULT_HTTP_UNEXPECTED: 'Phản hồi HTTP không hợp lệ',
  PREMIUM_RESULT_LOGIN_ALREADY_ATTEMPTED: 'Phiên này đã thử đăng nhập'
};

function statusText(status) {
  return STATUS_VN[status] || status || 'KHÔNG RÕ';
}

function errorText(error) {
  const code = String((error && error.message) || error || '');

  if (code === '__STOP__') return code;
  if (ERROR_VN[code]) return ERROR_VN[code];
  if (code.indexOf('PAGE_FAIL_') === 0) return 'Không mở được trang đăng nhập Bandai Namco ID';
  if (code.indexOf('PAGE_QUERY_') === 0) return 'Trang đăng nhập thiếu tham số';
  if (code.indexOf('PREMIUM_RESULT_LOGIN_PAGE_FAILED') === 0) return 'Không mở được trang đăng nhập Bandai Namco ID';

  return 'Lỗi Check Result: ' + code;
}

async function runAccount({ acc, index, total, form, stopCheck }) {
  form = form || {};

  const ids = Result.productIds(acc.productIds || form.productIds);

  if (!acc.email || !acc.pass) throw new Error('Thiếu email hoặc mật khẩu');

  const check = () => {
    if (stopCheck) stopCheck();
  };

  check();

  const client = Result.createClient();
  const step = label => {
    Core.updateCurrent({
      email: acc.email,
      step: 'Check Result · ' + label,
      status: 'Running'
    });
    Core.addLog('[Check Result A' + index + '] ' + label, 'info');
  };

  try {
    step('Đăng nhập native');
    await client.login(acc, check);

    step('Đọc lịch sử lottery');
    const raw = await client.readResults(ids.join(','), check);
    check();

    const results = raw.map(item => Object.assign({}, item, {
      statusLabel: statusText(item.status),
      entries: (item.entries || []).map(entry =>
        Object.assign({}, entry, { statusLabel: statusText(entry.status) })
      )
    }));

    const checkResultSummary = results
      .map(item => item.productId + ':' + item.statusLabel)
      .join('; ');

    Core.addLog('[Check Result A' + index + '] ' + checkResultSummary, 'success');

    return {
      ok: true,
      mode: 'BandaiPremium_CheckResult',
      verified: true,
      results,
      checkResultSummary
    };
  } catch (error) {
    if (error && error.message === '__STOP__') throw error;
    throw new Error(errorText(error));
  } finally {
    client.close();
  }
}

module.exports = { runAccount, cancelAll: Result.cancelAll };
