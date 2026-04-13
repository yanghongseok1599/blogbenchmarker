// background/service-worker.js
// 메시지 라우터 스켈레톤 (Phase 1.3 골격).
// 실제 핸들러는 후속 Phase에서 handlers/*-handler.js 로 분리 구현.

// 액션 네임스페이스 규칙: "{domain}.{action}"
// - auth.login / auth.logout / auth.status
// - analyze.post            → SEO 분석
// - generate.content        → AI 글 생성 (Edge Function 프록시)
// - benchmark.fetch         → 경쟁 블로그 벤치마킹
// - benchmark.addFavorite   → 즐겨찾기 등록
// - usage.today             → 오늘 사용량 조회

const handlers = {
  // "auth.login":         (payload, sender) => authHandler.login(payload, sender),
  // "auth.logout":        (payload, sender) => authHandler.logout(payload, sender),
  // "analyze.post":       (payload, sender) => analyzeHandler.post(payload, sender),
  // "generate.content":   (payload, sender) => generateHandler.content(payload, sender),
  // "benchmark.fetch":    (payload, sender) => benchmarkHandler.fetch(payload, sender),
  // "usage.today":        (payload, sender) => usageHandler.today(payload, sender),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.action];

  if (!handler) {
    sendResponse({ ok: false, error: `Unknown action: ${msg?.action ?? "(none)"}` });
    return false;
  }

  Promise.resolve(handler(msg.payload, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));

  // 비동기 sendResponse 보존 — 누락 시 응답이 버려진다.
  return true;
});

// 액션 버튼 클릭 시 사이드패널 열기.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => { /* 일부 환경 미지원 무시 */ });
  }
});
