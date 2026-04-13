# Chrome Web Store 등록 자료 — BLOG BenchMarker

**마지막 업데이트: 2026-04-14**
**대상 버전: 1.0.0**

본 문서는 Chrome Web Store 개발자 대시보드 제출용 텍스트·메타데이터·이미지 스펙을 정리합니다. 각 필드는 스토어 화면에 직접 노출되므로 과장 표현을 포함하지 않습니다.

---

## 목차

1. [기본 메타데이터](#1-기본-메타데이터)
2. [이름 (name)](#2-이름-name)
3. [짧은 설명 (short_description)](#3-짧은-설명-short_description)
4. [상세 설명 (detailed_description)](#4-상세-설명-detailed_description)
5. [카테고리 및 언어](#5-카테고리-및-언어)
6. [홍보 이미지 스펙](#6-홍보-이미지-스펙)
7. [권한 사유 (Permission justification)](#7-권한-사유-permission-justification)
8. [개인정보 처리방침 URL](#8-개인정보-처리방침-url)
9. [리뷰 시 제공할 테스트 계정](#9-리뷰-시-제공할-테스트-계정)

---

## 1. 기본 메타데이터

| 필드 | 값 |
|---|---|
| 확장 ID | (Chrome Web Store 최초 업로드 시 자동 발급) |
| 버전 | `1.0.0` |
| Manifest 버전 | `3` |
| default_locale | `ko` |
| 지원 언어 | 한국어(ko), 영어(en), 일본어(ja) |
| 개발자 이름 | {{DEVELOPER_DISPLAY_NAME}} |
| 개발자 이메일(공개) | {{PUBLIC_DEVELOPER_EMAIL}} |
| 홈페이지 URL | {{HOMEPAGE_URL}} |
| 지원 URL | {{SUPPORT_URL}} |

---

## 2. 이름 (name)

Chrome 스토어 표시명. 각 언어 45자 이내.

| 언어 | 이름 |
|---|---|
| 한국어 (ko) | BLOG BenchMarker — 네이버 블로그 SEO 분석 & 벤치마킹 |
| 영어 (en) | BLOG BenchMarker — Naver Blog SEO Analyzer & Benchmarker |
| 일본어 (ja) | BLOG BenchMarker — Naverブログ SEO 分析＆ベンチマーク |

---

## 3. 짧은 설명 (short_description)

각 언어 **132자 이하** (Chrome 웹 스토어 제한).

| 언어 | 내용 | 글자 수 |
|---|---|---:|
| 한국어 | 네이버 블로그 글의 SEO 점수를 계산하고, 경쟁 블로그를 벤치마킹해 더 나은 글을 쓰도록 도와주는 크롬 확장프로그램입니다. AI 초안 생성과 글쓰기 보조 도구를 포함합니다. | 96 |
| 영어 | Analyze the SEO of your Naver blog posts, benchmark competing blogs, and draft posts with AI assistance — right inside Chrome's side panel. | 135 → 다듬기 필요 |
| 영어 (대안) | SEO analysis for Naver blog posts, competitor benchmarking, and AI drafting — all in a Chrome side panel. | 103 |
| 일본어 | Naverブログ記事のSEOスコアを算出し、競合ブログをベンチマークして執筆を支援。AI下書き作成と執筆補助ツールも搭載。 | 60 |

**최종 권장 영어 버전:** "SEO analysis for Naver blog posts, competitor benchmarking, and AI drafting — all in a Chrome side panel." (103자)

---

## 4. 상세 설명 (detailed_description)

**제한:** 언어별 15,000자 이하. 아래는 한국어 마스터 버전입니다. 영어·일본어 번역본은 구조를 유지한 채 현지화합니다.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOG BenchMarker — 네이버 블로그 작성을 위한 SEO 분석과 벤치마킹
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

네이버 블로그를 운영하면서 이런 고민이 있나요?

- "내 글의 SEO 점수는 몇 점일까?"
- "잘 나가는 블로거는 어떤 구조로 쓸까?"
- "글 초안을 빠르게 만들고 싶어"

BLOG BenchMarker 는 사이드패널에서 이 세 가지를 한 번에 해결합니다.

━━━━━━━━━━━━━━━━━━━━
주요 기능
━━━━━━━━━━━━━━━━━━━━

🔍 SEO 분석 (100점 만점)
  · 제목 최적화, 본문 구조, 후킹, 가독성, 키워드 밀도 5개 섹션 점수
  · 첫 문장 후킹 유형 자동 분류(질문형/감탄형/통계형/스토리텔링/인사형)
  · 이미지·단락·문장 수 등 기본 지표
  · 개선 제안을 한국어로 최대 8개 제시

📊 경쟁 블로그 벤치마킹
  · 즐겨찾기한 블로거의 최근 글 자동 수집
  · 평균 글자수·이미지수·SEO 점수 비교
  · 자주 등장한 키워드 워드클라우드
  · 다기기 실시간 동기화

✍️ AI 글 생성 (Google Gemini 기반)
  · 분석한 글을 학습 데이터로 활용해 본인 문체에 맞게 초안 생성
  · 길이(80/100/120%)·모드(구조 유지/재해석/창작) 선택
  · 키워드·톤·역할 등 상세 옵션

🎬 YouTube → 블로그 변환
  · YouTube URL 입력 → 자막 추출 → 블로그 형식 글로 재가공

🧰 글쓰기 보조 도구
  · 글자수 카운터(공백 포함/제외, 단어·문장·문단 수)
  · 뽀모도로 타이머(사이드패널 닫아도 background 에서 진행)
  · 금칙어 검사(전역 + 사용자 정의)
  · 영역 스크린샷 캡처(라이브러리 의존 없이 네이티브 API 사용)

━━━━━━━━━━━━━━━━━━━━
플랜
━━━━━━━━━━━━━━━━━━━━

FREE (무료)
  · SEO 분석 무제한
  · AI 글 생성 일 3건, YouTube 변환 일 3건
  · 벤치마킹 1개 블로그, 학습 데이터 50개
  · 본인 Gemini API 키(BYOK) 등록 시 확장 한도 이용 가능

PRO (유료, 구독 결제 방식)
  · AI 글 생성 일 30건·월 500건, YouTube 무제한
  · 벤치마킹 10개 블로그, 학습 데이터 무제한
  · 시스템 제공 Gemini API 키 사용

━━━━━━━━━━━━━━━━━━━━
작동 방식
━━━━━━━━━━━━━━━━━━━━

1. 확장 설치 후 툴바 아이콘 클릭 → 사이드패널 열림
2. 이메일 또는 Google 로 간편 가입
3. 네이버 블로그 글 또는 글쓰기 페이지에서 사용
4. "분석하기" 버튼 클릭 → SEO 점수·개선 제안 확인
5. (선택) "AI 초안 생성" → 옵션 설정 → 결과 복사

━━━━━━━━━━━━━━━━━━━━
개인정보 보호
━━━━━━━━━━━━━━━━━━━━

· 네이버 블로그 도메인에서만 동작(`blog.naver.com`, `*.blog.naver.com`, `m.blog.naver.com`)
· 분석 점수 계산은 확장 내부에서 수행 — 본문이 서버로 전송되지 않습니다
· AI 생성 요청 시에만 입력 텍스트가 Supabase 경유로 Google Gemini 에 전달됩니다
· 세션은 chrome.storage.local 에 저장되며, 로그아웃 시 즉시 정리됩니다
· 자세한 내용: {{PRIVACY_POLICY_URL}}

━━━━━━━━━━━━━━━━━━━━
지원 및 문의
━━━━━━━━━━━━━━━━━━━━

· 사용 설명서: {{USER_MANUAL_URL}}
· FAQ: {{FAQ_URL}}
· 고객 문의: {{SUPPORT_EMAIL}}
· 버그 신고: {{ISSUE_TRACKER_URL}}

━━━━━━━━━━━━━━━━━━━━
v1.0.0 릴리스 노트
━━━━━━━━━━━━━━━━━━━━

· SEO 분석 엔진 출시(100점 만점 5개 섹션)
· 경쟁 블로그 벤치마킹(Realtime 동기화 포함)
· AI 글 생성 (Google Gemini gemini-2.5-flash)
· 뽀모도로·글자수 카운터·금칙어·스크린샷 도구
· 한국어·영어·일본어 다국어 지원

━━━━━━━━━━━━━━━━━━━━
주의 사항 (고지)
━━━━━━━━━━━━━━━━━━━━

· 본 확장은 네이버㈜ 또는 Google LLC 가 제공하는 공식 도구가 아닙니다.
· 네이버 블로그의 비공개·로그인 필요 페이지는 분석 대상이 아닙니다.
· AI 생성물의 정확성·검색 순위 향상·수익 발생은 보장하지 않습니다.
· 이용약관: {{TERMS_URL}}
```

**글자 수(공백 포함):** 약 1,650자. 15,000자 한도 내 충분한 여유.

---

## 5. 카테고리 및 언어

| 필드 | 값 | 비고 |
|---|---|---|
| Primary category | **Productivity** | 블로그 작성 생산성 도구 |
| Secondary category (선택) | Developer Tools | 해당 없음 — 공란 권장 |
| 대상 언어(Available Languages) | Korean, English, Japanese | `_locales/{ko,en,ja}/messages.json` 과 일치 |
| 주요 지역(Visibility Region) | All regions | 한국 우선이나 전 세계 노출 |
| 연령 | 13+ (Chrome 웹 스토어 기본) / 한국 내 14+ (PIPA) | 본 서비스는 14+ 적용 |

### 5.1 primary_color (테마 색)

| 필드 | 값 |
|---|---|
| primary_color | `#2563eb` (blue-600) |

사이드패널·로그인·마이페이지의 브랜드 색상과 일치.

---

## 6. 홍보 이미지 스펙

Chrome Web Store 는 아래 이미지를 요구합니다. 모두 PNG, RGB, 광고·저작권 위반 이미지 금지.

### 6.1 필수

| 종류 | 크기 | 수량 | 용도 |
|---|---|---:|---|
| 아이콘 | 128×128 px | 1 | Manifest `icons."128"` 와 동일 파일 |
| 스크린샷 | 1280×800 px 또는 640×400 px | 1~5 | `docs/SCREENSHOT-GUIDE.md` 참조 |

### 6.2 권장(선택이지만 노출도 향상)

| 종류 | 크기 | 비고 |
|---|---|---|
| Small promotional tile | 440×280 px | 카테고리 브라우징 시 노출 |
| Marquee promotional tile | 1400×560 px | 에디터 추천 후보 시 필요 |
| Large promotional tile | 920×680 px | 일부 배너 자리에 사용 |

### 6.3 디자인 가이드

- **배경색:** 브랜드 `#2563eb` + 흰색 조합. 과도한 그라디언트 지양.
- **텍스트:** 한국어 헤드카피는 12~14단어 이내. 영문 병기 선택.
- **장치 목업:** 브라우저 크롬을 포함한 스크린샷은 실제 UI 를 변형·조작하지 않을 것(스토어 정책).
- **사용자 데이터:** 실제 이용자 블로그 글을 캡처할 경우 반드시 사전 서면 동의. 샘플 더미 데이터 권장.
- **폰트:** Noto Sans KR / Noto Sans JP / Inter (모두 OFL/SIL 라이선스).

---

## 7. 권한 사유 (Permission justification)

Chrome Web Store 제출 시 각 권한에 대해 **공개 사유** 를 입력합니다. 아래 문구를 그대로 복붙 가능.

| 권한 | 공개 사유 (한글, 영문 모두 준비) |
|---|---|
| `storage` | 로그인 세션과 분석 결과 캐시를 로컬에 저장하기 위해 사용합니다. / Used to store login session and analysis cache locally. |
| `sidePanel` | 사이드패널 UI 를 제공하기 위한 필수 권한입니다. / Required to provide the side panel UI. |
| `scripting` | 네이버 블로그 글쓰기 페이지에 분석 사이드바 및 스크린샷 오버레이를 주입하기 위해 사용합니다. / Injects the analysis sidebar and screenshot overlay into the Naver blog writing page. |
| `alarms` | 벤치마크 정기 동기화와 뽀모도로 타이머 종료 알림을 예약합니다. / Schedules periodic benchmark sync and pomodoro timer notifications. |
| `notifications` | 뽀모도로 타이머의 작업·휴식 종료를 사용자에게 알립니다. / Notifies the user when the pomodoro work/break period ends. |
| `tabs` | 사이드패널에서 활성 탭을 캡처하기 위해 `chrome.tabs.captureVisibleTab` 을 호출합니다. / Calls `chrome.tabs.captureVisibleTab` from the side panel to screenshot the active tab. |
| Host `https://*.naver.com/*` | 네이버 블로그 페이지의 DOM 을 읽어 SEO 점수를 계산합니다. 요청한 글을 수집·전송하지 않습니다. / Reads the DOM of Naver blog pages to compute SEO scores. Does not upload the page content elsewhere. |

**Single Purpose 선언:** "Analyze, benchmark, and draft Naver blog posts."

**Remote code 사용 여부:** No. 모든 스크립트는 확장 번들에 포함되며 CDN 실행 코드를 로드하지 않습니다.

---

## 8. 개인정보 처리방침 URL

- Korean: {{PRIVACY_POLICY_URL}}/ko
- English: {{PRIVACY_POLICY_URL}}/en

`docs/PRIVACY.md` 및 `docs/PRIVACY.en.md` 를 공개 URL로 호스팅한 뒤 위 필드에 입력합니다.

---

## 9. 리뷰 시 제공할 테스트 계정

Chrome Web Store 리뷰 팀이 서비스의 유료/보호 기능을 검증할 수 있도록 테스트 계정을 제공합니다.

| 항목 | 값 |
|---|---|
| 이메일 | {{STORE_REVIEW_EMAIL}} |
| 비밀번호 | {{STORE_REVIEW_PASSWORD}} (스토어 대시보드 비공개 필드에 기재) |
| 플랜 | PRO (30일 테스트 라이선스) |
| 비고 | 본 계정은 리뷰 완료 후 회수하거나 비활성화합니다 |

---

## 부록: 제출 전 체크리스트

- [ ] `extension/manifest.json` 의 `version` 이 `1.0.0` 인가
- [ ] `_locales/{ko,en,ja}/messages.json` 의 `app_name` / `app_description` 이 위 §2·§3 과 일치하는가
- [ ] `icons/icon16.png` / `icon48.png` / `icon128.png` 가 실존하는 PNG 이며 투명 배경인가
- [ ] 스크린샷 1280×800 또는 640×400 × 최소 1장 준비 완료
- [ ] Privacy Policy URL 이 공개 상태인가
- [ ] Single Purpose 선언 문구 확인
- [ ] Remote code 사용 "No" 로 표시
- [ ] 모든 권한에 대한 공개 사유가 영문 포함되어 입력됐는가
- [ ] 테스트 계정(PRO 플랜) 생성 및 자격증명 비공개 필드 입력
