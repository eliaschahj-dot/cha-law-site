# -*- coding: utf-8 -*-
"""
data/review_rewrite.csv (+ review_rewrite_extra.csv) 의 수정안을 cha-blog-archive 마크다운에 적용한다.

- 기본은 --dry-run: 파일을 바꾸지 않고 각 행의 치환 대상을 찾았는지, 적용 후 광고규정 필터(import_archive.py 의
  REVIEW_TERMS)에 남는 문장이 있는지만 보고한다.
- --apply 를 줘야 실제로 쓴다. 쓰기 전 원본을 data/rewrite_backup/<타임스탬프>/ 에 복사한다.
- 치환은 본문(front matter 뒤, HTML 주석 밖)에서만 한다. front matter 의 flags: 와 파일 끝 주석(제거된 꼬리말)은 그대로 둔다.
- 같은 행이 여러 번 실행돼도 안전하다: 원문이 없고 수정안이 이미 들어 있으면 '이미 적용'으로 본다.
- 수정안이 빈 칸이면 해당 블록을 지우고 빈 줄 하나를 함께 거둬 문단 간격을 유지한다.

실행:
  python -I -X utf8 scripts/apply_rewrites.py                 # dry-run (기본)
  python -I -X utf8 scripts/apply_rewrites.py --apply         # 실제 적용
  python -I -X utf8 scripts/apply_rewrites.py --no-extra      # review_rewrite_extra.csv 제외
  python -I -X utf8 scripts/apply_rewrites.py --only 224118388646,223463335463
"""
import csv, re, sys, shutil, pathlib, datetime, collections, importlib.util

ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHIVE = ROOT.parent / "cha-blog-archive"
MAIN_CSV = ROOT / "data" / "review_rewrite.csv"
EXTRA_CSV = ROOT / "data" / "review_rewrite_extra.csv"
BACKUP_DIR = ROOT / "data" / "rewrite_backup"

APPLY = "--apply" in sys.argv
NO_EXTRA = "--no-extra" in sys.argv
ONLY = None
for i, a in enumerate(sys.argv):
    if a == "--only" and i + 1 < len(sys.argv):
        ONLY = set(sys.argv[i + 1].split(","))

# import_archive.py 의 필터·정제 로직을 그대로 가져와 적용 결과를 검증한다.
_spec = importlib.util.spec_from_file_location("import_archive", ROOT / "scripts" / "import_archive.py")
_ia = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ia)
sanitize, review_hits, parse_front = _ia.sanitize, _ia.review_hits, _ia.parse_front

COMMENT = re.compile(r"<!--.*?-->", re.S)


def load_rows():
    rows = []
    for p, kind in ((MAIN_CSV, "main"), (EXTRA_CSV, "extra")):
        if kind == "extra" and NO_EXTRA:
            continue
        if not p.exists():
            continue
        with open(p, encoding="utf-8-sig", newline="") as fh:
            for r in csv.DictReader(fh):
                r["_kind"] = kind
                rows.append(r)
    if ONLY:
        rows = [r for r in rows if r["logNo"] in ONLY]
    return rows


def ws_pattern(s):
    """원문을 공백 차이에 관대한 정규식으로. 줄 끝 공백·개행 수 차이를 흡수한다."""
    parts = [re.escape(p) for p in re.split(r"\s+", s.strip()) if p]
    return re.compile(r"\s+".join(parts))


def body_spans(text):
    """front matter 뒤, HTML 주석 밖 구간들 [(start,end), ...]"""
    m = re.match(r"^---\n.*?\n---\n", text, re.S)
    start = m.end() if m else 0
    spans, pos = [], start
    for c in COMMENT.finditer(text, start):
        if c.start() > pos:
            spans.append((pos, c.start()))
        pos = c.end()
    if pos < len(text):
        spans.append((pos, len(text)))
    return spans


def find_all(text, orig):
    """본문 구간에서 orig 의 위치들 [(s,e)]. 리터럴 → 공백 관대 순으로 시도."""
    hits = []
    for (a, b) in body_spans(text):
        seg = text[a:b]
        i = seg.find(orig)
        while i != -1:
            hits.append((a + i, a + i + len(orig)))
            i = seg.find(orig, i + 1)
    if hits:
        return hits, "literal"
    pat = ws_pattern(orig)
    for (a, b) in body_spans(text):
        for m in pat.finditer(text[a:b]):
            hits.append((a + m.start(), a + m.end()))
    return hits, ("whitespace" if hits else None)


