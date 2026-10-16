#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
fetch_posts.py - posts_index.json 의 글 전체에 대해
  1) 모바일 PostView HTML 을 raw/{logNo}.html 로 저장 (이미 정상 저장돼 있으면 건너뜀)
  2) 본문 이미지(se-image, se-imageGroup, se-imageStrip)를 images/{logNo}/ 에 원본 크기로 저장
     - 원본: https://blogfiles.pstatic.net/<path>  (쿼리 없음 = 업로드 원본)
     - 대체: https://postfiles.pstatic.net/<path>?type=w3840 -> mblogthumb ?type=w966 -> data-lazy-src
  3) images/{logNo}/manifest.json 과 전체 fetch_failures.json / fetch_log.txt 기록

실행:  python -I scripts/fetch_posts.py [--only LOGNO,...] [--no-images]
요청 간 0.7~1.0초 대기(글), 이미지 요청 간 0.25초 대기.
"""
import argparse
import json
import random
import re
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit

import requests
from bs4 import BeautifulSoup

BLOG_ID = "ontracksign"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                   "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    "Referer": f"https://m.blog.naver.com/{BLOG_ID}",
    "Accept-Language": "ko-KR,ko;q=0.9",
}
ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "posts_index.json"
RAW = ROOT / "raw"
RAW_FAILED = ROOT / "raw" / "_failed"
IMAGES = ROOT / "images"
FAILURES = ROOT / "fetch_failures.json"
LOG = ROOT / "fetch_log.txt"

POST_SLEEP = (0.7, 1.0)
IMG_SLEEP = 0.25
IMAGE_HOSTS = ("mblogthumb-phinf.pstatic.net", "postfiles.pstatic.net", "blogfiles.pstatic.net",
               "blogfiles.naver.net", "postfiles.naver.net")
# 본문 이미지가 아닌 것(링크카드 썸네일, 스티커, 이모티콘, 프로필)
SKIP_HOSTS = ("dthumb-phinf.pstatic.net", "storep-phinf.pstatic.net", "ssl.pstatic.net",
              "blogpfthumb-phinf.pstatic.net")

# Windows 금지 문자 + 마크다운/URL 에서 문제를 일으키는 문자(괄호·공백·#·%·& 등)를 모두 _ 로 치환
_bad = re.compile(r"""[\\/:*?"<>|\x00-\x1f()\[\]{}\s#%&+,;=!'`$@^~]""")


def log(msg: str) -> None:
    print(msg, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")


def safe_name(name: str, limit: int = 80) -> str:
    name = unquote(name)
    name = _bad.sub("_", name)
    name = re.sub(r"_+", "_", name).strip(" ._")
    if len(name) > limit:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: limit - len(ext) - 1] + "." + ext) if dot else name[:limit]
    return name or "image"


def html_ok(text: str) -> bool:
    return "se-main-container" in text or 'id="postViewArea"' in text


