/**
 * Render(Web Service)용 서버: dist/ 정적 파일 + /api/contact 상담 폼 수신.
 * 환경변수: PORT(Render 자동), SITE_URL, RESEND_API_KEY, CONTACT_TO, CONTACT_FROM
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://chahyungjin.com').replace(/\/$/, '');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap-index.xml\n`);
});

app.post('/api/contact', async (req, res) => {
  const d = req.body || {};
  if (d.company) return res.json({ ok: true }); // 허니팟
  const name = String(d.name || '').trim();
  const phone = String(d.phone || '').trim();
  const message = String(d.message || '').trim();
  const area = String(d.area || '').trim();
  const source = String(d.source || '').trim();
  if (!name || !phone || !message || !d.agree) return res.status(400).json({ ok: false, error: 'missing fields' });
  if (message.length > 4000) return res.status(400).json({ ok: false, error: 'too long' });

  const text = [
    `[상담 신청] ${area || '분야 미선택'}`,
    `성함: ${name}`,
    `연락처: ${phone}`,
    `유입 경로: ${source}`,
    '',
    message,
    '',
    `접수: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    `IP: ${req.ip}`,
  ].join('\n');

  if (process.env.RESEND_API_KEY && process.env.CONTACT_TO) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM || 'onboarding@resend.dev',
          to: [process.env.CONTACT_TO],
          subject: `[홈페이지 상담] ${name} · ${area}`,
          text,
        }),
      });
      if (!r.ok) return res.status(502).json({ ok: false, error: 'mail failed' });
    } catch {
      return res.status(502).json({ ok: false, error: 'mail failed' });
    }
  } else {
    console.log('[contact] (no mail key)\n' + text);
  }
  res.json({ ok: true });
});

app.use(express.static(DIST, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(webp|png|jpg|jpeg|svg|ico|css|js|woff2?)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    else res.setHeader('Cache-Control', 'public, max-age=300');
  },
}));

app.use((req, res) => {
  const nf = path.join(DIST, '404.html');
  if (fs.existsSync(nf)) return res.status(404).sendFile(nf);
  res.status(404).type('text/plain').send('Not found');
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`cha-law-site listening on ${port} (${SITE_URL})`));
