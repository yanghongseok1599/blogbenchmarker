# BLOG BenchMarker — 작업 재개 가이드

> 컨텍스트 클리어 후 이어서 작업할 때 이 문서부터 읽으세요.
> 마지막 갱신: 2026-04-14 (세션 1회차 종료)

---

## 1. 프로젝트 현황

**저장소:** https://github.com/yanghongseok1599/blogbenchmarker
**로컬 경로:** `/Users/seok/AI PROJECT/chrome/BLOG BenchMarker`
**백엔드:** Supabase 프로젝트 `ykyrdwllilffczgryvfv` (trainermilestone-blogbenchmarker, NANO)
  - 콘솔: https://supabase.com/dashboard/project/ykyrdwllilffczgryvfv
**최종 커밋:** `603cf95` (origin/main 동기화 완료, pending 0)

### 배포/설정 상태
- ✅ Supabase DB 마이그레이션 9개 적용됨 (001~009)
- ✅ Edge Functions 4개 배포됨:
  - generate-content (Gemini 2.5 Flash)
  - extract-youtube
  - verify-subscription (트레이너 마일스톤 webhook 대응)
  - admin-actions
- ✅ Secrets 설정됨: `GEMINI_API_KEY`, `WEBHOOK_SECRET` (자동 생성)
- ✅ 확장 manifest: content_scripts + identity 권한 + supabase host
- ✅ Supabase JS SDK는 `extension/lib/vendor/supabase-esm.js` (esbuild 번들)
- ⚠️ TOSS/PORTONE 키 미설정 (트레이너 마일스톤만 쓰기로 결정)
- ⚠️ 아이콘 PNG는 placeholder (16/48/128 파란 'B')

### 결제 (트레이너 마일스톤)
- 통합 스펙 문서: `docs/INTEGRATION-TRAINER-MILESTONE.md`
- TM 측 작업 필요: 결제창 페이지 + webhook POST (스펙대로)
- 운영자 작업: `app_settings.billing_url` 을 실 URL로 UPDATE, `WEBHOOK_SECRET`을 TM 에게 전달

---

## 2. 디자인 방향 (중요 — 바뀌지 말 것)

사용자 피드백 반복 후 최종 합의된 방향:

