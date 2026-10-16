# -*- coding: utf-8 -*-
"""
일회성: ../cha-blog-archive/content/**/*.md (수정안 적용본) → src/content/columns/{logno}.md
이미지는 이미 public/columns/{logno}/NN.webp 로 변환돼 있으면 재사용한다.
실행: python -I -X utf8 scripts/migrate_archive_to_content.py
"""
import json, sys, pathlib, collections
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import content_tools as ct

ARCHIVE = ct.ROOT.parent / "cha-blog-archive"
IMAGES = ARCHIVE / "images"

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    index = {str(p["logNo"]): p for p in json.loads((ct.ROOT / "data" / "naver_index.json").read_text(encoding="utf-8"))}
    files = sorted((ARCHIVE / "content").rglob("*.md"))
    known = set(index.keys())
    stats = collections.Counter()
    for f in files:
        fm, body = ct.parse_front(f.read_text(encoding="utf-8"))
        logno = str(fm.get("naver_logno") or f.stem.split("-")[-1])
        it = index.get(logno, {})
        cat_no = int(fm.get("category_no") or it.get("categoryNo") or 0)
        section = ct.SECTION.get(cat_no)
        title = (fm.get("title") or it.get("titleWithInspectMessage") or "").strip()
        date = str(fm.get("date") or "")[:10]
        clean, removed = ct.sanitize(body)
        imgs = fm.get("images") or []
        img_map = ct.convert_images(logno, imgs, IMAGES / logno) if imgs else {}
        md = ct.rewrite_md(clean, img_map, known)
        hits = ct.review_hits(ct.plain_text(md))
        title_hits = ct.review_hits(title)
        review = sorted({h[0] for h in hits + title_hits})
        public = section is not None and not title_hits
        meta = dict(title=title, date=date, section=section, category=fm.get("category") or it.get("categoryName"),
                    categoryNo=cat_no, tags=ct.auto_tags(title), excerpt=ct.excerpt_of(md), naverUrl=f"https://blog.naver.com/ontracksign/{logno}",
                    public=public, review=review, source="naver")
        ct.write_content(logno, meta, md)
        stats["files"] += 1
        stats["public" if public else "hidden"] += 1
        if review: stats["review"] += 1
        stats["images"] += len(img_map)
    print(dict(stats))

if __name__ == "__main__":
    main()
