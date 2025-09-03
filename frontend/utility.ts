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
  };

  // Use pagehide (fires on tab close and mobile background), plus unload fallback
  window.addEventListener('pagehide', onClose, { capture: true });
  window.addEventListener('unload', onClose, { capture: true });

  // Don’t mark offline on simple tab switches; we no longer do that on visibilitychange
}

export async function getJSON<T = any>(url: string, opts?: { silent404?: boolean }) {
  const res = await fetch(url);
  if (!res.ok) {
    if (opts?.silent404 && res.status === 404) return null as any;
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

// Optional: guard a one-time toast
export function toastOnce(key: string, message: string) {
  const k = `__once_${key}`;
  // @ts-ignore
  if ((window as any)[k]) return;
  // @ts-ignore
  (window as any)[k] = true;
  try { alert(message); } catch {}
}

export type ToastKind = 'info' | 'success' | 'error';
export function showToast(message: string, kind: ToastKind = 'info', opts: { timeout?: number } = {}) {
  if (!message) return;
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    // Bottom-right stack
    root.className = 'fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none';
    document.body.appendChild(root);
  }
  const colors: Record<ToastKind, string> = {
    info: 'bg-gray-700/95 border-gray-400 shadow-gray-900/50',
    success: 'bg-emerald-600/95 border-emerald-300 shadow-emerald-900/40',
    error: 'bg-red-600/95 border-red-300 shadow-red-900/40'
  };
  const el = document.createElement('div');
  el.className = `pointer-events-auto border px-4 py-2 rounded-md shadow-lg text-sm text-white/95 backdrop-blur-sm transition-opacity duration-500 ${colors[kind]}`;
  el.textContent = message;

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.className = 'ml-3 text-white/70 hover:text-white';
  closeBtn.onclick = () => dismiss();
  const wrap = document.createElement('div');
  wrap.className = 'flex items-start';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  el.textContent = '';
  wrap.appendChild(msgSpan);
  wrap.appendChild(closeBtn);
  el.appendChild(wrap);

  // For bottom stack newest at bottom, append then reorder using flex-col-reverse
  root.appendChild(el);
  const timeout = opts.timeout ?? 4000;
  let timeoutId: number | null = window.setTimeout(() => dismiss(), timeout);

  function dismiss() {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    el.classList.add('opacity-0');
    setTimeout(() => { el.remove(); if (root && !root.childElementCount) root.remove(); }, 500);
  }
  return { dismiss };
}