# -*- coding: utf-8 -*-
"""
칼럼 콘텐츠 공용 도구 — 아카이브 마크다운(네이버 변환본)을 사이트 콘텐츠(src/content/columns/*.md)로 바꾼다.
- 회사 상호 문단·CTA 문단 제거, 이미지 경로 치환(/columns/{logno}/NN.webp), 내부 링크 치환
- 광고규정 검토 표현 탐지(사람이 판단할 문장) → 프런트매터 review 로 기록 (빌드 때도 같은 규칙으로 다시 검사)
migrate_archive_to_content.py(일회성 이전)와 naver_sync.py(일일 동기화)가 함께 쓴다.
"""
import re, json, html, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "src" / "content" / "columns"
OUT_IMG = ROOT / "public" / "columns"

SECTION = {  # 네이버 카테고리 번호 → 사이트 코너 (None = 비공개)
    22: "상속", 19: "부동산", 20: "부동산", 21: "부동산", 23: "분쟁 절차",
    7: "꿀팁", 9: "꿀팁", 16: "꿀팁", 18: "꿀팁", 11: "꿀팁", 17: "꿀팁",
    14: None, 24: None,
}
TAGS = [
    ("유류분", ["유류분"]), ("상속재산분할", ["상속재산분할", "재산분할", "기여분", "특별수익"]), ("유언", ["유언"]),
    ("성년후견", ["성년후견", "후견", "치매"]), ("상속등기", ["상속등기", "명의신탁", "종중", "금양임야", "선산"]),
    ("상속세", ["상속세", "증여세", "증여"]), ("상속포기·한정승인", ["한정승인", "상속포기", "상속 포기", "특별한정승인", "상속 빚", "상속채무"]),
    ("전세보증금", ["전세", "보증금", "임차권", "전세사기", "임대인"]), ("분양", ["분양", "분양권", "모델하우스", "중도금"]),
    ("매매계약", ["매매", "계약금", "잔금", "배액", "가계약"]), ("임대차·명도", ["명도", "월세", "임대차", "권리금", "차임", "갱신"]),
    ("재개발·재건축", ["재개발", "재건축", "조합", "현금청산", "매도청구", "관리처분"]), ("공사대금·하자", ["공사대금", "하자", "누수", "유치권", "지체상금"]),
    ("보전처분·집행", ["가압류", "가처분", "지급명령", "내용증명", "강제집행", "압류", "소멸시효", "경매", "배당"]),
    ("등기", ["등기부", "등기", "근저당", "소유권이전"]), ("계약 체크리스트", ["특약", "체크", "확인", "조회", "주의"]),
]
COMPANY = re.compile(r"온트랙|ontrack|theirlaw|온전\s*법률사무소|온전함|온전\s*\(|온전㈜|onjeon", re.I)
PHONE = re.compile(r"0\d{1,2}-\d{3,4}-\d{4}")
CTA_WORDS = re.compile(r"상담|문의|연락|신청")
REVIEW_TERMS = [
    ("무료 상담", r"무료\s*(법률\s*)?(상담|진단|검토|변호)|상담[^.]{0,6}무료"),
    ("착수금 없음", r"착수금[^.]{0,15}(없|받지\s*않|0\s*원)|(없는|무)\s*착수금"),
    ("성공보수 없음", r"성공\s*보수[^.]{0,15}(없|받지\s*않)|(없는|무)\s*성공\s*보수"),
    ("승소 보장", r"승소\s*(율|확률|보장|가능성이\s*(높|확실))|반드시\s*승소|무조건\s*승소|승소[를을]\s*보장"),
    ("결과 보장", r"(승소|결과|성공|해결|회수)[을를]?\s*보장|보장(합니다|해\s*드리|하겠)"),
    ("100% 주장", r"100\s*%\s*(승소|환불|성공|보장|회수|해결)"),
    ("최고 표현", r"최고의\s*(변호사|로펌|법률사무소|전문가|실력)|최고[를을]\s*자랑"),
    ("유일 표현", r"유일(한|하게)\s*[^.]{0,12}(변호사|로펌|법률사무소|전문가)"),
    ("전담 표시", r"전담\s*(센터|팀|변호사)"),
    ("수치 주장", r"하루\s*\d+\s*명|누적\s*[\d,]+\s*(건|명)|\d+\s*명이\s*넘는"),
]

def parse_front(txt: str):
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    if not m:
        return {}, txt
    fm_raw, body = m.group(1), txt[m.end():]
    fm, key = {}, None
    for line in fm_raw.splitlines():
        mk = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if mk:
            key, val = mk.group(1), mk.group(2).strip()
            fm[key] = [] if val == "" else val.strip('"')
        elif line.strip().startswith("- ") and key is not None and isinstance(fm.get(key), list):
            fm[key].append(line.strip()[2:].strip().strip('"'))
    return fm, body

