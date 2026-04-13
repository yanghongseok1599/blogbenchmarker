# File Inventory

> 전체 프로젝트 파일 목록과 각 파일의 역할.
> 감사일: 2026-04-14 | 카테고리: extension/ · supabase/ · docs/ · scripts/ · _workspace/
> 경로는 모두 프로젝트 루트 기준 상대 경로.

---

## 1. extension/ — Chrome 확장프로그램 본체

### 1.1 최상위 / 설정
| 파일 | 역할 |
|------|------|
| `extension/manifest.json` | MV3 manifest. 권한 최소화, default_locale "ko", CSP `script-src 'self'`. |
| `extension/icons/README.md` | 아이콘 placeholder. 실제 PNG 16/48/128 는 Phase 12 TODO. |

### 1.2 `extension/_locales/` — 다국어 리소스
| 파일 | 역할 |
|------|------|
| `_locales/ko/messages.json` | 한국어 기본 (140 keys). |
| `_locales/en/messages.json` | 영어 (140 keys, 기계번역 초판). |
| `_locales/ja/messages.json` | 일본어 (140 keys, 기계번역 초판). |

### 1.3 `extension/lib/` — 공통 라이브러리

#### 1.3.1 최상위
| 파일 | 역할 |
|------|------|
| `lib/supabase-client.js` | Supabase JS SDK 초기화 + chrome.storage custom adapter. |
| `lib/env-config.example.js` | 환경변수 스캐폴드 (커밋 대상). |
| `lib/env-config.js` | 실제 값 (gitignore). |
| `lib/dom-safe.js` | XSS 방지 DOM 헬퍼 (textContent / createElement). |

#### 1.3.2 `lib/analyzers/`
| 파일 | 역할 |
|------|------|
| `analyzers/nlp-utils.js` | 한국어 NLP 원자 함수 (토큰/조사/이모지/수치/키워드). |
| `analyzers/hook-detector.js` | 첫 문단 후킹 타입 감지 (최소 2조건 충족). |
| `analyzers/seo-analyzer.js` | 100점 5섹션 SEO 분석 엔진. |
| `analyzers/learning-context.js` | 학습 데이터 → 프롬프트 컨텍스트 변환. |

#### 1.3.3 `lib/repositories/`
| 파일 | 역할 |
|------|------|
| `repositories/user-repo.js` | profiles CRUD (plan/language/updated_at). |
| `repositories/learning-repo.js` | learning_data CRUD. |
| `repositories/benchmark-repo.js` | benchmark_blogs + benchmark_posts CRUD. |
| `repositories/usage-repo.js` | usage_logs 조회 (사용량 표시용). |
| `repositories/subscription-repo.js` | subscriptions 활성 구독 조회. |
| `repositories/admin-repo.js` | 관리자 RPC 호출. |

#### 1.3.4 `lib/utils/`
| 파일 | 역할 |
|------|------|
| `utils/clipboard.js` | navigator.clipboard + execCommand 폴백. |
| `utils/i18n.js` | chrome.i18n 래퍼 + 런타임 locale 전환. |
| `utils/stats.js` | 차트/통계 유틸. |
| `utils/url-parser.js` | URL 검증/정규화. |

### 1.4 `extension/auth/` — 인증 UI
| 파일 | 역할 |
|------|------|
| `auth/login.html` / `login.js` | 로그인 (email/password + Google OAuth). |
| `auth/signup.html` / `signup.js` | 회원가입 (email 인증 흐름 포함). |
| `auth/reset.html` / `reset.js` | 비밀번호 재설정. |
| `auth/auth-error-map.js` | Supabase 에러 → i18n key → 사용자 메시지. |
| `auth/auth.css` | 3개 화면 공통 스타일. |

### 1.5 `extension/background/` — Service Worker
| 파일 | 역할 |
|------|------|
| `background/service-worker.js` | 메시지 라우터 진입점. |

#### 1.5.1 `background/handlers/`
| 파일 | 역할 |
|------|------|
| `handlers/index.js` | 핸들러 등록 허브. |
| `handlers/auth-handler.js` | signOut + storage 정리 + 자동 재로그인 방지. |
| `handlers/generate-handler.js` | `generate-content` Edge 호출 브릿지. |
| `handlers/youtube-handler.js` | `extract-youtube` Edge 호출 브릿지. |
| `handlers/benchmark-handler.js` | 경쟁 블로그 수집/조회. |
| `handlers/learning-handler.js` | 학습 데이터 저장/조회. |
| `handlers/pomodoro-handler.js` | 뽀모도로 타이머 (alarms 기반 백그라운드). |

