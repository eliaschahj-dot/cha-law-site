# -*- coding: utf-8 -*-
"""
칼럼 재작성 파이프라인 (2026.11.02, 마케터 피드백 반영)
네이버 블로그에서 옮긴 글을 '같은 기획·흐름, 다른 문장'으로 다시 써서 유사문서를 피하고,
핵심 키워드를 제목 맨 앞에 두고(본문 포함 6회 이상), 영문 키워드 슬러그와 새 대표 이미지를 붙인다.

  python -X utf8 scripts/rewrite_columns.py --limit 6                 # 아직 안 한 글 6편
  python -X utf8 scripts/rewrite_columns.py --ids 224388145362 ...    # 특정 글
  python -X utf8 scripts/rewrite_columns.py --section 상속 --limit 50
  python -X utf8 scripts/rewrite_columns.py --all                     # 전부 (비용 안내 후 실행)
  python -X utf8 scripts/rewrite_columns.py --check                   # 재작성된 글 검증만(키워드 횟수·유사도)

원본은 scripts/naver/original/{logNo}.md 에 보관하고, src/content/columns/{logNo}.md 를 덮어쓴다(프런트매터에 slug·keyword·rewritten·faq·cover 추가).
API 키: 환경변수 ANTHROPIC_API_KEY 또는 ~/bohum-banbak/key.txt, 워크스페이스 헤더는 ~/bohum-banbak/workspace.txt.
"""
import argparse, io, json, os, re, sys, time, pathlib, hashlib, threading
SLUG_LOCK = threading.Lock()
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTENT = ROOT / "src" / "content" / "columns"
ORIG = ROOT / "scripts" / "naver" / "original"
IMG_OUT = ROOT / "public" / "columns"
MODEL = os.environ.get("REWRITE_MODEL", "claude-sonnet-5-5")
KEY_FILE = pathlib.Path.home() / "bohum-banbak" / "key.txt"
WS_FILE = pathlib.Path.home() / "bohum-banbak" / "workspace.txt"

# ---------- 프런트매터 ----------
def parse_front(text):
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m: return {}, text
    fm = {}
    lines = m.group(1).split("\n"); i = 0
    while i < len(lines):
        ln = lines[i]
        mm = re.match(r"^([A-Za-z_][\w]*):\s*(.*)$", ln)
        if not mm: i += 1; continue
        k, v = mm.group(1), mm.group(2)
        if v == "" and i + 1 < len(lines) and lines[i + 1].startswith("  - "):
            arr = []; i += 1
            while i < len(lines) and lines[i].startswith("  - "):
                arr.append(json.loads(lines[i][4:]) if lines[i][4:].startswith('"') else lines[i][4:]); i += 1
            fm[k] = arr; continue
        if v.startswith("[") and v.endswith("]"):
            try: fm[k] = json.loads(v)
            except Exception: fm[k] = v
        elif v.startswith('"'):
            try: fm[k] = json.loads(v)
            except Exception: fm[k] = v.strip('"')
        elif v in ("true", "false"): fm[k] = v == "true"
        else: fm[k] = v
        i += 1
    return fm, m.group(2)

def dump_front(fm):
    out = ["---"]
    order = ["title", "slug", "keyword", "date", "section", "category", "categoryNo", "tags", "excerpt", "cover", "faq", "naverLogno", "naverUrl", "source", "public", "review", "rewritten", "needsRewrite"]
    keys = [k for k in order if k in fm] + [k for k in fm if k not in order]
    for k in keys:
        v = fm[k]
        if isinstance(v, bool): out.append(f"{k}: {'true' if v else 'false'}")
        elif isinstance(v, (int, float)): out.append(f"{k}: {v}")
        elif isinstance(v, list):
            if not v: out.append(f"{k}: []")
            elif all(isinstance(x, str) for x in v):
                out.append(f"{k}:"); out += [f"  - {json.dumps(x, ensure_ascii=False)}" for x in v]
            else: out.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        else: out.append(f"{k}: {json.dumps(str(v), ensure_ascii=False)}")
    out.append("---")
    return "\n".join(out) + "\n"

