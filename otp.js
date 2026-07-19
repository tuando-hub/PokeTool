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

// ======================================================
// JUMPCS CONBINI PAYMENT CODE
// ======================================================

function getJumpConbiniPayment(
  imapEmail,
  imapPass,
  targetMail,
  orderId
) {
  return new Promise(
    resolve => {
      const eventId =
        "JUMP_CONBINI_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8);

      console.log(
        "🚀 [JUMP CONBINI] START:",
        targetMail,
        orderId
      );

      let finished =
        false;

      let timer =
        null;

      function done(value) {
        if (finished) {
          return;
        }

        finished = true;

        if (timer) {
          clearTimeout(
            timer
          );

          timer = null;
        }

        const paymentCode =
          String(
            value || ""
          )
            .replace(
              /\D/g,
              ""
            )
            .trim();

        resolve(
          paymentCode ||
          null
        );
      }

      $nodejs.listen(
        eventId,
        res => {
          if (!res) {
            return;
          }

          if (res.error) {
            console.log(
              "❌ JUMP CONBINI NODE ERROR:",
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

          if (
            res.value !==
            undefined
          ) {
            done(
              res.value
            );

            return;
          }

          console.log(
            "📡 JUMP CONBINI UNKNOWN RESPONSE:",
            JSON.stringify(
              res
            )
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
          "JumpConbini",
          orderId
        ]
      });

      timer =
        setTimeout(() => {
          console.log(
            "⏱ JUMP CONBINI TIMEOUT:",
            targetMail,
            orderId
          );

          done(null);
        }, 300000);
    }
  );
}

module.exports = {
  getOtpDirect,
  getJumpConbiniPayment
};