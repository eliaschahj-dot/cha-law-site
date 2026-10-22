/**
 * 방문 통계 (자체 수집). 외부 분석 도구 없이 server.js 가 직접 기록·집계한다.
 * - 저장: DATA_DIR/events-YYYY-MM.jsonl 에 한 줄씩(JSON). Render 에서는 영구 디스크(/var/data)를 DATA_DIR 로 마운트한다.
 * - 기록 항목: 방문자 식별값(브라우저가 만든 난수)·세션·경로·사이트(in 상속/re 부동산)·유입 경로(호스트만)·기기·브라우저·국가·체류시간·스크롤 깊이. IP 는 저장하지 않는다.
 * - 집계(2026.10.22 확장): 사이트별(상속/부동산/전체) 분리, 직전 기간 비교, 유입·진입·기기별 상담 전환, 퍼널(홈→분야·안내→상담 페이지→신청),
 *   이탈 페이지, 요일·시간대, 스크롤 깊이, 캠페인(UTM), 칼럼 인기 글, 재방문, CSV 내보내기.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KST = 9 * 60 * 60 * 1000;
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data-local');
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|yeti|daum|kakaotalk-scrap|whatsapp|telegram|curl|wget|python-requests|headless|lighthouse|pingdom|uptime|monitor/i;

export const SITES = { all: '전체', in: '상속', re: '부동산' };
export const siteOfPath = (p = '') => (p === '/real-estate' || p.startsWith('/real-estate/') ? 're' : 'in');
const evSite = (ev) => (ev.site === 're' || ev.site === 'in' ? ev.site : siteOfPath(ev.path || ''));
const HOME = { in: '/', re: '/real-estate' };
const CONTACT = { in: '/contact', re: '/real-estate/contact' };
const norm = (p = '/') => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
const isContactPath = (p) => { const n = norm(p); return n === '/contact' || n === '/real-estate/contact'; };
const isHomePath = (p) => { const n = norm(p); return n === '/' || n === '/real-estate'; };
const pageKind = (p) => {
  const n = norm(p);
  if (isHomePath(n)) return '홈';
  if (isContactPath(n)) return '상담 페이지';
  if (/^\/columns\//.test(n)) return '칼럼';
  if (/\/(guide|situations)(\/|$)/.test(n)) return '안내';
  if (/^\/(inheritance-lawyer|real-estate\/lawyer)$/.test(n)) return '소개';
  if (/^\/(fees|faq|glossary|press|gangnam|inheritance|privacy)$/.test(n) || /^\/real-estate\/(fees|faq)$/.test(n)) return '기타';
  return '분야';
};

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
/** UTM 파라미터(q = location.search) → { source, medium, campaign } 또는 null */
export function utmOf(q = '') {
  if (!q) return null;
  let p; try { p = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q); } catch { return null; }
  const source = p.get('utm_source') || p.get('source'); if (!source) return null;
  return { source, medium: p.get('utm_medium') || '', campaign: p.get('utm_campaign') || '' };
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
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 세션 목록(sid 별 묶음). site = 'all' | 'in' | 're'. window: [now-(offset+days)d, now-offset d) */
export function buildSessions(events, days, site = 'all', offset = 0) {
  const to = Date.now() - offset * 86400000, from = to - days * 86400000;
  const inWin = (e) => { const t = Date.parse(e.t); return t >= from && t < to; };
  const all = events.filter(inWin);
  const views = all.filter((e) => e.type === 'view' && !e.bot && (site === 'all' || evSite(e) === site));
  const leaves = all.filter((e) => e.type === 'leave');
  const durById = new Map(), depthById = new Map();
  for (const l of leaves) {
    durById.set(l.id, Math.max(durById.get(l.id) || 0, Math.min(Number(l.dur) || 0, 3600)));
    if (l.dp !== undefined) depthById.set(l.id, Math.max(depthById.get(l.id) || 0, Math.min(Number(l.dp) || 0, 100)));
  }
  const bySid = new Map();
  for (const v of views) { if (!bySid.has(v.sid)) bySid.set(v.sid, []); bySid.get(v.sid).push(v); }
  // 상담 신청: sid 로 세션과 연결. site 는 기록값 → 없으면 세션의 사이트
  const contacts = all.filter((e) => e.type === 'contact');
  const contactBySid = new Map();
  for (const c of contacts) contactBySid.set(c.sid, (contactBySid.get(c.sid) || 0) + 1);
  const sessions = [];
  for (const [sid, list] of bySid) {
    list.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
    const pages = list.map((v, i) => {
      let dur = durById.get(v.id);
      if (dur === undefined) { const nxt = list[i + 1]; dur = nxt ? Math.min(Math.round((Date.parse(nxt.t) - Date.parse(v.t)) / 1000), 1800) : 0; }
      return { path: v.path, title: v.title || '', dur, t: v.t, dp: depthById.get(v.id), site: evSite(v), kind: pageKind(v.path) };
    });
    const first = list[0];
    const siteSet = new Set(pages.map((p) => p.site));
    sessions.push({
      sid, vid: first.vid, start: first.t, source: sourceOf(first.ref, first.q), utm: utmOf(first.q), dev: first.dev, br: first.br, cc: first.cc || '',
      site: siteSet.size === 1 ? [...siteSet][0] : 'both', pages, dur: pages.reduce((s, p) => s + p.dur, 0), contacts: contactBySid.get(sid) || 0,
    });
  }
  sessions.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  // 사이트별로 볼 때 상담 신청도 그 사이트 것만
  const contactsOf = contacts.filter((c) => {
    if (site === 'all') return true;
    const cs = c.site === 're' || c.site === 'in' ? c.site : (bySid.has(c.sid) ? evSite(bySid.get(c.sid)[0]) : (c.area === '부동산' ? 're' : 'in'));
    return cs === site;
  });
  return { sessions, views, contacts: contactsOf, from, to };
}

