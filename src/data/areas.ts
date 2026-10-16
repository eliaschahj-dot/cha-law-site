// 상속 분야 7개(키워드 랜딩 페이지)는 src/content/areas/*.json 에 있고 /admin(편집기)에서 고칠 수 있다.
export type Axis = 'in';
export interface Area {
  axis: Axis; slug: string; name: string; short: string; lead: string;
  situations: string[]; steps: { t: string; d: string }[]; docs: string[]; faq: { q: string; a: string }[]; tags: string[];
  deadlines?: { k: string; v: string }[];
}

export const axisMeta = {
  in: { base: '', hub: '/inheritance', name: '상속', gu: '상속 전문', sub: '물려주기 전의 설계, 물려받은 뒤의 분쟁' },
} as const;

/** 상단 메뉴·홈 순서 */
export const ORDER = ['dispute', 'legal-reserve', 'renunciation', 'guardianship', 'will', 'registration', 'tax'];
/** 홈 '분야' 섹션: 물려주기 전(설계) / 물려받은 뒤(분쟁) */
export const PLAN_SLUGS = ['will', 'guardianship', 'tax'];
export const DISPUTE_SLUGS = ['dispute', 'legal-reserve', 'renunciation', 'registration'];

const modules = import.meta.glob<{ default: Area }>('../content/areas/*.json', { eager: true });
const loaded: Area[] = Object.values(modules).map((m) => m.default);
const rank = (a: Area) => { const i = ORDER.indexOf(a.slug); return i === -1 ? 99 : i; };

export const areas: Area[] = [...loaded].sort((a, b) => rank(a) - rank(b));
export const byAxis = (_axis: Axis = 'in') => areas;
export const bySlugs = (slugs: string[]) => slugs.map((s) => areas.find((a) => a.slug === s)).filter(Boolean) as Area[];
export const areaPath = (a: Pick<Area, 'slug'>) => `/${a.slug}`;
