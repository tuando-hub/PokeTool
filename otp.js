// ================= OTP SERVICE =================

function getOtpDirect(imapEmail, imapPass, targetMail, mode) {
  return new Promise(resolve => {
    const eventId =
      "OTP_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

    console.log("🚀 [OTP] START:", targetMail);

    let finished = false;
    let timer = null;
    let retrying = false;

    function done(value) {
      if (finished) return;

      finished = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      resolve(value || null);
    }

    function runOtp() {
      if (finished) return;

      console.log("🔄 [OTP] CONNECT:", targetMail);

      $nodejs.run({
        name: "PokeTool/node/getotp",
        argv: [imapEmail, imapPass, targetMail, eventId, mode]
      });
    }

    function retryOtp() {
      if (finished || retrying) {
        return;
      }

      retrying = true;

      console.log("🔄 [OTP] RECONNECT IN 2s:", targetMail);

      setTimeout(() => {
        retrying = false;

        if (finished) return;

        runOtp();
      }, 2000);
    }

    $nodejs.listen(eventId, res => {
      if (!res) {
        return;
      }

      if (res.error) {
        console.log("❌ OTP NODE ERROR:", res.error);

        retryOtp();
        return;
      }

      if (typeof res === "string") {
        done(res);
        return;
      }

      if (
        res.value !== undefined &&
        res.value !== null &&
        String(res.value).trim()
      ) {
        done(res.value);
        return;
      }

      console.log("📡 OTP UNKNOWN RESPONSE:", JSON.stringify(res));

      retryOtp();
    });

    // chạy lần đầu
    runOtp();

    // timeout tổng vẫn là 5 phút
    timer = setTimeout(() => {
      console.log("⏱ OTP TIMEOUT:", targetMail);

      done(null);
    }, 185000);
  });
}

// ======================================================
// JUMPCS CONBINI PAYMENT CODE
// ======================================================

function getJumpConbiniPayment(imapEmail, imapPass, targetMail, orderId) {
  return new Promise(resolve => {
    const eventId =
      "JUMP_CONBINI_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 8);

    console.log("🚀 [JUMP CONBINI] START:", targetMail, orderId);

    let finished = false;

    let timer = null;

    function done(value) {
      if (finished) {
        return;
      }

      finished = true;

      if (timer) {
        clearTimeout(timer);

        timer = null;
      }

      const paymentCode = String(value || "")
        .replace(/\D/g, "")
        .trim();

      resolve(paymentCode || null);
    }

    $nodejs.listen(eventId, res => {
      if (!res) {
        return;
      }

      if (res.error) {
        console.log("❌ JUMP CONBINI NODE ERROR:", res.error);

        done(null);
        return;
      }

      if (typeof res === "string") {
        done(res);
        return;
      }

      if (res.value !== undefined) {
        done(res.value);

        return;
      }

      console.log("📡 JUMP CONBINI UNKNOWN RESPONSE:", JSON.stringify(res));
    });

    $nodejs.run({
      name: "PokeTool/node/getotp",

      argv: [imapEmail, imapPass, targetMail, eventId, "JumpConbini", orderId]
    });

    timer = setTimeout(() => {
      console.log("⏱ JUMP CONBINI TIMEOUT:", targetMail, orderId);

      done(null);
    }, 300000);
  });
}

// This request has its own event and deadline. Cancel stops local delivery;
// the existing getotp worker also closes itself at the supplied deadline.
function start3dsEmail(imapEmail, imapPass, referenceCode, since, deadline, onStatus) {
  const eventId = 'THREEDS_EMAIL_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
  let finished = false;
  let timer;
  let retryTimer;
  let attempts = 0;
  let finish;
  const promise = new Promise((resolve,reject) => {
    finish = (error,result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      if (error) reject(error); else resolve(result);
    };
    $nodejs.listen(eventId,result => {
      if (finished || !result) return;
      if (result.error) {
        if (result.retryable === true && attempts < 3 && deadline-Date.now() > 2500) {
          if (retryTimer) return;
          if (typeof onStatus === 'function') onStatus('3DS Email · Kết nối tạm lỗi, thử lại '+(attempts+1)+'/3 · '+String(result.error));
          retryTimer = setTimeout(() => { retryTimer=null; run(); },1500);
          return;
        }
        return finish(new Error(String(result.error)));
      }
      if (String(result.referenceCode || '') !== referenceCode || !/^\d{4,8}$/.test(String(result.value || ''))) {
        return finish(new Error('THREEDS_EMAIL_INVALID_RESULT'));
      }
      finish(null,String(result.value));
    });
    timer = setTimeout(() => finish(new Error('THREEDS_EMAIL_TIMEOUT')),Math.max(1,deadline-Date.now()));
    function run() {
      if (finished) return;
      attempts++;
      try {
        $nodejs.run({name:'PokeTool/node/getotp',argv:[imapEmail,imapPass,imapEmail,eventId,'ThreeDsEmail',
          JSON.stringify({referenceCode,since,deadline})]});
      } catch (_) { finish(new Error('THREEDS_EMAIL_START_FAILED')); }
    }
    run();
  });
  return {promise,cancel() { finish(null,null); }};
}

module.exports = {
  start3dsEmail,
  getOtpDirect,
  getJumpConbiniPayment
};