# ---------- 유사도·키워드 검증 ----------
def plain(md):
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", md)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"[#>*_`|-]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()

def shingles(t, n=8):
    s = re.sub(r"\s+", "", t)
    return {s[i:i + n] for i in range(max(0, len(s) - n + 1))}

def similarity(a, b):
    A, B = shingles(plain(a)), shingles(plain(b))
    if not A or not B: return 0.0
    return len(A & B) / len(A | B)

def kw_count(keyword, title, body, faq=None):
    k = re.sub(r"\s+", "", keyword)
    extra = " ".join(f"{x.get('q','')} {x.get('a','')}" for x in (faq or []))
    hay = re.sub(r"\s+", "", title + " " + plain(body) + " " + extra)
    return hay.count(k)

def fill_keyword(kw, title, body, faq, need=6):
    """키워드가 부족하면 재시도 대신 자연스러운 문장으로 채운다(맨 앞 한 줄, 맺음 한 줄)."""
    n = kw_count(kw, title, body, faq)
    if n < need and "핵심만 먼저 정리" not in body:
        body = f"{kw}, 핵심만 먼저 정리합니다." + chr(10) * 2 + body; n += 1
    if n < need and "상담 신청서에 상황을" not in body:
        body = body.rstrip() + chr(10) * 2 + f"{kw}에 관해 더 궁금한 점은 상담 신청서에 상황을 적어 주시면 변호사가 직접 답합니다."; n += 1
    if n < need and faq and kw not in faq[-1]["a"]:
        faq[-1]["a"] = faq[-1]["a"].rstrip() + f" {kw} 문제는 사정마다 결론이 달라 상담에서 확인합니다."; n += 1
    return body, faq, n

def slugify(s):
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-")
    return "-".join(w[:1].upper() + w[1:] for w in s.split("-") if w)[:60]

# ---------- 대표 이미지 ----------
FONTS = pathlib.Path(r"C:\Windows\Fonts")
# 리눅스(GitHub Actions)에서는 나눔 글꼴(fonts-nanum)로 대신한다: 굵게→NanumGothicBold, 보통→NanumGothic, 한바탕→NanumMyeongjoBold
NANUM = pathlib.Path("/usr/share/fonts/truetype/nanum")
LINUX_ALT = {"malgunbd.ttf": "NanumGothicBold.ttf", "malgun.ttf": "NanumGothic.ttf", "HANBatangB.ttf": "NanumMyeongjoBold.ttf"}
def font(name, size):
    for cand in [name, "malgunbd.ttf", "malgun.ttf"]:
        for p in (FONTS / cand, NANUM / LINUX_ALT.get(cand, cand)):
            if p.exists(): return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()

def wrap_text(d, text, f, width):
    words = text.split(); lines = []; cur = ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= width: cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def make_cover(slug, keyword, title, section):
    W, H = 1200, 630
    navy, brass, paper = (15, 26, 48), (154, 127, 82), (250, 251, 252)
    accent = (27, 75, 143) if section != "부동산" else (46, 125, 91)
    img = Image.new("RGB", (W, H), paper); d = ImageDraw.Draw(img)
    # 왼쪽 세로 띠 + 마크
    d.rectangle((0, 0, 18, H), fill=accent)
    seed = int(hashlib.md5(slug.encode()).hexdigest(), 16)
    for i in range(6):  # 글마다 다른 옅은 원 무늬
        r = 120 + (seed >> (i * 5)) % 160; cx = 900 + (seed >> (i * 7)) % 260; cy = 80 + (seed >> (i * 3)) % 470
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(225, 228, 236), width=2)
    def mark(x, y, s, col, w):
        def seg(a, b): d.line((x + a[0] * s, y + a[1] * s, x + b[0] * s, y + b[1] * s), fill=col, width=w)
        seg((12, 5.5), (20, 5.5)); seg((5.5, 11.5), (26.5, 11.5)); seg((16, 11.5), (7, 26.5)); seg((16, 11.5), (25, 26.5))
    mark(80, 70, 2.2, navy, 6)
    d.text((170, 92), f"{section} · 차형진 변호사", font=font("malgun.ttf", 26), fill=(90, 100, 125))
    kf = font("HANBatangB.ttf", 40) if ((FONTS / "HANBatangB.ttf").exists() or (NANUM / "NanumMyeongjoBold.ttf").exists()) else font("malgunbd.ttf", 40)
    d.text((80, 170), keyword, font=kf, fill=accent)
    tf = font("malgunbd.ttf", 48)
    y = 240
    for ln in wrap_text(d, title, tf, 1000)[:3]:
        d.text((80, y), ln, font=tf, fill=navy); y += 66
    d.line((80, y + 18, 150, y + 18), fill=brass, width=3)
    d.text((80, y + 36), "법무법인 베율 부대표 · 부동산 · 상속 전문 · www.lawyer-cha.com", font=font("malgun.ttf", 24), fill=(90, 100, 125))
    out = IMG_OUT / slug; out.mkdir(parents=True, exist_ok=True)
    p = out / "cover.webp"; img.save(p, "WEBP", quality=82)
    return f"/columns/{slug}/cover.webp"

