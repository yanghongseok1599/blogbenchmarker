# extension/icons/

Chrome Web Store 등록 및 `manifest.json` 의 `icons` 필드에서 참조되는 아이콘 폴더.

## 필요한 파일 (placeholder)

| 파일명 | 크기 | 용도 |
|---|---|---|
| `icon16.png` | 16×16 PNG | 툴바 favicon 크기 |
| `icon48.png` | 48×48 PNG | 확장프로그램 관리 페이지 |
| `icon128.png` | 128×128 PNG | Chrome Web Store 상세 페이지 |

## 생성 가이드

- 투명 배경 PNG 권장
- 단색 배경 시 Chrome 라이트/다크 모드 모두에서 식별 가능한 대비 유지
- 텍스트 포함 시 16px 버전에서도 가독성 확보 (최소 1~2글자만)
- 동일 디자인을 세 사이즈로 리사이즈 (pixel-snapped)

## 임시 대응

Phase 1.3 시점에는 실제 PNG 가 없어도 로드는 되나, Chrome 이 기본 퍼즐 아이콘으로 대체한다.
스토어 제출 전까지 반드시 실제 PNG 로 교체할 것.