#### 1.5.2 `background/collectors/` + `schedulers/`
| 파일 | 역할 |
|------|------|
| `collectors/naver-rss-collector.js` | 네이버 블로그 RSS 수집. |
| `collectors/naver-html-scraper.js` | RSS 미지원 블로그 HTML 스크래핑. |
| `schedulers/benchmark-sync.js` | `chrome.alarms` 정기 동기화. |

### 1.6 `extension/content/` — Content Script
| 파일 | 역할 |
|------|------|
| `content/extractor.js` | 네이버 블로그 DOM 파싱 (SmartEditor ONE / 구버전 iframe / 레거시). |
| `content/analyzer.js` | extractor + seo-analyzer 브릿지 + 학습 저장 연계. |
| `content/analyzer-bridge.js` | sidepanel ↔ content 메시지 브릿지. |
| `content/sidebar-injector.js` | 글쓰기 페이지 사이드바 주입. |
| `content/sidebar.html` / `sidebar.js` | 사이드바 마크업 + 실시간 분석 controller. |
| `content/content.css` | 사이드바/오버레이 스타일 (호스트 CSS 격리). |
| `content/screenshot-overlay.js` | 캡처 도구 오버레이. |

### 1.7 `extension/sidepanel/` — 사이드패널 UI

#### 1.7.1 최상위
| 파일 | 역할 |
|------|------|
| `sidepanel/panel.html` | 탭 쉘. data-i18n 적용. |
| `sidepanel/panel.js` | 탭 스위처 + 공통 초기화. |
| `sidepanel/panel.css` | 전역 스타일. |

#### 1.7.2 `sidepanel/tabs/`
| 파일 | 역할 |
|------|------|
| `tabs/analyze-tab.html` / `analyze-tab.js` | 분석 탭 (SEO 점수 + 섹션별 상세). |
| `tabs/benchmark-tab.html` / `benchmark-tab.js` | 벤치마크 탭 (블로그 목록 + 글 비교). |
| `tabs/benchmark-stats-section.js` | 벤치마크 통계 섹션(컴포넌트). |
| `tabs/generate-tab.html` / `generate-tab.js` | AI 글 생성 탭. |
| `tabs/youtube-tab.html` / `youtube-tab.js` | YouTube → 블로그 변환 탭. |
| `tabs/learning-tab.html` / `learning-tab.js` | 학습 데이터 탭. |
| `tabs/mypage-tab.html` / `mypage-tab.js` | 사이드패널 내 마이 미니뷰. |
| `tabs/tools-tab.html` / `tools-tab.js` | 부가 도구 허브. |

#### 1.7.3 `sidepanel/components/` — 재사용 UI 조각
| 파일 | 역할 |
|------|------|
| `components/score-card.js` | 점수 카드 (총점 + 섹션별 프로그레스). |
| `components/progress-bar.js` | 프로그레스 바. |
| `components/comparison-card.js` | 내 글 vs 경쟁 글 비교. |
| `components/bar-chart.js` | 막대 차트. |
| `components/word-cloud.js` | 키워드 워드클라우드. |
| `components/generate-result-card.js` | 생성 결과 + 복사 버튼. |
| `components/learning-card.js` | 학습 데이터 카드. |
| `components/usage-gauge.js` | 일일 사용량 게이지. |
| `components/expiry-banner.js` | 구독 만료 임박 배너. |

#### 1.7.4 `sidepanel/tools/` — 부가 기능 (Phase 9)
| 파일 | 역할 |
|------|------|
| `tools/char-counter.js` | 실시간 글자수 카운터. |
| `tools/pomodoro.js` | 뽀모도로 타이머 UI. |
| `tools/forbidden-words.js` | 금칙어 체크. |
| `tools/screenshot.js` | 캡처 도구 UI. |