# ---------- LLM ----------
PROMPT = """당신은 한국의 부동산·상속 전문 변호사 홈페이지의 편집자입니다. 아래 '원문'은 네이버 블로그에 올렸던 글입니다.
이 글을 홈페이지용으로 다시 씁니다. 목표는 검색엔진이 원문의 복제본(유사문서)으로 보지 않도록 문장을 전부 새로 쓰되, 글의 기획·논리 흐름·사실·법령 설명은 지키는 것입니다.

규칙(모두 지킬 것):
1. 핵심 키워드 하나를 정한다(검색자가 실제로 칠 법한 2~6어절, 예: "전세보증금반환소송", "가계약금 반환", "명도소송 절차"). 제목은 그 키워드로 시작한다(맨 왼쪽).
2. 키워드는 제목과 본문을 합쳐 6회 이상, 8회 이하 자연스럽게 반복한다(띄어쓰기 동일하게).
3. 원문 문장을 그대로 옮기지 않는다. 15자 이상 같은 구절이 없어야 한다. 소제목도 새로 짓는다. 문단 순서는 바꿔도 되지만 논리 흐름은 유지한다.
4. 분량 1,800~3,000자. 맨 앞에 '핵심 요약' 3줄(번호 목록), 본문은 ## 소제목 3~5개, 끝에 상담 안내 한 문장. 1인칭 "저는/제가"는 쓰되 인사말("안녕하세요")은 쓰지 않는다.
5. 법령·기한·숫자는 원문의 사실을 유지한다. 모르는 사실을 지어내지 않는다. 승소·결과 보장, 최고·유일·1위, 무료 상담, 근거 없는 수치, 경쟁사 비교는 쓰지 않는다. 특정 사건 당사자 정보는 쓰지 않는다. 회사 브랜드명(온트랙, 온전 등)은 쓰지 않고 '전세 계약 검토 서비스' 정도로만 표현한다.
6. 변호사 성명 "차형진"은 본문에 1회만.
7. 원문의 이미지는 쓰지 않는다(본문에 이미지 문법을 넣지 말 것).
8. 영문 슬러그: 키워드를 영어로 옮겨 단어 첫 글자 대문자, 하이픈 연결(예: Jeonse-Deposit-Return-Lawsuit). 2~5단어.
9. 자주 묻는 질문 3개(각 답 2~3문장)를 따로 만든다.
10. 요약문(excerpt) 1~2문장(120자 안팎), 키워드 포함.

출력은 아래 구분선 형식 그대로(JSON 아님, 설명 없이):
===KEYWORD===
(핵심 키워드)
===TITLE===
(제목)
===SLUG===
(영문 슬러그)
===EXCERPT===
(요약문)
===FAQ===
Q: 질문1
A: 답1
Q: 질문2
A: 답2
Q: 질문3
A: 답3
===BODY===
(마크다운 본문)
===END===

[코너] %s
[원문 제목] %s
[원문]
%s
"""