def sanitize(md: str):
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    kept, removed = [], 0
    for b in re.split(r"\n\s*\n", md.strip()):
        s = b.strip()
        if not s:
            continue
        if COMPANY.search(s) or (PHONE.search(s) and CTA_WORDS.search(s)):
            removed += 1
            continue
        kept.append(s)
    return "\n\n".join(kept), removed

def plain_text(md: str) -> str:
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", md)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"[#>*_`]", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()

def review_hits(text: str):
    hits = []
    sentences = re.split(r"(?<=[.!?다요])\s+", text)
    for name, pat in REVIEW_TERMS:
        for s in sentences:
            if re.search(pat, s):
                hits.append((name, s.strip()[:140]))
                break
    return hits

def auto_tags(title: str):
    return [name for name, kws in TAGS if any(k in title for k in kws)]

def excerpt_of(md: str, limit=180) -> str:
    t = plain_text(md)
    t = re.sub(r"^안녕하세요[^.]*차형진입니다\.?\s*", "", t)
    t = re.sub(r"^안녕하세요[,.]?\s*", "", t)
    return (t[:limit - 2].rstrip() + "…") if len(t) > limit else t

def convert_images(logno: str, files, src_dir: pathlib.Path):
    """원본 이미지(files: 파일명 목록, src_dir 안)를 최대 1200px WebP로 public/columns/{logno}/NN.webp 에 저장. {원본파일명: 공개경로}"""
    out = {}
    dst_dir = OUT_IMG / logno
    for i, f in enumerate(files, 1):
        src = src_dir / pathlib.Path(f).name
        if not src.exists():
            continue
        name = f"{i:02d}.webp"
        dst = dst_dir / name
        if not dst.exists():
            try:
                im = Image.open(src); im.seek(0)
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
                w, h = im.size
                if w > 1200:
                    im = im.resize((1200, int(h * 1200 / w)), Image.LANCZOS)
                dst_dir.mkdir(parents=True, exist_ok=True)
                im.save(dst, "WEBP", quality=78, method=4)
            except Exception as e:
                print("  image fail", src.name, e)
                continue
        out[src.name] = f"/columns/{logno}/{name}"
    return out

def rewrite_md(md: str, img_map: dict, known_lognos: set) -> str:
    def img_sub(m):
        alt, src = m.group(1), m.group(2)
        new = img_map.get(src.split("/")[-1])
        return f"![{alt}]({new})" if new else ""
    md = re.sub(r"!\[(.*?)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)", img_sub, md)
    # 매핑되지 않은 상대 경로 이미지·링크는 남기지 않는다 (빌드 오류 방지)
    md = re.sub(r"!?\[.*?\]\(\.\.?/[^)]*\)", "", md)
    def link_sub(m):
        text, url = m.group(1), m.group(2)
        mm = re.search(r"blog\.naver\.com/ontracksign/(\d+)", url)
        if mm and mm.group(1) in known_lognos:
            return f"[{text}](/columns/{mm.group(1)})"
        return m.group(0)
    md = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", link_sub, md)
    md = re.sub(r"<small>blog\.naver\.com</small>", "", md)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip() + "\n"

def yaml_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)

def write_content(logno: str, meta: dict, body: str) -> pathlib.Path:
    """src/content/columns/{logno}.md 작성. meta: title,date,section,category,categoryNo,tags,excerpt,naverUrl,public,review,source"""
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    lines = ["---",
             f"title: {yaml_str(meta['title'])}",
             f"date: {meta['date']}",
             f"section: {yaml_str(meta['section'] or '비공개')}",
             f"category: {yaml_str(meta.get('category') or '')}",
             f"categoryNo: {meta.get('categoryNo') or 0}",
             "tags:" + ("" if meta.get("tags") else " []")]
    for t in meta.get("tags") or []:
        lines.append(f"  - {yaml_str(t)}")
    lines += [f"excerpt: {yaml_str(meta.get('excerpt') or '')}",
              f"naverLogno: {yaml_str(str(logno))}",
              f"naverUrl: {yaml_str(meta.get('naverUrl') or '')}",
              f"source: {yaml_str(meta.get('source') or 'naver')}",
              f"public: {'true' if meta.get('public') else 'false'}",
              "review:" + ("" if meta.get("review") else " []")]
    for r in meta.get("review") or []:
        lines.append(f"  - {yaml_str(r)}")
    lines.append("---")
    p = CONTENT_DIR / f"{logno}.md"
    p.write_text("\n".join(lines) + "\n\n" + body, encoding="utf-8")
    return p

def existing_lognos() -> set:
    out = set()
    if CONTENT_DIR.exists():
        for p in CONTENT_DIR.glob("*.md"):
            out.add(p.stem)
    return out
