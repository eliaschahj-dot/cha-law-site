# -*- coding: utf-8 -*-
"""
네이버 블로그(ontracksign) 새 글 → 사이트 칼럼 자동 동기화.

흐름: 글 목록 API → 사이트에 없는 logNo 찾기 → 본문 HTML·이미지 내려받기(.naver-cache/)
     → 마크다운 변환(scripts/naver/convert.py) → 회사 상호·CTA 제거, 이미지 WebP 변환, 광고규정 검사
     → src/content/columns/{logNo}.md + public/columns/{logNo}/NN.webp

실행: python -I -X utf8 scripts/naver_sync.py [--limit N] [--only logNo,logNo] [--force]
      (GitHub Actions 가 매일 06:00 KST 에 실행하고, 바뀐 파일이 있으면 커밋·푸시 후 Render 배포 훅을 호출)
"""
import sys, json, time, random, argparse, pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CACHE = ROOT / ".naver-cache"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "naver"))

import content_tools as ct
import fetch_index, fetch_posts, convert  # scripts/naver/*
import requests

# 아카이브 스크립트들의 경로를 사이트 캐시 폴더로 돌린다
fetch_index.OUT = CACHE / "posts_index.json"
fetch_posts.ROOT = CACHE
fetch_posts.INDEX = CACHE / "posts_index.json"
fetch_posts.RAW = CACHE / "raw"
fetch_posts.RAW_FAILED = CACHE / "raw" / "_failed"
fetch_posts.IMAGES = CACHE / "images"
fetch_posts.FAILURES = CACHE / "fetch_failures.json"
fetch_posts.LOG = CACHE / "fetch_log.txt"
convert.ROOT = CACHE
convert.INDEX = CACHE / "posts_index.json"
convert.RAW = CACHE / "raw"
convert.IMAGES = CACHE / "images"
convert.CONTENT = CACHE / "content"
convert.REPORT = CACHE / "flags_report.csv"
convert.DETAIL = CACHE / "flags_detail.csv"
convert.STATS = CACHE / "convert_stats.json"


def fetch_index_all() -> list:
    session = requests.Session()
    posts, seen = [], set()
    for page in range(1, fetch_index.MAX_PAGES + 1):
        items = fetch_index.fetch_page(session, page)
        if not items:
            break
        for it in items:
            log_no = str(it.get("logNo"))
            if log_no in seen:
                continue
            seen.add(log_no)
            posts.append({
                "logNo": log_no,
                "title": it.get("titleWithInspectMessage") or "",
                "category_name": it.get("categoryName") or "",
                "category_no": it.get("categoryNo"),
                "date": fetch_index.to_iso(it.get("addDate")),
                "add_date_ms": it.get("addDate"),
                "brief": it.get("briefContents") or "",
                "url": f"https://blog.naver.com/{fetch_index.BLOG_ID}/{log_no}",
            })
        if len(items) < fetch_index.ITEM_COUNT:
            break
        time.sleep(fetch_index.SLEEP_SEC)
    posts.sort(key=lambda p: (p["add_date_ms"] or 0), reverse=True)
    CACHE.mkdir(exist_ok=True)
    fetch_index.OUT.write_text(json.dumps(posts, ensure_ascii=False, indent=1), encoding="utf-8")
    return posts


def fetch_one(session: requests.Session, p: dict) -> bool:
    log_no = p["logNo"]
    raw_path = fetch_posts.RAW / f"{log_no}.html"
    fetch_posts.RAW.mkdir(parents=True, exist_ok=True)
    html = raw_path.read_text(encoding="utf-8", errors="replace") if raw_path.exists() else None
    if not (html and fetch_posts.html_ok(html)):
        html, err = fetch_posts.fetch_html(session, log_no)
        if html is None:
            print(f"  HTML 실패 {log_no}: {err}")
            return False
        raw_path.write_text(html, encoding="utf-8")
        time.sleep(random.uniform(*fetch_posts.POST_SLEEP))
    items = fetch_posts.collect_images(html)
    dest = fetch_posts.IMAGES / log_no
    for it in items:
        fetch_posts.download_image(session, it, dest)
        if it.get("status") == "ok":
            time.sleep(fetch_posts.IMG_SLEEP)
    if items:
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "manifest.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    return True


def to_site(p: dict, known: set) -> dict:
    """convert.py 가 만든 캐시 마크다운을 사이트 콘텐츠로 옮긴다."""
    info = convert.convert_post(p)
    md_path = CACHE / info["path"]
    fm, body = ct.parse_front(md_path.read_text(encoding="utf-8"))
    log_no = p["logNo"]
    cat_no = int(p.get("category_no") or 0)
    section = ct.SECTION.get(cat_no)
    clean, removed = ct.sanitize(body)
    imgs = fm.get("images") or []
    img_map = ct.convert_images(log_no, imgs, fetch_posts.IMAGES / log_no) if imgs else {}
    md = ct.rewrite_md(clean, img_map, known)
    hits = ct.review_hits(ct.plain_text(md))
    title_hits = ct.review_hits(p["title"])
    review = sorted({h[0] for h in hits + title_hits})
    public = section is not None and not title_hits
    meta = dict(title=p["title"].strip(), date=(p.get("date") or "")[:10], section=section, category=p.get("category_name"),
                categoryNo=cat_no, tags=ct.auto_tags(p["title"]), excerpt=ct.excerpt_of(md),
                naverUrl=f"https://blog.naver.com/{fetch_index.BLOG_ID}/{log_no}", public=public, review=review, source="naver")
    ct.write_content(log_no, meta, md)
    return {"logNo": log_no, "title": p["title"], "section": section, "public": public, "review": review, "images": len(img_map)}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50, help="한 번에 처리할 최대 글 수")
    ap.add_argument("--only", help="쉼표로 구분한 logNo 만 처리")
    ap.add_argument("--force", action="store_true", help="이미 있는 글도 다시 만든다 (--only 와 함께)")
    args = ap.parse_args()

    print("1) 글 목록 받기")
    index = fetch_index_all()
    known = {p["logNo"] for p in index} | ct.existing_lognos()
    existing = ct.existing_lognos()
    if args.only:
        wanted = set(args.only.split(","))
        targets = [p for p in index if p["logNo"] in wanted]
    else:
        targets = [p for p in index if p["logNo"] not in existing]
    if not args.force and not args.only:
        targets = [p for p in targets if p["logNo"] not in existing]
    targets = targets[: args.limit]
    print(f"   전체 {len(index)}편, 사이트 {len(existing)}편, 처리 대상 {len(targets)}편")
    if not targets:
        print("새 글 없음")
        return

    session = requests.Session()
    results = []
    for i, p in enumerate(targets, 1):
        print(f"2) [{i}/{len(targets)}] {p['logNo']} {p['title'][:40]}")
        if not fetch_one(session, p):
            continue
        try:
            results.append(to_site(p, known))
        except Exception as e:  # noqa: BLE001
            print(f"  변환 실패 {p['logNo']}: {type(e).__name__}: {e}")
    pub = sum(1 for r in results if r["public"] and not r["review"])
    rev = sum(1 for r in results if r["review"])
    hid = sum(1 for r in results if not r["public"])
    print(f"3) 완료: {len(results)}편 추가 (전문 {pub} · 검토 필요 {rev} · 비공개 {hid})")
    (CACHE / "last_sync.json").write_text(json.dumps({"when": time.strftime("%Y-%m-%d %H:%M:%S"), "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
