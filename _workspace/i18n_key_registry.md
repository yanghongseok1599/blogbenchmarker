# i18n Key Registry

> `extension/_locales/{ko,en,ja}/messages.json` 의 모든 key 목록 + 설명.
> 새 key 추가 시 이 문서를 먼저 갱신하고 → 3개 locale 모두 추가한다.
> 각 key 의 소유 화면(파일) 과 치환 인자(placeholders) 를 함께 기록.

작성일: 2026-04-14 (Phase 10 초판)
message key 규약: `section_subsection_specifier` (snake_case 계층).

---

## 0. 공통 원칙

- **파일당 동일한 key 집합**: ko/en/ja 세 파일은 **항상 동일한 key set**을 가진다 (번역 누락 금지).
- **변수 치환**: `$1`, `$2` 인덱스 또는 `$NAME$` placeholder 모두 지원 (i18n.js `applySubstitutions`).
- **HTML 바인딩**: `data-i18n="key"`, `data-i18n-attr="placeholder:key;title:key2"`, `data-i18n-aria="key"`.
- **JS 호출**: `import { t } from '../../lib/utils/i18n.js'; t('key', [arg1, arg2])`.
- **누락 key**: i18n.js 는 key 를 그대로 반환하고 `console.warn` 출력 — QA 에서 `grep "missing message key"` 로 검출.

---

## 1. 섹션별 key 목록 (2026-04-14 기준, 총 ~140개)

### 1.1 `app_*` — 매니페스트·전역
| key | 사용 위치 | 설명 |
|-----|----------|------|
| `app_name` | manifest.json (향후 `__MSG_app_name__` 참조 가능), panel.html title | 확장 공식명 |
| `app_description` | manifest description | Chrome Web Store 용 |
| `app_action_title` | manifest action.default_title | 툴바 버튼 tooltip |

### 1.2 `common_*` — 버튼·공통 문구
| key | 설명 |
|-----|------|
| `common_submit` | OK / 확인 |
| `common_cancel` | 취소 |
| `common_save` | 저장 |
| `common_close` | 닫기 |
| `common_retry` | 다시 시도 |
| `common_copy` | 복사 |
| `common_copied` | 복사 완료 알림 |
| `common_loading` | 불러오는 중 |
| `common_processing` | 처리 중 |
| `common_or` | 또는 (구분자) |
| `common_required` | 필수 |
| `common_optional` | 선택 |
| `common_unknown_error` | 알 수 없는 오류 |
| `common_network_error` | 네트워크 오류 |
| `common_empty_title` / `common_empty_url` | 비어있음 placeholder |

### 1.3 `auth_*` — 인증 화면 (login.html / signup.html / reset.html)
| key | 사용처 | 비고 |
|-----|-------|------|
| `auth_brand_title` | 공통 헤더 |  |
| `auth_login_title` / `auth_login_submit` / `auth_login_submit_loading` / `auth_login_google` / `auth_login_link_signup` / `auth_login_link_reset` | login.html | 로딩 문구는 JS 에서 t() 로 교체 |
| `auth_signup_title` / `auth_signup_subtitle` / `auth_signup_submit` / `auth_signup_submit_loading` / `auth_signup_terms_prefix`/`_and`/`_privacy`/`_suffix` / `auth_signup_verify_title` / `auth_signup_verify_body` / `auth_signup_has_account` / `auth_signup_link_login` | signup.html | 약관 문구는 4조각(prefix/and/privacy/suffix) 분할 |
| `auth_reset_title` / `auth_reset_subtitle` / `auth_reset_submit` / `auth_reset_submit_loading` / `auth_reset_sent_title` / `auth_reset_sent_body` / `auth_reset_link_back` | reset.html |  |
| `auth_field_email_label` / `auth_field_email_placeholder` | 3 화면 공통 |  |
| `auth_field_password_label` / `auth_field_password_placeholder_login` / `auth_field_password_placeholder_signup` | login/signup |  |
| `auth_field_password_confirm_label` / `auth_field_password_confirm_placeholder` | signup |  |

### 1.4 `error_*` — 에러 메시지 (auth-error-map.js + 일반)
| key | 매핑 | 사용처 |
|-----|------|-------|
| `error_invalid_email` | 이메일 형식 | login/signup/reset 폼 검증 |
| `error_password_too_short` | 8자 미만 | login |
| `error_password_complexity` | 영문+숫자 8자 | signup |
| `error_password_too_long` | 72자 초과 | signup (bcrypt 한계) |
| `error_password_mismatch` | 확인 불일치 | signup |
| `error_terms_required` | 약관 미동의 | signup |
| `error_rate_limit` / `error_network` / `error_timeout` | 공통 | auth-error-map COMMON_MATCHERS |
| `error_login_invalid` / `error_login_unconfirmed` / `error_login_user_not_found` / `error_login_locked` / `error_login_generic` | 로그인 | auth-error-map LOGIN_MATCHERS + fallback |
| `error_signup_already` / `error_signup_weak` / `error_signup_invalid_email` / `error_signup_generic` | 가입 | auth-error-map SIGNUP_MATCHERS + fallback |
| `error_reset_not_found` / `error_reset_generic` | 재설정 | auth-error-map RESET_MATCHERS + fallback |
| `error_oauth_state` / `error_oauth_cancelled` / `error_oauth_unavailable` / `error_oauth_generic` | OAuth | auth-error-map OAUTH_MATCHERS + fallback |
| `error_quota_exceeded` / `error_invalid_input` / `error_invalid_response` / `error_upstream` | Edge Function 응답 | youtube-tab / generate-tab |
| `error_profile_not_found` / `error_missing_authorization` / `error_invalid_token` / `error_server_misconfig` | 인증 | 공통 |

