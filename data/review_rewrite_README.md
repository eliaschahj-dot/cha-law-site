# 광고규정 검토 문장 수정안 — 승인 후 적용 절차

작성일 2026-10-16. 대상: `data/review_queue.csv` 의 172문장(131편). **아직 아카이브 원문은 수정하지 않았습니다.**

## 파일

| 파일 | 내용 |
|---|---|
| `data/review_rewrite.csv` | 172행. 큐의 (logNo, 검토 항목)과 1:1. 열: logNo, 제목, 아카이브 파일, 검토 항목, 원문 문장, 수정안, 처리 방식[삭제/치환/연결문 추가], 비고. UTF-8 BOM(엑셀에서 바로 열림) |
| `data/review_rewrite_extra.csv` | 27행 추가 제안. 같은 열. (a) 큐에는 글·항목당 첫 문장만 기록돼 빠진 **같은 항목의 2번째 이후 문장 21건** — 이걸 안 고치면 재이관 때 그 글이 다시 걸립니다. (b) 정규식이 놓친 '무료' 표현 6건 |
| `data/review_rewrite.md` | 같은 내용을 글별로 원문 → 수정안으로 읽기 쉽게 묶은 것 + 참고(제목 수정 등) |
| `scripts/apply_rewrites.py` | 두 CSV를 읽어 아카이브 마크다운에 치환을 적용. **기본 dry-run**, `--apply` 로만 실제 수정 |

`원문 문장` 은 아카이브 파일의 본문 텍스트 그대로(마크다운 기호 포함)이고, `수정안` 이 빈 칸이면 그 블록을 지웁니다.
표·인용문 안의 한 구절만 바꾸는 행은 `원문 문장` 에 그 구절만 적혀 있습니다.

## 검토(승인) 방법

1. `data/review_rewrite.csv` 를 엑셀로 열어 `수정안` 열을 고치거나, 그대로 두거나, 행을 지웁니다(지운 행은 적용되지 않음).
   - 수정안을 고칠 때 '무료 상담/무료 법률상담', '착수금 없이', '승소 보장', '100% 승소·환불·해결', '최고의 변호사', '전담 변호사', '하루 N명', 'N명이 넘는' 같은 꼴은 다시 넣지 마세요. `import_archive.py` 의 `REVIEW_TERMS` 정규식에 다시 걸려 그 글이 요약으로 돌아갑니다.
   - 비고에 "비판 맥락의 인용" 이라고 적힌 행(타인 광고 문구를 경계하라는 글 4편, 광주시 지원대책 설명 1편)은 규정 위반이 아니라 필터 통과용 최소 수정입니다. 원문을 그대로 두고 싶으면 그 행을 지우고, 대신 `import_archive.py` 의 정규식에 예외를 두어야 합니다.
2. `data/review_rewrite_extra.csv` 도 같은 방식으로 봅니다. 적용에서 빼려면 행을 지우거나 실행 시 `--no-extra` 를 줍니다.
3. 저장 후 dry-run 으로 치환 대상이 모두 찾아지는지 확인합니다.

```bash
cd C:/Users/cha-h/cha-law-site
python -I -X utf8 scripts/apply_rewrites.py
```

출력 마지막 "요약"에서 `not_found` 가 없고 "적용 후 필터 재검사: 남는 문장 없음" 이 나와야 합니다.
(2026-10-16 현재 결과: 199행 중 169건 발견, 30건은 같은 문단을 두 항목이 공유해 1회 치환으로 처리, 못 찾은 행 0, 남는 문장 0.)

## 적용 → 이관 → 빌드 → 배포

```bash
cd C:/Users/cha-h/cha-law-site
python -I -X utf8 scripts/apply_rewrites.py --apply     # 아카이브 .md 수정 (원본은 data/rewrite_backup/<타임스탬프>/ 에 백업)
npm run import                                          # 아카이브 → src/data/posts.json + public/columns/{logno}/*.webp (이미지 포함), review_queue.csv 갱신
npm run build                                           # dist/ 생성
```

- `npm run import` 뒤 `data/review_queue.csv` 가 비어 있어야(헤더만) 정상입니다. 남는 행이 있으면 그 문장을 CSV에 추가해 다시 적용합니다.
- 배포: Render 대시보드 → `cha-law-site` → **Manual Deploy → Deploy latest commit** (저장소가 Public Git URL 로 연결돼 있어 푸시만으로는 배포되지 않음). 먼저 `git add src/data/posts.json public/columns data/review_* scripts/apply_rewrites.py` 후 커밋·푸시.

### 선택 사항

- `--only 224118388646,223463335463` 로 특정 글만 적용/점검할 수 있습니다.
- 스크립트는 재실행해도 안전합니다. 원문이 없고 수정안이 이미 들어 있으면 "이미 적용됨"으로 넘어갑니다.

## 반드시 알아둘 점

1. **아카이브 변환기와의 충돌.** `cha-blog-archive/README.md` 에 적힌 대로 `scripts/convert.py` 를 다시 실행하면 `content/*.md` 가 전부 다시 생성되어 **손으로(이 스크립트로) 고친 내용이 덮어쓰입니다.** 새 글을 받기 위해 `fetch_index.py → fetch_posts.py → convert.py` 를 돌린 뒤에는 **`apply_rewrites.py --apply` 를 다시 실행**하세요. 치환 쌍은 CSV에 남아 있으므로 몇 초면 끝납니다. (장기적으로는 `import_archive.py` 가 이관 시점에 CSV를 적용하도록 바꾸는 편이 더 안전합니다.)
2. **제목은 이 스크립트가 바꾸지 않습니다.** 두 글은 제목 자체가 규정에 걸립니다.
   - `224118388646` "부동산법률상담 비용은 필요 없습니다" → 예: "부동산법률상담, 비용보다 먼저 확인할 것"
   - `223463335463` "월세 사기 예방, 매일 300명이 줄서서 찾는 방법" → 예: "월세 사기 예방, 계약 전 꼭 확인할 방법"
   - 제목은 `data/naver_index.json` → `scripts/build_posts.py` → `src/data/posts.json` 순으로 만들어지므로 `build_posts.py` 에 `TITLE_OVERRIDE = {logno: 제목}` 을 두고 `npm run posts` 를 다시 실행하는 방식을 권합니다. (`223874270300` "…상담모집" 도 검토 권고.)
3. 아카이브 각 파일의 front matter `flags:` 와 파일 끝 HTML 주석(제거된 꼬리말 원문)은 변환기의 기록이므로 건드리지 않습니다. 이관은 주석을 버리고 회사 상호·전화번호가 든 블록을 제거한 뒤 검출하므로, 그 블록 안의 표현은 수정 대상에서 제외했습니다.
4. 필터에 걸리지 않지만 사람이 볼 만한 표현은 `review_rewrite.md` 마지막 "참고" 절에 모았습니다(시간제 보수 설명 2편, 과장 표현 3편, '대표 변호사' 호칭 등).
