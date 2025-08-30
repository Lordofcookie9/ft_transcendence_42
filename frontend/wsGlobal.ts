// frontend/wsGlobal.ts
import { route } from './router.js';

function handleAbortOnce(payload?: any) {
  // Prevent repeated alerts for the same aborted tournament (e.g., due to WS reconnect or page redraw)
  try {
    const lidStr = String(payload?.lobbyId || localStorage.getItem('tourn.lobby') || '');
    const lastLid = localStorage.getItem('tourn.abort.lobby') || '';
    if (lidStr && lidStr === lastLid) {
      // We've already handled this lobby abort; make sure client state is clean and bail.
      try { (window as any).__matchInProgress = false; (window as any).__activeTournamentHostLobbyId = undefined; } catch {}
      return;
    }
    if (lidStr) localStorage.setItem('tourn.abort.lobby', lidStr);
  } catch {}

  try {
    const now = Date.now();
    const last = Number(localStorage.getItem('tourn.abort.ts') || '0');
    if (now - last < 1500) return;
    localStorage.setItem('tourn.abort.ts', String(now));
  } catch {}
  try {
    const lid = String(payload?.lobbyId || localStorage.getItem('tourn.lobby') || '');
    if (lid) {
      localStorage.removeItem('tourn.lobby');
      localStorage.removeItem('tourn.match');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('tourn.room2lobby.')) localStorage.removeItem(k);
      }
    }
  } catch {}
  try { (window as any).__matchInProgress = false; (window as any).__activeTournamentHostLobbyId = undefined; } catch {}
  alert(String(payload?.message || 'a host left mid game, the tournament is canceled. You will be brought home'));
  route('/home');
}


export function connectGlobalWS() {
  const uid = Number(localStorage.getItem('userId') || '0');
  if (!uid) return;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws/?userId=${uid}`;
  let ws: WebSocket | null = null;

  const open = () => {
    try {
      ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        let msg: any; try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (msg && (msg.type === 'state' || msg.type === 'input')) {
            (window as any).__matchInProgress = true;
        }
        if (msg?.type === 'tournament:aborted') { handleAbortOnce(msg); }
        if (msg && msg.type === 'gameover') {
            // Once game is over, host navigation should NOT cancel the tournament
            (window as any).__matchInProgress = false;
            try { (window as any).__activeTournamentHostLobbyId = undefined; } catch {}
        }
      };
      ws.onclose = () => { setTimeout(open, 1200); };
      ws.onerror = () => { try { ws?.close(); } catch {} };
    } catch {}
  };
  open();
}
