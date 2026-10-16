#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
fetch_index.py - 네이버 블로그(ontracksign) 모바일 글 목록 API를 호출해 posts_index.json 을 만든다.

실행:  python -I scripts/fetch_index.py            (cha-blog-archive 폴더에서)
출력:  posts_index.json  (logNo, title, category_name, category_no, date(ISO, KST), brief, thumbnails)
"""
import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

BLOG_ID = "ontracksign"
API = f"https://m.blog.naver.com/api/blogs/{BLOG_ID}/post-list"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                   "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    "Referer": f"https://m.blog.naver.com/{BLOG_ID}",
    "Accept": "application/json",
}
ITEM_COUNT = 30
MAX_PAGES = 40          # 안전 상한. 빈 페이지가 나오면 중단.
SLEEP_SEC = 0.5
KST = timezone(timedelta(hours=9))

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "posts_index.json"


def fetch_page(session: requests.Session, page: int) -> list:
    for attempt in range(3):
        try:
            r = session.get(API, params={"categoryNo": 0, "itemCount": ITEM_COUNT, "page": page},
                            headers=HEADERS, timeout=30)
            r.raise_for_status()
            data = r.json()
            if not data.get("isSuccess"):
                raise RuntimeError(f"isSuccess=false: {str(data)[:200]}")
            return data["result"].get("items", [])
        except Exception as e:  # noqa: BLE001
            print(f"  page {page} attempt {attempt+1} failed: {e}", file=sys.stderr)
            time.sleep(2 + attempt * 2)
    raise SystemExit(f"page {page}: giving up")


def to_iso(ms) -> str:
    if ms is None:
        return ""
    return datetime.fromtimestamp(int(ms) / 1000, tz=KST).isoformat(timespec="seconds")


def main() -> None:
    session = requests.Session()
    posts = []
    seen = set()
    for page in range(1, MAX_PAGES + 1):
        items = fetch_page(session, page)
        print(f"page {page}: {len(items)} items")
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
                "date": to_iso(it.get("addDate")),
                "add_date_ms": it.get("addDate"),
                "brief": it.get("briefContents") or "",
                "thumbnails": [t.get("encodedThumbnailUrl") for t in (it.get("thumbnailList") or [])
                               if t.get("encodedThumbnailUrl")],
                "thumbnail_count": it.get("thumbnailCount"),
                "editor_version": it.get("smartEditorVersion"),
                "all_open": it.get("allOpenPost"),
                "search_allowed": it.get("searchYn"),
                "url": f"https://blog.naver.com/{BLOG_ID}/{log_no}",
                "mobile_url": f"https://m.blog.naver.com/PostView.naver?blogId={BLOG_ID}&logNo={log_no}",
            })
        if len(items) < ITEM_COUNT:
            break
        time.sleep(SLEEP_SEC)

    posts.sort(key=lambda p: (p["add_date_ms"] or 0), reverse=True)
    OUT.write_text(json.dumps(posts, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"saved {len(posts)} posts -> {OUT}")

    # 카테고리별 집계
    from collections import Counter
    c = Counter((p["category_no"], p["category_name"]) for p in posts)
    for (no, name), n in sorted(c.items(), key=lambda x: -x[1]):
        print(f"  [{no}] {name}: {n}")


if __name__ == "__main__":
    main()