def client():
    key = os.environ.get("ANTHROPIC_API_KEY") or (KEY_FILE.read_text(encoding="utf-8").strip() if KEY_FILE.exists() else "")
    if not key: sys.exit("API 키가 없습니다 (ANTHROPIC_API_KEY 또는 ~/bohum-banbak/key.txt)")
    import anthropic
    headers = {}
    ws = os.environ.get("ANTHROPIC_WORKSPACE_ID", "").strip() or (WS_FILE.read_text(encoding="utf-8").strip() if WS_FILE.exists() else "")
    if ws: headers["anthropic-workspace-id"] = ws
    return anthropic.Anthropic(api_key=key, default_headers=headers or None)

def ask(cl, section, title, body, stricter=False):
    msg = PROMPT % (section, title, body)
    if stricter: msg += "\n\n(추가 지시) 앞서 쓴 결과가 원문과 너무 비슷했습니다. 문장 구조와 어휘를 완전히 바꾸고, 예시와 설명 순서를 재배치하세요. 키워드 횟수 6~8회를 꼭 지키세요."
    r = cl.messages.create(model=MODEL, max_tokens=12000, messages=[{"role": "user", "content": msg}])
    txt = "".join(getattr(b, "text", "") for b in r.content)
    def sec(name, nxt):
        m = re.search(r"===%s===\s*(.*?)\s*===%s===" % (name, nxt), txt, re.S)
        if not m: raise ValueError(f"{name} 구간 없음: " + txt[:160].replace(chr(10), " "))
        return m.group(1).strip()
    faq = []
    for q, a_ in re.findall(r"Q:\s*(.+?)\s*\nA:\s*(.+?)(?=\nQ:|\Z)", sec("FAQ", "BODY"), re.S):
        faq.append({"q": q.strip(), "a": re.sub(r"\s+", " ", a_).strip()})
    mb = re.search(r"===BODY===\s*(.*?)(?:\s*===END===|\Z)", txt, re.S)
    if not mb or len(mb.group(1).strip()) < 600: raise ValueError("BODY 구간 없음/짧음: " + txt[:160].replace(chr(10), " "))
    data = {"keyword": sec("KEYWORD", "TITLE"), "title": sec("TITLE", "SLUG"), "slug": sec("SLUG", "EXCERPT"), "excerpt": sec("EXCERPT", "FAQ"), "faq": faq, "body_md": mb.group(1).strip()}
    usage = getattr(r, "usage", None)
    return data, (usage.input_tokens if usage else 0), (usage.output_tokens if usage else 0)

def existing_slugs():
    out = {}
    for f in CONTENT.glob("*.md"):
        fm, _ = parse_front(f.read_text(encoding="utf-8"))
        if fm.get("slug"): out[fm["slug"]] = f.stem
    return out

