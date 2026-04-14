# 트레이너 마일스톤(TM) ↔ BlogBenchmarker 결제 통합 스펙

> 마지막 업데이트: 2026-04-14
> 대상 독자: TM 결제 시스템 개발자 + BlogBenchmarker 운영자

---

## 1. 통합 개요

```
[BlogBenchmarker 확장]                   [트레이너 마일스톤]
checkout.html  ──── 새 탭 리다이렉트 ───▶  결제창 (자체 호스팅)
                                              │
                                              │ 결제 완료
                                              ▼
                                          (PG 결과 처리)
                                              │
                                              │ webhook POST
                                              ▼
[Supabase Edge Function] ◀── HMAC 서명 검증 ── verify-subscription
       │
       └─ subscriptions UPSERT → profiles.plan 자동 동기화 (트리거)
```

**책임 분리:**
- **TM 책임:** 결제창 UI, PG 사 연동(카드/계좌/간편결제), 결제 상태 관리, webhook 발송
- **BlogBenchmarker 책임:** 사용자 인증, 플랜 혜택 부여/회수, webhook 수신 검증, DB 반영

---

## 2. (A) 결제 시작 — TM 결제창 호출 사양

BlogBenchmarker의 `extension/payments/checkout.html` 이 사용자 클릭 시 새 탭으로 다음 URL을 엽니다.

### URL 형식

```
https://trainermilestone.com/checkout?plan={plan}&gateway=trainer_milestone&userId={userId}&orderId={orderId}&returnTo=chrome-extension
```

### 쿼리 파라미터

| 이름 | 타입 | 예시 | 설명 |
|------|------|------|------|
| `plan` | `pro` \| `unlimited` | `pro` | 구독 플랜 |
| `gateway` | `trainer_milestone` | (고정) | 게이트웨이 식별자 |
| `userId` | UUID | `0c5e1f9b-...` | BlogBenchmarker `profiles.id` (Supabase auth.users.id 와 동일) |
| `orderId` | string | `bm_0c5e1f9b_lz3a2_a8d` | 클라이언트 발급 주문 식별자 (TM이 자체 결제 ID와 매핑하는 외부키로 사용 권장) |
| `returnTo` | string | `chrome-extension` | 결제 완료 후 처리 분기용 (TM은 무시 가능) |

### 가격 (BlogBenchmarker 측 정의)

| Plan | 월 가격 (KRW) |
|------|--------------:|
| `pro` | **9,900** |
| `unlimited` | **29,900** |

> ⚠️ TM 측에서 결제 금액과 BlogBenchmarker 가격이 일치해야 합니다. 불일치 시 webhook 처리에서 `amount_mismatch` (HTTP 400) 반환.

### TM 측 운영자 설정

`app_settings.billing_url` 값을 실제 TM 결제창 URL로 업데이트하세요:

```sql
-- Supabase SQL 에디터에서
UPDATE public.app_settings
SET value = '"https://trainermilestone.com/your-checkout-path"'::jsonb
WHERE key = 'billing_url';
```

기본값은 `https://trainermilestone.com/checkout` 입니다.

---

## 3. (B) 결제 완료 — TM Webhook 사양

TM은 결제 상태 변경 시 다음 엔드포인트로 POST 요청을 보냅니다.

### 엔드포인트

```
POST https://ykyrdwllilffczgryvfv.supabase.co/functions/v1/verify-subscription
```

### 요청 헤더

```
Content-Type: application/json
X-Trainer-Milestone-Signature: <HMAC-SHA256 hex>
```

> 또는 `X-Signature` 헤더도 동일하게 인식합니다 (둘 중 하나만).

### HMAC 서명 생성 방법

```python
import hmac, hashlib
secret = "BlogBenchmarker가 발급한 WEBHOOK_SECRET"  # 별도 안전 채널로 전달
raw_body = json.dumps(payload, separators=(',', ':'))  # 또는 그대로 직렬화한 raw 문자열
signature = hmac.new(secret.encode(), raw_body.encode(), hashlib.sha256).hexdigest()
```

```javascript
// Node.js
const crypto = require('crypto')
const secret = process.env.BLOGBENCH_WEBHOOK_SECRET
const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
```

> 💡 검증은 `rawBody` 원문 기준입니다. JSON.stringify 결과의 공백/순서가 달라도 같은 본문을 같은 순서로 사용했다면 통과합니다.

### 요청 본문 (JSON)

```json
{
  "gateway": "trainer_milestone",
  "payment_id": "tm_pay_2026041401234",
  "user_id": "0c5e1f9b-7a23-4f6d-9e12-3b45c8a9d1e0",
  "plan": "pro",
  "amount": 9900,
  "status": "paid",
  "paid_at": "2026-04-14T05:23:45+09:00",
  "ends_at": "2026-05-14T05:23:45+09:00"
}
```

### 필드