def fetch_html(session: requests.Session, log_no: str):
    url = "https://m.blog.naver.com/PostView.naver"
    last_err = ""
    for attempt in range(4):
        try:
            r = session.get(url, params={"blogId": BLOG_ID, "logNo": log_no}, headers=HEADERS, timeout=40)
            if r.status_code == 200 and html_ok(r.text):
                return r.text, ""
            last_err = f"status={r.status_code} len={len(r.text)} main_container={'se-main-container' in r.text}"
            RAW_FAILED.mkdir(parents=True, exist_ok=True)
            (RAW_FAILED / f"{log_no}.attempt{attempt+1}.html").write_text(r.text, encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            last_err = f"{type(e).__name__}: {e}"
        time.sleep(3 + attempt * 3)
    return None, last_err


def base_image_url(url: str):
    """네이버 CDN 이미지는 쿼리를 제거한 경로, 외부 호스트 이미지는 URL 그대로. 스티커/링크카드 썸네일은 None."""
    if not url or not url.startswith("http"):
        return None
    parts = urlsplit(url)
    if parts.netloc in SKIP_HOSTS:
        return None
    if parts.netloc not in IMAGE_HOSTS:
        return url  # 외부 호스트(googleusercontent, 언론사 등)에서 핫링크한 이미지
    return f"https://{parts.netloc}{parts.path}"


def is_external(base: str) -> bool:
    return urlsplit(base).netloc not in IMAGE_HOSTS


def collect_images(html: str) -> list:
    """본문(se-main-container)의 이미지 컴포넌트에서 이미지 목록을 순서대로 수집."""
    soup = BeautifulSoup(html, "lxml")
    main = soup.select_one("div.se-main-container")
    out = []
    seen = set()
    if main is None:
        # 구형 에디터(SE2/SE3) 대비
        main = soup.select_one("#postViewArea") or soup
    comps = main.select("div.se-component.se-image, div.se-component.se-imageGroup, div.se-component.se-imageStrip")
    if not comps:
        comps = [main]
    for comp in comps:
        comp_id = comp.get("id", "")
        for img in comp.select("img"):
            a = img.find_parent("a")
            linkdata = {}
            if a is not None and a.get("data-linkdata"):
                try:
                    linkdata = json.loads(a["data-linkdata"])
                except Exception:  # noqa: BLE001
                    linkdata = {}
            cand = linkdata.get("src") or img.get("data-lazy-src") or img.get("src") or ""
            base = base_image_url(cand)
            if base is None:
                base = base_image_url(img.get("data-lazy-src") or "")
            if base is None or base in seen:
                continue
            seen.add(base)
            out.append({
                "order": len(out) + 1,
                "component_id": comp_id,
                "src_base": base,
                "external": is_external(base),
                "lazy_src": img.get("data-lazy-src") or img.get("src") or "",
                "original_width": linkdata.get("originalWidth"),
                "original_height": linkdata.get("originalHeight"),
                "file_size": linkdata.get("fileSize"),
                "alt": img.get("alt") or "",
            })
    return out


def download_candidates(base: str, lazy: str) -> list:
    if is_external(base):
        return [base]
    path = urlsplit(base).path
    cands = [
        f"https://blogfiles.pstatic.net{path}",
        f"https://postfiles.pstatic.net{path}?type=w3840",
        f"https://mblogthumb-phinf.pstatic.net{path}?type=w966",
    ]
    if lazy and lazy not in cands:
        cands.append(lazy)
    return cands


def download_image(session: requests.Session, item: dict, dest_dir: Path) -> dict:
    base = item["src_base"]
    if is_external(base):
        # 외부 이미지는 경로에 확장자가 없을 수 있어 해시 이름 + 응답 content-type 확장자 사용
        import hashlib
        stem = f"{item['order']:02d}_ext_{hashlib.sha1(base.encode()).hexdigest()[:10]}"
        found = list(dest_dir.glob(stem + ".*")) if dest_dir.exists() else []
        if found and found[0].stat().st_size > 0:
            item["file"] = found[0].name
            item["status"] = "exists"
            item["bytes"] = found[0].stat().st_size
            return item
        fname = stem
        dest = dest_dir / fname
        item["file"] = fname
    else:
        fname = safe_name(Path(urlsplit(base).path).name)
        fname = f"{item['order']:02d}_{fname}"
        dest = dest_dir / fname
        item["file"] = fname
        if dest.exists() and dest.stat().st_size > 0:
            item["status"] = "exists"
            item["bytes"] = dest.stat().st_size
            return item
    last_err = ""
    ext_headers = dict(HEADERS)
    if is_external(base):
        ext_headers.pop("Referer", None)
    for url in download_candidates(base, item.get("lazy_src", "")):
        try:
            r = session.get(url, headers=ext_headers, timeout=60)
            ctype = r.headers.get("content-type", "")
            if r.status_code == 200 and ctype.startswith("image/") and len(r.content) > 0:
                dest_dir.mkdir(parents=True, exist_ok=True)
                if is_external(base) and not Path(fname).suffix:
                    ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
                           "image/webp": ".webp", "image/svg+xml": ".svg"}.get(ctype.split(";")[0].strip(), ".img")
                    dest = dest_dir / (fname + ext)
                    item["file"] = dest.name
                dest.write_bytes(r.content)
                item["status"] = "ok"
                item["downloaded_from"] = url
                item["bytes"] = len(r.content)
                item["content_type"] = ctype
                return item
            last_err = f"{url} -> status={r.status_code} ctype={ctype}"
        except Exception as e:  # noqa: BLE001
            last_err = f"{url} -> {type(e).__name__}: {e}"
        time.sleep(IMG_SLEEP)
    item["status"] = "failed"
    item["error"] = last_err
    return item


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="쉼표로 구분한 logNo 목록만 처리")
    ap.add_argument("--no-images", action="store_true")
    args = ap.parse_args()

    posts = json.loads(INDEX.read_text(encoding="utf-8"))
    if args.only:
        wanted = set(args.only.split(","))
        posts = [p for p in posts if p["logNo"] in wanted]
    RAW.mkdir(exist_ok=True)
    IMAGES.mkdir(exist_ok=True)

    failures = []
    session = requests.Session()
    n_html_new = n_html_skip = n_img_ok = n_img_exist = n_img_fail = 0
    t0 = time.time()
    log(f"=== fetch_posts start: {len(posts)} posts ({time.strftime('%Y-%m-%d %H:%M:%S')}) ===")

    for i, p in enumerate(posts, 1):
        log_no = p["logNo"]
        raw_path = RAW / f"{log_no}.html"
        html = None
        if raw_path.exists():
            html = raw_path.read_text(encoding="utf-8", errors="replace")
            if html_ok(html):
                n_html_skip += 1
            else:
                html = None
        if html is None:
            html, err = fetch_html(session, log_no)
            if html is None:
                failures.append({"logNo": log_no, "stage": "html", "title": p["title"], "error": err})
                log(f"[{i}/{len(posts)}] {log_no} HTML FAILED: {err}")
                time.sleep(random.uniform(*POST_SLEEP))
                continue
            raw_path.write_text(html, encoding="utf-8")
            n_html_new += 1
            time.sleep(random.uniform(*POST_SLEEP))

        if args.no_images:
            continue

        items = collect_images(html)
        dest_dir = IMAGES / log_no
        for it in items:
            download_image(session, it, dest_dir)
            st = it.get("status")
            if st == "ok":
                n_img_ok += 1
                time.sleep(IMG_SLEEP)
            elif st == "exists":
                n_img_exist += 1
            else:
                n_img_fail += 1
                failures.append({"logNo": log_no, "stage": "image", "title": p["title"],
                                 "url": it["src_base"], "error": it.get("error", "")})
        if items:
            dest_dir.mkdir(parents=True, exist_ok=True)
            (dest_dir / "manifest.json").write_text(json.dumps(items, ensure_ascii=False, indent=1),
                                                    encoding="utf-8")
        n_ok = sum(1 for x in items if x.get("status") == "ok")
        n_ex = sum(1 for x in items if x.get("status") == "exists")
        n_fl = sum(1 for x in items if x.get("status") == "failed")
        log(f"[{i}/{len(posts)}] {log_no} images={len(items)} (ok {n_ok}, exist {n_ex}, fail {n_fl}) | {p['title'][:40]}")

    FAILURES.write_text(json.dumps(failures, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"=== done in {time.time()-t0:.0f}s: html new={n_html_new} skipped={n_html_skip}; "
        f"images ok={n_img_ok} exist={n_img_exist} fail={n_img_fail}; failures={len(failures)} -> {FAILURES}")


if __name__ == "__main__":
    main()
