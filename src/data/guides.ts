// 안내 페이지: 절차 가이드(/guide/…)와 상황별 안내(/situations/…). 원본은 src/content/guides/*.json, /admin 에서 고칠 수 있다.
import { site } from './site';

export interface GuideSection { h: string; p: string[]; list?: string[] }
export interface Guide {
  slug: string; kind: 'guide' | 'situation'; updated: string;
  title: string; seoTitle?: string; desc: string; eyebrow: string; lead: string;
  keywords: string[]; areas: string[]; tags: string[];
  deadlines: { k: string; v: string }[]; sections: GuideSection[]; faq: { q: string; a: string }[];
}

const GUIDE_ORDER = ['after-death', 'estate-search', 'division-agreement', 'will-writing'];
const SITUATION_ORDER = ['siblings', 'dementia-parent', 'stepmother', 'out-of-wedlock'];

const modules = import.meta.glob<{ default: Guide }>('../content/guides/*.json', { eager: true });
const loaded: Guide[] = Object.values(modules).map((m) => m.default);
const rank = (g: Guide) => { const o = g.kind === 'guide' ? GUIDE_ORDER : SITUATION_ORDER; const i = o.indexOf(g.slug); return i === -1 ? 99 : i; };

export const guides: Guide[] = [...loaded].sort((a, b) => rank(a) - rank(b));
export const procedureGuides = guides.filter((g) => g.kind === 'guide');
export const situationGuides = guides.filter((g) => g.kind === 'situation');
export const hubOf = (g: Pick<Guide, 'kind'>) => (g.kind === 'guide' ? { href: '/guide', label: '상속 절차 안내' } : { href: '/situations', label: '이런 상황이라면' });
export const guidePath = (g: Pick<Guide, 'kind' | 'slug'>) => `${hubOf(g).href}/${g.slug}`;

/** Article + FAQPage 구조화 데이터 */
export const guideLd = (g: Guide) => [
  {
    '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.desc, inLanguage: 'ko',
    datePublished: g.updated, dateModified: g.updated, keywords: g.keywords.join(', '),
    mainEntityOfPage: { '@type': 'WebPage', '@id': new URL(guidePath(g), site.url).href },
    author: { '@type': 'Person', name: '차형진', jobTitle: site.role, url: new URL('/inheritance-lawyer', site.url).href, worksFor: { '@type': 'LegalService', name: site.firm } },
    publisher: { '@type': 'Person', name: '차형진 변호사', url: site.url },
  },
  ...(g.faq.length > 0 ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
];
