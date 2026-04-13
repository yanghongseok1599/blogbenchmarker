// sidepanel/panel.js
// 탭 전환 로직 + 활성 탭 onActivate 훅 (각 탭의 마운트는 tabs/*-tab.js 가 담당).

const TAB_IDS = ["analyze", "benchmark", "generate", "mypage"];

// 탭별 onActivate 훅. lazy-load 후 1회만 마운트한다(각 mount 함수가 idempotent).
const tabActivators = {
  analyze: async (panelEl) => {
    const mod = await import("./tabs/analyze-tab.js");
    mod.mountAnalyzeTab(panelEl);
  },
  benchmark: async (panelEl) => {
    const mod = await import("./tabs/benchmark-tab.js");
    await mod.mountBenchmarkTab(panelEl);
  },
  // generate/mypage 는 후속 Phase 에서 등록.
};

function activateTab(tabId) {
  if (!TAB_IDS.includes(tabId)) return;

  const tabs = document.querySelectorAll(".bm-tab");
  tabs.forEach((btn) => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  /** @type {HTMLElement | null} */
  let activePanel = null;
  const panels = document.querySelectorAll(".bm-panel");
  panels.forEach((panel) => {
    const isActive = panel.dataset.panel === tabId;
    panel.classList.toggle("is-active", isActive);
    if (isActive) {
      panel.removeAttribute("hidden");
      activePanel = panel;
    } else {
      panel.setAttribute("hidden", "");
    }
  });

  // 탭별 마운트 훅 — 실패해도 탭 전환 자체는 막지 않는다.
  const activator = tabActivators[tabId];
  if (activator && activePanel) {
    Promise.resolve(activator(activePanel)).catch((err) => {
      console.error(`[panel] ${tabId} 탭 마운트 실패:`, err);
    });
  }
}

function handleTabClick(event) {
  const btn = event.target.closest(".bm-tab");
  if (!btn) return;
  activateTab(btn.dataset.tab);
}

document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".bm-tabs");
  nav?.addEventListener("click", handleTabClick);
  activateTab("analyze");
});
