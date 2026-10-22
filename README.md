# 차형진 변호사 | 상속 전문 — 개인 홈페이지

> 2026.10.16 컨셉 변경: 부동산 축을 빼고 **상속 단일 전문**으로 개편했습니다.
> - 상단 메뉴 = 상속 키워드 랜딩 페이지: `/dispute`(상속분쟁) `/legal-reserve`(유류분) `/renunciation`(상속포기·한정승인) `/guardianship`(성년후견인) `/will`(유언) `/registration`(상속등기·명의신탁) `/tax`(상속세). 내용은 `src/content/areas/*.json`.
> - 키워드별 기둥 칼럼 7편: `src/content/columns/guide-*.md` (source: site).
> - 부동산 코너 칼럼 147편은 파일을 남기되 공개하지 않습니다(`src/data/posts.ts`의 `PUBLIC_SECTIONS`). 꿀팁 148편은 공개하되 목록 전면에는 내지 않고(`hidden`), 랜딩 페이지 '관련 글'과 태그 페이지(`/columns/tag/{태그}`)로만 이어집니다.
> - 옛 주소(`/inheritance/*`, `/real-estate/*`, `/columns/topic/real-estate`)는 `astro.config.mjs`의 redirects로 새 주소로 보냅니다.
> - 상담 페이지에는 상속 외 일반 민사·부동산·형사·가사 사건도 진행한다는 안내와 폼 선택지를 넣었습니다.

Astro 정적 사이트. 홈페이지 자체가 한 장의 등기사항전부증명서처럼 읽히도록 설계했습니다
(표제부 → 갑구(업무 분야) → 을구(일하는 방식), 왼쪽 '순위번호' 레일, 인주 도장).

## 실행

```bash
npm install
npm run dev        # http://127.0.0.1:4321
npm run build      # dist/ 생성 (457페이지)
npm run preview
npm run posts      # data/naver_index.json → src/data/posts.json 재생성
```

## 구조

```
src/
  layouts/Base.astro        공통 머리·바닥·레일·JSON-LD·OG
  styles/global.css         디자인 토큰과 모든 컴포넌트 스타일
  data/site.ts              연락처·이력·언론·FAQ (사실 정보는 여기만 고치면 됩니다)
  data/areas.ts             부동산 6 · 상속 7 분야 페이지 내용
  data/posts.json           블로그 467편 색인(430편 공개) — scripts/build_posts.py가 생성
  data/posts.ts             칼럼 코너·관련 글 유틸
  pages/                    / about real-estate/* inheritance/* columns/* fees press contact privacy 404
functions/api/contact.js    Cloudflare Pages Function — 상담 폼 수신(Resend로 이메일)
public/                     robots.txt, favicon.svg, og.png
```

> **2026.10.22 부동산 안내 페이지**: 절차 안내 4편(`/real-estate/guide`)과 상황별 안내 4편(`/real-estate/situations`)을 추가했습니다. 원본은 같은 `src/content/guides/*.json`이고 `site: re`로 구분합니다(`/admin`→'안내 페이지'→'사이트').

> **2026.10.22 부동산 전문 하위 사이트 `/real-estate`**: 같은 도메인 아래 별도 사이트처럼 동작합니다. 홈(`src/pages/real-estate/index.astro`, 상속 홈과 같은 마케터 구성)·소개(`/real-estate/lawyer`)·분야 6개(`src/content/areas/re-*.json`, 10.16 개편 때 지웠던 것을 복원)·칼럼 목록(`/real-estate/columns`, 부동산·꿀팁 코너)·FAQ·비용·상담(`ConsultFormRe.astro`, 신청서에 '중요한 날짜·걸린 금액' 항목). 레이아웃은 `Base.astro`의 `variant`(주소가 `/real-estate`로 시작하면 자동)로 메뉴·브랜드 꼬리표·푸터·OG 이미지(`og-re.png`)·구조화 데이터가 바뀝니다. 글 페이지는 코너가 부동산·꿀팁이면 부동산 틀로 보입니다. 검색 문안은 `src/data/seo.ts`, 공용 FAQ는 `src/data/realestate.ts`.