export function aggregate(events, days, site = 'all', offset = 0) {
  const { sessions, views, contacts, from } = buildSessions(events, days, site, offset);
  const uniq = (arr) => new Set(arr).size;
  const vidCount = new Map(); for (const s of sessions) vidCount.set(s.vid, (vidCount.get(s.vid) || 0) + 1);
  const totals = {
    sessions: sessions.length,
    visitors: uniq(sessions.map((s) => s.vid)),
    views: views.length,
    avgDur: sessions.length ? Math.round(sessions.reduce((s, x) => s + x.dur, 0) / sessions.length) : 0,
    avgPages: sessions.length ? +(views.length / sessions.length).toFixed(1) : 0,
    bounce: sessions.length ? Math.round((sessions.filter((s) => s.pages.length === 1).length / sessions.length) * 100) : 0,
    contacts: contacts.length,
    conv: sessions.length ? +((contacts.length / sessions.length) * 100).toFixed(1) : 0,
    returningVisitors: [...vidCount.values()].filter((n) => n > 1).length,
    returningShare: sessions.length ? Math.round((sessions.filter((s) => vidCount.get(s.vid) > 1).length / sessions.length) * 100) : 0,
  };

  const daily = new Map();
  for (let i = days - 1; i >= 0; i--) daily.set(kstDate(new Date(from + (days - 1 - i) * 86400000 + 1).toISOString()), { sessions: 0, views: 0, vids: new Set(), contacts: 0 });
  for (const s of sessions) { const d = daily.get(kstDate(s.start)); if (d) { d.sessions++; d.vids.add(s.vid); } }
  for (const v of views) { const d = daily.get(kstDate(v.t)); if (d) d.views++; }
  for (const c of contacts) { const d = daily.get(kstDate(c.t)); if (d) d.contacts++; }
  const dailyRows = [...daily].map(([date, d]) => ({ date, sessions: d.sessions, views: d.views, visitors: d.vids.size, contacts: d.contacts }));

  const count = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  // 전환 분석: 묶음별 방문 수·상담 수·전환율
  const convBy = (key) => {
    const m = new Map();
    for (const s of sessions) { const k = key(s); const r = m.get(k) || { n: 0, c: 0, dur: 0 }; r.n++; r.c += s.contacts ? 1 : 0; r.dur += s.dur; m.set(k, r); }
    return [...m].map(([k, r]) => ({ key: k, sessions: r.n, contacts: r.c, rate: +((r.c / r.n) * 100).toFixed(1), avgDur: Math.round(r.dur / r.n) })).sort((a, b) => b.sessions - a.sessions);
  };
  const sources = convBy((s) => s.source.name);
  const devices = convBy((s) => s.dev || '?');
  const browsers = count(sessions, (s) => s.br || '?');
  const countries = count(sessions, (s) => s.cc || '?');
  const entries = convBy((s) => norm(s.pages[0]?.path || '/'));
  const exits = count(sessions.filter((s) => s.pages.length > 1 || true), (s) => norm(s.pages[s.pages.length - 1]?.path || '/'));
  const campaigns = convBy((s) => (s.utm ? [s.utm.source, s.utm.medium, s.utm.campaign].filter(Boolean).join(' / ') : '')).filter((r) => r.key);

  // 페이지별: 페이지뷰·방문·평균 체류·평균 스크롤 깊이·이탈(마지막 페이지였던 비율)
  const pageMap = new Map();
  for (const s of sessions) s.pages.forEach((p, i) => {
    const k = norm(p.path);
    const m = pageMap.get(k) || { path: k, title: p.title, kind: p.kind, site: p.site, views: 0, sessions: new Set(), dur: 0, durN: 0, dp: 0, dpN: 0, exits: 0 };
    m.views++; m.sessions.add(s.sid); if (p.title) m.title = p.title; if (p.dur > 0) { m.dur += p.dur; m.durN++; }
    if (p.dp !== undefined) { m.dp += p.dp; m.dpN++; }
    if (i === s.pages.length - 1) m.exits++;
    pageMap.set(k, m);
  });
  const pages = [...pageMap.values()].map((m) => ({ path: m.path, title: m.title, kind: m.kind, site: m.site, views: m.views, sessions: m.sessions.size, avgDur: m.durN ? Math.round(m.dur / m.durN) : 0, avgDepth: m.dpN ? Math.round(m.dp / m.dpN) : null, exitRate: Math.round((m.exits / m.views) * 100) })).sort((a, b) => b.views - a.views);
  const columns = pages.filter((p) => p.kind === '칼럼').slice(0, 15);
  const depthPages = pages.filter((p) => p.avgDepth !== null && p.views >= 3).sort((a, b) => b.avgDepth - a.avgDepth);

  // 퍼널: 홈 → 분야·안내·칼럼 → 상담 페이지 → 상담 신청
  const saw = (s, f) => s.pages.some(f);
  const funnel = [
    ['방문', sessions.length],
    ['홈을 봄', sessions.filter((s) => saw(s, (p) => p.kind === '홈')).length],
    ['분야·안내·칼럼을 봄', sessions.filter((s) => saw(s, (p) => ['분야', '안내', '칼럼', '소개'].includes(p.kind))).length],
    ['상담 페이지를 봄', sessions.filter((s) => saw(s, (p) => p.kind === '상담 페이지')).length],
    ['상담 신청', sessions.filter((s) => s.contacts > 0).length],
  ];
  const kinds = convBy((s) => (s.pages[0] ? s.pages[0].kind : '?'));

  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => ({ sessions: 0, contacts: 0 }));
  for (const s of sessions) { const d = new Date(Date.parse(s.start) + KST); hours[d.getUTCHours()]++; const w = weekdays[d.getUTCDay()]; w.sessions++; if (s.contacts) w.contacts++; }

  const out = { days, site, totals, daily: dailyRows, sources, devices, browsers, countries, entries, exits: exits.slice(0, 12), campaigns, pages, columns, depthPages, funnel, kinds, hours, weekdays, recent: sessions.slice(0, 60), contactsList: contacts.slice(-30).reverse() };
  if (site === 'all' && offset === 0) {
    out.bySite = {};
    for (const k of ['in', 're']) { const a = aggregate(events, days, k, 0); out.bySite[k] = { totals: a.totals, topEntries: a.entries.slice(0, 3), topSources: a.sources.slice(0, 3) }; }
  }
  return out;
}