| 원칙 | 내용 |
|------|------|
| **폰트** | Pretendard 단일 (나눔명조 세리프 제거) |
| **Italic** | 전역 금지 (`* { font-style: normal !important }`) |
| **이모지** | 전면 금지 — SVG 아이콘만 (`icons.js` 사용) |
| **섹션** | 박스 형태로 명확히 분리 (글래스 카드 + shadow) |
| **팔레트** | **그린 대시보드** (#2F5F4A primary, #DFEAE1 민트 배경) |
| **배경** | 민트 그라디언트 mesh + backdrop-filter blur(22px) |
| **카드** | rgba 반투명 + 글래스 shadow + 16px radius |
| **참고 이미지** | `/Users/seok/AI PROJECT/chrome/BLOG BenchMarker/` 내 스크린샷 (유저 공유) |

---

## 3. 최근 작업 히스토리 (역순)

```
603cf95  마이페이지 → 헤더 우측 이동 + 도구 탭 로딩 에러 수정
8e0416e  모든 탭 통일 박스 스타일 (분석/벤치마크/학습/도구/마이)
4c52d0c  그린 대시보드 팔레트 + AI 글 생성 폼 전면 재설계
870f818  추천사항(.bm-recs) CSS 누락 수정 - 가독성 대폭 개선
841d82e  글래스모피즘 재디자인 + 이모지 제거 + 구조분석 sanity
74332a6  블로그 글 구조 분석 + 글쓰기 가이드 추가
```

---

## 4. 알려진 이슈 / TODO (우선순위)

### 🔴 P0 — 사용자가 보고했지만 미해결
1. **[ ] 분석 시 구조가 여전히 이상할 수 있음**  
   - sanity 3단계 추가했지만 SmartEditor 특정 블로그에서 목차 과잉 감지 가능
   - 재현: 네이버 블로그 글에서 "분석 시작" → "구조 분석" 카드 확인
   - 테스트용: `extension/lib/analyzers/structure-analyzer.js` 직접 실행으로 테스트 가능

2. **[ ] 이미지 숫자 정확도 확인**  
   - `analyze-handler.js`의 extractFromDOM 이미지 필터 검증 필요
   - 현재: alt 이모티콘/스티커 제외, 크기 <100 제외, 최대 50개

3. **[ ] 추천사항 "중요" 텍스트가 여전히 인라인**  
   - `recommendation-list.js`에서 priority pill 과 text 분리 렌더 재확인
   - 이미지 예: "중요제목에 숫자 또는..." (pill 과 text 붙음)

### 🟡 P1 — 다음 세션에 확인
- [ ] 사용자가 실제 Chrome 확장 로드 후 피드백 받기
- [ ] 다크모드 전환 확인 (사용자 OS 설정 자동 반영)
- [ ] 분석/벤치마크/생성/학습/도구 5탭 개별 동작 확인
- [ ] 마이페이지 버튼 클릭 → mypage 탭 뷰 확인
- [ ] 글쓰기 페이지 주입 (sidebar-injector) 동작 확인
- [ ] 트레이너 마일스톤 실 결제 URL 설정 후 통합 테스트

### 🟢 P2 — 기능 확장
- [ ] 아이콘 PNG 디자인 교체 (현재 placeholder)
- [ ] Chrome Web Store 스토어 등록 자료 (docs/STORE-LISTING.md 활용)
- [ ] 프로덕션 빌드 실행 (`bash scripts/build.sh`) + 테스트

---

## 5. 다음 세션 시작 방법

```bash
# 1) 프로젝트로 이동
cd "/Users/seok/AI PROJECT/chrome/BLOG BenchMarker"

# 2) 상태 확인
git status           # 변경사항 없어야 정상
git log --oneline | head -5
bash _workspace/qa-scripts/run-all.sh   # 5/5 PASS 기대

# 3) 확장 로드 (Chrome)
#    chrome://extensions → 개발자 모드 → "압축해제된 확장 프로그램을 로드합니다"
#    → /Users/seok/AI PROJECT/chrome/BLOG BenchMarker/extension 선택

# 4) Supabase CLI 인증 (토큰 이미 저장됨, 필요시)
supabase projects list

# 5) 새 작업 전 이 파일을 읽음
cat CONTINUATION.md
```

---

## 6. 핵심 파일 위치

### 문서
- `CLAUDE.md` — 프로젝트 자동 컨텍스트
- `PRD.md`, `ARCHITECTURE.md`, `TASKS.md`, `REFERENCE.md` — 기획/설계
- `docs/INTEGRATION-TRAINER-MILESTONE.md` — TM 결제 통합 스펙
- `_workspace/*.md` — 에이전트 산출물 요약 (30+ 개)

### 확장 (extension/)
```
extension/
├── manifest.json                         # MV3 설정 (type:"module" SW)
├── icons/icon{16,48,128}.png             # placeholder 아이콘
├── fonts/NanumMyeongjo*.woff2            # 미사용 (제거 후보)
├── lib/
│   ├── env-config.js                     # Supabase URL/KEY (gitignored)
│   ├── vendor/supabase-esm.js            # 666KB 번들
│   ├── dom-safe.js                       # createEl, safeText, XSS 방지
│   ├── supabase-client.js
│   ├── analyzers/
│   │   ├── seo-analyzer.js
│   │   ├── structure-analyzer.js         # 구조 분석 ★
│   │   ├── hook-detector.js
│   │   ├── nlp-utils.js
│   │   └── learning-context.js
│   ├── repositories/                     # Supabase CRUD 추상화 (7개)
│   └── utils/                            # clipboard, i18n, stats, url-parser
├── content/
│   ├── sidebar-injector.js               # 글쓰기 페이지 주입 (content script)
│   ├── sidebar.html/.js                  # 주입된 iframe (구조 가이드 포함)
│   ├── analyzer-bridge.js                # debounce 분석 요청
│   ├── extractor.js, analyzer.js
│   └── screenshot-overlay.js
├── background/
│   ├── service-worker.js                 # module SW
│   ├── handlers/                         # 7 핸들러 (auth/analyze/generate/benchmark/learning/pomodoro/youtube)
│   │   ├── analyze-handler.js            # ★ extractFromDOM + structure
│   │   └── index.js                      # routes 맵
│   ├── collectors/naver-{rss,html}*.js
│   └── schedulers/benchmark-sync.js      # chrome.alarms 3시간
├── sidepanel/
│   ├── panel.html                        # 5탭 + 헤더 mypage 버튼
│   ├── panel.js                          # 탭 라우터
│   ├── panel.css                         # ★ 디자인 시스템 (글래스 + 그린)
│   ├── tabs/*.js (analyze/benchmark/generate/learning/tools/mypage)
│   ├── components/                       # icons, score-card, structure-card, 등 14개
│   └── tools/                            # char-counter, pomodoro, forbidden-words, screenshot
├── auth/                                 # login/signup/reset + auth.css + error-map
├── mypage/
├── admin/
├── payments/                             # checkout.html/.js (TM 리다이렉트)
└── _locales/ko,en,ja/messages.json

supabase/
├── config.toml                           # 프로젝트 링크됨
├── migrations/                           # 9개 (001~009)
└── functions/
    ├── _shared/auth.ts, gemini.ts, usage.ts, cors.ts
    ├── _shared/toss.ts, portone.ts, trainer-milestone.ts, webhook-sig.ts
    ├── generate-content/
    ├── extract-youtube/
    ├── verify-subscription/              # TM webhook 핸들러 포함
    └── admin-actions/

scripts/
├── build.sh
├── strip-console.js
├── package-extension.sh
└── verify-build.sh

_workspace/
├── qa-scripts/                           # 5종 자동 검증 (bash)
├── *_summary.md (30+)
└── qa_report_*.md
```

---

## 7. 하네스 (Claude Code 에이전트 팀)

프로젝트는 tmux 5분할 멀티 에이전트 구조로 설계됨:
- 리더 (왼쪽 큰 패인) + 기획자/프론트엔드/백엔드/검수자 (우측 4패인)
- 각 에이전트에 병렬 작업 분배 후 완료 체크 + 커밋 루프

세션 이어갈 때:
- 우측 4패인 상태 체크: `unset TMUX; /opt/homebrew/bin/tmux capture-pane -t bsd:main.{1,2,3,4} -p`
- 프롬프트 파일: `/tmp/bsd-prompts/` 에 배치
- 작업 배분 템플릿: `extension/.claude/skills/blog-benchmarker-orchestrator/SKILL.md`

---

## 8. 재개 명령 예시

사용자에게 "작업하던거 이어서" 라고 들으면:

```
1. cat CONTINUATION.md  # 이 파일
2. git log --oneline | head -10
3. 현재 알려진 이슈 P0/P1 중 우선 처리
4. 사용자 추가 피드백 대기
```

사용자가 UI 관련 피드백을 주면:
- **Pretendard 단일 / italic 금지 / 이모지 금지 / 박스화 / 그린 팔레트** 원칙 고수
- 재디자인 말고 기존 스타일에서 조정만 (방향 반복 변경은 이미 했음)

---

## 9. 주의사항 (하지 말 것)

- ❌ 나눔명조/세리프 폰트 다시 도입
- ❌ italic 스타일 재도입
- ❌ 이모지 (📊 🏆 ✨ 🔍 ⚠️ 등) 사용
- ❌ 인디고/보라 그라디언트 (이전 시도, 실패)
- ❌ 에디토리얼 저널 방향 (이전 시도, 사용자 거부)
- ❌ SW 에 `importScripts` (module SW에서 불가)
- ❌ `innerHTML` (XSS)
- ❌ TOSS/PORTONE 직접 연동 (TM 만 쓰기로 결정)
- ❌ mypage 를 탭 네비게이션에 재추가 (헤더 우측으로 이동됨)

---

**끝.** 이 파일 읽은 뒤 사용자에게 "어느 부분부터 이어갈까요?" 질문 권장.
