#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
convert.py - raw/{logNo}.html (네이버 SmartEditor ONE) 을 홈페이지 재공개용 마크다운으로 변환하고
광고규정 검수 플래그를 붙인다.

출력:
  content/{카테고리슬러그}/{YYYY-MM-DD}-{logNo}.md   프런트매터 + 본문
  flags_report.csv       글 단위 (logNo, 제목, 섹션, 플래그 수, 플래그 종류, 게시일, 파일)
  flags_detail.csv       플래그 단위 (logNo, 제목, 섹션, 종류, 문장, 제거된 꼬리말 안인지)
  convert_stats.json     편수·섹션별·플래그별 통계, 변환 실패 목록

규칙:
  - 글 내용은 고치지 않는다. 플래그는 표시만 한다.
  - 스티커, 상담 신청/온트랙 등 광고성 링크카드(와 그 바로 앞의 '▼ 상담 신청' 안내 한 줄),
    "이어서 보면 좋을 칼럼"·"긴 글 읽어주셔서 감사합니다" 류 꼬리말은 본문에서 제거하되,
    제거한 텍스트는 파일 끝 HTML 주석에 그대로 남긴다(검수용).
  - 플래그 검사는 제거 전 전체 텍스트(제목 + 본문 + 링크카드 문구)에 대해 수행한다.

