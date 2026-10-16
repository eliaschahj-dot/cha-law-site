import raw from './posts.json';

export interface Post {
  logno: string;
  title: string;
  date: string;
  category: string;
  categoryNo: number;
  section: '상속' | '부동산' | '분쟁 절차' | '꿀팁' | null;
  tags: string[];
  excerpt: string;
  naverUrl: string;
  public: boolean;
  flags: string[];
  body: string | null;
}

export const posts = raw as Post[];
export const publicPosts = posts.filter((p) => p.public);

export const sections: { slug: string; name: Post['section']; label: string; desc: string }[] = [
  { slug: 'inheritance', name: '상속', label: '칼럼 · 상속', desc: '유류분, 상속재산분할, 유언, 성년후견, 상속등기, 상속세, 한정승인' },
  { slug: 'real-estate', name: '부동산', label: '칼럼 · 부동산', desc: '전세보증금, 분양계약, 매매, 명도, 재개발, 공사대금' },
  { slug: 'procedure', name: '분쟁 절차', label: '칼럼 · 분쟁 절차', desc: '가압류·가처분, 지급명령, 내용증명, 강제집행, 소멸시효' },
  { slug: 'tips', name: '꿀팁', label: '꿀팁 · 계약 체크리스트', desc: '전세·월세·매매 계약 전 확인할 것, 특약, 안전한 매물 고르기, 보증금 찾기' },
];

export const sectionBySlug = (slug: string) => sections.find((s) => s.slug === slug);
export const sectionSlug = (name: Post['section']) => sections.find((s) => s.name === name)?.slug ?? 'real-estate';
export const postPath = (p: Post) => `/columns/${p.logno}`;
export const fmtDate = (iso: string) => iso.replaceAll('-', '.');

export function related(tags: string[], limit = 6, exclude?: string): Post[] {
  const scored = publicPosts
    .filter((p) => p.logno !== exclude)
    .map((p) => ({ p, s: p.tags.filter((t) => tags.includes(t)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.p.date < b.p.date ? 1 : -1));
  return scored.slice(0, limit).map((x) => x.p);
}
