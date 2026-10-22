// 안내 페이지: 절차 가이드(/guide/…)와 상황별 안내(/situations/…). 원본은 src/content/guides/*.json, /admin 에서 고칠 수 있다.
// 2026.10.22 부동산 하위 사이트용(site: 're')은 /real-estate/guide/…, /real-estate/situations/… 로 열린다.
import { site } from './site';

export type GuideSite = 'in' | 're';
export interface GuideSection { h: string; p: string[]; list?: string[] }
export interface Guide {
  slug: string; kind: 'guide' | 'situation'; site?: GuideSite; updated: string;
  title: string; seoTitle?: string; desc: string; eyebrow: string; lead: string;
  keywords: string[]; areas: string[]; tags: string[];
  deadlines: { k: string; v: string }[]; sections: GuideSection[]; faq: { q: string; a: string }[];
}

const ORDER: Record<GuideSite, Record<'guide' | 'situation', string[]>> = {
  in: { guide: ['after-death', 'estate-search', 'division-agreement', 'will-writing'], situation: ['siblings', 'dementia-parent', 'stepmother', 'out-of-wedlock'] },
  re: { guide: ['deposit-steps', 'lease-checklist', 'eviction', 'presale-cancel'], situation: ['landlord-changed', 'gagyeyak', 'premium', 'defects'] },
};

const modules = import.meta.glob<{ default: Guide }>('../content/guides/*.json', { eager: true });
const loaded: Guide[] = Object.values(modules).map((m) => ({ ...m.default, site: m.default.site ?? 'in' }));
const siteOf = (g: Guide): GuideSite => g.site ?? 'in';
const rank = (g: Guide) => { const i = ORDER[siteOf(g)][g.kind].indexOf(g.slug); return i === -1 ? 99 : i; };

export const guides: Guide[] = [...loaded].sort((a, b) => (siteOf(a) === siteOf(b) ? rank(a) - rank(b) : siteOf(a) === 'in' ? -1 : 1));
export const guidesOf = (s: GuideSite) => guides.filter((g) => siteOf(g) === s);
/** 상속 사이트 */
export const procedureGuides = guidesOf('in').filter((g) => g.kind === 'guide');
export const situationGuides = guidesOf('in').filter((g) => g.kind === 'situation');
/** 부동산 사이트 */
export const reProcedureGuides = guidesOf('re').filter((g) => g.kind === 'guide');
export const reSituationGuides = guidesOf('re').filter((g) => g.kind === 'situation');

export const siteMeta: Record<GuideSite, { home: string; contact: string; field: string; guideHub: string; situationHub: string }> = {
  in: { home: '/', contact: '/contact', field: '상속', guideHub: '/guide', situationHub: '/situations' },
  re: { home: '/real-estate', contact: '/real-estate/contact', field: '부동산', guideHub: '/real-estate/guide', situationHub: '/real-estate/situations' },
};
export const hubOf = (g: Pick<Guide, 'kind' | 'site'>) => {
  const m = siteMeta[g.site ?? 'in'];
  return g.kind === 'guide' ? { href: m.guideHub, label: `${m.field} 절차 안내` } : { href: m.situationHub, label: '이런 상황이라면' };
};
export const guidePath = (g: Pick<Guide, 'kind' | 'slug' | 'site'>) => `${hubOf(g).href}/${g.slug}`;

/** Article + FAQPage 구조화 데이터 */
export const guideLd = (g: Guide) => [
  {
    '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.desc, inLanguage: 'ko',
    datePublished: g.updated, dateModified: g.updated, keywords: g.keywords.join(', '),
    mainEntityOfPage: { '@type': 'WebPage', '@id': new URL(guidePath(g), site.url).href },
    author: { '@type': 'Person', name: '차형진', jobTitle: site.role, url: new URL(siteOf(g) === 're' ? '/real-estate/lawyer' : '/inheritance-lawyer', site.url).href, worksFor: { '@type': 'LegalService', name: site.firm } },
    publisher: { '@type': 'Person', name: '차형진 변호사', url: site.url },
  },
  ...(g.faq.length > 0 ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
];