### 1.5 `tab_*` / `tabs_aria_label` / `placeholder_*` — panel.html
| key | 설명 |
|-----|------|
| `tabs_aria_label` | `<nav aria-label>` |
| `tab_analyze`/`tab_benchmark`/`tab_generate`/`tab_youtube`/`tab_learning`/`tab_mypage`/`tab_tools` | 탭 버튼 레이블 |
| `placeholder_analyze`/`_benchmark`/`_generate`/`_mypage` | Phase 골격 플레이스홀더 (탭 구현 완료 시 제거 예정) |

### 1.6 `analyze_*` — analyze-tab
| key | 설명 |
|-----|------|
| `analyze_title` / `analyze_hint` | 상단 문구 |
| `analyze_start` / `analyze_start_loading` | 제출 버튼 |
| `analyze_status_checking_tab` / `analyze_status_running` | 로딩 상태 |
| `analyze_error_tab_url` / `analyze_error_not_naver` / `analyze_error_response` | 에러 |
| `analyze_total_label` / `analyze_empty_sections` | 결과 영역 |

### 1.7 `generate_*` — generate-tab
| key | 설명 |
|-----|------|
| `generate_title` / `generate_subtitle` | 헤더 |
| `generate_label_topic` / `generate_placeholder_topic` | 주제 입력 |
| `generate_label_originality` / `generate_hint_originality` | 원본 보존도 슬라이더 |
| `generate_label_length` / `generate_length_short` / `generate_length_medium` / `generate_length_long` | 분량 |
| `generate_label_notes` / `generate_placeholder_notes` | 추가 요청 |
| `generate_label_use_learning` | 학습 데이터 체크박스 |
| `generate_submit` / `generate_submit_loading` | 생성 버튼 |
| `generate_error_empty_topic` / `generate_status_running` / `generate_error_generic` / `generate_error_login` | 상태/에러 |

### 1.8 `benchmark_*` — benchmark-tab
| key | 설명 |
|-----|------|
| `benchmark_title` / `benchmark_subtitle` / `benchmark_empty` | 프레임 |
| `benchmark_add` / `benchmark_remove` / `benchmark_sync` | CRUD 버튼 |
| `benchmark_stats_avg_score` / `benchmark_stats_avg_chars` / `benchmark_stats_avg_images` | 통계 라벨 |

### 1.9 `learning_*` — learning-tab
`learning_title` / `learning_subtitle` / `learning_empty` / `learning_item_remove` / `learning_item_detail`

### 1.10 `mypage_*` — mypage-tab
`mypage_title` / `mypage_section_plan` / `mypage_section_usage` / `mypage_plan_free` / `mypage_plan_pro` / `mypage_plan_unlimited` / `mypage_upgrade` / `mypage_logout` / `mypage_language`

### 1.11 `youtube_*` — youtube-tab (✓ 전면 적용됨)
`youtube_title` / `_subtitle` / `_label_url` / `_placeholder_url` / `_label_length` / `_length_short` / `_length_normal` / `_length_long` / `_label_language` / `_language_ko` / `_language_en` / `_language_ja` / `_submit` / `_submit_loading` / `_result_label` / `_btn_copy` / `_btn_send` / `_transcript_toggle` / `_error_empty_url` / `_error_bad_scheme` / `_error_invalid_url` / `_error_no_transcripts` / `_error_unavailable` / `_error_upstream` / `_sent_to_generate` / `_copy_failed`

### 1.12 `component_*` — 공용 컴포넌트 (placeholders 포함)
| key | placeholders | 예시 출력 |
|-----|-------------|----------|
| `component_expiry_days_left` | `{days: $1}` | "구독 만료까지 3일 남았습니다." |
| `component_expiry_renew` | — | "갱신하기" |
| `component_usage_label` | `{used: $1, total: $2}` | "오늘 사용량: 2 / 3" |
| `component_usage_unlimited` | `{used: $1}` | "오늘 사용량: 17 (무제한)" |
| `component_score_excellent` / `_good` / `_needs_work` | — | 점수 레이블 |

---

## 2. 적용 완료 파일 (Phase 10 초판, 2026-04-14)

