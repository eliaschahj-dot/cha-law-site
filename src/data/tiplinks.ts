// 꿀팁 칼럼(세입자·계약 정보글) → 부동산 하위 사이트의 분쟁 안내 페이지 연결(2026.11.06).
// 구글로 들어오는 꿀팁 독자는 선임 의도가 낮으므로, 글 중간과 끝에서 "이 문제로 분쟁이 생겼다면" 상자로 안내 페이지에 잇는다.
export interface TipLink { href: string; label: string; desc: string; topic: string }

const L = {
  gagyeyak: { href: '/real-estate/situations/gagyeyak', label: '가계약금을 보냈는데 집주인이 마음을 바꿨을 때', desc: '가계약금이 계약금인지, 돌려받을 수 있는지, 배액으로 받을 수 있는지는 문자 한 줄로 갈립니다.', topic: '매매' },
  premium: { href: '/real-estate/situations/premium', label: '상가 권리금을 못 받고 나가게 될 때', desc: '임대인이 새 임차인을 거절하거나 직접 쓰겠다고 하면 권리금 회수 기회 방해가 됩니다. 만료 6개월 전부터가 승부처입니다.', topic: '임대차' },
  eviction: { href: '/real-estate/guide/eviction', label: '명도소송 절차와 기간: 점유이전금지가처분부터 강제집행까지', desc: '차임을 두 달 넘게 밀리거나 만기 뒤에도 나가지 않으면, 가처분과 명도소송으로 집을 돌려받는 순서가 있습니다.', topic: '임대차' },
  defects: { href: '/real-estate/situations/defects', label: '신축 아파트·빌라에 누수·균열이 있을 때', desc: '하자 사진과 날짜를 남기는 것부터 담보책임 기간, 하자보수와 손해배상 청구까지 순서대로 안내합니다.', topic: '공사' },
  presale: { href: '/real-estate/guide/presale-cancel', label: '분양계약 해제·계약금 반환 절차: 광고물 확보부터 소송까지', desc: '광고와 다른 분양, 중도금 연체, 입주 지연. 계약금을 돌려받을 수 있는 경우와 절차를 정리했습니다.', topic: '분양' },
  landlord: { href: '/real-estate/situations/landlord-changed', label: '집주인이 바뀌었는데 보증금이 걱정될 때', desc: '새 집주인에게 보증금 반환 의무가 넘어가는지, 계약을 끝내고 나갈 수 있는지, 임차권등기는 언제 하는지 안내합니다.', topic: '전세보증금' },
  deposit: { href: '/real-estate/guide/deposit-steps', label: '전세보증금을 못 받았을 때 순서: 임차권등기명령부터 경매 배당까지', desc: '내용증명, 임차권등기명령, 지급명령·소송, 경매 배당. 이사 전에 해 둘 것과 순서를 정리했습니다.', topic: '전세보증금' },
  checklist: { href: '/real-estate/guide/lease-checklist', label: '전세 계약 전 등기부·특약 체크리스트', desc: '근저당 채권최고액, 선순위 세입자, 집주인 체납, 특약 문구. 계약서에 도장 찍기 전에 볼 것을 정리했습니다.', topic: '전세보증금' },
  hub: { href: '/real-estate/situations', label: '이런 상황이라면: 부동산 분쟁 상황별 안내', desc: '보증금·계약금·명도·분양·하자. 지금 상황에 맞는 안내와 기한을 먼저 확인하세요.', topic: '' },
} satisfies Record<string, TipLink>;

const RULES: [RegExp, TipLink][] = [
  [/가계약/, L.gagyeyak],
  [/권리금/, L.premium],
  [/명도|내보내|강제집행|차임.*연체|월세.*(연체|밀린|안 ?내)|세입자.*(안 ?나가|퇴거)/, L.eviction],
  [/하자|누수|균열/, L.defects],
  [/분양|현금청산|청약/, L.presale],
  [/집주인.*(바뀌|바뀐|변경)|임대인.*(변경|바뀌)|전세.?안고|매매.*세입자/, L.landlord],
  [/보증금.*(못|안|반환|돌려|떼)|전세사기|임차권등기|경매|배당/, L.deposit],
  [/전세|등기부|특약|확정일자|전입신고|융자|근저당|월세|계약서|중개|복비|임대차|자취|원룸|오피스텔/, L.checklist],
];

/** 꿀팁 글의 제목·키워드·태그로 가장 가까운 분쟁 안내 페이지를 고른다 */
export function tipLinkOf(p: { title: string; keyword?: string; tags?: string[] }): TipLink {
  const text = [p.title, p.keyword ?? '', ...(p.tags ?? [])].join(' ');
  for (const [re, link] of RULES) if (re.test(text)) return link;
  return L.hub;
}