> **2026.10.21 검색 노출(SEO) 구조**: 네이버·구글 자동완성 검색어 조사 결과를 바탕으로 ① 분야 페이지 9개의 검색용 제목·설명·'검색어 소제목 단락'(`src/data/seo.ts`), ② 절차 안내 4편(`/guide`)과 상황별 안내 4편(`/situations`, 원본 `src/content/guides/*.json`, `/admin`→'안내 페이지'에서 편집·추가), ③ 칼럼 주제별 모음 허브(`/columns/tag`)와 태그 페이지 제목, ④ 구조화 데이터(Article·FAQPage·BlogPosting·CollectionPage), ⑤ robots.txt 사이트맵 주소 교정(옛 도메인→www.lawyer-cha.com)을 넣었습니다. 광고(파워링크·구글 애즈)·네이버 채널·측정 방법은 `docs/seo-marketing-plan.md`에 있습니다.

> **2026.10.20 디자인 테마**: 글은 시안 그대로 두고 `src/styles/theme.css`가 생김새를 입힙니다(제목 Noto Serif KR, 밝은 흰빛 바탕(종이 질감은 같은 날 제거), 카드·버튼·푸터, 아이콘 일러스트 `src/components/Icon.astro`, 히어로 장식, 사진 액자·폴라로이드, 등장·선 그리기·도장 애니메이션). 색·질감을 바꾸려면 theme.css만 고치면 됩니다.

> **2026.10.20 마케터 시안 반영**: 홈(`src/pages/index.astro`)과 '상속 전문 변호사' 페이지(`src/pages/inheritance-lawyer.astro`, 옛 `/about`은 여기로 넘어감)를 마케터가 만든 `index.html`·`inheritance-lawyer.html` 그대로 옮겼습니다. 그 두 페이지의 CSS는 `src/styles/marketer.css`(`.mk` 래퍼 안에서만 적용), 전역 내비·푸터·버튼은 `global.css`로 옮겼고, 사진 12장은 `public/img/*.webp`입니다. 상담 신청서는 `src/components/ConsultForm.astro`(돌아가신 시기·상속인 구성·입장·관련 항목·상황·통화 가능 시간)이고 `server.js`의 `/api/contact`가 새 필드를 메일로 보냅니다. 문안은 변협 광고규정 검사(`scripts/content_tools.py`) 기준으로 '무료 법률상담'→'공익 법률상담', 서비스 상호 '온트랙' 언급만 바꿨습니다.

## 배포 (Render) — 2026.10.16 배포 완료

- 주소: https://cha-law-site.onrender.com (Blueprint `cha-law-site`, 웹 서비스 `srv-db8rif2jnfac73bk83n0`, Free 플랜, Singapore)
- 2026.10.16 GitHub의 Render 앱에 이 저장소 접근을 추가해 **푸시 자동 배포**를 켰습니다(Auto-Deploy: On Commit). 확인: 커밋 07ea7ad 푸시 후 약 2분 만에 라이브 `X-App-Version` 헤더가 바뀌었습니다. 자동 배포가 멈추면 대시보드 → cha-law-site → Manual Deploy → Deploy latest commit.
- 환경변수(2026.10.16 기준): `NODE_VERSION`, `SITE_URL`, `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM`(2026.10.20 Resend에서 lawyer-cha.com 인증 완료 → `차형진 변호사 홈페이지 <consult@lawyer-cha.com>`), `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`. 상담 폼 메일 수신과 `/admin` 로그인 모두 확인됨.

`render.yaml`(Blueprint)이 들어 있습니다. `server.js`(Express)가 `dist/` 정적 파일과 `/api/contact`를 함께 서비스합니다.

1. GitHub에 `cha-law-site` 저장소를 만들고 푸시합니다 (아래 명령).
   ```bash
   git remote add origin https://github.com/eliaschahj-dot/cha-law-site.git
   git push -u origin main
   ```
