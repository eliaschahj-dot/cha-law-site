# -*- coding: utf-8 -*-
"""
cha-blog-archive의 마크다운(467편)을 사이트 칼럼으로 이관한다.

- 입력: ../cha-blog-archive/content/**/*.md, ../cha-blog-archive/images/{logno}/
- 출력: src/data/posts.json 의 body(HTML)·flags 갱신, public/columns/{logno}/NN.webp, data/review_queue.csv
- 정책:
  1) HTML 주석(아카이브가 걷어낸 CTA 블록)은 버린다.
  2) 회사 상호(온트랙·ontracksign·theirlaw·온전 법률사무소·온전함)가 든 문단과, 상담 유도+전화번호 문단은 제거한다.
  3) 남은 본문에 광고규정상 판단이 필요한 표현(무료·착수금·성공보수·승소·보장·100%·최고·유일·전담·수치 주장)이 있으면
     전문을 싣지 않고(요약+원문 링크 유지) review_queue.csv에 문장과 함께 기록한다.
  4) '전문(성명 미병기)' 표현은 글 상단 바이라인(변호사 차형진)으로 성명이 특정되므로 통과시킨다.
실행: python -I -X utf8 scripts/import_archive.py [--no-images]
"""
import json, re, sys, csv, pathlib, html as htmlmod
import markdown
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHIVE = ROOT.parent / "cha-blog-archive"
CONTENT = ARCHIVE / "content"
IMAGES = ARCHIVE / "images"
POSTS = ROOT / "src" / "data" / "posts.json"
OUT_IMG = ROOT / "public" / "columns"
QUEUE = ROOT / "data" / "review_queue.csv"
NO_IMAGES = "--no-images" in sys.argv

COMPANY = re.compile(r"온트랙|ontrack|theirlaw|온전\s*법률사무소|온전함|온전\s*\(|온전㈜|onjeon", re.I)
PHONE = re.compile(r"0\d{1,2}-\d{3,4}-\d{4}")
CTA_WORDS = re.compile(r"상담|문의|연락|신청")
# 광고규정상 사람이 판단해야 하는 표현. 설명·경고 맥락의 일반 단어(예: '최고장', '100% 안전하지 않다', '책임을 보장')는 통과시키고
# 변호사 자신의 서비스에 대한 약속·과시로 읽힐 수 있는 꼴만 잡는다.
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

def parse_front(txt):
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    if not m:
        return {}, txt
    fm_raw, body = m.group(1), txt[m.end():]
    fm = {}
    key = None
    for line in fm_raw.splitlines():
        mk = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if mk:
            key, val = mk.group(1), mk.group(2).strip()
            if val == "":
                fm[key] = []
            else:
                fm[key] = val.strip('"')
        elif line.strip().startswith("- ") and key is not None and isinstance(fm.get(key), list):
            fm[key].append(line.strip()[2:].strip().strip('"'))
    return fm, body

def split_blocks(md):
    return re.split(r"\n\s*\n", md.strip())

def sanitize(md):
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    kept = []
    removed = 0
    for b in split_blocks(md):
        s = b.strip()
        if not s:
            continue
        if COMPANY.search(s):
            removed += 1
            continue
        if PHONE.search(s) and CTA_WORDS.search(s):
            removed += 1
            continue
        kept.append(s)
    return "\n\n".join(kept), removed

def review_hits(text):
    hits = []
    sentences = re.split(r"(?<=[.!?다요])\s+", text)
    for name, pat in REVIEW_TERMS:
        for s in sentences:
            if re.search(pat, s):
                hits.append((name, s.strip()[:140]))
                break
    return hits

def md_to_html(md, logno, public_lognos, img_map):
    def img_sub(m):
        alt, src = m.group(1), m.group(2)
        fname = src.split("/")[-1]
        new = img_map.get(fname)
        return f"![{alt}]({new})" if new else ""
    md = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", img_sub, md)
    def link_sub(m):
        text, url = m.group(1), m.group(2)
        mm = re.search(r"blog\.naver\.com/ontracksign/(\d+)", url)
        if mm and mm.group(1) in public_lognos:
            return f"[{text}](/columns/{mm.group(1)})"
        return m.group(0)
    md = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", link_sub, md)
    md = re.sub(r"<small>blog\.naver\.com</small>", "", md)
    h = markdown.markdown(md, extensions=["extra", "sane_lists"], output_format="html5")
    h = h.replace("<p></p>", "")
    return h

def convert_images(logno, files):
    """원본 이미지를 최대 1200px WebP로 줄여 public/columns/{logno}/NN.webp 에 저장. {원본파일명: 공개경로}"""
    out = {}
    src_dir = IMAGES / logno
    if not src_dir.exists():
        return out
    dst_dir = OUT_IMG / logno
    for i, f in enumerate(files, 1):
        src = src_dir / f.split("/")[-1]
        if not src.exists():
            continue
        name = f"{i:02d}.webp"
        dst = dst_dir / name
        if not dst.exists() and not NO_IMAGES:
            try:
                im = Image.open(src)
                im.seek(0)
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
        if dst.exists() or NO_IMAGES:
            out[src.name] = f"/columns/{logno}/{name}"
    return out

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    posts = json.loads(POSTS.read_text(encoding="utf-8"))
    by_logno = {p["logno"]: p for p in posts}
    public_lognos = {p["logno"] for p in posts if p["public"]}
    files = sorted(CONTENT.rglob("*.md"))
    stats = {"md": len(files), "full": 0, "review": 0, "hidden": 0, "removed_blocks": 0, "images": 0}
    queue = []
    for f in files:
        txt = f.read_text(encoding="utf-8")
        fm, body = parse_front(txt)
        logno = str(fm.get("naver_logno") or f.stem.split("-")[-1])
        p = by_logno.get(logno)
        if not p:
            continue
        if not p["public"]:
            stats["hidden"] += 1
            p["body"] = None
            continue
        clean, removed = sanitize(body)
        stats["removed_blocks"] += removed
        plain = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", clean)
        plain = re.sub(r"[#>*_`\[\]()]", " ", plain)
        hits = review_hits(plain)
        if hits:
            stats["review"] += 1
            p["body"] = None
            p["flags"] = sorted({h[0] for h in hits})
            for name, sent in hits:
                queue.append([logno, p["title"], p["section"], name, sent, str(f.relative_to(ARCHIVE))])
            continue
        imgs = fm.get("images") or []
        img_map = convert_images(logno, imgs) if imgs else {}
        stats["images"] += len(img_map)
        p["body"] = md_to_html(clean, logno, public_lognos, img_map)
        p["flags"] = []
        if not p.get("excerpt"):
            txt_only = re.sub(r"<[^>]+>", " ", p["body"])
            txt_only = re.sub(r"\s+", " ", htmlmod.unescape(txt_only)).strip()
            txt_only = re.sub(r"^안녕하세요[^.]*차형진입니다\.?\s*", "", txt_only)
            p["excerpt"] = (txt_only[:178].rstrip() + "…") if len(txt_only) > 180 else txt_only
        stats["full"] += 1
    POSTS.write_text(json.dumps(posts, ensure_ascii=False, indent=1), encoding="utf-8")
    QUEUE.parent.mkdir(parents=True, exist_ok=True)
    with open(QUEUE, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["logNo", "제목", "섹션", "검토 항목", "해당 문장", "아카이브 파일"])
        w.writerows(queue)
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    print("review queue:", QUEUE)

if __name__ == "__main__":
    main()
