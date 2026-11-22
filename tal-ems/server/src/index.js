require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { db, HttpError, authenticate } = require('./core');
const { refreshStatuses } = require('./metrics');

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"] } },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// CSRF defence in depth: cookies are SameSite=Strict, and every state-changing API call
// must also carry a custom header that cross-site forms cannot set.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'tal-ems') return next(new HttpError(403, 'طلب غير موثوق'));
  next();
});

app.get('/api/health', async (req, res) => { await db.raw('select 1'); res.json({ ok: true }); });
app.use('/api/auth', require('./routes/auth').router);
app.use('/api', authenticate);
app.use('/api', require('./routes/resources').router);
app.use('/api', require('./routes/dashboard'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/app'));
app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

// Serve the built frontend in production
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '7d', setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') err = new HttpError(413, 'حجم الملف أكبر من المسموح');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'حدث خطأ في الخادم' : err.message, ...(err.extra || {}) });
});

const port = Number(process.env.PORT || 4000);
if (require.main === module) {
  app.listen(port, () => console.log(`TAL EMS API on :${port}`));
  refreshStatuses().catch(console.error);
  setInterval(() => refreshStatuses().catch(console.error), 60 * 60 * 1000);
}
module.exports = app;
