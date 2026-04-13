# Privacy Policy — BLOG BenchMarker

**Last updated: 2026-04-14**
**Effective date: 2026-04-14**

BLOG BenchMarker (the "Service") respects your privacy. This policy describes how we collect, use, store, and protect your personal data in accordance with the Republic of Korea's Personal Information Protection Act (PIPA) and the EU General Data Protection Regulation (GDPR).

---

## Table of Contents

1. [Data We Collect](#1-data-we-collect)
2. [Purposes of Processing](#2-purposes-of-processing)
3. [Retention and Deletion](#3-retention-and-deletion)
4. [Third-Party Processors](#4-third-party-processors)
5. [Your Rights](#5-your-rights)
6. [Cookies and Local Storage](#6-cookies-and-local-storage)
7. [Security Measures](#7-security-measures)
8. [Children's Data](#8-childrens-data)
9. [Contact](#9-contact)
10. [Changes](#10-changes)

---

## 1. Data We Collect

| Category | Items | When Collected | Legal Basis |
|---|---|---|---|
| Account | Email, hashed password, display name (optional) | Sign-up | Contract (GDPR Art. 6(1)(b)) |
| Account (OAuth) | Google account email, profile picture URL, subject ID | Google login | Consent (GDPR Art. 6(1)(a)) |
| Service | Analyzed Naver blog URL, title, content summary, SEO score | On analysis request | Contract |
| Service | Registered competitor blog URLs and collected post metadata | On benchmark add/sync | Contract |
| Service | Learning data (posts explicitly saved by user) | On "Analyze + Learn" click | Consent |
| Usage logs | Feature call record (feature name, token cost, timestamp) | On paid feature call | Contract / Legitimate interest |
| Billing | Plan, payment status, gateway ID, expiry date | On subscription payment | Contract |
| Technical | Extension version, browser language | During use | Legitimate interest |

**We do NOT collect:**

- National IDs or financial account numbers (payments are handled by the processor directly).
- Your Naver blog account credentials.
- Contacts, location, photos, or other sensitive device data.
- Personal information from other websites the extension can access.

---

## 2. Purposes of Processing

| Purpose | Related Data |
|---|---|
| Account authentication and management | Email, password, display name |
| SEO analysis results | Blog URL, content, analysis result |
| Competitor benchmarking statistics | Competitor blog URLs, collected posts |
| AI content generation personalization | Learning data |
| Daily/monthly usage quota verification and billing | Usage logs, billing history |
| Expiry notices and plan status | Billing history, email |
| Service improvement and incident response | Anonymized technical information |

---

## 3. Retention and Deletion

- **On account deletion:** Deleting `auth.users` cascades (FK CASCADE) to profile, learning data, benchmark lists, usage logs, and billing — all removed immediately. Physical erasure may take up to 30 days due to the database backup rotation cycle.
- **Billing records:** Retained for 5 years per Korea's Act on Consumer Protection in Electronic Commerce (billing/refund records only). During this period, minimal anonymized identifiers are preserved after account deletion.
- **Usage logs:** Retained up to 12 months, then auto-deleted. Used for dispute / abuse handling.
- **Cookies/local storage:** Removed immediately when you remove the extension or clear browser data.

---

## 4. Third-Party Processors

We do NOT sell or share your personal data with third parties. The following processors support service delivery.

| Processor | Role | Data Processed | Region |
|---|---|---|---|
| Supabase, Inc. (USA) | Account/data storage, auth, realtime | Email, hashed password, analysis/benchmark data, usage logs | Project region at sign-up (default Asia-Northeast1 or us-east-1) |
| Google LLC (USA) — Gemini API | Passes text to AI model and returns generated output | Blog body/title at generation time | Per Google policy |
| Google LLC — OAuth | Identity verification if you choose Google login | Email, subject ID | — |
| Toss Payments Co., Ltd. or PortOne Inc. | Payment processing and webhook verification | Payment amount, order ID, payment method metadata (no raw card data) | Korea |

**International Transfer Notice:** Use of Supabase and Google services may transfer some of your data outside Korea. You will be notified and asked to consent at account creation.

**Google Gemini Data Transmitted:**

- Content and title are sent only upon AI generation requests. SEO analysis (score calculation) runs entirely inside the extension and is NOT transmitted.
- We configure API options so Google does NOT train models with the transmitted data (default for paid API as of 2026-04-14).

---

## 5. Your Rights

You may exercise the following rights at any time (GDPR Art. 15–22; PIPA Art. 35–39).

| Right | How to Exercise |
|---|---|
| **Access** | My Page → Profile & usage dashboard |
| **Rectification** | Edit display name on My Page. Contact {{SUPPORT_EMAIL}} to change email |
| **Erasure / Right to be Forgotten** | My Page → "Delete account" or request via {{SUPPORT_EMAIL}}. Processed within 30 days |
| **Restriction of Processing** | Request via {{SUPPORT_EMAIL}} |
| **Data Portability** | Request via {{SUPPORT_EMAIL}} to receive your data as a JSON file |
| **Withdraw Consent** | Learning data consent, marketing consent, etc. — revocable immediately from Settings |
| **Object to Automated Decision-Making** | We do NOT perform profiling-based automated decisions |

**Identity verification:** We verify your identity via email confirmation link or OAuth re-authentication before acting on requests.

---

## 6. Cookies and Local Storage

We do NOT set website cookies. The extension uses the Chrome `chrome.storage` API.

| Storage | Purpose | Retention |
|---|---|---|
| `chrome.storage.local` | Supabase session tokens (auto-login), analysis cache, expiry banner dismissal | Until extension removed or logout |
| `chrome.storage.session` | One-time OAuth state parameter | Cleared on browser restart |
| `chrome.storage.sync` | User settings (language) — synced across devices | Until user deletes |

No advertising or tracking cookies are used.

---

## 7. Security Measures

- **Transport encryption:** All external traffic uses HTTPS (TLS 1.2+).
- **At-rest encryption:** Supabase PostgreSQL uses disk-level AES-256 encryption.
- **Access control:** Row Level Security (RLS) enforces per-user data isolation at the database level.
- **API key protection:** Gemini and similar API keys are stored only in server-side Edge Functions and never bundled into the extension.
- **XSS prevention:** The extension never uses `innerHTML`; it uses safe DOM APIs exclusively.
- **Passwords:** Raw passwords are not stored; we use Supabase Auth's bcrypt hashing.
- **Log minimization:** Debug logs are stripped in production builds.

---

## 8. Children's Data

The Service does not permit sign-up by children under 14. Accounts confirmed to belong to children under 14 will be deleted without delay. For GDPR jurisdictions, we observe the applicable local age of consent (e.g., 16).

---

## 9. Contact

- **Data Protection Officer:** {{PRIVACY_OFFICER_NAME}}
- **Contact email:** {{SUPPORT_EMAIL}}
- **Official site:** {{PRIVACY_POLICY_URL}}
- **EU/UK Representative:** {{EU_REP_NAME_AND_EMAIL}}

For complaints or inquiries, you may also contact:

- Personal Information Dispute Mediation Committee (https://www.kopico.go.kr) — +82-1833-6972
- Korea Internet & Security Agency (KISA) Privacy Center (https://privacy.kisa.or.kr) — 118
- Supervisory authority in your EU member state (for GDPR complaints)

---

## 10. Changes

| Date | Version | Change |
|---|---|---|
| 2026-04-14 | 1.0.0 | Initial version (effective with v1.0.0 release) |

Material changes will be announced in-app and by email at least 7 days before taking effect.