/** CSV 내보내기(세션 단위) */
export function sessionsCsv(events, days, site = 'all') {
  const { sessions } = buildSessions(events, days, site);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['시작(KST)', '사이트', '유입', '캠페인', '기기', '브라우저', '국가', '페이지수', '체류초', '진입', '이탈', '상담신청', '경로'];
  const rows = sessions.map((s) => [kstTime(s.start), SITES[s.site] || s.site, s.source.name, s.utm ? `${s.utm.source}/${s.utm.medium}/${s.utm.campaign}` : '', s.dev, s.br, s.cc, s.pages.length, s.dur, norm(s.pages[0]?.path || ''), norm(s.pages[s.pages.length - 1]?.path || ''), s.contacts, s.pages.map((p) => `${norm(p.path)}(${p.dur}s)`).join(' > ')]);
  return '﻿' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderStats(agg, { user = '', siteUrl = '', prev = null } = {}) {
  const { totals: T, days, site } = agg;
  const qs = (o) => `/stats?days=${o.days ?? days}&site=${o.site ?? site}`;
  const max = Math.max(1, ...agg.daily.map((d) => d.sessions));
  const bars = agg.daily.map((d, i) => {
    const h = Math.round((d.sessions / max) * 120);
    const x = i * (900 / agg.daily.length);
    const w = Math.max(2, 900 / agg.daily.length - 2);
    return `<rect x="${x}" y="${130 - h}" width="${w}" height="${h}" rx="2"><title>${d.date} 방문 ${d.sessions} · 페이지뷰 ${d.views} · 방문자 ${d.visitors} · 상담 ${d.contacts}</title></rect>${d.contacts ? `<circle cx="${x + w / 2}" cy="${124 - h}" r="3" class="c"><title>${d.date} 상담 ${d.contacts}</title></circle>` : ''}`;
  }).join('');
  const labels = agg.daily.filter((_, i) => i % Math.ceil(agg.daily.length / 8) === 0).map((d) => { const i = agg.daily.indexOf(d); return `<text x="${i * (900 / agg.daily.length)}" y="146">${d.date.slice(5)}</text>`; }).join('');
  const table = (rows, head) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="muted">아직 기록이 없습니다</td></tr>`}</tbody></table>`;
  const pct = (n) => (T.sessions ? Math.round((n / T.sessions) * 100) : 0) + '%';
  const link = (p) => `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p)}</a>`;
  const delta = (cur, before, { pctPoint = false, lowerBetter = false } = {}) => {
    if (!prev) return '';
    if (before === 0 && cur === 0) return '<span class="d flat">변동 없음</span>';
    let txt, up;
    if (pctPoint) { const diff = +(cur - before).toFixed(1); up = diff > 0; txt = `${up ? '▲' : diff < 0 ? '▼' : '='} ${Math.abs(diff)}%p`; }
    else if (before === 0) { up = true; txt = '▲ 신규'; }
    else { const r = Math.round(((cur - before) / before) * 100); up = r > 0; txt = `${up ? '▲' : r < 0 ? '▼' : '='} ${Math.abs(r)}%`; }
    const good = lowerBetter ? !up : up;
    return `<span class="d ${good ? 'good' : 'bad'}" title="직전 ${days}일: ${before}">${txt}</span>`;
  };
  const P = prev?.totals || {};
  const periodTabs = [7, 30, 90, 365].map((d) => `<a class="${d === days ? 'on' : ''}" href="${qs({ days: d })}">${d === 365 ? '1년' : d + '일'}</a>`).join('');
  const siteTabs = Object.entries(SITES).map(([k, v]) => `<a class="${k === site ? 'on' : ''} s-${k}" href="${qs({ site: k })}">${v}</a>`).join('');
  const hoursMax = Math.max(1, ...agg.hours);
  const hourBars = agg.hours.map((n, h) => `<div class="hb" title="${h}시 ${n}회"><i style="height:${Math.round((n / hoursMax) * 48)}px"></i><b>${h}</b></div>`).join('');
  const wdMax = Math.max(1, ...agg.weekdays.map((w) => w.sessions));
  const wdBars = agg.weekdays.map((w, i) => `<div class="hb" title="${WEEK[i]}요일 방문 ${w.sessions} · 상담 ${w.contacts}"><i style="height:${Math.round((w.sessions / wdMax) * 48)}px"></i><b>${WEEK[i]}${w.contacts ? `<em>${w.contacts}</em>` : ''}</b></div>`).join('');
  const siteTag = (s) => (s === 'both' ? '<span class="tag both">둘 다</span>' : s === 're' ? '<span class="tag re">부동산</span>' : '<span class="tag in">상속</span>');
  const recentRows = agg.recent.map((s) => [
    kstTime(s.start),
    `<code title="${esc(s.vid)}">${esc(String(s.vid).slice(0, 6))}</code>${s.contacts ? ' <b class="cv">상담</b>' : ''}`,
    site === 'all' ? siteTag(s.site) : esc(s.source.name),
    site === 'all' ? esc(s.source.name) : `${esc(s.dev)} · ${esc(s.br)}${s.cc ? ' · ' + esc(s.cc) : ''}`,
    `<div class="flow">${s.pages.map((p) => `<span title="${esc(p.title)}"><a href="${esc(p.path)}" target="_blank" rel="noopener">${esc(p.path)}</a> <em>${fmtDur(p.dur)}</em>${p.dp !== undefined ? `<small>${p.dp}%</small>` : ''}</span>`).join('<i>→</i>')}</div>`,
    fmtDur(s.dur),
  ]);
  const funnelMax = Math.max(1, agg.funnel[0][1]);
  const funnelRows = agg.funnel.map(([k, n], i) => { const base = agg.funnel[0][1] || 1; const prevN = i ? agg.funnel[i - 1][1] || 0 : n; return `<div class="fr"><span class="fk">${k}</span><span class="fb"><i style="width:${Math.round((n / funnelMax) * 100)}%"></i></span><span class="fn">${n}</span><span class="fp">${Math.round((n / base) * 100)}%${i ? ` <small>이전 단계의 ${prevN ? Math.round((n / prevN) * 100) : 0}%</small>` : ''}</span></div>`; }).join('');
  const convTable = (rows, label, limit = 10) => table(rows.slice(0, limit).map((r) => [esc(r.key || '(없음)'), r.sessions, pct(r.sessions), r.contacts, `<b>${r.rate}%</b>`, fmtDur(r.avgDur)]), [label, '방문', '비율', '상담', '전환율', '평균 체류']);
  const bySiteCards = agg.bySite ? `<div class="grid2 sitecards">${['in', 're'].map((k) => { const b = agg.bySite[k]; const t = b.totals; return `<div class="card s-${k}"><h2><span class="tag ${k}">${SITES[k]}</span> ${SITES[k]} 전문 홈페이지 <a class="more" href="${qs({ site: k })}">자세히 →</a></h2>
<div class="mini"><div><small>방문</small><b>${t.sessions}</b></div><div><small>방문자</small><b>${t.visitors}</b></div><div><small>페이지뷰</small><b>${t.views}</b></div><div><small>평균 체류</small><b>${fmtDur(t.avgDur)}</b></div><div><small>상담 신청</small><b>${t.contacts}</b></div><div><small>전환율</small><b>${t.conv}%</b></div></div>
<p class="note">진입: ${b.topEntries.map((e) => `${esc(e.key)} ${e.sessions}`).join(' · ') || '-'}<br>유입: ${b.topSources.map((e) => `${esc(e.key)} ${e.sessions}`).join(' · ') || '-'}</p></div>`; }).join('')}</div>` : '';
  const shareBar = agg.bySite ? (() => { const a = agg.bySite.in.totals.sessions, b = agg.bySite.re.totals.sessions, t = a + b || 1; return `<div class="share"><i class="in" style="width:${Math.round((a / t) * 100)}%" title="상속 ${a}"></i><i class="re" style="width:${Math.round((b / t) * 100)}%" title="부동산 ${b}"></i></div><p class="note">상속 ${Math.round((a / t) * 100)}% · 부동산 ${Math.round((b / t) * 100)}% (두 사이트를 오간 방문은 양쪽에 셉니다)</p>`; })() : '';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>방문 통계 · ${SITES[site]} · 차형진 변호사</title>
<style>
:root{--ink:#0F1A30;--ink2:#44506A;--ink3:#7E879A;--line:rgba(15,26,48,.13);--accent:#1B4B8F;--brass:#9A7F52;--bg:#F5F6F8;--card:#fff;--in:#1B4B8F;--re:#2E7D5B}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 Pretendard,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;letter-spacing:-.02em}
.wrap{max-width:1180px;margin:0 auto;padding:28px 22px 60px}header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:14px}
h1{font-size:22px;margin:0}h1 small{font-size:13px;color:var(--ink3);font-weight:500;margin-left:10px}.tabs{display:flex;flex-wrap:wrap;gap:6px}.tabs a{display:inline-block;padding:7px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--ink2);font-weight:700;font-size:13px;background:#fff}.tabs a.on{background:var(--accent);color:#fff;border-color:var(--accent)}.tabs a.s-re.on{background:var(--re);border-color:var(--re)}.tabs a.s-in.on{background:var(--in);border-color:var(--in)}
.sitebar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:4px 0 16px;font-size:13px;color:var(--ink3)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0 18px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px}.kpi small{display:block;font-size:12px;color:var(--brass);font-weight:800;letter-spacing:.04em}.kpi b{display:block;font-size:26px;font-weight:900;margin-top:4px}.kpi span{font-size:12px;color:var(--ink3);display:block}
.d{display:inline-block;font-size:12px;font-weight:800;margin-top:4px;padding:1px 7px;border-radius:999px;background:#EEF0F4;color:var(--ink2)}.d.good{background:#E3F3EA;color:#1D6B42}.d.bad{background:#FBE7E7;color:#A33A3A}.d.flat{background:#EEF0F4}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin-bottom:16px}h2{font-size:15px;margin:0 0 12px;color:var(--ink2);letter-spacing:.02em;display:flex;align-items:center;gap:8px}h2 .more{margin-left:auto;font-size:12px;color:var(--accent);text-decoration:none}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:860px){.grid2,.grid3{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:13.5px}th{text-align:left;color:var(--ink3);font-weight:700;font-size:12px;padding:6px 8px;border-bottom:1px solid var(--line)}td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}td:last-child,th:last-child{text-align:right}.muted{color:var(--ink3)}
svg.chart{width:100%;height:150px;display:block}svg.chart rect{fill:var(--accent)}svg.chart circle.c{fill:#C9A227}svg.chart text{font-size:10px;fill:var(--ink3)}
.hours{display:flex;gap:3px;align-items:flex-end;height:70px}.hb{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px}.hb i{display:block;width:100%;background:var(--brass);border-radius:2px 2px 0 0;min-height:1px}.hb b{font-size:9px;color:var(--ink3);font-weight:600}.hb b em{font-style:normal;color:#C9A227;margin-left:2px}
.flow span{white-space:nowrap}.flow em{font-style:normal;color:var(--accent);font-weight:700;font-size:12px}.flow small{color:var(--ink3);font-size:10px;margin-left:3px}.flow i{color:var(--ink3);margin:0 6px;font-style:normal}.flow a{color:var(--ink);text-decoration:none}code{font-size:12px;background:#EEF0F4;padding:1px 5px;border-radius:3px}.cv{font-size:11px;color:#fff;background:#C9A227;padding:1px 6px;border-radius:999px}
.tag{display:inline-block;font-size:11px;font-weight:800;padding:1px 8px;border-radius:999px;color:#fff;background:var(--in)}.tag.re{background:var(--re)}.tag.both{background:var(--ink3)}
.sitecards .card.s-in{border-top:3px solid var(--in)}.sitecards .card.s-re{border-top:3px solid var(--re)}.mini{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px}.mini small{display:block;font-size:11px;color:var(--ink3)}.mini b{font-size:20px;font-weight:900}
.share{display:flex;height:12px;border-radius:999px;overflow:hidden;background:#EEF0F4;margin-top:4px}.share i{display:block;height:100%}.share .in{background:var(--in)}.share .re{background:var(--re)}
.funnel{display:grid;gap:8px}.fr{display:grid;grid-template-columns:150px 1fr 56px 150px;gap:10px;align-items:center;font-size:13.5px}.fb{height:16px;background:#EEF0F4;border-radius:999px;overflow:hidden}.fb i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),#3C6FBF)}.fn{font-weight:900;text-align:right}.fp{color:var(--ink3);font-size:12.5px}.fp small{color:var(--ink3)}@media(max-width:640px){.fr{grid-template-columns:100px 1fr 44px}.fp{display:none}}
.note{font-size:12.5px;color:var(--ink3);margin-top:8px}footer{font-size:12px;color:var(--ink3);margin-top:20px}footer a{color:var(--ink2)}
</style></head><body><div class="wrap">
<header><h1>방문 통계 <small>${esc(siteUrl)} · 최근 ${days}일 · 한국 시간</small></h1><div class="tabs">${periodTabs}<a href="${qs({})}&format=json">JSON</a><a href="/stats/export.csv?days=${days}&site=${site}">CSV</a>${user ? `<a href="/stats/logout">로그아웃</a>` : ''}</div></header>
<div class="sitebar"><span>보는 사이트</span><div class="tabs">${siteTabs}</div><span class="muted">상속 = / 아래 · 부동산 = /real-estate 아래(칼럼은 코너 기준)</span></div>
${bySiteCards}${shareBar ? `<div class="card"><h2>두 사이트 방문 비중</h2>${shareBar}</div>` : ''}
<div class="kpis">
<div class="kpi"><small>방문(세션)</small><b>${T.sessions.toLocaleString('ko-KR')}</b><span>30분 넘게 비우면 새 방문</span>${delta(T.sessions, P.sessions)}</div>
<div class="kpi"><small>방문자</small><b>${T.visitors.toLocaleString('ko-KR')}</b><span>재방문 ${T.returningShare}% (${T.returningVisitors}명)</span>${delta(T.visitors, P.visitors)}</div>
<div class="kpi"><small>페이지뷰</small><b>${T.views.toLocaleString('ko-KR')}</b><span>방문당 ${T.avgPages}쪽</span>${delta(T.views, P.views)}</div>
<div class="kpi"><small>평균 체류</small><b>${fmtDur(T.avgDur)}</b><span>화면이 보인 시간만 합산</span>${delta(T.avgDur, P.avgDur)}</div>
<div class="kpi"><small>한 쪽만 보고 이탈</small><b>${T.bounce}%</b><span>페이지 1개로 끝난 방문</span>${delta(T.bounce, P.bounce, { pctPoint: true, lowerBetter: true })}</div>
<div class="kpi"><small>상담 신청</small><b>${T.contacts}</b><span>전환율 ${T.conv}% (방문 대비)</span>${delta(T.contacts, P.contacts)}</div>
</div>
<p class="note" style="margin:-8px 0 16px">▲▼ 는 직전 ${days}일과 비교한 변화입니다.</p>
<div class="card"><h2>일별 방문 <span class="muted" style="font-weight:500">· 노란 점 = 상담 신청</span></h2><svg class="chart" viewBox="0 0 900 150" preserveAspectRatio="none">${bars}${labels}</svg>
${table(agg.daily.slice().reverse().slice(0, 14).map((d) => [d.date, d.sessions, d.visitors, d.views, d.contacts]), ['날짜', '방문', '방문자', '페이지뷰', '상담 신청'])}<p class="note">표는 최근 14일. 그래프는 선택한 기간 전체.</p></div>
<div class="card"><h2>상담까지의 흐름 (퍼널)</h2><div class="funnel">${funnelRows}</div><p class="note">방문 중 홈·분야·안내·칼럼·상담 페이지를 한 번이라도 본 방문의 수. 상담 신청은 신청서가 접수된 방문입니다.</p></div>
<div class="grid2">
<div class="card"><h2>유입 경로별 전환</h2>${convTable(agg.sources, '경로')}</div>
<div class="card"><h2>진입 페이지별 전환</h2>${convTable(agg.entries.map((r) => ({ ...r, key: r.key })), '처음 연 페이지', 12)}</div>
</div>
<div class="grid2">
<div class="card"><h2>기기별 전환</h2>${convTable(agg.devices, '기기')}</div>
<div class="card"><h2>진입 유형별 전환</h2>${convTable(agg.kinds, '처음 연 페이지 종류')}<p class="note">홈으로 들어온 방문과 검색으로 분야·안내·칼럼에 바로 들어온 방문의 전환을 비교합니다.</p></div>
</div>
${agg.campaigns.length ? `<div class="card"><h2>캠페인(UTM)별 전환</h2>${convTable(agg.campaigns, 'utm_source / medium / campaign', 20)}<p class="note">광고 링크에 ?utm_source=naver&utm_medium=cpc&utm_campaign=유류분 처럼 붙이면 여기에 잡힙니다.</p></div>` : ''}
<div class="card"><h2>많이 본 페이지</h2>${table(agg.pages.slice(0, 25).map((p) => [`${link(p.path)}<br><span class="muted">${esc(p.title)}</span>`, site === 'all' ? siteTag(p.site) : esc(p.kind), p.views, p.sessions, fmtDur(p.avgDur), p.avgDepth === null ? '-' : p.avgDepth + '%', p.exitRate + '%']), ['페이지', site === 'all' ? '사이트' : '종류', '페이지뷰', '방문', '평균 체류', '스크롤', '이탈률'])}<p class="note">스크롤 = 페이지를 어디까지 내려 봤는지 평균(100%면 끝까지). 이탈률 = 그 페이지를 마지막으로 보고 나간 비율.</p></div>
<div class="grid2">
<div class="card"><h2>칼럼 인기 글</h2>${table(agg.columns.map((p) => [`${link(p.path)}<br><span class="muted">${esc(p.title)}</span>`, p.views, fmtDur(p.avgDur), p.avgDepth === null ? '-' : p.avgDepth + '%']), ['글', '페이지뷰', '평균 체류', '스크롤'])}</div>
<div class="card"><h2>마지막으로 보고 나간 페이지 (이탈)</h2>${table(agg.exits.map(([k, n]) => [link(k), n, pct(n)]), ['페이지', '방문', '비율'])}</div>
</div>
<div class="grid2">
<div class="card"><h2>끝까지 읽는 페이지 / 금방 떠나는 페이지</h2>${table([...depthTop(agg.depthPages, 5), ...depthTop(agg.depthPages.slice().reverse(), 5)].map((p) => [link(p.path), p.views, p.avgDepth + '%', fmtDur(p.avgDur)]), ['페이지', '페이지뷰', '스크롤', '평균 체류'])}<p class="note">위 5개는 스크롤 깊이가 높은 페이지, 아래 5개는 낮은 페이지(페이지뷰 3 이상).</p></div>
<div class="card"><h2>요일별 방문 <span class="muted" style="font-weight:500">· 노란 숫자 = 상담 신청</span></h2><div class="hours">${wdBars}</div><h2 style="margin-top:18px">시간대별 방문 (0~23시)</h2><div class="hours">${hourBars}</div></div>
</div>
<div class="grid3">
<div class="card"><h2>브라우저</h2>${table(agg.browsers.slice(0, 8).map(([k, n]) => [esc(k), n, pct(n)]), ['브라우저', '방문', '비율'])}</div>
<div class="card"><h2>국가</h2>${table(agg.countries.slice(0, 8).map(([k, n]) => [esc(k), n, pct(n)]), ['국가', '방문', '비율'])}</div>
<div class="card"><h2>최근 상담 신청</h2>${table(agg.contactsList.map((c) => [kstTime(c.t), c.site ? siteTag(c.site) : (c.area === '부동산' ? siteTag('re') : siteTag('in')), esc(c.side || ''), esc(c.topic || '')]), ['시각', '사이트', '입장', '관련'])}</div>
</div>
<div class="card"><h2>최근 방문 흐름 (최근 60건)</h2>${table(recentRows, ['시각', '방문자', site === 'all' ? '사이트' : '유입', site === 'all' ? '유입' : '기기', '본 페이지와 체류시간·스크롤', '합계'])}<p class="note">방문자 칸은 브라우저가 만든 임의 식별값의 앞 6자입니다. 이름·IP는 기록하지 않습니다. 변호사님 본인 방문은 이 화면에 로그인한 브라우저에서는 제외됩니다.</p></div>
<footer>기록 위치: ${esc(DATA_DIR)} · 매월 파일 하나(events-YYYY-MM.jsonl). 검색엔진·메신저 미리보기 로봇은 제외. 스크롤 깊이는 2026.10.22 이후 기록부터. <a href="/">상속 홈</a> · <a href="/real-estate">부동산 홈</a> · <a href="/admin/">글 편집기</a></footer>
</div></body></html>`;
}
const depthTop = (arr, n) => arr.slice(0, n);

// ---- 통계 화면 로그인 세션 쿠키 ----
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
