// 사이트 설정은 src/content/site/*.json 에 있고 /admin(편집기)에서 고칠 수 있다. 이 파일은 그 JSON을 읽어 내보내기만 한다.
import siteJson from '../content/site/site.json';
import trustJson from '../content/site/trust.json';
import bioJson from '../content/site/bio.json';
import pressJson from '../content/site/press.json';
import faqJson from '../content/site/faq.json';

export const site = siteJson as {
  name: string; tagline: string; url: string; description: string; firm: string; role: string; bar: string;
  phone: string; phoneHref: string; kakaoName: string; kakaoUrl: string; blog: string;
  address: string; transit: string; parking: string; hours: string; closed: string; reply: string;
};

export const nav = [
  { href: '/dispute', label: '상속분쟁' },
  { href: '/legal-reserve', label: '유류분' },
  { href: '/renunciation', label: '상속포기' },
  { href: '/guardianship', label: '성년후견인' },
  { href: '/will', label: '유언' },
  { href: '/columns', label: '칼럼' },
  { href: '/about', label: '변호사 소개' },
  { href: '/fees', label: '비용' },
];
export const footerNav = [
  { href: '/inheritance', label: '상속 분야 전체' },
  { href: '/registration', label: '상속등기 · 명의신탁' },
  { href: '/tax', label: '상속세 · 증여 설계' },
  { href: '/press', label: '언론 · 활동' },
  { href: '/contact', label: '상담 예약' },
];

export const trust = trustJson.items as { k: string; v: string; s: string; n?: number; unit?: string }[];
export const bio = bioJson as { quote: string; intro: string; education: string[]; career: string[]; activity: string[]; awards: string[] };
export const press = pressJson.items as { date: string; outlet: string; title: string; url: string; pick?: boolean; summary?: string }[];
export const pressOutlets = pressJson.outlets as string[];
export const activities = pressJson.activities as { k: string; v: string; s: string }[];
export const faq = faqJson.home as { q: string; a: string }[];
export const feeFaq = faqJson.fees as { q: string; a: string }[];