- ✅ `extension/_locales/ko/messages.json`
- ✅ `extension/_locales/en/messages.json` (TODO: 전문 번역)
- ✅ `extension/_locales/ja/messages.json` (TODO: 전문 번역)
- ✅ `extension/lib/utils/i18n.js`
- ✅ `extension/manifest.json` (default_locale: "ko" — 기존 유지)
- ✅ `extension/auth/login.html` — `data-i18n` 전면 적용 + `initI18n()` 스크립트
- ✅ `extension/auth/signup.html`
- ✅ `extension/auth/reset.html`
- ✅ `extension/auth/auth-error-map.js` — 하드코딩 문자열 → i18n key 반환. `mapXxxError()` 는 `t(key)` 반환, `mapXxxErrorKey()` 는 key 반환(로그·ARIA 용).
- ✅ `extension/sidepanel/panel.html` — 탭 버튼 + 골격 placeholder + aria
- ✅ `extension/sidepanel/tabs/youtube-tab.html` — 전 UI 문자열

---

## 3. 미적용 파일 — Phase 10.2 후속 작업 (key 등록 완료, 실제 `t()` 치환만 남음)

이 파일들의 하드코딩 한국어는 모두 §1 에 key 로 등록되어 있다. 실제 치환 작업은 다음 라운드:

| 파일 | 예상 key 치환 포인트 | 비고 |
|------|-------------------|------|
| `extension/sidepanel/tabs/analyze-tab.js` | `analyze_*` (11개) | `createEl` 호출의 텍스트 배열 → `t()` |
| `extension/sidepanel/tabs/benchmark-tab.js` | `benchmark_*` (8개) |  |
| `extension/sidepanel/tabs/generate-tab.js` | `generate_*` (18개) | 슬라이더/라벨/placeholder |
| `extension/sidepanel/tabs/learning-tab.js` | `learning_*` (5개) |  |
| `extension/sidepanel/tabs/mypage-tab.js` | `mypage_*` (9개) |  |
| `extension/sidepanel/tabs/youtube-tab.js` | `youtube_*` (이미 ERROR_MESSAGES 객체에서 한국어 사용 — i18n 로 치환 필요) |  |
| `extension/sidepanel/tabs/benchmark-stats-section.js` | `benchmark_stats_*` | 컴포넌트성 |
| `extension/sidepanel/components/expiry-banner.js` | `component_expiry_*` | placeholders 활용 |
| `extension/sidepanel/components/usage-gauge.js` | `component_usage_*` |  |
| `extension/sidepanel/components/score-card.js` | `component_score_*` |  |
| `extension/sidepanel/components/bar-chart.js` / `comparison-card.js` / `generate-result-card.js` / `learning-card.js` / `progress-bar.js` / `word-cloud.js` | 도메인별 라벨 | key 등록은 이미 `component_*` / 도메인 prefix 로 완료 |
| `extension/auth/login.js` / `signup.js` / `reset.js` | 폼 검증 메시지 → `error_*` key | 사용자 지시 명시 범위 외(HTML 만 지정) — 선택 작업 |

**치환 패턴 템플릿:**

```js
// Before
createEl('button', {}, ['분석 시작'])

// After
import { t } from '../../lib/utils/i18n.js'
createEl('button', { 'data-i18n': 'analyze_start' }, [t('analyze_start')])
//                 ↑ 나중에 changeLocale() 호출 시 applyI18n() 가 재적용
```

에러 매핑:
```js
// Before
showStatus('현재 탭 URL 을 가져올 수 없습니다.', 'error')

// After
showStatus(t('analyze_error_tab_url'), 'error')
```

---

## 4. key 검증 / 동기화

### 4.1 ko / en / ja key 일치 검사
```bash
jq -r 'keys[]' extension/_locales/ko/messages.json | sort > /tmp/ko_keys
jq -r 'keys[]' extension/_locales/en/messages.json | sort > /tmp/en_keys
jq -r 'keys[]' extension/_locales/ja/messages.json | sort > /tmp/ja_keys
diff /tmp/ko_keys /tmp/en_keys      # 0 diff 기대
diff /tmp/ko_keys /tmp/ja_keys      # 0 diff 기대
```

### 4.2 누락 key 런타임 탐지
i18n.js 는 `t('unknown_key')` 호출 시 `console.warn('[i18n] missing message key: unknown_key')` 로그 + key 자체 반환.
사이드패널/옵션 페이지를 한 바퀴 돌면서 콘솔 확인.

### 4.3 unused key 감사
```bash
for key in $(jq -r 'keys[]' extension/_locales/ko/messages.json); do
  found=$(grep -rl "\"$key\"\\|'$key'" extension/ 2>/dev/null | wc -l | tr -d ' ')
  [ "$found" = "0" ] && echo "UNUSED: $key"
done
```

---

## 5. 변경 이력

| 날짜 | 변경 | 영향 |
|------|-----|------|
| 2026-04-14 | Phase 10 초판 — 140개 key 등록, 3 locale, auth/panel/youtube HTML 전면 적용, auth-error-map 이관 | 미적용 tab/component JS 는 후속 라운드 (§3) |
