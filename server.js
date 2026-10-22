/**
 * Render(Web Service)용 서버: dist/ 정적 파일 + /api/contact 상담 폼 수신 + /api/hit 방문 기록 + /stats 방문 통계.
 * 환경변수: PORT(Render 자동), SITE_URL, RESEND_API_KEY, CONTACT_TO, CONTACT_FROM, DATA_DIR(영구 디스크), STATS_PASSWORD(통계 화면 비밀번호), STATS_OPEN=1(로컬 테스트용 로그인 생략)
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { DATA_DIR, ensureDir, record, parseUA, readEvents, aggregate, renderStats, sessionsCsv, makeSession, readSession, parseCookies } from './analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://www.lawyer-cha.com').replace(/\/$/, '');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb', type: ['application/json', 'text/plain'] }));
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
  const s = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).join(', ') : String(v || '').trim());
  const name = s(d.name);
  const phone = s(d.phone);
  const message = s(d.story || d.message); // 2026.10.20 시안: story(상황). 옛 폼은 message
  const area = s(d.area);
  const source = s(d.source);
  const whenDied = s(d.when_died);
  const heirs = s(d.heirs);
  const side = s(d.side);
  const topic = s(d.topic);
  const calltime = s(d.calltime);
  const dates = s(d.dates);   // 부동산 신청서: 만료일·잔금일 등
  const amount = s(d.amount); // 부동산 신청서: 걸린 금액
  if (!name || !phone || !d.agree) return res.status(400).json({ ok: false, error: 'missing fields' });
  if (message.length > 4000) return res.status(400).json({ ok: false, error: 'too long' });

  const label = [side, topic, area].filter(Boolean).join(' · ') || '분야 미선택';
  const text = [
    `[상담 신청] ${label}`,
    `성함: ${name}`,
    `연락처: ${phone}`,
    whenDied && `돌아가신 시기: ${whenDied}`,
    heirs && `상속인 구성: ${heirs}`,
    side && `입장: ${side}`,
    topic && `관련: ${topic}`,
    dates && `중요한 날짜: ${dates}`,
    amount && `걸린 금액: ${amount}`,
    calltime && `통화 가능 시간: ${calltime}`,
    source && `유입 경로: ${source}`,
    '',
    message || '(상황 설명 없음)',
    '',
    `접수: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    `IP: ${req.ip}`,
  ].filter((l) => l !== false && l !== undefined && l !== null && l !== '').join('\n');

  if (process.env.RESEND_API_KEY && process.env.CONTACT_TO) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM || 'onboarding@resend.dev',
          to: [process.env.CONTACT_TO],
          subject: `[홈페이지 상담] ${name} · ${label}`,
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
  const refPath = (() => { try { return new URL(req.get('referer') || '', 'https://x').pathname; } catch { return ''; } })();
  const contactSite = d.site === 're' || d.site === 'in' ? d.site : (area === '부동산' || /^\/real-estate(\/|$)/.test(refPath) ? 're' : 'in');
  record({ type: 'contact', site: contactSite, side, topic, area, sid: String(d.sid || '').slice(0, 40), vid: String(d.vid || '').slice(0, 40) }).catch(() => {});
  res.json({ ok: true });
});

// ---- 방문 기록·통계 ----
ensureDir();
// 통계 화면 로그인: 비밀번호 하나(Render 환경변수 STATS_PASSWORD). 비밀번호를 아는 사람은 누구나 열 수 있다.
const STATS_PASSWORD = process.env.STATS_PASSWORD || '';
const STATS_SECRET = process.env.STATS_SECRET || (STATS_PASSWORD ? crypto.createHash('sha256').update('stats:' + STATS_PASSWORD).digest('hex') : Math.random().toString(36));
const statsUser = (req) => readSession(parseCookies(req.headers.cookie)['stats_session'], STATS_SECRET);
const loginFails = new Map(); // ip → { n, t }
const loginPage = (msg = '') => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>방문 통계 로그인</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F4EF;font:15px/1.6 Pretendard,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#0F1A30}form{background:#fff;border:1px solid rgba(15,26,48,.12);border-radius:16px;padding:32px 30px;width:min(92vw,360px);box-shadow:0 24px 48px -30px rgba(15,26,48,.35)}h1{font-size:18px;margin:0 0 6px}p{margin:0 0 18px;color:#7E879A;font-size:13px}input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px 14px;border:1px solid rgba(15,26,48,.2);border-radius:10px}button{width:100%;margin-top:12px;font:inherit;font-weight:800;font-size:15px;padding:13px;border:0;border-radius:10px;background:#1B4B8F;color:#fff;cursor:pointer}.err{color:#B42318;font-size:13px;margin:10px 0 0}</style></head>
<body><form method="post" action="/stats/login"><h1>방문 통계</h1><p>비밀번호를 입력하세요.</p><input type="password" name="password" autocomplete="current-password" autofocus required /><button type="submit">열기</button>${msg ? `<div class="err">${msg}</div>` : ''}</form></body></html>`;

app.post('/api/hit', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const d = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body) || {};
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.notrack === '1') return res.status(204).end();
  const str = (v, n) => String(v || '').slice(0, n);
  const ua = parseUA(req.headers['user-agent'] || '');
  if (ua.bot) return res.status(204).end();
  const type = d.type === 'leave' ? 'leave' : d.type === 'view' ? 'view' : '';
  if (!type) return res.status(400).end();
  const ev = { type, id: str(d.id, 24), sid: str(d.sid, 40), vid: str(d.vid, 40) };
  if (type === 'view') {
    const p = str(d.path, 200);
    if (!p.startsWith('/') || /^\/(admin|stats)/.test(p)) return res.status(204).end();
    Object.assign(ev, { path: p, site: d.site === 're' || d.site === 'in' ? d.site : (/^\/real-estate(\/|$)/.test(p) ? 're' : 'in'), title: str(d.title, 120), ref: str(d.ref, 300), q: str(d.q, 120), w: Number(d.w) || 0, dev: ua.dev, br: ua.br, cc: str(req.headers['cf-ipcountry'] || req.headers['x-country'] || '', 4).toUpperCase() });
  } else {
    ev.dur = Math.max(0, Math.min(3600, Math.round(Number(d.dur) || 0)));
    if (d.dp !== undefined) ev.dp = Math.max(0, Math.min(100, Math.round(Number(d.dp) || 0)));
  }
  record(ev).catch(() => {});
  res.status(204).end();
});

app.get('/stats', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = statsUser(req);
  if (!user && process.env.STATS_OPEN !== '1') return res.redirect('/stats/login');
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const site = ['all', 'in', 're'].includes(String(req.query.site)) ? String(req.query.site) : 'all';
  const events = await readEvents(days * 2); // 직전 기간 비교용으로 두 배를 읽는다
  const agg = aggregate(events, days, site, 0);
  const prev = aggregate(events, days, site, days);
  if (req.query.format === 'json') return res.json({ ...agg, prevTotals: prev.totals });
  res.type('html').send(renderStats(agg, { user: user ? '로그인됨' : '', siteUrl: SITE_URL.replace(/^https?:\/\//, ''), prev }));
});

app.get('/stats/export.csv', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = statsUser(req);
  if (!user && process.env.STATS_OPEN !== '1') return res.redirect('/stats/login');
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const site = ['all', 'in', 're'].includes(String(req.query.site)) ? String(req.query.site) : 'all';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="visits-${site}-${days}d.csv"`);
  res.send(sessionsCsv(await readEvents(days), days, site));
});

app.get('/stats/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!STATS_PASSWORD) return res.status(500).type('html').send(loginPage('Render 환경변수 STATS_PASSWORD 가 아직 설정되지 않았습니다.'));
  if (statsUser(req)) return res.redirect('/stats');
  res.type('html').send(loginPage());
});

app.post('/stats/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!STATS_PASSWORD) return res.status(500).type('html').send(loginPage('Render 환경변수 STATS_PASSWORD 가 아직 설정되지 않았습니다.'));
  const ip = req.ip || '';
  const f = loginFails.get(ip);
  if (f && f.n >= 10 && Date.now() - f.t < 15 * 60 * 1000) return res.status(429).type('html').send(loginPage('시도가 너무 많습니다. 15분 뒤에 다시 시도하세요.'));
  const given = Buffer.from(String((req.body && req.body.password) || ''));
  const want = Buffer.from(STATS_PASSWORD);
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok) { loginFails.set(ip, { n: (f && Date.now() - f.t < 15 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() }); return res.status(401).type('html').send(loginPage('비밀번호가 맞지 않습니다.')); }
  loginFails.delete(ip);
  const secure = SITE_URL.startsWith('https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `stats_session=${makeSession('pw', STATS_SECRET)}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax${secure}`,
    `notrack=1; Path=/; Max-Age=${365 * 86400}; SameSite=Lax${secure}`, // 이 브라우저의 방문은 통계에서 제외
  ]);
  res.redirect('/stats');
});

app.get('/stats/logout', (req, res) => {
  res.setHeader('Set-Cookie', ['stats_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax', 'notrack=; Path=/; Max-Age=0; SameSite=Lax']);
  res.redirect('/');
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
