/**
 * 광고규정상 사람이 판단해야 하는 표현 탐지 (scripts/content_tools.py 의 REVIEW_TERMS 와 같은 규칙).
 * 빌드 때 모든 글 본문을 다시 검사해, 한 건이라도 걸리면 전문 대신 요약만 싣는다.
 */
export const REVIEW_TERMS: [string, RegExp][] = [
  ['무료 상담', /무료\s*(법률\s*)?(상담|진단|검토|변호)|상담[^.]{0,6}무료/],
  ['착수금 없음', /착수금[^.]{0,15}(없|받지\s*않|0\s*원)|(없는|무)\s*착수금/],
  ['성공보수 없음', /성공\s*보수[^.]{0,15}(없|받지\s*않)|(없는|무)\s*성공\s*보수/],
  ['승소 보장', /승소\s*(율|확률|보장|가능성이\s*(높|확실))|반드시\s*승소|무조건\s*승소|승소[를을]\s*보장/],
  ['결과 보장', /(승소|결과|성공|해결|회수)[을를]?\s*보장|보장(합니다|해\s*드리|하겠)/],
  ['100% 주장', /100\s*%\s*(승소|환불|성공|보장|회수|해결)/],
  ['최고 표현', /최고의\s*(변호사|로펌|법률사무소|전문가|실력)|최고[를을]\s*자랑/],
  ['유일 표현', /유일(한|하게)\s*[^.]{0,12}(변호사|로펌|법률사무소|전문가)/],
  ['전담 표시', /전담\s*(센터|팀|변호사)/],
  ['수치 주장', /하루\s*\d+\s*명|누적\s*[\d,]+\s*(건|명)|\d+\s*명이\s*넘는/],
];
const COMPANY = /온트랙|ontrack|theirlaw|온전\s*법률사무소|온전함|온전㈜|onjeon/i;

export function plainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 본문에서 걸린 항목 이름 목록 (회사 상호 노출 포함) */
export function reviewHits(md: string): string[] {
  const text = plainText(md);
  const hits = new Set<string>();
  for (const [name, re] of REVIEW_TERMS) if (re.test(text)) hits.add(name);
  if (COMPANY.test(text)) hits.add('회사 상호');
  return [...hits];
}
