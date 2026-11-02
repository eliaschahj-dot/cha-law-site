// 재작성된 칼럼의 옛 주소(logNo) → 새 영문 슬러그. server.js 가 시작할 때 dist/columns-redirects.json 을 읽어 301 로 돌린다.
import type { APIRoute } from 'astro';
import { getColumns } from '../data/posts';

export const GET: APIRoute = async () => {
  const map: Record<string, string> = {};
  // 프런트매터 slug 가 있으면 Astro 가 entry.id 자체를 slug 로 바꾸므로, 옛 주소는 naverLogno 로 찾는다
  for (const p of await getColumns()) { const old = String(p.entry.data.naverLogno || p.entry.data.oldId || ''); if (p.slug && old && old !== p.slug) map[old] = p.slug; }
  return new Response(JSON.stringify(map), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
