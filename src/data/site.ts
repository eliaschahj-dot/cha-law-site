// 사이트 설정은 src/content/site/*.json 에 있고 /admin(편집기)에서 고칠 수 있다. 이 파일은 그 JSON을 읽어 내보내기만 한다.
import siteJson from '../content/site/site.json';
import trustJson from '../content/site/trust.json';
import bioJson from '../content/site/bio.json';
import pressJson from '../content/site/press.json';
import faqJson from '../content/site/faq.json';

export const site = siteJson as {
  name: string; tagline: string; url: string; description: string; firm: string; role: string; bar: string;
  phone: string; phoneHref: string; email: string; emailHref: string; blog: string;
  address: string; transit: string; parking: string; hours: string; closed: string; reply: string;
  naverVerify?: string; googleVerify?: string;
};

export const nav = [
  { href: '/inheritance-lawyer', label: '상속 전문 변호사' },
  { href: '/legal-reserve', label: '유류분' },
  { href: '/renunciation', label: '상속포기' },
  { href: '/guardianship', label: '성년후견인' },
  { href: '/will', label: '유언' },
  { href: '/columns', label: '칼럼' },
  { href: '/fees', label: '비용' },
];
export const footerNav = [
  { href: '/inheritance', label: '상속 분야 전체' },
  { href: '/dispute', label: '상속분쟁' },
  { href: '/registration', label: '상속등기 · 명의신탁' },
  { href: '/tax', label: '상속세 · 증여 설계' },
  { href: '/contribution', label: '기여분' },
  { href: '/special-benefit', label: '특별수익 · 생전증여' },
  { href: '/gangnam', label: '강남 상속변호사' },
  { href: '/guide', label: '상속 절차 안내' },
  { href: '/situations', label: '이런 상황이라면' },
  { href: '/columns/tag', label: '칼럼 주제별 모음' },
  { href: '/faq', label: '자주 묻는 질문' },
  { href: '/glossary', label: '상속 용어 사전' },
  { href: '/press', label: '언론 · 활동' },
];

// 부동산 전문 하위 사이트(/real-estate) 메뉴. 2026.10.22
export const reNav = [
  { href: '/real-estate/lawyer', label: '부동산 전문 변호사' },
  { href: '/real-estate/deposit', label: '전세보증금' },
  { href: '/real-estate/sale', label: '매매 · 계약금' },
  { href: '/real-estate/lease', label: '임대차 · 명도' },
  { href: '/real-estate/presale', label: '분양' },
  { href: '/real-estate/columns', label: '칼럼' },
  { href: '/real-estate/fees', label: '비용' },
];
export const reFooterNav = [
  { href: '/real-estate', label: '부동산 홈' },
  { href: '/real-estate/redevelopment', label: '재개발 · 재건축' },
  { href: '/real-estate/construction', label: '공사대금 · 하자' },
  { href: '/real-estate/faq', label: '자주 묻는 질문' },
  { href: '/real-estate/guide', label: '부동산 절차 안내' },
  { href: '/real-estate/situations', label: '이런 상황이라면' },
  { href: '/columns/topic/tips', label: '등기부 · 계약 체크리스트' },
  { href: '/columns/tag', label: '칼럼 주제별 모음' },
  { href: '/press', label: '언론 · 활동' },
];
/** 레이아웃(Base.astro)이 쓰는 사이트 변형: in = 상속(기본, /), re = 부동산(/real-estate) */
export type Variant = 'in' | 're';
export const variants: Record<Variant, { key: Variant; home: string; contact: string; brandSub: string; field: string; nav: typeof nav; footerNav: typeof footerNav; description: string; og: string; knowsAbout: string[]; other: { href: string; label: string }; tagline: string }> = {
  in: { key: 'in', home: '/', contact: '/contact', brandSub: '상속', field: '상속', nav, footerNav, description: site.description, og: '/og.png', tagline: site.tagline,
    knowsAbout: ['상속재산분할', '기여분', '유류분', '상속포기', '한정승인', '성년후견', '유언', '상속등기', '상속세'], other: { href: '/real-estate', label: '부동산 전문 홈페이지' } },
  re: { key: 're', home: '/real-estate', contact: '/real-estate/contact', brandSub: '부동산', field: '부동산', nav: reNav, footerNav: reFooterNav, og: '/og-re.png', tagline: '전세금도 계약금도, 돌려받는 일만큼은 자신 있습니다',
    description: '전세보증금 반환, 계약금 분쟁, 명도, 분양, 재개발, 공사대금·하자. 건축학과 법학을 함께 공부한 부동산 전문 변호사 차형진(법무법인 베율 부대표)이 등기부·계약서·도면을 직접 읽고 상담·서면·재판을 직접 합니다.',
    knowsAbout: ['전세보증금 반환', '전세사기', '매매계약', '계약금', '임대차', '명도소송', '권리금', '분양계약', '재개발', '재건축', '현금청산', '공사대금', '하자'], other: { href: '/', label: '상속 전문 홈페이지' } },
};
export const variantOfPath = (path: string): Variant => (path === '/real-estate' || path.startsWith('/real-estate/') ? 're' : 'in');

export const trust = trustJson.items as { k: string; v: string; s: string; n?: number; unit?: string }[];
export const bio = bioJson as { quote: string; intro: string; education: string[]; career: string[]; activity: string[]; awards: string[] };
export const press = pressJson.items as { date: string; outlet: string; title: string; url: string; pick?: boolean; summary?: string }[];
export const pressOutlets = pressJson.outlets as string[];
export const activities = pressJson.activities as { k: string; v: string; s: string }[];
export const faq = faqJson.home as { q: string; a: string }[];
export const feeFaq = faqJson.fees as { q: string; a: string }[];
