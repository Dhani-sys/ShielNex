(function () {
  const cfg = window.SHIELDNEX_CONFIG;
  const $ = (id) => document.getElementById(id);

  const state = { identifier: '', resetToken: '', captchaToken: '', widgetId: null };
  let expiryTimer = null;
  let resendTimer = null;

  // ---------- helpers ----------
  function showMessage(text, type = 'info') {
    const el = $('msg');
    el.textContent = text;
    el.className = `msg show ${type}`;
  }
  function clearMessage() {
    $('msg').className = 'msg';
  }
  function showStep(id) {
    ['step-identify', 'step-otp', 'step-reset', 'step-done'].forEach((s) =>
      $(s).classList.toggle('hidden', s !== id)
    );
  }
  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  function resetCaptcha() {
    state.captchaToken = '';
    if (window.turnstile && state.widgetId !== null) window.turnstile.reset(state.widgetId);
  }
  function formatTime(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  // ---------- CAPTCHA (Cloudflare Turnstile) ----------
  window.onTurnstileLoad = function () {
    state.widgetId = window.turnstile.render('#captcha', {
      sitekey: cfg.turnstileSiteKey,
      theme: 'dark',
      callback: (token) => { state.captchaToken = token; },
      'expired-callback': () => { state.captchaToken = ''; },
      'error-callback': () => { state.captchaToken = ''; },
    });
  };

  // ---------- timers ----------
  function startTimers(expiresIn, resendAfter) {
    clearInterval(expiryTimer);
    clearInterval(resendTimer);

    let left = expiresIn;
    $('otp-timer').textContent = formatTime(left);
    expiryTimer = setInterval(() => {
      left -= 1;
      $('otp-timer').textContent = formatTime(Math.max(left, 0));
      if (left <= 0) {
        clearInterval(expiryTimer);
        showMessage('The code has expired. Please request a new one.', 'error');
      }
    }, 1000);

    let wait = resendAfter;
    const btn = $('btn-resend');
    btn.disabled = true;
    btn.textContent = `Resend code (${wait}s)`;
    resendTimer = setInterval(() => {
      wait -= 1;
      if (wait <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = 'Resend code';
      } else {
        btn.textContent = `Resend code (${wait}s)`;
      }
    }, 1000);
  }

  // ---------- step 1: request code ----------
  async function requestCode() {
    if (!state.captchaToken) {
      showMessage('Please complete the CAPTCHA.', 'error');
      return false;
    }
    const data = await post('/api/password/forgot', {
      identifier: state.identifier,
      captchaToken: state.captchaToken,
    });
    resetCaptcha();
    $('otp-info').textContent = data.message;
    startTimers(data.expiresInSeconds, data.resendAfterSeconds);
    return true;
  }

  $('step-identify').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();
    state.identifier = $('identifier').value.trim();
    const btn = $('btn-send');
    btn.disabled = true;
    try {
      if (await requestCode()) {
        $('otp').value = '';
        showStep('step-otp');
        $('otp').focus();
      }
    } catch (err) {
      resetCaptcha();
      showMessage(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- step 2: verify code ----------
  // Resend: go back to step 1 (email/phone kept) so the user completes a fresh CAPTCHA.
  $('btn-resend').addEventListener('click', () => {
    clearInterval(expiryTimer);
    clearInterval(resendTimer);
    resetCaptcha();
    showStep('step-identify');
    showMessage('Complete the CAPTCHA and click "Send code" to get a new code.', 'info');
  });

  $('otp').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  $('step-otp').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();
    const otp = $('otp').value.trim();
    if (!/^\d{6}$/.test(otp)) return showMessage('Enter the 6-digit code.', 'error');

    const btn = $('btn-verify');
    btn.disabled = true;
    try {
      const data = await post('/api/password/verify', { identifier: state.identifier, otp });
      state.resetToken = data.resetToken;
      clearInterval(expiryTimer);
      clearInterval(resendTimer);
      showStep('step-reset');
      $('new-password').focus();
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- step 3: new password ----------
  $('step-reset').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();
    const pw = $('new-password').value;
    if (pw !== $('confirm-password').value) return showMessage('Passwords do not match.', 'error');
    if (pw.length < 8) return showMessage('Password must be at least 8 characters.', 'error');

    const btn = $('btn-reset');
    btn.disabled = true;
    try {
      await post('/api/password/reset', { resetToken: state.resetToken, newPassword: pw });
      showStep('step-done');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
