// ================= OTP SERVICE =================

function getOtpDirect(
  imapEmail,
  imapPass,
  targetMail,
  mode
) {
  return new Promise(resolve => {
    const eventId =
      "OTP_" + Date.now();

    console.log(
      "🚀 [OTP] START:",
      targetMail
    );

    let finished = false;

    function done(value) {
      if (finished) return;

      finished = true;
      resolve(value || null);
    }

    $nodejs.listen(
      eventId,
      res => {
        if (!res) return;

        if (res.error) {
          console.log(
            "❌ OTP NODE ERROR:",
            res.error
          );

          done(null);
          return;
        }

        if (
          typeof res ===
          "string"
        ) {
          done(res);
          return;
        }

        if (res.value) {
          done(res.value);
          return;
        }

        console.log(
          "📡 OTP UNKNOWN RESPONSE:",
          JSON.stringify(res)
        );
      }
    );

    $nodejs.run({
      name: "GETOtp",
      argv: [
        imapEmail,
        imapPass,
        targetMail,
        eventId,
        mode
      ]
    });

    setTimeout(() => {
      console.log(
        "⏱ OTP TIMEOUT:",
        targetMail
      );

      done(null);
    }, 300000);
  });
}

module.exports = {
  getOtpDirect
};