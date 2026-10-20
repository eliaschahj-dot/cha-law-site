/**
 * 방문 통계 (자체 수집). 외부 분석 도구 없이 server.js 가 직접 기록·집계한다.
 * - 저장: DATA_DIR/events-YYYY-MM.jsonl 에 한 줄씩(JSON). Render 에서는 영구 디스크(/var/data)를 DATA_DIR 로 마운트한다.
 * - 기록 항목: 방문자 식별값(브라우저가 만든 난수)·세션·경로·유입 경로(호스트만)·기기·브라우저·국가·체류시간. IP 는 저장하지 않는다.
 * - 집계: /stats 에서 기간별 방문·방문자·페이지뷰·체류시간·유입·상위 페이지·기기·최근 방문 흐름.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KST = 9 * 60 * 60 * 1000;
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data-local');
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|yeti|daum|kakaotalk-scrap|whatsapp|telegram|curl|wget|python-requests|headless|lighthouse|pingdom|uptime|monitor/i;

export function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
const monthFile = (ms) => path.join(DATA_DIR, `events-${new Date(ms + KST).toISOString().slice(0, 7)}.jsonl`);

let queue = Promise.resolve();
export function record(ev) {
  const line = JSON.stringify({ t: new Date().toISOString(), ...ev }) + '\n';
  queue = queue.then(() => fs.promises.appendFile(monthFile(Date.now()), line)).catch((e) => console.error('[stats] write failed', e?.message || e));
  return queue;
}

export function parseUA(ua = '') {
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  let br = 'other';
  if (/KAKAOTALK/i.test(ua)) br = '카카오톡';
  else if (/NAVER\(inapp/i.test(ua)) br = '네이버앱';
  else if (/Whale/i.test(ua)) br = 'Whale';
  else if (/SamsungBrowser/i.test(ua)) br = 'Samsung';
  else if (/Edg\//i.test(ua)) br = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) br = 'Chrome';
  else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) br = 'Safari';
  else if (/Firefox\//i.test(ua)) br = 'Firefox';
  return { dev: mobile ? '모바일' : 'PC', br, bot: BOT.test(ua) };
}

export function sourceOf(ref = '', q = '') {
  let host = '';
  try { host = ref ? new URL(ref).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
  const qs = (q || '').toLowerCase();
  if (/utm_source=|source=/.test(qs)) { const m = qs.match(/(?:utm_source|source)=([^&]+)/); if (m) return { name: `캠페인·${decodeURIComponent(m[1])}`, host }; }
  if (!host) return { name: '직접 방문·북마크', host };
  if (/search\.naver\.com|m\.search\.naver\.com/.test(host)) return { name: '네이버 검색', host };
  if (/blog\.naver\.com/.test(host)) return { name: '네이버 블로그', host };
  if (/naver\.com/.test(host)) return { name: '네이버 기타', host };
  if (/google\./.test(host)) return { name: '구글 검색', host };
  if (/daum\.net|kakao\.com/.test(host)) return { name: '다음·카카오', host };
  if (/bing\.com/.test(host)) return { name: 'Bing', host };
  if (/instagram\.com/.test(host)) return { name: '인스타그램', host };
  if (/youtube\.com|youtu\.be/.test(host)) return { name: '유튜브', host };
  if (/lawyer-cha\.com|cha-law-site\.onrender\.com/.test(host)) return { name: '사이트 내부', host };
  return { name: host, host };
}

export async function readEvents(days) {
  ensureDir();
  const since = Date.now() - days * 86400000;
  const files = [];
  for (let d = since; d <= Date.now() + 86400000; d += 20 * 86400000) files.push(monthFile(d));
  files.push(monthFile(Date.now()));
  const out = [];
  for (const f of [...new Set(files)]) {
    let txt = '';
    try { txt = await fs.promises.readFile(f, 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line) continue;
      try { const ev = JSON.parse(line); if (Date.parse(ev.t) >= since) out.push(ev); } catch { /* skip */ }
    }
  }
  return out;
}