| 필드 | 타입 | 필수 | 값 | 설명 |
|------|------|:---:|----|------|
| `gateway` | string | ✓ | `trainer_milestone` 고정 | 게이트웨이 식별 |
| `payment_id` | string | ✓ | TM 내부 결제 ID | webhook 재시도 멱등 키 (UNIQUE) |
| `user_id` | UUID | ✓ | BlogBenchmarker 사용자 ID | checkout URL의 `userId` 그대로 |
| `plan` | string | ✓ | `pro` \| `unlimited` | 구독 플랜 |
| `amount` | number | ✓ | KRW (정수) | 실 결제 금액 |
| `status` | string | ✓ | `paid` \| `refunded` \| `cancelled` | 결제 상태 |
| `paid_at` | ISO8601 | ✓ | `2026-04-14T05:23:45+09:00` | 결제 완료 시각 |
| `ends_at` | ISO8601 \| `null` | × | 구독 만료일 | 미제공 시 BlogBenchmarker가 30일 자동 산정 |

### 응답 (성공)

```json
{
  "ok": true,
  "data": {
    "received": true,
    "matched": true,
    "subscription_id": "uuid",
    "status": "active"
  }
}
```

HTTP 200.

### 응답 (실패)

| HTTP | code | 의미 | TM 측 대응 |
|:----:|------|------|-----------|
| 400 | `invalid_payload` | 필드 누락/형식 오류 | webhook 페이로드 점검 |
| 400 | `invalid_input` | gateway 식별 실패 | gateway 필드 확인 |
| 400 | `amount_mismatch` | 가격 불일치 | TM 측 결제 금액 점검 |
| 401 | `invalid_signature` | HMAC 서명 검증 실패 | secret 또는 raw_body 확인 |
| 500 | `db_error` | DB 저장 실패 | 재시도 (멱등하게 처리됨) |

### 재시도 정책 (TM 측에서 구현 권장)

- HTTP 500/502/503/타임아웃 → 지수 백오프 재시도 (1m, 5m, 30m, 2h)
- HTTP 4xx → 페이로드 오류, 재시도 무의미 (수동 조사)

> ✅ BlogBenchmarker는 `UNIQUE(gateway, payment_id)` 제약 + UPSERT로 webhook 재시도를 안전하게 흡수합니다.

---

## 4. WEBHOOK_SECRET 발급 및 공유

BlogBenchmarker가 자동 생성한 32바이트 hex 시크릿:

```bash
# BlogBenchmarker 운영자가 다음 명령으로 확인 가능
supabase secrets list  # WEBHOOK_SECRET 디지스트만 표시됨

# 새 시크릿 생성/교체
supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

→ 생성된 값을 **TM 운영자에게 안전한 채널**(1Password / 사내 보안 메신저)로 전달.

---

## 5. 환불/취소 시나리오

### 환불 (`status: "refunded"`)

```json
{
  "gateway": "trainer_milestone",
  "payment_id": "tm_pay_2026041401234",
  "user_id": "0c5e1f9b-...",
  "plan": "pro",
  "amount": 9900,
  "status": "refunded",
  "paid_at": "2026-04-14T05:23:45+09:00",
  "ends_at": "2026-04-15T10:00:00+09:00"
}
```

→ BlogBenchmarker:
- `subscriptions.status = 'refunded'`
- `subscriptions.plan = 'free'`
- 트리거가 `profiles.plan = 'free'` 자동 복귀

### 사용자 자발 취소 (`status: "cancelled"`)

```json
{ ..., "status": "cancelled" }
```

→ BlogBenchmarker:
- `subscriptions.status = 'cancelled'`
- `ends_at` 시점까지는 plan 혜택 유지 (기존 트리거 정책)

---

## 6. 테스트 체크리스트 (TM 측)

| # | 시나리오 | 기대 응답 |
|---|---------|----------|
| 1 | 정상 결제 (`status=paid`, 정확한 amount) | 200 / `received: true` |
| 2 | 잘못된 서명 | 401 / `invalid_signature` |
| 3 | 금액 불일치 (pro 인데 5000원) | 400 / `amount_mismatch` |
| 4 | 같은 payment_id 로 재전송 | 200 / `matched: true` (UPSERT) |
| 5 | 환불 webhook | 200 / `status: 'refunded'` |
| 6 | user_id가 잘못된 형식 | 400 / `invalid_payload` |

---

## 7. 운영 모니터링

### 로그 확인

```bash
supabase functions logs verify-subscription --tail
```

### 구독 현황 SQL

```sql
-- TM 결제로 활성화된 구독 목록
SELECT s.id, s.plan, s.status, s.starts_at, s.ends_at, p.email
FROM public.subscriptions s
JOIN public.profiles p ON p.id = s.user_id
WHERE s.gateway = 'trainer_milestone'
ORDER BY s.created_at DESC
LIMIT 50;

-- 최근 24h webhook으로 갱신된 행
SELECT * FROM public.subscriptions
WHERE gateway = 'trainer_milestone'
  AND created_at >= NOW() - INTERVAL '24 hours';
```

---

## 8. 변경 이력

| 일자 | 변경 | 사유 |
|------|------|------|
| 2026-04-14 | 초기 작성 | TOSS/PORTONE → 트레이너 마일스톤으로 게이트웨이 단일화 |
