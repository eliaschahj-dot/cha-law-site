import { getCollection, type CollectionEntry } from 'astro:content';
import { reviewHits } from '../lib/review';

export interface Post {
  id: string;            // URL 조각 (네이버 글은 logNo)
  title: string;
  date: string;          // YYYY-MM-DD
  section: string;       // 상속 | 부동산 | 분쟁 절차 | 꿀팁 | 비공개
  category: string;
  tags: string[];
  excerpt: string;
  naverUrl: string;
  source: string;
  public: boolean;       // 목록·페이지 생성 여부
  review: string[];      // 비어 있지 않으면 전문 대신 요약만
  full: boolean;         // 전문 게재 가능
  entry: CollectionEntry<'columns'>;
}

export const sections: { slug: string; name: string; label: string; desc: string }[] = [
  { slug: 'inheritance', name: '상속', label: '칼럼 · 상속', desc: '유류분, 상속재산분할, 유언, 성년후견, 상속등기, 상속세, 한정승인' },
  { slug: 'real-estate', name: '부동산', label: '칼럼 · 부동산', desc: '전세보증금, 분양계약, 매매, 명도, 재개발, 공사대금' },
  { slug: 'procedure', name: '분쟁 절차', label: '칼럼 · 분쟁 절차', desc: '가압류·가처분, 지급명령, 내용증명, 강제집행, 소멸시효' },
  { slug: 'tips', name: '꿀팁', label: '꿀팁 · 계약 체크리스트', desc: '전세·월세·매매 계약 전 확인할 것, 특약, 안전한 매물 고르기, 보증금 찾기' },
];
export const sectionBySlug = (slug: string) => sections.find((s) => s.slug === slug);
export const sectionSlug = (name: string) => sections.find((s) => s.name === name)?.slug ?? 'real-estate';
export const postPath = (p: Pick<Post, 'id'>) => `/columns/${p.id}`;
export const fmtDate = (iso: string) => iso.replaceAll('-', '.');

let cache: Promise<Post[]> | null = null;

/** 모든 글(비공개 포함). 빌드 중 한 번만 읽는다. */
export function getColumns(): Promise<Post[]> {
  if (!cache) {
    cache = getCollection('columns').then((entries) => {
      const posts = entries.map((entry) => {
        const d = entry.data;
        const hits = new Set<string>([...d.review, ...reviewHits(entry.body ?? '')]);
        const titleHits = reviewHits(d.title);
        titleHits.forEach((h) => hits.add(h));
        const review = [...hits];
        const isPublic = d.public && d.section !== '비공개' && titleHits.length === 0;
        return {
          id: entry.id,
          title: d.title,
          date: d.date.toISOString().slice(0, 10),
          section: d.section,
          category: d.category,
          tags: d.tags,
          excerpt: d.excerpt,
          naverUrl: d.naverUrl,
          source: d.source,
          public: isPublic,
          review,
          full: review.length === 0 && (entry.body ?? '').trim().length > 0,
          entry,
        } satisfies Post;
      });
      posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
      return posts;
    });
  }
  return cache;
}

export async function getPublicColumns(): Promise<Post[]> {
  return (await getColumns()).filter((p) => p.public);
}

export function related(posts: Post[], tags: string[], limit = 6, exclude?: string): Post[] {
  return posts
    .filter((p) => p.id !== exclude)
    .map((p) => ({ p, s: p.tags.filter((t) => tags.includes(t)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.p.date < b.p.date ? 1 : -1))
    .slice(0, limit)
    .map((x) => x.p);
}
