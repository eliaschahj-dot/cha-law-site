// 칼럼 RSS (네이버 서치어드바이저 RSS 제출용). 전문 게재 글만, 최신 50편.
import type { APIRoute } from 'astro';
import { getPublicColumns, postPath } from '../data/posts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.href ?? 'https://www.lawyer-cha.com/').replace(/\/$/, '');
  const posts = (await getPublicColumns()).filter((p) => p.full).slice(0, 50);
  const items = posts.map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${origin}${postPath(p)}</link>
      <guid isPermaLink="true">${origin}${postPath(p)}</guid>
      <pubDate>${new Date(p.date + 'T09:00:00+09:00').toUTCString()}</pubDate>
      <category>${esc(p.section)}</category>
      <description>${esc(p.excerpt || p.title)}</description>
    </item>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>차형진 변호사 상속 칼럼</title>
    <link>${origin}/columns</link>
    <atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml" />
    <description>상속분쟁·유류분·상속포기·성년후견·유언 — 상속 전문 변호사 차형진이 직접 쓰는 칼럼</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