def splice(text, s, e, new):
    if new:
        return text[:s] + new + text[e:]
    # 삭제: 뒤따르는 빈 줄 하나(또는 앞의 빈 줄)를 함께 거둔다
    if text[e:e + 2] == "\n\n":
        e += 2
    elif text[s - 2:s] == "\n\n":
        s -= 2
    out = text[:s] + text[e:]
    return re.sub(r"\n{3,}", "\n\n", out)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    rows = load_rows()
    by_file = collections.OrderedDict()
    for r in rows:
        by_file.setdefault(r["아카이브 파일"], []).append(r)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    stats = collections.Counter()
    problems = []
    remaining = {}
    for rel, rs in by_file.items():
        path = ARCHIVE / rel
        if not path.exists():
            for r in rs:
                problems.append((r["logNo"], r["검토 항목"], "파일 없음: " + rel))
                stats["missing_file"] += 1
            continue
        text = path.read_text(encoding="utf-8")
        new_text = text
        done_pairs = set()
        for r in rs:
            orig, new = r["원문 문장"], r["수정안"]
            key = (orig, new)
            tag = f"{r['logNo']} [{r['검토 항목']}]{' (extra)' if r['_kind']=='extra' else ''}"
            if key in done_pairs:
                stats["dup_pair"] += 1
                print(f"  = {tag}: 동일 문단 치환이 앞 행에서 이미 처리됨")
                continue
            done_pairs.add(key)
            hits, how = find_all(new_text, orig)
            if not hits:
                if new and find_all(new_text, new)[0]:
                    stats["already"] += 1
                    print(f"  ✓ {tag}: 이미 적용됨")
                else:
                    stats["not_found"] += 1
                    problems.append((r["logNo"], r["검토 항목"], "원문을 찾지 못함: " + re.sub(r"\s+", " ", orig)[:80]))
                    print(f"  ✗ {tag}: 원문을 찾지 못함")
                continue
            if len(hits) > 1:
                stats["multi"] += 1
                print(f"  ! {tag}: 원문이 {len(hits)}곳 — 모두 치환")
            for (s, e) in reversed(hits):
                new_text = splice(new_text, s, e, new)
            stats["found"] += 1
            print(f"  {'·' if not APPLY else '✎'} {tag}: {'삭제' if not new else '치환'}{'' if how=='literal' else ' (공백 차이 흡수)'}")
        # 적용 후 필터 재검사 (import_archive.py 와 같은 절차)
        fm, body = parse_front(new_text)
        clean, _ = sanitize(body)
        plain = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", clean)
        plain = re.sub(r"[#>*_`\[\]()]", " ", plain)
        left = review_hits(plain)
        if left:
            remaining[rel] = left
        if APPLY and new_text != text:
            bdir = BACKUP_DIR / stamp / pathlib.Path(rel).parent
            bdir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, bdir / pathlib.Path(rel).name)
            path.write_text(new_text, encoding="utf-8")
            stats["files_written"] += 1

    print("\n==== 요약 ====")
    print(f"행 {len(rows)}개 / 파일 {len(by_file)}개 / 모드 {'APPLY' if APPLY else 'DRY-RUN'}")
    for k in ("found", "already", "dup_pair", "multi", "not_found", "missing_file", "files_written"):
        if stats[k]:
            print(f"  {k}: {stats[k]}")
    if problems:
        print("\n문제 행:")
        for p in problems:
            print("  -", *p)
    if remaining:
        print("\n적용 후에도 필터에 남는 글:")
        for rel, left in remaining.items():
            for name, sent in left:
                print(f"  - {rel} [{name}] {sent[:90]}")
    else:
        print("\n적용 후 필터 재검사: 남는 문장 없음 (모든 대상 글이 전문 게재 가능 상태)")
    if APPLY and stats["files_written"]:
        print(f"\n백업: {BACKUP_DIR / stamp}")
    return 1 if (problems or remaining) else 0


if __name__ == "__main__":
    sys.exit(main())
