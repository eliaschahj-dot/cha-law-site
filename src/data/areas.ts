// 업무 분야 13개는 src/content/areas/*.json 에 있고 /admin(편집기)에서 고칠 수 있다.
export type Axis = 're' | 'in';
export interface Area {
  axis: Axis; slug: string; name: string; short: string; lead: string;
  situations: string[]; steps: { t: string; d: string }[]; docs: string[]; faq: { q: string; a: string }[]; tags: string[];
}

export const axisMeta = {
  re: { base: '/real-estate', name: '부동산', gu: '갑구 · 소유권', sub: '계약부터 명도까지, 돈과 집을 돌려받는 일' },
  in: { base: '/inheritance', name: '상속', gu: '갑구 · 상속', sub: '물려주기 전의 설계, 물려받은 뒤의 분쟁' },
} as const;

const ORDER: Record<Axis, string[]> = {
  re: ['deposit', 'presale', 'sale', 'lease', 'redevelopment', 'construction'],
  in: ['legal-reserve', 'division', 'will', 'guardianship', 'registration', 'tax', 'debt'],
};

const modules = import.meta.glob<{ default: Area }>('../content/areas/*.json', { eager: true });
const loaded: Area[] = Object.values(modules).map((m) => m.default);
const rank = (a: Area) => { const i = ORDER[a.axis].indexOf(a.slug); return i === -1 ? 99 : i; };

export const areas: Area[] = [...loaded].sort((a, b) => (a.axis === b.axis ? rank(a) - rank(b) : a.axis === 're' ? -1 : 1));
export const byAxis = (axis: Axis) => areas.filter((a) => a.axis === axis);
export const areaPath = (a: Area) => `${axisMeta[a.axis].base}/${a.slug}`;