def rewrite_one(cl, f, slugs, dry=False):
    text = f.read_text(encoding="utf-8")
    fm, body = parse_front(text)
    orig_body = body
    if fm.get("rewritten") and not dry: return None
    ORIG.mkdir(parents=True, exist_ok=True)
    op = ORIG / f.name
    if not op.exists(): op.write_text(text, encoding="utf-8")
    else:
        ofm, obody = parse_front(op.read_text(encoding="utf-8")); orig_body = obody
    section = fm.get("section", "")
    src_body = re.sub(r"!\[[^\]]*\]\([^)]*\)", "[이미지]", orig_body)
    tin = tout = 0
    for attempt in range(2):
        data, i_, o_ = ask(cl, section, fm["title"], src_body, stricter=attempt > 0); tin += i_; tout += o_
        kw = data["keyword"].strip(); title = data["title"].strip(); new_body = data["body_md"].strip()
        sim = similarity(orig_body, new_body)
        ok_title = re.sub(r"\s+", "", title).startswith(re.sub(r"\s+", "", kw))
        if not ok_title: title = f"{kw}, {title}"; ok_title = True
        new_body, data["faq"], n = fill_keyword(kw, title, new_body, data.get("faq", [])[:3])
        if sim < 0.12 and n >= 6: break
        print(f"  재시도 {attempt + 1}: 유사도 {sim:.2f}, 키워드 {n}회")
    with SLUG_LOCK:
        slug = slugify(data.get("slug") or kw) or f"Post-{f.stem}"
        base = slug; k = 2
        while slug in slugs and slugs[slug] != f.stem: slug = f"{base}-{k}"; k += 1
        slugs[slug] = f.stem
    cover = make_cover(slug, kw, title, section)
    fm.update({"title": title, "slug": slug, "keyword": kw, "excerpt": data.get("excerpt", "").strip(), "faq": data.get("faq", [])[:3], "cover": cover, "rewritten": time.strftime("%Y-%m-%d"), "public": True})
    fm.pop("needsRewrite", None)
    f.write_text(dump_front(fm) + "\n" + new_body + "\n", encoding="utf-8")
    return {"id": f.stem, "slug": slug, "keyword": kw, "title": title, "sim": round(sim, 3), "kw": n, "in": tin, "out": tout, "chars": len(new_body)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0); ap.add_argument("--ids", nargs="*"); ap.add_argument("--section"); ap.add_argument("--all", action="store_true"); ap.add_argument("--check", action="store_true"); ap.add_argument("--fix", action="store_true"); ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    files = sorted(CONTENT.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    targets = []
    for f in files:
        fm, body = parse_front(f.read_text(encoding="utf-8"))
        if a.ids and f.stem not in a.ids: continue
        if a.fix and fm.get("rewritten"):
            body2, faq2, n = fill_keyword(fm.get("keyword", ""), fm["title"], body.strip(), fm.get("faq") or [])
            if body2 != body.strip() or faq2 != (fm.get("faq") or []):
                fm["faq"] = faq2; f.write_text(dump_front(fm) + chr(10) + body2 + chr(10), encoding="utf-8"); print(f"{f.stem}: 키워드 보충 → {n}회")
            continue
        if a.check:
            if fm.get("rewritten"):
                op = ORIG / f.name; ob = parse_front(op.read_text(encoding="utf-8"))[1] if op.exists() else ""
                print(f"{f.stem} {fm.get('slug')}: 키워드 {kw_count(fm.get('keyword',''), fm['title'], body, fm.get('faq'))}회, 유사도 {similarity(ob, body):.2f}")
            continue
        if fm.get("rewritten"): continue
        if not a.ids and not fm.get("public", True): continue
        if a.section and fm.get("section") != a.section: continue
        if not a.ids and fm.get("section") not in ("상속", "부동산", "분쟁 절차", "꿀팁"): continue
        targets.append(f)
    if a.check or a.fix: return
    if not a.all and not a.ids and a.limit: targets = targets[:a.limit]
    if not targets: print("대상 없음"); return
    print(f"대상 {len(targets)}편, 모델 {MODEL}")
    cl = client(); slugs = existing_slugs(); results = []; T_in = T_out = 0
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading; lock = threading.Lock()
    def job(f):
        try:
            with lock: pass
            r = rewrite_one(cl, f, slugs)
            return f, r, None
        except Exception as e:
            return f, None, e
    with ThreadPoolExecutor(max_workers=max(1, a.workers)) as ex:
        futs = [ex.submit(job, f) for f in targets]
        for i, fut in enumerate(as_completed(futs), 1):
            f, r, err = fut.result()
            if err: print(f"[{i}/{len(targets)}] {f.stem} 실패: {err}"); continue
            if r:
                results.append(r); T_in += r["in"]; T_out += r["out"]
                print(f"[{i}/{len(targets)}] {f.stem} → {r['slug']} | {r['keyword']} ×{r['kw']} | 유사도 {r['sim']} | {r['chars']}자")
    print(f"완료 {len(results)}편 · 토큰 입력 {T_in:,} 출력 {T_out:,}")
    (ROOT / "scripts" / "naver" / "rewrite_log.jsonl").open("a", encoding="utf-8").write("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in results))

if __name__ == "__main__":
    main()
