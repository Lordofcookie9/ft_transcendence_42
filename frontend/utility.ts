export function setContent(html: string) {
	const app = document.getElementById('app');
	if (app) app.innerHTML = html;
  }
  
export function escapeHtml(str: string) {
	return str.replace(/&/g, "&amp;")
						.replace(/</g, "&lt;")
						.replace(/>/g, "&gt;")
						.replace(/"/g, "&quot;")
						.replace(/'/g, "&#039;");
}

export function formatDbDateTime(ts: string): string {
  if (!ts) return '';
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export function formatDbTime(ts: string): string {
  if (!ts) return '';
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function renderNotFound() {
	setContent('<div class="p-10 text-red-500 text-xl">404: Page not found</div>');
}

let __presenceTimer: number | null = null;
let __presenceStarted = false;

function sendOnline() {
  // same-origin: cookies included automatically
  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
    navigator.sendBeacon('/api/presence/heartbeat', blob);
  } else {
    fetch('/api/presence/heartbeat', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {});
  }
}

function sendOffline() {
  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
    navigator.sendBeacon('/api/presence/offline', blob);
  } else {
    fetch('/api/presence/offline', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {});
  }
}

// --- Multi-tab bookkeeping (per-tab id set in localStorage) ---
const TABS_KEY = 'presence.openTabs';
const TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function readTabs(): Set<string> {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr);
  } catch {}
  return new Set();
}
function writeTabs(set: Set<string>) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(Array.from(set))); } catch {}
}

function addThisTab() {
  const set = readTabs();
  if (!set.has(TAB_ID)) {
    set.add(TAB_ID);
    writeTabs(set);
  }
  return set.size;
}
function removeThisTab(): number {
  const set = readTabs();
  if (set.delete(TAB_ID)) writeTabs(set);
  return set.size;
}

export function startPresenceHeartbeat() {
  if (__presenceStarted) return;
  __presenceStarted = true;

  // register this tab
  const count = addThisTab();
  // if first tab, announce online immediately
  if (count === 1) sendOnline();

  // heartbeat every 25s while visible (server sweeper uses 60s; see below)
  if (!__presenceTimer) {
    sendOnline();
    __presenceTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') sendOnline();
    }, 25_000);
  }

  // On page restored from BFCache, ping again
  window.addEventListener('pageshow', (_e) => sendOnline());

  // Only mark offline when the LAST tab closes
  const onClose = () => {
    const remaining = removeThisTab();
    if (remaining === 0) {
      // last tab closing -> mark offline immediately
      sendOffline();
    }
  };

  // Use pagehide (fires on tab close and mobile background), plus unload fallback
  window.addEventListener('pagehide', onClose, { capture: true });
  window.addEventListener('unload', onClose, { capture: true });
  // Some browsers fire beforeunload but not unload in fast closes; add redundancy
  window.addEventListener('beforeunload', onClose, { capture: true });

  // Don’t mark offline on simple tab switches; we no longer do that on visibilitychange
}