// Minimal Auth0 Management API client (uses the "ShieldNex API" M2M app).
const { auth0 } = require('./config');

const baseUrl = `https://${auth0.domain}`;
let cachedToken = { value: null, expiresAt: 0 };

async function getManagementToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }
  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: auth0.m2mClientId,
      client_secret: auth0.m2mClientSecret,
      audience: `${baseUrl}/api/v2/`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Auth0 token request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function managementApi(path, options = {}) {
  const token = await getManagementToken();
  const res = await fetch(`${baseUrl}/api/v2${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.message || `Auth0 Management API error (${res.status})`);
    err.status = res.status;
    err.auth0 = body;
    throw err;
  }
  return body;
}

// Only consider users from our username/password database connection.
const inOurConnection = (user) =>
  (user.identities || []).some((identity) => identity.connection === auth0.connection);

async function findUserByEmail(email) {
  const users = await managementApi(`/users-by-email?email=${encodeURIComponent(email)}`);
  return users.find(inOurConnection) || null;
}

async function findUserByPhone(phone) {
  // phone is pre-validated as +<digits>, so it is safe inside the query string.
  const q = `phone_number:"${phone}" OR user_metadata.phone:"${phone}"`;
  const users = await managementApi(
    `/users?q=${encodeURIComponent(q)}&search_engine=v3&per_page=5`
  );
  return users.find(inOurConnection) || null;
}

async function updatePassword(userId, password) {
  return managementApi(`/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ password, connection: auth0.connection }),
  });
}

module.exports = { findUserByEmail, findUserByPhone, updatePassword };
