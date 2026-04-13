# QA Master Report — Phase 1.2 / 1.3 / 2.1 체크리스트 초안 요약

> 작성일: 2026-04-13
> 작성자: security-qa 에이전트(검수자)
> 상태: **초안 only — 실제 검증 미실행**. 다른 에이전트(supabase-backend, extension-core, ui-builder) 산출물이 도착하면 본 체크리스트로 incremental QA 수행.
> 근거: `boundary-qa` 스킬의 incremental 실행 원칙(§2), 경계면 교차 비교 방법론(§1).

---

## 1. 산출물 목록

| 파일 | Phase | 항목 수 | BLOCKER | HIGH | MEDIUM | LOW |
|---|---|---:|---:|---:|---:|---:|
| `_workspace/qa_checklist_1.2.md` | 1.2 DB 마이그레이션 | 52 | 8 | 20 | 20 | 4 |
| `_workspace/qa_checklist_1.3.md` | 1.3 Extension 골격 | 46 | 13 | 18 | 14 | 1 |
| `_workspace/qa_checklist_2.1.md` | 2.1 Auth UI | 41 | 10 | 19 | 12 | 0 |
| **합계** | — | **139** | **31** | **57** | **46** | **5** |

요청 범위(체크리스트당 30~60개) 충족.

---

## 2. Phase별 주요 테마

### 2.1 Phase 1.2 (DB 마이그레이션)
- **RLS 무결성**: 모든 public 테이블 ENABLE + 정책 0개 누락 0건 + `is_admin`은 반드시 `profiles` 조회 기반(이메일/JWT 클레임 직접 비교 금지).
- **트랜잭션 안전**: idempotent DDL, ROLLBACK 주석, `handle_new_user()`의 `SECURITY DEFINER` + `search_path` 고정.
- **결제 위변조 방지**: `subscriptions(payment_provider, payment_id)` UNIQUE — webhook 재시도 시 이중 결제 row 차단.
- **시간/타입 일관성**: 모든 시간 컬럼 `TIMESTAMPTZ`, 플랜·상태 enum CHECK 제약.
- **인덱스 누락**: `learning_data`·`usage_logs`·`benchmark_posts` 정렬·필터 컬럼 복합 인덱스.
- **PII / 암호화**: `profiles.email`은 auth.users와 이중 저장 정합성, `learning_data.content`(타인 블로그 본문) 저작권/프라이버시 정책 명시 필요.
- **관리자 격리**: service role은 `admin-actions` Edge Function에만, 일반 정책은 anon key + JWT 경로.

### 2.2 Phase 1.3 (Extension 골격 / Manifest V3)
- **최소 권한**: `<all_urls>` 금지, 네이버 도메인 host_permissions 화이트리스트, 실제 사용 chrome API와 manifest 매칭.
- **CSP 강화**: MV3 기본 CSP 유지 또는 `'strict-dynamic'`/해시 기반만, 동적 코드 실행 패턴(스킬 §1-3 목록) 정적 분석 0건, 원격 스크립트 금지.
- **Service Worker 패턴**: handler 맵, async response의 `return true`, 글로벌 가변 상태 금지, sender 검증.
- **세션 저장 위치**: `chrome.storage.local` + custom adapter, `localStorage`/`chrome.storage.sync` 금지.
- **content script 화이트리스트**: matches는 네이버 도메인만, 글쓰기 페이지용 injector는 별도 블록.
- **XSS 차단**: `dom-safe.js` 헬퍼 강제, 스킬 §3-1 금지 API 0건.
- **메시지 출처**: `sender.tab?.url` 도메인 검증, `externally_connectable` 화이트리스트.

### 2.3 Phase 2.1 (Auth UI)
- **XSS 차단**: 인라인 스크립트·`on*=` 금지, 사용자 입력 echo 금지, 모든 동적 렌더는 `dom-safe.js` 경유.
- **OAuth 안전성**: `chrome.identity.launchWebAuthFlow` 경유, redirect URL Supabase 대시보드 화이트리스트, `state` 파라미터 검증.
- **세션 저장**: chrome.storage.local + Supabase adapter, `detectSessionInUrl: false`.
- **로그아웃 정리**: `__intentional_logout` 플래그 → `signOut()` → 양 storage clear (기존 `blog-booster-pro` 자동 재로그인 버그 재현 금지).
- **관리자 판정**: 이메일 비교 절대 금지, `profiles.is_admin` 단일 진실의 원천.
- **에러 UX**: Supabase 원본 메시지 노출 금지, 한국어 친화 매핑.
- **경계면 shape**: handler 응답 shape, profiles 조회 race condition (트리거 비동기).

---

## 3. 횡단 (cross-cutting) 우선순위

다음 항목은 3개 Phase에서 공통 등장하는 **BLOCKER급 룰**이다. 검증 자동화 1순위 후보.

1. **API 키 하드코딩 검사** — `grep -rE "AIza[0-9A-Za-z_-]{30,}|sk_live|service_role|GEMINI_API_KEY\s*=\s*['\"]" extension/ supabase/`
2. **DOM 안전 헬퍼 우회 검사** — 스킬 `chrome-extension-security §3-1` 금지 API 정적 분석.
3. **RLS ENABLE 누락 검사** — `pg_tables` 쿼리.
4. **이메일 비교 기반 관리자 판정 검사** — `grep -nE "auth\.email\(\)|email\s*===\s*['\"]" supabase/migrations/ extension/`.
5. **Service Worker async response 누락** — `chrome.runtime.onMessage.addListener` 블록의 `return true` 존재 확인.

→ 이 5가지는 `_workspace/qa-scripts/` 폴더에 셸/SQL 스크립트로 번들링해 매 Phase 실행 시 선행 적용 권장(스킬 `boundary-qa §8`).

---

## 4. 미정/추후 결정 사항

- [ ] `subscriptions.payment_id` UNIQUE 정책 — `payment_provider` 단독 vs 복합 결정.
- [ ] `learning_data.content`·`benchmark_posts.content_summary`의 PII/저작권 정책 — 약관 문구 + 보존 기간 결정.
- [ ] OAuth provider 범위(Google만 vs Google+Kakao) 결정 후 redirect URL 화이트리스트 확정.
- [ ] 로그아웃 후 `usage_logs`에 sender 검증 실패 이벤트 기록 여부.
- [ ] `chrome.identity.launchWebAuthFlow` 사용 시 manifest의 `oauth2` 클라이언트 등록 필요 여부.

---

## 5. 다음 단계

1. supabase-backend / extension-core / ui-builder 산출물 도착 대기.
2. Phase별 작업 완료 보고를 받으면 본 체크리스트로 incremental QA 실행 → 결과를 `_workspace/qa_report_{phase}.md`에 기록(스킬 `boundary-qa §6` 포맷).
3. BLOCKER 발견 시 같은 날 긴급 수정, HIGH는 다음 작업 진행 전 처리.
4. 공통 BLOCKER 5종은 `_workspace/qa-scripts/`로 자동화 후 매 Phase 선행 실행.

---

**메모:** 본 보고서는 *체크리스트 초안*에 대한 메타 요약이다. "이상 없음" 금지(스킬 §7) 원칙에 따라, 실제 검증 시에는 PASS 항목도 증거(grep 결과·SQL 결과 라인)를 반드시 첨부해 추적성을 확보할 것.
