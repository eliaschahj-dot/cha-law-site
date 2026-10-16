# -*- coding: utf-8 -*-
"""
data/naver_index.json (네이버 모바일 글 목록 API 원본) → src/data/posts.json
- 공개 코너 매핑, 제목 태그 자동 부여, 광고규정 검수 플래그, 요약 정리
- 실행: python -I scripts/build_posts.py
"""
import json, re, html, sys, time, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "naver_index.json"
OUT = ROOT / "src" / "data" / "posts.json"

# 카테고리 번호 → 사이트 코너
SECTION = {
    22: "상속",            # 상속 법률상담소
    19: "부동산", 20: "부동산", 21: "부동산",   # 부동산 법률상담소 / 분양계약 / 부동산 분쟁
    23: "분쟁 절차",       # 민사 법률상담소
    7: "꿀팁", 9: "꿀팁", 16: "꿀팁", 18: "꿀팁", 11: "꿀팁", 17: "꿀팁",  # 계약 A~Z 등
    14: None,              # 온트랙 홍보 글 → 비공개
    24: None,              # 가지급금 → 비공개
}

TAGS = [
    ("유류분", ["유류분"]),
    ("상속재산분할", ["상속재산분할", "재산분할", "기여분", "특별수익"]),
    ("유언", ["유언"]),
    ("성년후견", ["성년후견", "후견", "치매"]),
    ("상속등기", ["상속등기", "명의신탁", "종중", "금양임야", "선산"]),
    ("상속세", ["상속세", "증여세", "증여"]),
    ("상속포기·한정승인", ["한정승인", "상속포기", "상속 포기", "특별한정승인", "상속 빚", "상속채무"]),
    ("전세보증금", ["전세", "보증금", "임차권", "전세사기", "임대인"]),
    ("분양", ["분양", "분양권", "모델하우스", "중도금"]),
    ("매매계약", ["매매", "계약금", "잔금", "배액", "가계약"]),
    ("임대차·명도", ["명도", "월세", "임대차", "권리금", "차임", "갱신"]),
    ("재개발·재건축", ["재개발", "재건축", "조합", "현금청산", "매도청구", "관리처분"]),
    ("공사대금·하자", ["공사대금", "하자", "누수", "유치권", "지체상금"]),
    ("보전처분·집행", ["가압류", "가처분", "지급명령", "내용증명", "강제집행", "압류", "소멸시효", "경매", "배당"]),
    ("등기", ["등기부", "등기", "근저당", "소유권이전"]),
    ("계약 체크리스트", ["특약", "체크", "확인", "조회", "주의"]),
]

FLAG_TERMS = [
    ("무료", r"무료"),
    ("착수금·성공보수", r"착수금|성공보수|성공 보수"),
    ("결과 보장", r"승소|보장|100\s*%|확실"),
    ("최상급", r"최고|유일|1위|최다"),
    ("회사 상호", r"온트랙|온전함|온전\s*주식회사|ontrack|onjeon|theirlaw"),
    ("연락처", r"0\d{1,2}-\d{3,4}-\d{4}"),
    ("수치 주장", r"하루\s*\d+\s*명|누적\s*[\d,]+"),
]

def kst(ms):
    return time.strftime("%Y-%m-%d", time.gmtime(ms / 1000 + 9 * 3600))

def clean_excerpt(text):
    t = html.unescape(text or "")
    t = re.sub(r"\s+", " ", t).strip()
    # 인사말 제거
    t = re.sub(r"^안녕하세요[^.]*(변호사\s*)?차형진입니다\.?\s*", "", t)
    t = re.sub(r"^안녕하세요[,.]?\s*", "", t)
    return t

def flags_in(text):
    hits = []
    for name, pat in FLAG_TERMS:
        if re.search(pat, text or "", re.I):
            hits.append(name)
    return hits

def truncate_safe(excerpt):
    """플래그 단어가 나오는 문장 앞까지만 남긴다."""
    sentences = re.split(r"(?<=[.!?다요])\s+", excerpt)
    keep = []
    for s in sentences:
        if flags_in(s):
            break
        keep.append(s)
    out = " ".join(keep).strip()
    if len(out) > 180:
        out = out[:178].rstrip() + "…"
    return out if len(out) >= 40 else ""

def main():
    raw = json.loads(SRC.read_text(encoding="utf-8"))
    posts = []
    stats = {"total": len(raw), "public": 0, "hidden_section": 0, "hidden_title": 0, "flagged": 0, "by_section": {}}
    for it in raw:
        cat_no = it.get("categoryNo")
        section = SECTION.get(cat_no)
        title = html.unescape(it.get("titleWithInspectMessage") or "").strip()
        logno = str(it.get("logNo"))
        date = kst(it.get("addDate"))
        excerpt_full = clean_excerpt(it.get("briefContents"))
        tflags = flags_in(title)
        eflags = flags_in(excerpt_full)
        tags = [name for name, kws in TAGS if any(k in title for k in kws)]
        public = section is not None and not tflags
        if section is None:
            stats["hidden_section"] += 1
        elif tflags:
            stats["hidden_title"] += 1
        excerpt = truncate_safe(excerpt_full) if public else ""
        flags = sorted(set(tflags + eflags))
        if flags:
            stats["flagged"] += 1
        if public:
            stats["public"] += 1
            stats["by_section"][section] = stats["by_section"].get(section, 0) + 1
        posts.append({
            "logno": logno,
            "title": title,
            "date": date,
            "category": it.get("categoryName"),
            "categoryNo": cat_no,
            "section": section,
            "tags": tags,
            "excerpt": excerpt,
            "naverUrl": f"https://blog.naver.com/ontracksign/{logno}",
            "public": public,
            "flags": flags,
            "body": None,   # 아카이브(마크다운) 이관 후 채움
        })
    posts.sort(key=lambda p: p["date"], reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(posts, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
