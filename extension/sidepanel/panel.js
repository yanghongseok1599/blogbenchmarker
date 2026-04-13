// sidepanel/panel.js
// Phase 1.3: 탭 전환 로직만. 각 탭의 실제 렌더링은 tabs/*-tab.js 로 분리 예정.

const TAB_IDS = ["analyze", "benchmark", "generate", "mypage"];

function activateTab(tabId) {
  if (!TAB_IDS.includes(tabId)) return;

  const tabs = document.querySelectorAll(".bm-tab");
  tabs.forEach((btn) => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  const panels = document.querySelectorAll(".bm-panel");
  panels.forEach((panel) => {
    const isActive = panel.dataset.panel === tabId;
    panel.classList.toggle("is-active", isActive);
    if (isActive) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
  });
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
