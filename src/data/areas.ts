// 업무 분야: 상속 9개(/{slug}) + 부동산 6개(/real-estate/{slug}). 원본은 src/content/areas/*.json, /admin(편집기)에서 고칠 수 있다.
// 2026.10.22 부동산 전문 하위 사이트(/real-estate)를 열면서 두 축(axis)을 함께 다룬다.
export type Axis = 'in' | 're';
export interface Area {
  axis: Axis; slug: string; name: string; short: string; lead: string;
  situations: string[]; steps: { t: string; d: string }[]; docs: string[]; faq: { q: string; a: string }[]; tags: string[];
  deadlines?: { k: string; v: string }[];
}

export const axisMeta = {
  in: { base: '', home: '/', hub: '/inheritance', contact: '/contact', name: '상속', gu: '상속 전문', hubLabel: '상속 업무 분야', sub: '물려주기 전의 설계, 물려받은 뒤의 분쟁' },
  re: { base: '/real-estate', home: '/real-estate', hub: '/real-estate#fields', contact: '/real-estate/contact', name: '부동산', gu: '부동산 전문', hubLabel: '부동산 업무 분야', sub: '계약부터 명도까지, 돈과 집을 돌려받는 일' },
} as const;

/** 상단 메뉴·홈 순서 */
export const ORDER = ['dispute', 'contribution', 'special-benefit', 'legal-reserve', 'renunciation', 'guardianship', 'will', 'registration', 'tax'];
export const RE_ORDER = ['deposit', 'sale', 'lease', 'presale', 'redevelopment', 'construction'];
/** 홈 '분야' 섹션: 물려주기 전(설계) / 물려받은 뒤(분쟁) */
export const PLAN_SLUGS = ['will', 'guardianship', 'tax'];
export const DISPUTE_SLUGS = ['dispute', 'contribution', 'special-benefit', 'legal-reserve', 'renunciation', 'registration'];

const modules = import.meta.glob<{ default: Area }>('../content/areas/*.json', { eager: true });
const loaded: Area[] = Object.values(modules).map((m) => m.default);
const rank = (a: Area) => { const o = a.axis === 're' ? RE_ORDER : ORDER; const i = o.indexOf(a.slug); return i === -1 ? 99 : i; };

/** 두 축 전체 */
export const allAreas: Area[] = [...loaded].sort((a, b) => (a.axis === b.axis ? rank(a) - rank(b) : a.axis === 'in' ? -1 : 1));
/** 상속 분야(기존 이름 유지: 상속 사이트의 페이지·메뉴가 이 배열을 쓴다) */
export const areas: Area[] = allAreas.filter((a) => a.axis === 'in');
/** 부동산 분야 */
export const reAreas: Area[] = allAreas.filter((a) => a.axis === 're');
export const byAxis = (axis: Axis = 'in') => (axis === 're' ? reAreas : areas);
export const bySlugs = (slugs: string[]) => slugs.map((s) => areas.find((a) => a.slug === s)).filter(Boolean) as Area[];
export const areaPath = (a: Pick<Area, 'slug' | 'axis'>) => `${axisMeta[a.axis ?? 'in'].base}/${a.slug}`;