### 1.8 `extension/mypage/` — 마이페이지 (별도 페이지)
| 파일 | 역할 |
|------|------|
| `mypage/mypage.html` / `mypage.js` / `mypage.css` | 사용량, 구독, 로그아웃, 언어 설정 풀페이지. |

### 1.9 `extension/payments/` — 결제 페이지
| 파일 | 역할 |
|------|------|
| `payments/checkout.html` / `checkout.js` | 토스/포트원 결제 진입 페이지. |

### 1.10 `extension/admin/` — 관리자 콘솔
| 파일 | 역할 |
|------|------|
| `admin/admin.html` / `admin.js` / `admin.css` | 관리자 쉘 (is_admin 게이트). |
| `admin/utils.js` | 공통 유틸. |
| `admin/tabs/users.js` | 유저 목록/플랜 수동 변경. |
| `admin/tabs/settings.js` | app_settings 편집. |
| `admin/tabs/banwords.js` | 금칙어 관리. |
| `admin/tabs/audit.js` | admin_audit_logs 조회. |

---

## 2. supabase/ — Backend (DB + Edge Functions)

### 2.1 `supabase/migrations/`
| 파일 | 역할 |
|------|------|
| `migrations/001_users.sql` | profiles + handle_new_user 트리거 + language/updated_at. |
| `migrations/002_learning_data.sql` | learning_data + GIN 인덱스. |
| `migrations/003_benchmarks.sql` | benchmark_blogs + benchmark_posts. |
| `migrations/004_usage_logs.sql` | usage_logs + (user,created_at) / (feature,created_at) 인덱스. |
| `migrations/005_settings.sql` | app_settings (key-value) + subscriptions (status/gateway/payment_id). |
| `migrations/006_rls.sql` | 7개 테이블 RLS + `is_admin_user(uid)` SQL 함수. |
| `migrations/007_payment_triggers.sql` | subscriptions ↔ profiles.plan 자동 동기화. plan_rank / compute_effective_plan / refresh_user_plan / expire_due_subscriptions. |
| `migrations/008_admin_audit.sql` | admin_audit_logs 테이블 + 관리자 작업 트리거. |

### 2.2 `supabase/functions/_shared/`
| 파일 | 역할 |
|------|------|
| `_shared/auth.ts` | JWT 검증 + profiles 조회 → AuthContext. |
| `_shared/usage.ts` | 쿼터 검증 (분/일) + usage_logs INSERT. |
| `_shared/gemini.ts` | Gemini 2.5 Flash 호출 + 프롬프트 주입 방어 fence. |
| `_shared/youtube.ts` | YouTube videoId 추출 + 공개 자막 fetch (타사 라이브러리 미사용). |
| `_shared/blog-transform.ts` | 자막 → 블로그 Gemini 변환 (responseSchema JSON). |
| `_shared/toss.ts` | 토스페이먼츠 API 래퍼. |
| `_shared/portone.ts` | 포트원 API 래퍼. |
| `_shared/webhook-sig.ts` | 결제 webhook 서명 검증. |

### 2.3 `supabase/functions/generate-content/` (Phase 5.1)
| 파일 | 역할 |
|------|------|
| `generate-content/index.ts` | POST 진입점. 쿼터 → Gemini → usage_logs. |
| `generate-content/cors.ts` | CORS 헤더 + OPTIONS (extract-youtube 도 import). |
| `generate-content/deno.json` | std@0.220 설정. |

### 2.4 `supabase/functions/extract-youtube/` (Phase 6)
| 파일 | 역할 |
|------|------|
| `extract-youtube/index.ts` | POST 진입점. 자막 → Gemini 변환. |
| `extract-youtube/deno.json` | 설정. |

### 2.5 `supabase/functions/verify-subscription/` (Phase 8.2)
| 파일 | 역할 |
|------|------|
| `verify-subscription/index.ts` | 결제 webhook. 서명 검증 + service_role 로 subscriptions UPSERT. |
| `verify-subscription/deno.json` | 설정. |

### 2.6 `supabase/functions/admin-actions/` (Phase 11)
| 파일 | 역할 |
|------|------|
| `admin-actions/index.ts` | 관리자 RPC (유저 차단/플랜 변경 등). is_admin 검증 + service_role. |
| `admin-actions/deno.json` | 설정. |

---

## 3. docs/ — 문서 (Phase 12 작업)