실행:  python -I scripts/convert.py [--only LOGNO,...]
"""
import argparse
import csv
import html as htmllib
import json
import re
import sys
from collections import Counter, OrderedDict
from pathlib import Path
from urllib.parse import urlsplit

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "posts_index.json"
RAW = ROOT / "raw"
IMAGES = ROOT / "images"
CONTENT = ROOT / "content"
REPORT = ROOT / "flags_report.csv"
DETAIL = ROOT / "flags_detail.csv"
STATS = ROOT / "convert_stats.json"

BLOG_ID = "ontracksign"
NAVER_IMAGE_HOSTS = ("mblogthumb-phinf.pstatic.net", "postfiles.pstatic.net", "blogfiles.pstatic.net",
                     "blogfiles.naver.net", "postfiles.naver.net")

# ---------------------------------------------------------------- 카테고리 -> 섹션/슬러그
CATEGORY_MAP = {
    # categoryNo: (slug, section)
    22: ("sangsok-sangdam", "칼럼-상속"),          # 상속 법률상담소
    19: ("budongsan-sangdam", "칼럼-부동산"),      # 부동산 법률상담소
    20: ("bunyang-gyeyak", "칼럼-부동산"),         # └ 분양계약
    21: ("budongsan-bunjaeng", "칼럼-부동산"),     # └ 부동산 분쟁
    23: ("minsa-sangdam", "칼럼-분쟁절차"),        # 민사 법률상담소
    7: ("jeonse-az", "꿀팁-계약"),                 # 전세계약 A~Z
    9: ("wolse-az", "꿀팁-계약"),                  # 월세계약 A~Z
    16: ("maemae-gyeyak", "꿀팁-계약"),            # 매매계약
    18: ("teukyak-zip", "꿀팁-계약"),              # 특약사항 모음Zip
    17: ("bojeunggeum-chatgi", "꿀팁-계약"),       # 내 보증금 찾기 (가정: 꿀팁)
    11: ("anjeon-budongsan", "꿀팁-계약"),         # 안전 부동산 찾기 (가정: 꿀팁)
    14: ("ontrack", "비공개-온트랙"),              # 부동산 안심 계약 - 온트랙 (상위 직접 글)
    24: ("gajigeupgeum", "비공개-가지급금"),       # 가지급금 분쟁
}
DEFAULT_CAT = ("etc", "미분류")

# ---------------------------------------------------------------- 태그 사전 (태그: 검색 패턴들)
TAG_RULES = OrderedDict([
    ("유류분", [r"유류분"]),
    ("상속재산분할", [r"상속재산\s*분할", r"재산분할\s*심판"]),
    ("유언", [r"유언", r"유증"]),
    ("성년후견", [r"성년\s*후견", r"후견인"]),
    ("상속등기", [r"상속\s*등기"]),
    ("상속세", [r"상속세"]),
    ("증여", [r"증여"]),
    ("상속포기", [r"상속\s*포기"]),
    ("한정승인", [r"한정\s*승인"]),
    ("상속채무", [r"상속\s*채무", r"상속\s*빚", r"빚.{0,4}상속", r"채무.{0,4}상속"]),
    ("기여분", [r"기여분"]),
    ("특별수익", [r"특별\s*수익"]),
    ("대습상속", [r"대습\s*상속"]),
    ("상속회복청구", [r"상속회복"]),
    ("상속분", [r"법정\s*상속분", r"상속분"]),
    ("가업승계", [r"가업\s*승계"]),
    ("사실혼", [r"사실혼"]),
    ("이혼", [r"이혼"]),
    ("전세보증금", [r"전세\s*보증금", r"보증금\s*반환", r"전세금"]),
    ("전세사기", [r"전세\s*사기"]),
    ("임차권등기", [r"임차권\s*등기"]),
    ("확정일자", [r"확정일자"]),
    ("전세", [r"전세"]),
    ("월세", [r"월세"]),
    ("임대차", [r"임대차", r"임대인", r"임차인"]),
    ("분양", [r"분양"]),
    ("매매", [r"매매"]),
    ("명도", [r"명도"]),
    ("재개발", [r"재개발", r"재건축", r"정비사업", r"조합원"]),
    ("공사대금", [r"공사\s*대금", r"공사비"]),
    ("하자", [r"하자"]),
    ("가압류", [r"가압류"]),
    ("가처분", [r"가처분"]),
    ("경매", [r"경매"]),
    ("계약해제", [r"계약\s*해제", r"계약\s*해지", r"해제권"]),
    ("위약금", [r"위약금", r"손해배상액의 예정"]),
    ("계약금", [r"계약금"]),
    ("중도금", [r"중도금"]),
    ("특약", [r"특약"]),
    ("등기부등본", [r"등기부", r"등기사항"]),
    ("전자계약", [r"전자\s*계약"]),
    ("공인중개사", [r"공인\s*중개사", r"중개보수", r"중개사"]),
    ("대출", [r"대출"]),
    ("손해배상", [r"손해배상"]),
    ("부당이득", [r"부당이득"]),
    ("내용증명", [r"내용증명"]),
    ("지급명령", [r"지급명령"]),
    ("소송절차", [r"소송", r"소장", r"변론", r"판결"]),
    ("조정", [r"조정\s*절차", r"조정기일", r"조정위원"]),
    ("가지급금", [r"가지급금"]),
    ("법인", [r"법인"]),
    ("세금", [r"양도세", r"취득세", r"양도소득세", r"세무"]),
    ("관리비", [r"관리비"]),
    ("집합건물", [r"집합건물", r"구분소유"]),
    ("상가", [r"상가", r"권리금"]),
    ("오피스텔", [r"오피스텔"]),
    ("아파트", [r"아파트"]),
    ("신탁", [r"신탁"]),
    ("사기", [r"사기"]),
    ("혼외자", [r"혼외자", r"인지\s*청구", r"인지\s*소송", r"친생자"]),
    ("변호사비용", [r"변호사\s*비용", r"수임료", r"상담\s*비용", r"법률\s*비용", r"착수금"]),
    ("형사합의", [r"합의금", r"특수폭행", r"폭행", r"형사\s*합의", r"고소"]),
    ("주택임대차보호법", [r"주택임대차보호법", r"주임법"]),
    ("상가임대차보호법", [r"상가(건물)?임대차보호법", r"상임법"]),
    ("인감증명", [r"인감", r"본인서명확인서"]),
    ("등기", [r"등기\s*신청", r"소유권\s*이전\s*등기", r"등기소"]),
    # 범용 태그(가중치 낮음): 구체 태그가 적을 때만 채워진다
    ("상속", [r"상속"]),
    ("부동산", [r"부동산"]),
])
GENERIC_TAGS = {"상속", "부동산"}
GENERIC_WEIGHT = 0.15
MAX_TAGS = 8

# ---------------------------------------------------------------- 검수 플래그 규칙
PHONE_RE = r"(?<!\d)(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})(?!\d)"
FLAG_RULES = [
    # (종류, 정규식)
    ("무료", r"무료"),
    ("착수금", r"착수금"),
    ("성공보수", r"성공\s*보수"),
    ("승소", r"승소"),
    ("보장", r"보장"),
    ("100%", r"100\s*%|백\s*퍼센트"),
    ("최고", r"최고"),
    ("유일", r"유일"),
    ("전문 로펌", r"전문\s*로펌|전문\s*법무법인"),
    ("전담", r"전담"),
    ("온트랙", r"온트랙|온\s*트랙"),
    ("ontracksign", r"ontracksign"),
    ("theirlaw", r"theirlaw"),
    ("온전 법률사무소", r"온전\s*법률사무소|온전\s*\(주\)|온전㈜|온전주식회사"),
    ("전화번호", PHONE_RE),
    ("수치 주장", r"(하루|매일|일일|한\s*달|매월|월|연간|누적|지금까지)\s*\d[\d,]*\s*(명|건|회|분|팀)|\d[\d,]*\s*(명|건)\s*(이상|넘|돌파)"),
    ("전문(성명 미병기)", r"전문\s*변호사"),
]
NAME_RE = re.compile(r"차형진")
OWN_BLOG_URL_RE = re.compile(r"https?://(m\.)?blog\.naver\.com/ontracksign(/\d+)?", re.I)


def flag_sentences(text: str) -> list:
    """텍스트에서 플래그에 걸리는 문장을 찾는다. [(종류, 문장)]"""
    out = []
    sentences = re.split(r"(?<=[.!?。])\s+|\n+", text)
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        # 본인 블로그 글 링크(blog.naver.com/ontracksign/…)는 브랜드 노출이 아니므로 ontracksign 검사에서 제외
        s_for_brand = OWN_BLOG_URL_RE.sub("", s)
        for kind, pat in FLAG_RULES:
            target = s_for_brand if kind == "ontracksign" else s
            if re.search(pat, target):
                if kind == "전문(성명 미병기)" and NAME_RE.search(s):
                    continue  # '전문 변호사 차형진' 처럼 성명이 병기된 문장은 허용
                out.append((kind, s[:200]))
    return out


# ---------------------------------------------------------------- 광고 블록 / 꼬리말 판정
AD_LINK_HOSTS = ("ontracksign.com", "theirlaw", "onjeon", "talk.naver.com", "naver.me", "booking.naver.com",
                 "form.office.naver.com", "pf.kakao.com", "open.kakao.com", "smartstore.naver.com")
AD_LINK_PATHS = ("/ontracksign/223803550663",)  # [상담신청] 차형진 대표 변호사 1:1 법률상담 글
AD_TITLE_RE = re.compile(r"상담\s*신청|상담신청|온트랙|안심\s*계약\s*서비스|화상\s*계약|법률상담 신청|1:1\s*(법률)?상담")

TAIL_MARK_RE = re.compile(
    r"이어서\s*(많이\s*)?(보|읽)|함께\s*(보|읽)(면|으면|으시면)?\s*좋|추천\s*(칼럼|글)|관련\s*(칼럼|글)\s*[▼↓>\]]|"
    r"1\s*:\s*1\s*(법률)?\s*상담|상담\s*신청\s*[▼↓▶]|상담\s*신청은\s*아래|"
    r"이 글이 도움이 되셨다면|도움이 되셨다면|공감.*이웃\s*추가|이웃\s*추가|"
    r"긴 글 읽어\s*주셔서\s*감사|끝까지 읽어\s*주셔서\s*감사|읽어\s*주셔서\s*감사합니다|"
    r"아래\s*(링크|배너)를\s*(확인|클릭|눌러)|아래\s*창구로|"
    r"무료\s*상담|전화\s*상담|카카오톡\s*상담|카톡\s*상담|네이버\s*톡톡|톡톡\s*문의|상담\s*문의|"
    r"#\S+\s+#\S+"  # 해시태그 줄
)
# 광고 링크카드 바로 앞의 안내 한 줄("<… 상담 신청 ▼>" 등)
CTA_LINE_RE = re.compile(r"상담|문의|신청|진단|검토|▼|↓|▶|아래|링크|클릭|배너")


def is_ad_link(href: str, title: str, summary: str) -> bool:
    h = (href or "").lower()
    if any(x in h for x in AD_LINK_HOSTS):
        return True
    if any(p in h for p in AD_LINK_PATHS):
        return True
    if AD_TITLE_RE.search(title or "") or AD_TITLE_RE.search(summary or ""):
        return True
    return False


# ---------------------------------------------------------------- 인라인 변환
ZW = "​‌‍﻿"


def _wrap(inner: str, mark: str) -> str:
    """앞뒤 공백은 마커 밖으로 빼서 '**굵게**' 형태를 유지."""
    core = inner.strip()
    if not core:
        return inner if inner.strip(ZW + " ") else ""
    lead = inner[: len(inner) - len(inner.lstrip())]
    trail = inner[len(inner.rstrip()):]
    return f"{lead}{mark}{core}{mark}{trail}"


def inline_md(node, in_link: bool = False) -> str:
    """span/b/u/i/a/br 를 마크다운 인라인으로. <br> 은 공백 두 개 + 개행."""
    parts = []
    for child in node.children:
        if isinstance(child, NavigableString):
            s = str(child)
            for z in ZW:
                s = s.replace(z, "")
            parts.append(s)
            continue
        if not isinstance(child, Tag):
            continue
        name = child.name.lower()
        if name == "br":
            parts.append("  \n")
        elif name in ("b", "strong"):
            parts.append(_wrap(inline_md(child, in_link), "**"))
        elif name in ("i", "em"):
            parts.append(_wrap(inline_md(child, in_link), "*"))
        elif name == "a" and not in_link:
            href = child.get("href") or ""
            inner = inline_md(child, True).strip() or href
            parts.append(f"[{inner}]({href})" if href else inner)
        else:  # span, u, s, font, ...
            parts.append(inline_md(child, in_link))
    return "".join(parts)


def clean_text(s: str) -> str:
    for z in ZW:
        s = s.replace(z, "")
    s = s.replace("\xa0", " ").replace(" ", " ")
    s = re.sub(r"[ \t]+", " ", s)
    # 인접한 굵게 구간 병합: '**a****b**' -> '**ab**', '**a** **b**' -> '**a b**'
    s = re.sub(r"\*\*(\s*)\*\*", r"\1", s)
    s = re.sub(r"\*\*\s*\*\*", "", s)
    return s.strip()


def para_md(p: Tag) -> str:
    return clean_text(inline_md(p))


def para_text(p: Tag) -> str:
    return clean_text(p.get_text(" ", strip=False))


# ---------------------------------------------------------------- 블록 추출
class Block:
    __slots__ = ("kind", "md", "text", "ad", "meta")

    def __init__(self, kind, md, text="", ad=False, meta=None):
        self.kind = kind      # para, heading, list, quote, table, image, oglink, hr, sticker, other, blank
        self.md = md          # 마크다운
        self.text = text      # 플래그 검사용 순수 텍스트
        self.ad = ad          # 광고 블록 여부
        self.meta = meta or {}


SENTENCE_END_RE = re.compile(r"(다|요|죠|까|니다|네|음|함)\s*[.!?~]*$")


def heading_like(p: Tag, txt: str) -> bool:
    """굵은 글씨/큰 글씨 한 줄 짜리 소제목 판정 (보수적)."""
    if not txt or len(txt) > 40:
        return False
    if txt[0] in "\"'“‘(<[「『【":
        return False
    if re.search(r"[▼↓▶→☞✅]", txt):
        return False
    if SENTENCE_END_RE.search(txt):
        return False
    big = any(re.match(r"se-fs-fs(19|2\d|3\d)", c) for sp in p.find_all("span") for c in sp.get("class", []))
    bolds = p.find_all(["b", "strong"])
    if not bolds and not big:
        return False
    bold_text = clean_text(" ".join(b.get_text(" ") for b in bolds))
    all_bold = bool(bolds) and len(bold_text) >= len(txt) * 0.9
    return bool(big or all_bold)


def text_module_blocks(mod: Tag) -> list:
    """div.se-module-text 안의 p / ul / ol 을 순서대로 블록으로."""
    blocks = []
    for el in mod.children:
        if not isinstance(el, Tag):
            continue
        if el.name == "p":
            md = para_md(el)
            txt = para_text(el)
            if not md:
                blocks.append(Block("blank", ""))
                continue
            blocks.append(Block("para", md, txt, meta={"heading_like": heading_like(el, txt)}))
        elif el.name in ("ul", "ol"):
            items = []
            ordered = el.name == "ol"
            for i, li in enumerate(el.find_all("li", recursive=False), 1):
                line = " ".join(para_md(p) for p in li.find_all("p") if para_md(p))
                if not line:
                    line = clean_text(li.get_text(" "))
                if line:
                    items.append(f"{i}. {line}" if ordered else f"- {line}")
            if items:
                blocks.append(Block("list", "\n".join(items), "\n".join(items)))
        elif el.name == "div":
            blocks.extend(text_module_blocks(el))
    return blocks


def convert_component(comp: Tag, ctx: dict) -> list:
    log_no, img_map, img_rel, title = ctx["log_no"], ctx["img_map"], ctx["img_rel"], ctx["title"]
    cls = comp.get("class", [])
    kind = next((c[3:] for c in cls if c.startswith("se-") and c not in ("se-component",)), "")
    blocks = []

    if kind == "text":
        for mod in comp.select("div.se-module-text"):
            blocks.extend(text_module_blocks(mod))
            break

    elif kind == "quotation":
        quote = comp.select_one(".se-quote")
        cite = comp.select_one(".se-cite")
        inner = text_module_blocks(quote) if quote else []
        inner = [b for b in inner if b.kind != "blank"]
        txt = "\n".join(b.text for b in inner)
        underline_style = any("quotation_underline" in c for c in cls)
        joined = " ".join(b.text for b in inner)
        as_heading = False
        if inner and all(b.kind == "para" for b in inner) and len(joined) <= 60:
            if underline_style and len(inner) == 1:
                as_heading = True
            elif len(inner) <= 2 and not SENTENCE_END_RE.search(joined) and joined[0] not in "\"'“‘(":
                as_heading = True
        if as_heading:
            md = "## " + re.sub(r"\*\*", "", " ".join(b.md for b in inner))
            blocks.append(Block("heading", md, joined))
        elif inner:
            lines = []
            for b in inner:
                for ln in b.md.split("\n"):
                    lines.append("> " + ln)
            if cite:
                c = clean_text(cite.get_text(" "))
                if c:
                    lines.append("> — " + c)
            blocks.append(Block("quote", "\n".join(lines), txt))

    elif kind in ("image", "imageGroup", "imageStrip"):
        for img in comp.select("img"):
            a = img.find_parent("a")
            src = ""
            if a is not None and a.get("data-linkdata"):
                try:
                    src = json.loads(a["data-linkdata"]).get("src", "")
                except Exception:  # noqa: BLE001
                    src = ""
            src = src or img.get("data-lazy-src") or img.get("src") or ""
            if not src.startswith("http"):
                continue
            host = urlsplit(src).netloc
            if host in ("dthumb-phinf.pstatic.net", "storep-phinf.pstatic.net"):
                continue
            external = host not in NAVER_IMAGE_HOSTS
            base = src if external else f"https://{host}{urlsplit(src).path}"
            local = img_map.get(base)
            ctx["img_n"] += 1
            alt = clean_text(img.get("alt") or "") or f"{title} - 이미지 {ctx['img_n']}"
            if local:
                path = f"{img_rel}/{log_no}/{local}"
                blocks.append(Block("image", f"![{alt}]({path})",
                                    meta={"src": base, "local": path, "external": external}))
            else:
                remote = img.get("data-lazy-src") or src
                blocks.append(Block("image", f"![{alt}]({remote})",
                                    meta={"src": base, "local": None, "external": external}))
        cap = comp.select_one(".se-caption")
        if cap:
            c = clean_text(cap.get_text(" "))
            if c:
                blocks.append(Block("para", f"*{c}*", c))

    elif kind == "oglink":
        a = comp.select_one("a.se-oglink-info") or comp.select_one("a")
        href = a.get("href") if a else ""
        title_ = clean_text((comp.select_one(".se-oglink-title") or Tag(name="x")).get_text(" "))
        summary = clean_text((comp.select_one(".se-oglink-summary") or Tag(name="x")).get_text(" "))
        site = clean_text((comp.select_one(".se-oglink-url") or Tag(name="x")).get_text(" "))
        ad = is_ad_link(href, title_, summary)
        md = f"> 🔗 **[{title_ or href}]({href})**"
        if summary:
            md += f"  \n> {summary}"
        if site:
            md += f"  \n> <small>{site}</small>"
        blocks.append(Block("oglink", md, "\n".join(x for x in (title_, summary, href) if x), ad=ad,
                            meta={"href": href, "title": title_}))

    elif kind == "horizontalLine":
        blocks.append(Block("hr", "---"))

    elif kind == "sticker":
        blocks.append(Block("sticker", "", ad=True))

    elif kind == "table":
        table = comp.select_one("table")
        rows = []
        if table is not None:
            for tr in table.find_all("tr"):
                cells = []
                for td in tr.find_all(["td", "th"]):
                    paras = [para_md(p) for p in td.find_all("p")]
                    paras = [x for x in paras if x]
                    cells.append(("<br>".join(paras)) if paras else clean_text(td.get_text(" ")))
                rows.append(cells)
        txt = "\n".join(" | ".join(r) for r in rows)
        if rows and len(rows) == 1 and len(rows[0]) == 1:
            # 한 칸짜리 박스(핵심 요약 등) -> 인용 블록
            lines = ["> " + ln for ln in rows[0][0].split("<br>")]
            blocks.append(Block("quote", "\n".join(lines), txt))
        elif rows:
            width = max(len(r) for r in rows)
            norm = [r + [""] * (width - len(r)) for r in rows]
            esc = [[c.replace("|", "\\|") for c in r] for r in norm]
            lines = ["| " + " | ".join(esc[0]) + " |", "|" + "---|" * width]
            for r in esc[1:]:
                lines.append("| " + " | ".join(r) + " |")
            blocks.append(Block("table", "\n".join(lines), txt))

    elif kind == "sectionTitle":
        t = clean_text(comp.get_text(" "))
        if t:
            blocks.append(Block("heading", "## " + t, t))

    elif kind in ("video", "oembed", "file", "placesMap", "material", "code", "formula", "schedule"):
        t = clean_text(comp.get_text(" "))
        a = comp.select_one("a[href]")
        href = a.get("href") if a else ""
        label = {"video": "동영상", "oembed": "외부 콘텐츠", "file": "첨부파일", "placesMap": "지도",
                 "material": "자료", "code": "코드", "formula": "수식", "schedule": "일정"}.get(kind, kind)
        md = f"*[{label}: {t[:80]}]({href})*" if href else f"*[{label}: {t[:80]}]*"
        blocks.append(Block("other", md, t, meta={"kind": kind}))

    else:
        for mod in comp.select("div.se-module-text"):
            blocks.extend(text_module_blocks(mod))
        if not blocks:
            t = clean_text(comp.get_text(" "))
            if t:
                blocks.append(Block("para", t, t, meta={"unknown": kind}))
    return blocks


def extract_blocks(html: str, ctx: dict) -> list:
    soup = BeautifulSoup(html, "lxml")
    main = soup.select_one("div.se-main-container")
    if main is None:
        legacy = soup.select_one("#postViewArea")
        if legacy is None:
            raise ValueError("no se-main-container / postViewArea")
        text = clean_text(legacy.get_text("\n"))
        return [Block("para", ln, ln) for ln in text.split("\n") if ln.strip()]
    blocks = []
    for comp in main.select("div.se-component"):
        # 중첩 컴포넌트(표 안의 텍스트 모듈 등)는 상위에서 처리
        if comp.find_parent("div", class_="se-component") is not None:
            continue
        blocks.extend(convert_component(comp, ctx))
    # 링크 수집
    for a in main.select("a[href]"):
        href = a.get("href") or ""
        if not href.startswith("http"):
            continue
        if OWN_BLOG_URL_RE.match(href):
            ctx["internal_links"].append(href)
        elif "pstatic.net" not in href:
            ctx["external_links"].append(href)
    return blocks


# ---------------------------------------------------------------- 광고 블록 / 꼬리말 절단
def mark_cta_lines(blocks: list) -> None:
    """광고 링크카드/스티커 바로 앞의 짧은 안내 문단('<… 상담 신청 ▼>')도 광고 블록으로 표시."""
    for i, b in enumerate(blocks):
        if not (b.kind in ("oglink", "sticker") and b.ad):
            continue
        j = i - 1
        while j >= 0 and blocks[j].kind == "blank":
            j -= 1
        if j >= 0 and blocks[j].kind in ("para", "heading") and len(blocks[j].text) <= 45 \
                and CTA_LINE_RE.search(blocks[j].text) and not SENTENCE_END_RE.search(blocks[j].text):
            blocks[j].ad = True


def split_tail(blocks: list) -> tuple:
    """꼬리말 시작 지점을 찾아 (본문, 꼬리말) 로 나눈다."""
    def is_marker(b):
        return b.kind in ("para", "heading") and TAIL_MARK_RE.search(b.text or "")

    def tail_ok(rest):
        # 꼬리말 구간: 광고/링크카드/이미지/빈 줄/구분선/스티커/짧은 문단/마커 문단만 있어야 한다
        for b in rest:
            if b.kind in ("blank", "hr", "sticker", "image", "oglink"):
                continue
            if b.kind in ("para", "heading") and (is_marker(b) or len(b.text) <= 45 or b.ad):
                continue
            return False
        return True

    n = len(blocks)
    start_search = max(0, int(n * 0.5))
    for i in range(start_search, n):
        if is_marker(blocks[i]) and tail_ok(blocks[i + 1:]):
            return blocks[:i], blocks[i:]
    return blocks, []


def render(blocks: list) -> str:
    out = []
    prev_blank = True
    for b in blocks:
        if b.kind == "blank":
            if not prev_blank:
                out.append("")
                prev_blank = True
            continue
        if b.kind == "sticker" or not b.md:
            continue
        if b.kind == "para" and b.meta.get("heading_like"):
            out.append("### " + re.sub(r"\*\*", "", b.md))
        else:
            out.append(b.md)
        out.append("")
        prev_blank = True
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
    return text


# ---------------------------------------------------------------- 태그
def auto_tags(title: str, body: str) -> list:
    scores = {}
    for tag, pats in TAG_RULES.items():
        n_title = sum(len(re.findall(p, title)) for p in pats)
        n_body = sum(len(re.findall(p, body)) for p in pats)
        if n_title or n_body >= 2:
            score = n_title * 5 + n_body
            if tag in GENERIC_TAGS:
                score *= GENERIC_WEIGHT
            scores[tag] = score
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    return [t for t, _ in ranked[:MAX_TAGS]]


# ---------------------------------------------------------------- YAML
def y(s) -> str:
    return json.dumps(s, ensure_ascii=False)


def frontmatter(d: OrderedDict) -> str:
    lines = ["---"]
    for k, v in d.items():
        if isinstance(v, list):
            if not v:
                lines.append(f"{k}: []")
            elif all(isinstance(x, str) for x in v):
                lines.append(f"{k}:")
                for x in v:
                    lines.append(f"  - {y(x)}")
            else:
                lines.append(f"{k}:")
                for x in v:
                    lines.append(f"  - type: {y(x['type'])}")
                    lines.append(f"    text: {y(x['text'])}")
                    if x.get("removed"):
                        lines.append("    in_removed_tail: true")
        elif isinstance(v, bool):
            lines.append(f"{k}: {'true' if v else 'false'}")
        elif isinstance(v, (int, float)):
            lines.append(f"{k}: {v}")
        elif v is None:
            lines.append(f"{k}: null")
        else:
            lines.append(f"{k}: {y(str(v))}")
    lines.append("---")
    return "\n".join(lines)


# ---------------------------------------------------------------- 글 하나 변환
def convert_post(p: dict) -> dict:
    log_no = p["logNo"]
    raw = RAW / f"{log_no}.html"
    if not raw.exists():
        raise FileNotFoundError(f"raw/{log_no}.html 없음")
    html = raw.read_text(encoding="utf-8", errors="replace")

    slug, section = CATEGORY_MAP.get(p.get("category_no"), DEFAULT_CAT)
    date_iso = p.get("date") or ""
    day = date_iso[:10] if date_iso else "0000-00-00"
    out_dir = CONTENT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{day}-{log_no}.md"

    img_map = {}
    manifest = IMAGES / log_no / "manifest.json"
    if manifest.exists():
        for it in json.loads(manifest.read_text(encoding="utf-8")):
            if it.get("status") in ("ok", "exists") and it.get("file"):
                img_map[it["src_base"]] = it["file"]

    ctx = {"log_no": log_no, "img_map": img_map, "img_rel": "../../images", "title": p["title"],
           "img_n": 0, "internal_links": [], "external_links": []}
    blocks = extract_blocks(html, ctx)

    mark_cta_lines(blocks)
    body_blocks, tail_blocks = split_tail(blocks)
    removed = [b for b in body_blocks if b.ad] + tail_blocks
    kept = [b for b in body_blocks if not b.ad]

    # 플래그: 제목 + 전체 텍스트(제거분 포함)
    flags = []
    for kind, sent in flag_sentences(p["title"]):
        flags.append({"type": kind, "text": "[제목] " + sent})
    removed_ids = {id(b) for b in removed}
    for b in blocks:
        if not b.text:
            continue
        for kind, sent in flag_sentences(b.text):
            flags.append({"type": kind, "text": sent, "removed": id(b) in removed_ids})
    seen = set()
    uniq = []
    for f in flags:
        key = (f["type"], f["text"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(f)
    flags = uniq

    body_md = render(kept)
    body_text = "\n".join(b.text for b in kept if b.text)
    kept_images = [b.meta["local"] for b in kept if b.kind == "image" and b.meta.get("local")]
    remote_images = [b.meta["src"] for b in kept if b.kind == "image" and not b.meta.get("local")]
    # 네이버가 아닌 외부 호스트에서 핫링크한 이미지(언론사 등) -> 저작권 확인 대상
    external_images = [b.meta["src"] for b in kept if b.kind == "image" and b.meta.get("external")]
    removed_text = "\n".join(b.text or b.md for b in removed if (b.text or b.md))
    removed_text = removed_text.replace("--", "—")

    def uniq_list(xs):
        return list(OrderedDict.fromkeys(xs))

    fm = OrderedDict()
    fm["title"] = p["title"]
    fm["date"] = date_iso
    fm["naver_logno"] = log_no
    fm["naver_url"] = f"https://blog.naver.com/{BLOG_ID}/{log_no}"
    fm["category"] = p.get("category_name", "")
    fm["category_no"] = p.get("category_no")
    fm["section"] = section
    fm["tags"] = auto_tags(p["title"], body_text)
    fm["summary"] = re.sub(r"\s+", " ", htmllib.unescape(p.get("brief") or "")).strip()[:200]
    fm["hero"] = kept_images[0] if kept_images else None
    fm["images"] = kept_images
    fm["images_total"] = len(img_map)
    fm["images_missing"] = remote_images
    fm["external_images"] = external_images
    fm["internal_links"] = uniq_list(ctx["internal_links"])
    fm["external_links"] = uniq_list(ctx["external_links"])
    fm["flags"] = flags
    fm["flag_count"] = len(flags)
    fm["removed_blocks"] = len(removed)
    fm["word_count"] = len(re.sub(r"\s", "", body_text))
    fm["draft"] = True  # 검수 전에는 모두 초안

    md = frontmatter(fm) + "\n\n" + body_md
    if removed_text:
        md += "\n<!-- 제거된 꼬리말/광고 블록 (원문 보존, 검수용)\n" + removed_text + "\n-->\n"
    out_path.write_text(md, encoding="utf-8")

    body_flags = [f for f in flags if not f.get("removed")]
    return {
        "logNo": log_no, "title": p["title"], "section": section, "slug": slug, "date": day,
        "path": str(out_path.relative_to(ROOT)).replace("\\", "/"),
        "flags": flags, "flag_count": len(flags),
        "flag_count_body": len(body_flags),
        "flag_types": sorted({f["type"] for f in flags}),
        "flag_types_body": sorted({f["type"] for f in body_flags}),
        "tags": fm["tags"], "images": len(kept_images), "images_total": len(img_map),
        "images_missing": len(remote_images),
        "external_images": len(external_images),
        "removed_blocks": len(removed), "word_count": fm["word_count"],
        "internal_links": len(fm["internal_links"]), "external_links": len(fm["external_links"]),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    args = ap.parse_args()
    posts = json.loads(INDEX.read_text(encoding="utf-8"))
    if args.only:
        wanted = set(args.only.split(","))
        posts = [p for p in posts if p["logNo"] in wanted]

    results, failures = [], []
    for i, p in enumerate(posts, 1):
        try:
            results.append(convert_post(p))
        except Exception as e:  # noqa: BLE001
            failures.append({"logNo": p["logNo"], "title": p["title"], "error": f"{type(e).__name__}: {e}"})
            print(f"[{i}] {p['logNo']} FAILED: {e}", file=sys.stderr)
        if i % 50 == 0:
            print(f"  ... {i}/{len(posts)}")

    with REPORT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["logNo", "제목", "섹션", "플래그 수", "플래그 종류", "본문 플래그 수", "본문 플래그 종류",
                    "게시일", "파일"])
        for r in sorted(results, key=lambda x: (-x["flag_count_body"], -x["flag_count"], x["date"])):
            w.writerow([r["logNo"], r["title"], r["section"], r["flag_count"], ";".join(r["flag_types"]),
                        r["flag_count_body"], ";".join(r["flag_types_body"]), r["date"], r["path"]])
    with DETAIL.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["logNo", "제목", "섹션", "종류", "문장", "제거된 꼬리말"])
        for r in results:
            for fl in r["flags"]:
                w.writerow([r["logNo"], r["title"], r["section"], fl["type"], fl["text"],
                            "Y" if fl.get("removed") else ""])

    by_section = Counter(r["section"] for r in results)
    by_slug = Counter(r["slug"] for r in results)
    by_flag_type = Counter(t for r in results for t in r["flag_types"])
    by_flag_type_body = Counter(t for r in results for t in r["flag_types_body"])
    flag_instances = Counter(fl["type"] for r in results for fl in r["flags"])
    body_flag_posts = sum(1 for r in results if any(not fl.get("removed") for fl in r["flags"]))
    flagged_posts = sum(1 for r in results if r["flag_count"])
    flagged_by_section = Counter(r["section"] for r in results if r["flag_count"])
    tag_counts = Counter(t for r in results for t in r["tags"])
    stats = {
        "converted": len(results),
        "failed": len(failures),
        "by_section": dict(by_section),
        "by_slug": dict(by_slug),
        "flagged_posts": flagged_posts,
        "flagged_posts_body_only": body_flag_posts,
        "flagged_posts_by_section": dict(flagged_by_section),
        "posts_by_flag_type": dict(by_flag_type),
        "posts_by_flag_type_body_only": dict(by_flag_type_body),
        "flag_instances_by_type": dict(flag_instances),
        "images_in_body": sum(r["images"] for r in results),
        "images_downloaded": sum(r["images_total"] for r in results),
        "images_missing_local": sum(r["images_missing"] for r in results),
        "external_images": sum(r["external_images"] for r in results),
        "posts_with_external_images": [r["logNo"] for r in results if r["external_images"]],
        "posts_with_internal_links": sum(1 for r in results if r["internal_links"]),
        "posts_without_tags": sum(1 for r in results if not r["tags"]),
        "posts_with_removed_blocks": sum(1 for r in results if r["removed_blocks"]),
        "top_tags": tag_counts.most_common(40),
        "failures": failures,
    }
    STATS.write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in stats.items() if k not in ("top_tags", "failures")}, ensure_ascii=False, indent=1))
    if failures:
        print("failures:", json.dumps(failures, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
