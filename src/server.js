const path = require('path');
const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');

const config = require('./config');
const passwordRoutes = require('./routes/password');

const app = express();
app.set('trust proxy', 1); // correct client IPs behind Render/Hostinger proxies

const auth0Origin = `https://${config.auth0.domain}`;
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.auth0.com', 'https://challenges.cloudflare.com'],
        frameSrc: ['https://challenges.cloudflare.com', auth0Origin],
        connectSrc: ["'self'", auth0Origin],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);
app.use(express.json({ limit: '10kb' }));

// Public settings for the browser (no secrets here).
app.get('/config.js', (req, res) => {
  const publicConfig = {
    auth0Domain: config.auth0.domain,
    auth0ClientId: config.auth0.spaClientId,
    turnstileSiteKey: config.turnstile.siteKey,
  };
  res.type('application/javascript').send(`window.SHIELDNEX_CONFIG = ${JSON.stringify(publicConfig)};`);
});

app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'db_unavailable' });
});

app.use('/api/password', passwordRoutes);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

mongoose
  .connect(config.mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err.message));

app.listen(config.port, () => {
  console.log(`ShieldNex running on ${config.appUrl} (port ${config.port})`);
});
