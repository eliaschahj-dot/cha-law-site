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

const VERSION = (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7);
app.use((req, res, next) => {
  res.setHeader('X-App-Version', VERSION);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// ---- /admin 편집기(Decap CMS)용 GitHub OAuth ----
// 환경변수: GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET (GitHub → Settings → Developer settings → OAuth Apps)
// Authorization callback URL 은 `${SITE_URL}/callback`
const OAUTH_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const OAUTH_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const oauthStates = new Map();

app.get('/auth', (req, res) => {
  if (!OAUTH_ID || !OAUTH_SECRET) return res.status(500).type('text/plain').send('GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET 환경변수가 없습니다.');
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  oauthStates.set(state, Date.now());
  for (const [k, t] of oauthStates) if (Date.now() - t > 10 * 60 * 1000) oauthStates.delete(k);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', OAUTH_ID);
  url.searchParams.set('redirect_uri', `${SITE_URL}/callback`);
  url.searchParams.set('scope', 'repo,user');
  url.searchParams.set('state', state);
  res.redirect(url.href);
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const page = (status, payload) => res.type('html').send(`<!doctype html><meta charset="utf-8"><title>로그인</title><script>
(function(){
  var msg = 'authorization:github:${status}:' + ${JSON.stringify(JSON.stringify(payload))};
  function receive(e){ window.opener.postMessage(msg, e.origin); window.removeEventListener('message', receive, false); }
  window.addEventListener('message', receive, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script><p>${status === 'success' ? '로그인되었습니다. 이 창은 닫아도 됩니다.' : '로그인에 실패했습니다.'}</p>`);
  if (!code || !state || !oauthStates.has(String(state))) return page('error', { error: 'invalid state' });
  oauthStates.delete(String(state));
  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: OAUTH_ID, client_secret: OAUTH_SECRET, code, redirect_uri: `${SITE_URL}/callback` }),
    });
    const j = await r.json();
    if (!j.access_token) return page('error', { error: j.error_description || 'no token' });
    return page('success', { token: j.access_token, provider: 'github' });
  } catch (e) {
    return page('error', { error: 'exchange failed' });
  }
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
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error(`[contact] resend ${r.status}: ${body.slice(0, 400)}`);
        return res.status(502).json({ ok: false, error: `mail failed (${r.status})` });
      }
    } catch (e) {
      console.error('[contact] resend request error:', e?.message || e);
      return res.status(502).json({ ok: false, error: 'mail failed (network)' });
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