const kstDate = (iso) => new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);
const kstTime = (iso) => { const d = new Date(Date.parse(iso) + KST); return `${d.toISOString().slice(5, 10).replace('-', '.')} ${d.toISOString().slice(11, 16)}`; };
const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`);

export function aggregate(events, days) {
  const views = events.filter((e) => e.type === 'view' && !e.bot);
  const leaves = events.filter((e) => e.type === 'leave');
  const contacts = events.filter((e) => e.type === 'contact');
  const durById = new Map();
  for (const l of leaves) durById.set(l.id, Math.max(durById.get(l.id) || 0, Math.min(Number(l.dur) || 0, 3600)));

  // 세션: sid 별 묶음, 페이지별 체류 = leave 기록(없으면 다음 페이지와의 간격, 최대 30분)
  const bySid = new Map();
  for (const v of views) { if (!bySid.has(v.sid)) bySid.set(v.sid, []); bySid.get(v.sid).push(v); }
  const sessions = [];
  for (const [sid, list] of bySid) {
    list.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
    const pages = list.map((v, i) => {
      let dur = durById.get(v.id);
      if (dur === undefined) { const nxt = list[i + 1]; dur = nxt ? Math.min(Math.round((Date.parse(nxt.t) - Date.parse(v.t)) / 1000), 1800) : 0; }
      return { path: v.path, title: v.title || '', dur, t: v.t };
    });
    const first = list[0];
    sessions.push({ sid, vid: first.vid, start: first.t, source: sourceOf(first.ref, first.q), dev: first.dev, br: first.br, cc: first.cc || '', pages, dur: pages.reduce((s, p) => s + p.dur, 0) });
  }
  sessions.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

  const uniq = (arr) => new Set(arr).size;
  const totals = {
    sessions: sessions.length,
    visitors: uniq(sessions.map((s) => s.vid)),
    views: views.length,
    avgDur: sessions.length ? Math.round(sessions.reduce((s, x) => s + x.dur, 0) / sessions.length) : 0,
    avgPages: sessions.length ? +(views.length / sessions.length).toFixed(1) : 0,
    bounce: sessions.length ? Math.round((sessions.filter((s) => s.pages.length === 1).length / sessions.length) * 100) : 0,
    contacts: contacts.length,
    returning: sessions.length ? Math.round((sessions.filter((s) => s.returning).length / sessions.length) * 100) : 0,
  };
  // 재방문: 같은 vid 로 세션이 2개 이상
  const vidCount = new Map(); for (const s of sessions) vidCount.set(s.vid, (vidCount.get(s.vid) || 0) + 1);
  totals.returningVisitors = [...vidCount.values()].filter((n) => n > 1).length;

  const daily = new Map();
  for (let i = days - 1; i >= 0; i--) daily.set(kstDate(new Date(Date.now() - i * 86400000).toISOString()), { sessions: 0, views: 0, vids: new Set(), contacts: 0 });
  for (const s of sessions) { const d = daily.get(kstDate(s.start)); if (d) { d.sessions++; d.vids.add(s.vid); } }
  for (const v of views) { const d = daily.get(kstDate(v.t)); if (d) d.views++; }
  for (const c of contacts) { const d = daily.get(kstDate(c.t)); if (d) d.contacts++; }
  const dailyRows = [...daily].map(([date, d]) => ({ date, sessions: d.sessions, views: d.views, visitors: d.vids.size, contacts: d.contacts }));

  const count = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  const sources = count(sessions, (s) => s.source.name);
  const devices = count(sessions, (s) => s.dev || '?');
  const browsers = count(sessions, (s) => s.br || '?');
  const countries = count(sessions, (s) => s.cc || '?');
  const entries = count(sessions, (s) => s.pages[0]?.path || '/');

  const pageMap = new Map();
  for (const s of sessions) for (const p of s.pages) {
    const m = pageMap.get(p.path) || { path: p.path, title: p.title, views: 0, sessions: new Set(), dur: 0, durN: 0 };
    m.views++; m.sessions.add(s.sid); if (p.title) m.title = p.title; if (p.dur > 0) { m.dur += p.dur; m.durN++; }
    pageMap.set(p.path, m);
  }
  const pages = [...pageMap.values()].map((m) => ({ path: m.path, title: m.title, views: m.views, sessions: m.sessions.size, avgDur: m.durN ? Math.round(m.dur / m.durN) : 0 })).sort((a, b) => b.views - a.views);

  const hours = Array.from({ length: 24 }, () => 0);
  for (const s of sessions) hours[new Date(Date.parse(s.start) + KST).getUTCHours()]++;

  return { days, totals, daily: dailyRows, sources, devices, browsers, countries, entries, pages, hours, recent: sessions.slice(0, 60), contactsList: contacts.slice(-20).reverse() };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderStats(agg, { user = '', siteUrl = '' } = {}) {
  const { totals: T, days } = agg;
  const max = Math.max(1, ...agg.daily.map((d) => d.sessions));
  const bars = agg.daily.map((d, i) => {
    const h = Math.round((d.sessions / max) * 120);
    const x = i * (900 / agg.daily.length);
    const w = Math.max(2, 900 / agg.daily.length - 2);
    return `<rect x="${x}" y="${130 - h}" width="${w}" height="${h}" rx="2"><title>${d.date} 방문 ${d.sessions} · 페이지뷰 ${d.views} · 방문자 ${d.visitors}</title></rect>`;
  }).join('');
  const labels = agg.daily.filter((_, i) => i % Math.ceil(agg.daily.length / 8) === 0).map((d) => { const i = agg.daily.indexOf(d); return `<text x="${i * (900 / agg.daily.length)}" y="146">${d.date.slice(5)}</text>`; }).join('');
  const table = (rows, head) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="muted">아직 기록이 없습니다</td></tr>`}</tbody></table>`;
  const pct = (n) => (T.sessions ? Math.round((n / T.sessions) * 100) : 0) + '%';
  const tabs = [7, 30, 90, 365].map((d) => `<a class="${d === days ? 'on' : ''}" href="/stats?days=${d}">${d === 365 ? '1년' : d + '일'}</a>`).join('');
  const hoursMax = Math.max(1, ...agg.hours);
  const hourBars = agg.hours.map((n, h) => `<div class="hb" title="${h}시 ${n}회"><i style="height:${Math.round((n / hoursMax) * 48)}px"></i><b>${h}</b></div>`).join('');
  const recentRows = agg.recent.map((s) => [
    kstTime(s.start),
    `<code title="${esc(s.vid)}">${esc(String(s.vid).slice(0, 6))}</code>`,
    esc(s.source.name),
    `${esc(s.dev)} · ${esc(s.br)}${s.cc ? ' · ' + esc(s.cc) : ''}`,
    `<div class="flow">${s.pages.map((p) => `<span title="${esc(p.title)}"><a href="${esc(p.path)}" target="_blank" rel="noopener">${esc(p.path)}</a> <em>${fmtDur(p.dur)}</em></span>`).join('<i>→</i>')}</div>`,
    fmtDur(s.dur),
  ]);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>방문 통계 · 차형진 변호사</title>
<style>
:root{--ink:#0F1A30;--ink2:#44506A;--ink3:#7E879A;--line:rgba(15,26,48,.13);--accent:#1B4B8F;--brass:#9A7F52;--bg:#F5F4EF;--card:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 Pretendard,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;letter-spacing:-.02em}
.wrap{max-width:1180px;margin:0 auto;padding:28px 22px 60px}header{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;margin-bottom:18px}
h1{font-size:22px;margin:0}h1 small{font-size:13px;color:var(--ink3);font-weight:500;margin-left:10px}.tabs a{display:inline-block;padding:7px 12px;border:1px solid var(--line);border-radius:999px;margin-right:6px;text-decoration:none;color:var(--ink2);font-weight:700;font-size:13px;background:#fff}.tabs a.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0 22px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px}.kpi small{display:block;font-size:12px;color:var(--brass);font-weight:800;letter-spacing:.04em}.kpi b{display:block;font-size:26px;font-weight:900;margin-top:4px}.kpi span{font-size:12px;color:var(--ink3)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin-bottom:16px}h2{font-size:15px;margin:0 0 12px;color:var(--ink2);letter-spacing:.02em}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:860px){.grid2,.grid3{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:13.5px}th{text-align:left;color:var(--ink3);font-weight:700;font-size:12px;padding:6px 8px;border-bottom:1px solid var(--line)}td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}td:last-child,th:last-child{text-align:right}.muted{color:var(--ink3)}
svg.chart{width:100%;height:150px;display:block}svg.chart rect{fill:var(--accent)}svg.chart text{font-size:10px;fill:var(--ink3)}
.hours{display:flex;gap:3px;align-items:flex-end;height:70px}.hb{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px}.hb i{display:block;width:100%;background:var(--brass);border-radius:2px 2px 0 0;min-height:1px}.hb b{font-size:9px;color:var(--ink3);font-weight:600}
.flow span{white-space:nowrap}.flow em{font-style:normal;color:var(--accent);font-weight:700;font-size:12px}.flow i{color:var(--ink3);margin:0 6px;font-style:normal}.flow a{color:var(--ink);text-decoration:none}code{font-size:12px;background:#EEF0F4;padding:1px 5px;border-radius:3px}
.note{font-size:12.5px;color:var(--ink3);margin-top:8px}footer{font-size:12px;color:var(--ink3);margin-top:20px}footer a{color:var(--ink2)}
</style></head><body><div class="wrap">
<header><h1>방문 통계 <small>${esc(siteUrl)} · 최근 ${days}일 · 한국 시간</small></h1><div class="tabs">${tabs}<a href="/stats?days=${days}&format=json">JSON</a>${user ? `<a href="/stats/logout">로그아웃</a>` : ''}</div></header>
<div class="kpis">
<div class="kpi"><small>방문(세션)</small><b>${T.sessions.toLocaleString('ko-KR')}</b><span>같은 사람이 30분 넘게 비우면 새 방문</span></div>
<div class="kpi"><small>방문자</small><b>${T.visitors.toLocaleString('ko-KR')}</b><span>재방문자 ${T.returningVisitors}명</span></div>
<div class="kpi"><small>페이지뷰</small><b>${T.views.toLocaleString('ko-KR')}</b><span>방문당 ${T.avgPages}쪽</span></div>
<div class="kpi"><small>평균 체류</small><b>${fmtDur(T.avgDur)}</b><span>화면이 보인 시간만 합산</span></div>
<div class="kpi"><small>한 쪽만 보고 이탈</small><b>${T.bounce}%</b><span>페이지 1개로 끝난 방문</span></div>
<div class="kpi"><small>상담 신청</small><b>${T.contacts}</b><span>홈페이지 신청서 접수 건수</span></div>
</div>
<div class="card"><h2>일별 방문</h2><svg class="chart" viewBox="0 0 900 150" preserveAspectRatio="none">${bars}${labels}</svg>
${table(agg.daily.slice().reverse().slice(0, 14).map((d) => [d.date, d.sessions, d.visitors, d.views, d.contacts]), ['날짜', '방문', '방문자', '페이지뷰', '상담 신청'])}<p class="note">표는 최근 14일. 그래프는 선택한 기간 전체.</p></div>
<div class="grid2">
<div class="card"><h2>어디서 들어왔나 (유입 경로)</h2>${table(agg.sources.map(([k, n]) => [esc(k), n, pct(n)]), ['경로', '방문', '비율'])}</div>
<div class="card"><h2>처음 연 페이지 (진입)</h2>${table(agg.entries.slice(0, 12).map(([k, n]) => [`<a href="${esc(k)}" target="_blank" rel="noopener">${esc(k)}</a>`, n, pct(n)]), ['페이지', '방문', '비율'])}</div>
</div>
<div class="card"><h2>많이 본 페이지</h2>${table(agg.pages.slice(0, 25).map((p) => [`<a href="${esc(p.path)}" target="_blank" rel="noopener">${esc(p.path)}</a><br><span class="muted">${esc(p.title)}</span>`, p.views, p.sessions, fmtDur(p.avgDur)]), ['페이지', '페이지뷰', '방문', '평균 체류'])}</div>
<div class="grid3">
<div class="card"><h2>기기</h2>${table(agg.devices.map(([k, n]) => [esc(k), n, pct(n)]), ['기기', '방문', '비율'])}</div>
<div class="card"><h2>브라우저</h2>${table(agg.browsers.slice(0, 8).map(([k, n]) => [esc(k), n, pct(n)]), ['브라우저', '방문', '비율'])}</div>
<div class="card"><h2>국가</h2>${table(agg.countries.slice(0, 8).map(([k, n]) => [esc(k), n, pct(n)]), ['국가', '방문', '비율'])}</div>
</div>
<div class="card"><h2>시간대별 방문 (0~23시)</h2><div class="hours">${hourBars}</div></div>
<div class="card"><h2>최근 방문 흐름 (최근 60건)</h2>${table(recentRows, ['시각', '방문자', '유입', '기기', '본 페이지와 체류시간', '합계'])}<p class="note">방문자 칸은 브라우저가 만든 임의 식별값의 앞 6자입니다. 이름·IP는 기록하지 않습니다. 변호사님 본인 방문은 이 화면에 로그인한 브라우저에서는 제외됩니다.</p></div>
${agg.contactsList.length ? `<div class="card"><h2>최근 상담 신청 (시각·입장·관련)</h2>${table(agg.contactsList.map((c) => [kstTime(c.t), esc(c.side || ''), esc(c.topic || ''), esc(c.area || '')]), ['시각', '입장', '관련', '분야'])}</div>` : ''}
<footer>기록 위치: ${esc(DATA_DIR)} · 매월 파일 하나(events-YYYY-MM.jsonl). 검색엔진·메신저 미리보기 로봇은 제외. <a href="/">홈으로</a> · <a href="/admin/">글 편집기</a></footer>
</div></body></html>`;
}

// ---- 통계 화면 로그인(GitHub) 세션 쿠키 ----
export function sign(payload, secret) { return crypto.createHmac('sha256', secret).update(payload).digest('base64url'); }
export function makeSession(login, secret, days = 30) {
  const exp = Date.now() + days * 86400000;
  const payload = `${login}.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}
export function readSession(cookie, secret) {
  if (!cookie) return null;
  const i = cookie.lastIndexOf('.');
  if (i < 0) return null;
  const payload = cookie.slice(0, i), sig = cookie.slice(i + 1);
  if (sign(payload, secret) !== sig) return null;
  const [login, exp] = payload.split('.');
  if (!login || Number(exp) < Date.now()) return null;
  return login;
}
export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