**현재 비어있음.** 필요 산출물:
- `docs/deployment.md` — Supabase secrets / functions deploy / db push 절차
- `docs/privacy.md` — 개인정보 처리방침
- `docs/api.md` — 내부 API / repository 계약

---

## 4. scripts/ — 빌드/배포 스크립트

**현재 비어있음.** 필요 산출물:
- 프로덕션 빌드 (console.log 제거, ES Module → IIFE 번들)
- CSS 번들 (Tailwind CDN 제거 예정이라면)
- 아이콘 최적화
- RLS / 정책 존재 검증 SQL

---

## 5. _workspace/ — 에이전트 간 공유 문서

### 5.1 계약 / 레퍼런스 (장기 보존)
| 파일 | 역할 |
|------|------|
| `_workspace/backend_schema_changelog.md` | DB 스키마 단일 소스 + diff 이력 (§6 Phase 1.2 QA, §7 Phase 8.2 결제). |
| `_workspace/edge_function_contracts.md` | 4개 Edge Function 의 요청/응답 shape. |
| `_workspace/analyzer_result_shape.md` | SEO 분석 결과 JSON 스키마. |
| `_workspace/i18n_key_registry.md` | 140개 i18n key 카탈로그. |

### 5.2 Phase 요약
| 파일 | 대상 Phase |
|------|-----------|
| `1.2_backend_summary.md` / `1.2_backend_fix_summary.md` | DB 스키마 + QA 수정 |
| `1.3_planner_summary.md` / `1.3_planner_fix_summary.md` | 확장 골격 |
| `2.1_frontend_summary.md` / `2.1_frontend_fix_summary.md` | Auth UI |
| `2.2_auth_handler_summary.md` | 세션 관리 |
| `3.1_analyzer_summary.md` / `3.2_sidebar_summary.md` / `3.3_analyze_tab_summary.md` | SEO 분석 / 사이드바 / 분석 탭 |
| `4.1_benchmark_ui_summary.md` / `4.2_collect_summary.md` / `4.3_stats_summary.md` | 벤치마킹 |
| `5.1_gemini_edge_summary.md` / `5.2_generate_ui_summary.md` | AI 생성 |
| `6_youtube_summary.md` | YouTube 변환 |
| `7_learning_summary.md` | 학습 엔진 |
| `8.1_mypage_summary.md` / `8.2_payment_summary.md` | 마이페이지 / 결제 |
| `9_tools_summary.md` | 부가 기능 |
| `10_i18n_summary.md` | 다국어 |
| `11_admin_summary.md` | 관리자 |

### 5.3 QA 리포트
| 파일 | 대상 |
|------|------|
| `qa_checklist_1.2.md` / `qa_report_1.2.md` | Phase 1.2 DB |
| `qa_checklist_1.3.md` / `qa_report_1.3.md` | Phase 1.3 골격 |
| `qa_checklist_2.1.md` / `qa_report_2.1.md` | Phase 2.1 Auth UI |
| `qa_fix_summary.md` | QA 해소 이력 종합 |
| `qa_master_report.md` | 통합 QA |
| `qa_report_cross_cutting.md` | 경계면 이슈 |
| `qa-scripts/` | grep/SQL 자동 검증 스크립트 디렉토리 |

### 5.4 감사 / 계획 (본 작업)
| 파일 | 역할 |
|------|------|
| `integration_test_plan.md` | E2E 테스트 시나리오 10개. |
| `remaining_work.md` | 미구현/개선 항목 + 우선순위. |
| `architecture_audit.md` | 원안 vs 실제 구현 diff. |
| `file_inventory.md` | (이 파일) |
| `12_audit_summary.md` | 상위 감사 메타. |

---

## 파일 수 요약

| 범주 | 개수 |
|------|------|
| extension/ .js | 56 |
| extension/ .html | 15 |
| extension/ .css | 5 |
| extension/ messages.json | 3 |
| supabase/migrations/ | 8 |
| supabase/functions/ | 16 (.ts 11 + deno.json 4 + cors.ts 1) |
| docs/ | 0 ⚠️ |
| scripts/ | 0 ⚠️ |
| _workspace/ 문서 | 32+ |

**docs/ , scripts/ 공란** 은 Phase 12 가 미착수임을 반영.
