(async function () {
  const cfg = window.SHIELDNEX_CONFIG;
  const $ = (id) => document.getElementById(id);

  function showMessage(text, type) {
    const el = $('msg');
    el.textContent = text;
    el.className = `msg show ${type}`;
  }

  let client;
  try {
    client = await auth0.createAuth0Client({
      domain: cfg.auth0Domain,
      clientId: cfg.auth0ClientId,
      authorizationParams: { redirect_uri: window.location.origin },
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
    });

    // Coming back from the Auth0 login page
    const params = new URLSearchParams(window.location.search);
    if (params.has('error')) {
      showMessage(params.get('error_description') || 'Login failed.', 'error');
      window.history.replaceState({}, document.title, '/');
    } else if (params.has('code') && params.has('state')) {
      await client.handleRedirectCallback();
      window.history.replaceState({}, document.title, '/');
    }

    // /?login=1 is used after a password reset to go straight to login
    if (params.get('login') === '1') {
      return client.loginWithRedirect();
    }
  } catch (err) {
    console.error(err);
    showMessage('Could not connect to the login service. Please refresh the page.', 'error');
  }

  const loggedIn = client ? await client.isAuthenticated() : false;
  $('loading').classList.add('hidden');

  if (loggedIn) {
    const user = await client.getUser();
    $('user-email').textContent = user.email || user.name;
    $('logged-in').classList.remove('hidden');
  } else {
    $('logged-out').classList.remove('hidden');
  }

  $('btn-login').addEventListener('click', () => client.loginWithRedirect());
  $('btn-signup').addEventListener('click', () =>
    client.loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })
  );
  $('btn-logout').addEventListener('click', () =>
    client.logout({ logoutParams: { returnTo: window.location.origin } })
  );
})();