2. Render 대시보드 → **New → Blueprint** → 저장소 선택 → `render.yaml`을 읽어 `cha-law-site` 웹 서비스를 만듭니다.
   (또는 https://render.com/deploy?repo=https://github.com/eliaschahj-dot/cha-law-site)
3. 환경변수(Render → Environment)
   - `SITE_URL` — 처음엔 `https://cha-law-site.onrender.com`, 도메인 연결 후 실제 주소 (canonical·sitemap·robots에 쓰임)
   - `RESEND_API_KEY` — resend.com 발급 키 (없으면 상담 신청이 서버 로그에만 남습니다)
   - `CONTACT_TO` — 상담 신청을 받을 이메일
   - `CONTACT_FROM` — 인증된 도메인의 발신 주소 (`차형진 변호사 홈페이지 <consult@lawyer-cha.com>`, Resend Domains에 lawyer-cha.com 인증됨·가비아 DNS에 DKIM/CNAME 2/DMARC 등록)
   - `PUBLIC_NAVER_SITE_VERIFICATION`, `PUBLIC_GOOGLE_SITE_VERIFICATION` — 소유 확인 메타 (빌드 시 적용)
4. 무료 플랜은 15분 유휴 후 잠들어 첫 접속이 30초쯤 걸립니다. 오픈 전 **Starter** 플랜으로 올리거나, 정적 사이트(Static Site)로 바꾸고 폼만 별도 처리하세요.
5. 도메인 연결: Render → Settings → Custom Domains에 도메인 추가 후 DNS(CNAME) 설정. 그 뒤 `SITE_URL`을 바꾸고 재배포.
6. 네이버 서치어드바이저·구글 서치 콘솔에 `https://도메인/sitemap-index.xml` 제출.

### 도메인 연결 체크리스트 (구매 후 순서대로)
1. 등록기관(가비아 등)에서 구매. 사이트 본인 명의로 등록하고 자동 연장을 켭니다.
2. Render → cha-law-site → Settings → Custom Domains → Add: `도메인`과 `www.도메인` 둘 다 추가. Render가 알려 주는 값대로 DNS 설정(루트는 A 레코드 또는 ALIAS, `www`는 CNAME `cha-law-site.onrender.com`). 인증서는 Render가 자동 발급(수 분~수십 분).
3. Render → Environment → `SITE_URL`을 `https://도메인`으로 바꾸고 저장(자동 재배포). canonical·sitemap·robots·OG가 새 주소로 바뀝니다.
4. `public/admin/config.yml`의 `base_url`·`site_url`을 새 주소로 바꿔 푸시하고, GitHub OAuth App(Settings → Developer settings)의 Homepage URL·Callback URL(`https://도메인/callback`)도 바꿉니다. `/admin` 로그인으로 확인.
5. Resend → Domains에서 도메인 인증(DNS에 SPF·DKIM 추가) 후 `CONTACT_FROM`을 `consult@도메인`으로 교체. 상담 폼 테스트 1회.
6. 옛 주소는 그대로 둡니다. `cha-law-site.onrender.com`은 Render가 새 도메인과 함께 계속 응답하므로 끊기지 않습니다.
7. 네이버 서치어드바이저·구글 서치 콘솔에 새 도메인 등록 → 소유 확인 메타값을 `PUBLIC_NAVER_SITE_VERIFICATION`·`PUBLIC_GOOGLE_SITE_VERIFICATION`에 넣고 재배포 → `https://도메인/sitemap-index.xml` 제출.
8. theirlaw.org 정리 절차(아래)를 시작합니다.

로컬에서 Render와 같은 방식으로 확인하려면 `npm run build && npm start` 후 http://localhost:3000.

### 대안: Cloudflare Pages
`functions/api/contact.js`(Pages Function)도 남겨 두었습니다. Build `npm run build`, output `dist`, 같은 환경변수.

## 확정 필요 (현재 플레이스홀더)

| 항목 | 현재 값 | 위치 |
|---|---|---|
| 도메인 | **https://www.lawyer-cha.com** (가비아 구매 2026.10.20, Render Custom Domain 연결) | `astro.config.mjs` 기본값, `public/admin/config.yml`, Render `SITE_URL` |
| 직통 전화 | 070-4571-7668 (블로그 공개 번호) | `src/data/site.ts` `phone` |
| 프로필 사진 | 회색 플레이스홀더 (4:5) | `index.astro`, `about.astro` `.photo` |
| 상담료 안내 문구 | "예약 시 안내" | `src/data/site.ts` `feeFaq` |
| 개인정보처리방침 시행일·위탁업체명 | 빈칸 | `src/pages/privacy.astro` |
| 톱클래스 인터뷰 링크 | 없음(지면 기사) | `src/data/site.ts` `press` |
| OG 이미지 | 자동 생성본 (`public/og.png`) | 사진 촬영 후 교체 권장 |

## 결정 반영 사항 (2026.10.16)

- 비용: 일반 수임(착수금·성공보수)이 기본, 시간제는 "자문·일부 사건"에 한해 — `/fees`, 홈 비용 섹션, FAQ.
- 연락처: 변호사 직통만 표시, 법무법인 베율 대표번호 없음.
- 베율 관계: "법무법인 베율 부대표 변호사" 병기, 주소는 베율 삼성동 사무실, 푸터에 베율 링크.
- 온전·온트랙·온전함: 로고·링크·이용 권유 없음. 경력란에 "온전 주식회사 대표"만 사실로 기재.
- theirlaw.org: 폐쇄 대상 (아래 절차).

## 방문 통계 관리자 페이지 (2026.10.20)

- 주소: `https://www.lawyer-cha.com/stats` — 비밀번호 하나로 엽니다. 비밀번호는 Render → Environment → `STATS_PASSWORD`에 넣습니다(값을 바꾸면 기존 로그인은 모두 풀립니다). 틀린 시도 10회면 15분 잠금. 글 편집기 `/admin`은 GitHub에 저장하는 구조라 GitHub 로그인을 그대로 씁니다.
- 보여주는 것: 기간(7·30·90일·1년)별 방문·방문자·페이지뷰·평균 체류·이탈률·상담 신청 수, 일별 그래프, 유입 경로(네이버 검색/블로그·구글·직접…), 진입 페이지, 많이 본 페이지와 평균 체류, 기기·브라우저·국가, 시간대, 최근 방문 60건의 페이지 흐름과 체류시간, 최근 상담 신청. `?format=json`으로 원자료.
- 수집 방식: `src/layouts/Base.astro`의 인라인 스크립트가 페이지를 열 때 `/api/hit`(view)로, 화면을 벗어날 때(leave, 30초마다 갱신) 체류시간을 보냅니다. 브라우저가 만든 난수(localStorage `cv`=방문자, sessionStorage `cs`=세션)만 쓰고 **IP·이름은 저장하지 않습니다**. 로봇 UA, `/admin`·`/stats`, 통계 화면에 로그인한 브라우저(`notrack` 쿠키)는 제외.
- 저장: `DATA_DIR/events-YYYY-MM.jsonl`(Render 영구 디스크 `/var/data`, 1GB, `render.yaml`의 `disk`). 집계는 `analytics.js`. 로컬 테스트: `DATA_DIR=./data-local STATS_OPEN=1 PORT=3999 node server.js` 후 http://localhost:3999/stats.
- 개인정보처리방침에 통계 수집 항목·보유기간(1년)을 적었습니다. 1년 지난 월 파일은 디스크에서 지우면 됩니다.

## 검색엔진 등록·SEO (2026.10.20)

- **구글 서치 콘솔**: 계정 elias.cha.h.j@gmail.com, 속성 `https://www.lawyer-cha.com/`(URL 접두어). 소유 확인은 `public/google498bd14d332aac27.html`(지우지 말 것)과 `site.json`의 `googleVerify` 메타 두 가지. 사이트맵 `sitemap-index.xml` 제출 완료.
- **네이버 서치어드바이저**: https://searchadvisor.naver.com → 웹마스터 도구 → 사이트 등록 `https://www.lawyer-cha.com` → 소유확인 'HTML 태그' 값을 `/admin` → 사이트 설정 → '네이버 사이트 소유확인 값'에 넣고 저장(2~3분 뒤 반영) → 소유확인 → 요청 › 사이트맵 제출 `https://www.lawyer-cha.com/sitemap-index.xml`, RSS 제출 `https://www.lawyer-cha.com/rss.xml`.
- **파비콘**: `scripts/make_favicons.py`가 `favicon.ico`(16/32/48)·`favicon-16/32.png`·`apple-touch-icon.png`·`icon-192/512.png`·`site.webmanifest`를 만든다. 마크를 바꾸면 다시 실행.
- **구조화 데이터**: 모든 페이지 Attorney, 홈 WebSite·FAQPage, 분야 페이지 FAQPage+BreadcrumbList, 칼럼 BlogPosting+BreadcrumbList, `/gangnam` LegalService, `/faq` FAQPage, `/glossary` DefinedTermSet.
- **검색용 페이지**: 분야 9개(`src/content/areas/*.json`, 편집기에서 수정) + `/gangnam`(지역) + `/faq`(FAQ 모음, 분야 FAQ 자동 집계) + `/glossary`(용어 22개) + `/rss.xml`(전문 칼럼 50편).

## theirlaw.org 폐쇄 절차

1. 새 도메인 오픈 전까지는 그대로 두되, "부동산 전문 로펌"·"무료 법률상담"·승소확률 문구를 먼저 내립니다.
2. 새 사이트 오픈 후 워드프레스 호스팅에서 301 리다이렉트: `theirlaw.org/*` → 새 도메인 홈(또는 `/columns`). 6~12개월 유지.
3. 네이버 서치어드바이저·구글 서치 콘솔에서 주소 변경 신청.
4. 이후 호스팅 해지, 도메인은 만료까지 보유(타인 등록 방지).

## 글·문구 편집 (2026.10.16 추가)

### /admin 편집기 (Decap CMS)
- 주소: `https://cha-law-site.onrender.com/admin/` — GitHub 계정으로 로그인하면 칼럼(작성·수정·비공개), 업무 분야 13개, 사이트 설정(연락처·표제부·소개·언론·FAQ)을 폼으로 고칠 수 있습니다. 저장하면 GitHub에 커밋되고 2~3분 뒤 사이트에 반영됩니다(자동 배포가 켜져 있을 때).
- 처음 한 번 설정 (사용자가 직접)
  1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**
     - Application name: `cha-law-site admin`
     - Homepage URL: `https://cha-law-site.onrender.com`
     - Authorization callback URL: `https://cha-law-site.onrender.com/callback`
  2. 생성 후 **Client ID**와 **Generate a new client secret**으로 만든 secret을 Render → cha-law-site → Environment에 `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`으로 저장.
  3. 도메인을 바꾸면 OAuth App의 두 URL, `public/admin/config.yml`의 `base_url`·`site_url`, Render의 `SITE_URL`을 함께 바꿉니다.
- 글 본문에 '무료 상담', '승소 보장', '하루 300명' 같은 표현이 들어가면 빌드가 자동으로 걸러 그 글은 전문 대신 요약만 보입니다(`src/lib/review.ts`). 편집 화면의 '검토 필요 항목'을 비우고 문장을 고치면 전문이 올라갑니다.

### 네이버 블로그 자동 동기화
- `scripts/naver_sync.py`가 글 목록을 받아 사이트에 없는 글만 내려받고(`.naver-cache/`), 마크다운으로 변환해 `src/content/columns/{logNo}.md`와 `public/columns/{logNo}/NN.webp`를 만듭니다. 회사 상호·CTA 문단 제거, 광고규정 검사는 아카이브 이관과 같은 규칙입니다.
- GitHub Actions(`.github/workflows/naver-sync.yml`)가 매일 06:00 KST에 실행하고, 새 글이 있으면 커밋·푸시합니다. Actions 탭에서 "Run workflow"로 즉시 실행할 수도 있습니다.
- 워크플로가 푸시하면 Render 푸시 자동 배포(2026.10.16 확인)가 이어서 돌므로 따로 할 일은 없습니다. `RENDER_DEPLOY_HOOK` 시크릿(Render → Settings → Deploy Hook 주소)은 선택 사항이며, 넣어 두면 푸시 자동 배포가 꺼졌을 때의 예비 경로가 됩니다.
- 로컬 실행: `npm run sync` (Python 3.12, `pip install requests beautifulsoup4 lxml pillow`). GitHub 러너에서 네이버 접속이 막히면 이 명령을 PC 작업 스케줄러에 등록해 쓰면 됩니다.

### 콘텐츠 파일 구조
```
src/content/columns/*.md   칼럼 467편 (네이버 logNo = 파일명). 프런트매터: title, date, section, tags, excerpt, public, review, source, naverUrl
src/content/areas/*.json   업무 분야 13개
src/content/site/*.json    연락처(site) · 표제부(trust) · 소개(bio) · 언론(press) · FAQ(faq)
public/columns/{logNo}/    칼럼 이미지(WebP)
public/uploads/            편집기에서 올린 이미지
```
`src/data/site.ts`·`areas.ts`·`posts.ts`는 위 파일을 읽어 페이지에 넘기는 얇은 층입니다.

## 블로그 아카이브 이관 (완료 · 2026.10.16)

`../cha-blog-archive`(467편 마크다운 + 이미지 2,082장)를 `scripts/import_archive.py`가 사이트로 옮깁니다.

```bash
python -I -X utf8 scripts/import_archive.py            # 이미지 변환 포함 (WebP 1200px, 약 1분)
python -I -X utf8 scripts/import_archive.py --no-images # 본문만 다시
```

이관 정책
1. 아카이브가 HTML 주석으로 걷어낸 옛 CTA 블록은 버립니다.
2. 회사 상호(온트랙·ontracksign·theirlaw·온전 법률사무소·온전함)가 든 문단, 상담 유도+전화번호 문단은 제거합니다. (777개 문단 제거)
3. 남은 본문에 **무료·착수금·성공보수·승소·보장·100%·최고·유일·전담·수치 주장**이 있으면 전문을 싣지 않고 요약+원문 링크만 두며, `data/review_queue.csv`에 해당 문장을 기록합니다.
4. "부동산 전문 변호사로서" 같은 성명 없는 '전문' 표현은 글 상단 바이라인(변호사 차형진)으로 성명이 특정되므로 통과시킵니다. 이 해석이 불안하면 `REVIEW_TERMS`에 `("전문", r"전문 변호사")`를 추가해 재실행하세요.

결과: 전문 게재 190편 · 검토 대기 240편(요약만) · 비공개 37편(온트랙·가지급금·제목 플래그) · 이미지 822장 43MB.

검토 작업 흐름: `data/review_queue.csv`를 열어 해당 문장을 아카이브 마크다운(`아카이브 파일` 열)에서 직접 고친 뒤 `npm run posts && python -I -X utf8 scripts/import_archive.py --no-images && npm run build`. 고친 글은 자동으로 전문 게재로 올라갑니다. 글 하단에는 원문 게시일과 "현재 기준으로 다시 확인" 안내가 붙습니다.

## 광고규정 체크 (대한변호사협회 2025 개정 기준)

- 사용: "부동산 · 상속 전문 변호사 차형진"(성명 병기형), "주요 취급분야".
- 미사용: "대한변협 등록"(등록 전), "전문 로펌", "전담센터", "무료 상담", 승소율·결과 보장, "최고·유일", 회사 상호·로고·서비스 링크.
- 푸터에 광고 주체 변호사 성명 고정. 숫자(칼럼 430편, 블로그 누적 방문 15만)는 집계 기준을 함께 표기.
- 변협 전문분야 등록(부동산 30건·상속 20건/최근 3년) 후 "대한변협 등록 부동산·상속 전문변호사"로 승격 가능.

## 광고규정 검토 문장 수정안 (2026.10.16, 승인 대기)

요약만 실린 131편의 172문장에 대한 수정안을 `data/review_rewrite.csv`(+ `review_rewrite_extra.csv` 27건)·`data/review_rewrite.md` 에 정리했습니다.
승인 후 `python -I -X utf8 scripts/apply_rewrites.py --apply` → `npm run import` → `npm run build` → Render Manual Deploy 순서로 반영합니다.
절차와 주의점(convert.py 재실행 시 덮어쓰임, 제목 2건 별도 수정)은 `data/review_rewrite_README.md` 를 보세요.
