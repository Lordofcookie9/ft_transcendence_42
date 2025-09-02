// frontend/pages/tournamentRoom.ts
import { setContent, escapeHtml } from '../utility.js';
import { route } from '../router.js';
import { getUserInfo } from '../users/userManagement.js';
import { initPongGame } from '../pong/pong.js';

function onBackToLobby(ev: Event, lobbyId: number) {
  ev.preventDefault();
  ev.stopPropagation();
  // ensure the match WS is closed so the server sees the host leaving
  try { (window as any).__tournRoomCleanup?.(); } catch {}
  const inProg = !!(window as any).__matchInProgress;
  if (inProg) {
    // host leaves mid-game: mirror the broadcast message locally for the leaver
    try { alert('a host left mid game, the tournament is canceled. You will be brought home'); } catch {}
    route('/home');
    return false;
  }
  // not in progress (e.g., after gameover): safe to return to lobby
  route(`/tournament-online?lobby=${lobbyId}`);
  return false;
}

function handleAbortOnce(payload?: any) {
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
  try { route('/home'); } catch { location.href = '/home'; }
}

type MatchLite = {
  id: number;
  round: number;
  match_index: number;
  p1_user_id: number | null;
  p1_alias: string | null;
  p2_user_id: number | null;
  p2_alias: string | null;
  room_id: number | null;
  status: 'pending' | 'active' | 'finished';
  winner_user_id: number | null;
};

function qNum(param: string): number | null {
  const v = new URLSearchParams(location.search).get(param);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function renderOnlineTournamentRoom() {
  const lobbyId = qNum('lobby');
  const matchId = qNum('mid');
  const roomId  = qNum('room');
  if (!lobbyId || !matchId || !roomId) {
    setContent(`<div class="p-6 text-red-400">Missing lobby/match/room in URL</div>`);
    return;
  }

  // Base UI
  setContent(`
    <a
      href="/tournament-online?lobby=${lobbyId}"
      onclick="return onBackToLobby(event, ${lobbyId})"
      class="fixed top-4 left-4 z-[60] bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm"
    >← Back to lobby</a>

    <div class="text-center mt-10">
      <h1 class="text-3xl font-bold mb-2">Tournament Match</h1>
      <div class="text-gray-400 text-sm mb-1">
         Controls : left player use W,S right player use up and down arrow
      </div>

      <div id="host-controls" class="mt-3 hidden">
        <button id="btn-start" class="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded" disabled>Start</button>
        <div id="start-hint" class="text-sm text-gray-300 mt-1">Waiting for opponent to join…</div>
      </div>

      <div class="flex justify-between items-center max-w-6xl mx-auto mb-4 px-8 text-xl font-semibold text-white">
        <div id="player1-info" class="text-left w-1/3">—: 0</div>
        <div class="text-gray-300 text-base">Match</div>
        <div id="player2-info" class="text-right w-1/3">—: 0</div>
      </div>

      <div class="flex justify-center">
        <div id="pong-root" class="border-2 border-white bg-black"></div>
      </div>
    </div>
  `);

  const container = document.getElementById('pong-root') as HTMLElement | null;
  if (!container) return;

  const hostControls = document.getElementById('host-controls') as HTMLDivElement | null;
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement | null;
  const startHint = document.getElementById('start-hint') as HTMLDivElement | null;

  // Identity (only to map bracket P1/P2 to room host/guest)
  // getUserInfo is synchronous and returns an object with userId, not id
  const userInfo = getUserInfo();
  const myId: number | null = userInfo?.type === 'loggedInUser' ? Number(userInfo.userId) : null;

  // Join room (role + room default names; bracket will override names)
  const WAITING = '— waiting —';
  let role: 'left' | 'right' = 'left';
  let hostAlias = 'P1';
  let guestAlias = WAITING;
  try {
    const res = await fetch(`/api/game/room/${roomId}/join`, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (res.status === 410 || String(data?.error || '') === 'tournament_cancelled') {
      alert('This tournament was cancelled. You will be brought home.');
      route('/home');
      return;
    }
    if (!res.ok) throw new Error(data?.error || `Join failed (${res.status})`);
    role = data.role;
    // If I am the room host and this room belongs to a tournament, mark it globally
    try {
      const isRoomHost = (role === 'left');
      if (isRoomHost && lobbyId) {
        // Defer marking until we actually see gameplay traffic
        (window as any).__activeTournamentHostLobbyId = String(lobbyId);
        (window as any).__matchInProgress = false; // will flip to true on first state/input
      }
    } catch {}
    hostAlias  = data.host_alias || 'P1';
    guestAlias = data.guest_alias || WAITING;
  } catch (e: any) {
    setContent(`<div class="p-6 text-red-400">Could not join room: ${escapeHtml(e?.message || '')}</div>`);
    return;
  }

  // ---- Read tournament snapshot and compute a reliable mapping using USER IDs + ROLE ----
  let match: MatchLite | null = null;
  let bracketP1Alias: string | null = null;
  let bracketP2Alias: string | null = null;
  let bracketP1Side: 'host' | 'guest' = 'host'; // which room side corresponds to bracket P1

  try {
    const res = await fetch(`/api/tournament/${lobbyId}`, { credentials: 'include' });
    const snap = await res.json();
    if (res.ok && snap?.state?.rounds) {
      // find my match
      outer:
      for (const r of snap.state.rounds as MatchLite[][]) {
        for (const m of r) { if (m.id === matchId) { match = m; break outer; } }
      }
      bracketP1Alias = match?.p1_alias || null;
      bracketP2Alias = match?.p2_alias || null;

      // Determine whether room HOST is bracket P1 or P2 using myId + role
      if (match && myId) {
        if (role === 'left') {
          if (myId === match.p1_user_id) bracketP1Side = 'host';
          else if (myId === match.p2_user_id) bracketP1Side = 'guest';
        } else { // role === 'right'
          if (myId === match.p2_user_id) bracketP1Side = 'host';  // host is the opponent (bracket P1)
          else if (myId === match.p1_user_id) bracketP1Side = 'guest';
        }
      }

      // Apply bracket aliases to UI immediately (if available)
      const aliasForHost  = (bracketP1Side === 'host') ? (bracketP1Alias || null) : (bracketP2Alias || null);
      const aliasForGuest = (bracketP1Side === 'host') ? (bracketP2Alias || null) : (bracketP1Alias || null);
      if (aliasForHost)  hostAlias  = aliasForHost;
      if (aliasForGuest) guestAlias = aliasForGuest;
    }
  } catch {}

  // ---------- Stable name handling (bracket alias is the source of truth) ----------
  const updateNameplates = () => {
    const s1 = localStorage.getItem('p1Score') || '0';
    const s2 = localStorage.getItem('p2Score') || '0';
    const el1 = document.getElementById('player1-info');
    const el2 = document.getElementById('player2-info');
    if (el1) el1.innerHTML = `${escapeHtml(hostAlias)}: ${escapeHtml(s1)}`;
    if (el2) el2.innerHTML = `${escapeHtml(guestAlias)}: ${escapeHtml(s2)}`;
  };

  let guestJoined = guestAlias && guestAlias !== WAITING;

  
  // New: only allow starting once we receive a server presence event
  let guestConnected: boolean = false;
const setHostAliasMaybe = (name?: string | null) => {
    const n = (name || '').trim();
    if (!n || n === WAITING) return;
    hostAlias = n;
    try { localStorage.setItem('p1', hostAlias); } catch {}
    updateNameplates();
    try { window.dispatchEvent(new CustomEvent('pong:setNames', { detail: { left: hostAlias } })); } catch {}
  };
  const setGuestAliasMaybe = (name?: string | null) => {
    const n = (name || '').trim();
    if (!n || n === WAITING) return;
    guestAlias = n;
    try { localStorage.setItem('p2', guestAlias); } catch {}
    updateNameplates();
    try { window.dispatchEvent(new CustomEvent('pong:setNames', { detail: { right: guestAlias } })); } catch {}
  };

  // Seed UI with (maybe) bracket-driven aliases
  updateNameplates();
  const onScore = () => updateNameplates();
  window.addEventListener('pong:score', onScore as any);

  const showEndOverlay = (detail?: any) => {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-40';
    const winnerText = detail?.winner ? `Winner: ${escapeHtml(String(detail.winner))}` : 'Match Over';
    el.innerHTML = `
      <div class="text-white text-center space-y-4">
        <div class="text-3xl font-bold">${winnerText}</div>
        <div class="flex gap-3 justify-center">
          <button id="btn-back" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Go back to lobby</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>('#btn-back')?.addEventListener('click', () => {
      el.remove();
      route('/tournament-online?lobby=' + encodeURIComponent(String(lobbyId)));
    });
  };

  // Build WebSocket
  const wsProto  = location.protocol === 'https:' ? 'wss' : 'ws';
  const __uid    = Number(localStorage.getItem('userId') || '0');
  const ws = new WebSocket(`${wsProto}://${location.host}/ws/game/${roomId}/${(role === 'left') ? 'host' : 'guest'}?lobbyId=${encodeURIComponent(String(lobbyId))}&userId=${__uid}`);
  // This tab is the authoritative source for "in progress" from the host's perspective.
  (window as any).__matchInProgress = false;

  // Clean shutdown
  const cleanup = () => {
    try { ws.close(1001, 'navigate'); } catch {}
    try { (window as any).__activeTournamentHostLobbyId = undefined; } catch {}
    try { (window as any).__matchInProgress = false; } catch {}
  };
  try { (window as any).__tournRoomCleanup = cleanup; } catch {}
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('popstate', cleanup);

  // Presence & streaming hooks
  let pushGuestInputToEngine: ((input: { up: boolean; down: boolean }) => void) | null = null;
  let applyStateFromHost: ((state: any) => void) | null = null;
  let resendTimer: number | null = null;
  let engineStarted = false;
  let postedComplete = false;

  // Host-only game start logic (moved earlier so we can optionally auto-start)
  const startHostGame = () => {
    if (engineStarted) return;
    engineStarted = true;
    if (hostControls) hostControls.remove();

    try { localStorage.setItem('p1', hostAlias); } catch {}
    try {
      if (guestJoined) localStorage.setItem('p2', guestAlias);
      localStorage.setItem('p1Score', '0');
      localStorage.setItem('p2Score', '0');
    } catch {}

    initPongGame(container as HTMLElement, async () => {
      try { localStorage.removeItem('game.inProgress'); } catch {}
      const hostScore = parseInt(localStorage.getItem('p1Score') || '0', 10);
      const guestScore = parseInt(localStorage.getItem('p2Score') || '0', 10);
      let winnerAlias = '—';
      if (Number.isFinite(hostScore) && Number.isFinite(guestScore)) {
        winnerAlias = hostScore > guestScore ? hostAlias : guestAlias;
      }
      let winner_slot; // map to bracket p1/p2
      if (Number.isFinite(hostScore) && Number.isFinite(guestScore) && hostScore !== guestScore) {
        const hostWon = hostScore > guestScore;
        winner_slot = hostWon
          ? (bracketP1Side === 'host' ? 'p1' : 'p2')
          : (bracketP1Side === 'guest' ? 'p1' : 'p2');
      }
      let p1_score; let p2_score;
      if (bracketP1Side === 'host') { p1_score = hostScore; p2_score = guestScore; }
      else { p1_score = guestScore; p2_score = hostScore; }
      const detail = winnerAlias !== '—' ? { winner: winnerAlias } : {};
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'gameover', detail })); } catch {}
      }
      if (!postedComplete) {
        postedComplete = true;
        try {
          await fetch(`/api/tournament/${lobbyId}/match/${matchId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              winner_slot,
              host_score: hostScore,
              guest_score: guestScore,
              p1_score, p2_score
            }),
          });
        } catch {}
      }
      showEndOverlay(detail);
    }, {
      control: 'left',
      netMode: 'host',
      emitState: (state: any) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'state', state })); },
      onRemoteInput: (register: any) => { pushGuestInputToEngine = register; },
    });
  };

  // Show/enable Start button only for host
  if (role === 'left' && hostControls && btnStart) {
    hostControls.classList.remove('hidden');
    btnStart.disabled = !guestConnected;
    if (guestConnected && startHint) startHint.textContent = 'Opponent is here. You can start!';
  }

  // Helpers that always prefer bracket alias, not usernames
  const preferBracketForHost = (incoming?: string | null) => {
    const bracketHost = (bracketP1Side === 'host') ? (bracketP1Alias || null) : (bracketP2Alias || null);
    return (bracketHost && bracketHost.trim()) ? bracketHost : (incoming || '');
  };
  const preferBracketForGuest = (incoming?: string | null) => {
    const bracketGuest = (bracketP1Side === 'host') ? (bracketP2Alias || null) : (bracketP1Alias || null);
    return (bracketGuest && bracketGuest.trim()) ? bracketGuest : (incoming || '');
  };

  // Attach message handler BEFORE 'open'
  ws.addEventListener('message', (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg && msg.type === 'tournament:aborted') {
      try { alert(String(msg.message || 'a host left mid game, the tournament is canceled. You will be brought home')); } catch {}
      try { route('/home'); } catch { location.href = '/home'; }
      return;
    }

    if (msg.type === 'opponent:joined') {
      if (role === 'left' && msg.role === 'guest') {
        guestConnected = true;
        if (btnStart) btnStart.disabled = false;
        if (startHint) startHint.textContent = 'Opponent is here. You can start!';
        setGuestAliasMaybe(preferBracketForGuest(msg.alias));
      } else if (role === 'right' && msg.role === 'host') {
        setHostAliasMaybe(preferBracketForHost(msg.alias));
      }
      return;
    }

    if (msg.type === 'hello' && msg.alias) {
      // Back-compat; still favor bracket alias
      if (role === 'left') setGuestAliasMaybe(preferBracketForGuest(String(msg.alias)));
      else setHostAliasMaybe(preferBracketForHost(String(msg.alias)));
      return;
    }

    if (role === 'left' && msg.type === 'input' && pushGuestInputToEngine) {
      (window as any).__matchInProgress = true;
      pushGuestInputToEngine({ up: !!msg.up, down: !!msg.down });
      return;
    }
    if (role === 'right' && msg.type === 'state' && applyStateFromHost) {
      (window as any).__matchInProgress = true;
      applyStateFromHost(msg.state);
      try {
        const scores = (msg.state && (msg.state.scores || {})) || {};
        const left  = Number((scores.left  ?? msg.state?.leftScore  ?? msg.state?.p1Score ?? msg.state?.scoreLeft)  ?? 0);
        const right = Number((scores.right ?? msg.state?.rightScore ?? msg.state?.p2Score ?? msg.state?.scoreRight) ?? 0);
        if (Number.isFinite(left) && Number.isFinite(right)) {
          try { localStorage.setItem('p1Score', String(left)); } catch {}
          try { localStorage.setItem('p2Score', String(right)); } catch {}
          updateNameplates();
          try { window.dispatchEvent(new CustomEvent('pong:score', { detail: { left, right } })); } catch {}
        }
      } catch {}
      return;
    }

    if (msg.type === 'gameover') {
      (window as any).__matchInProgress = false;
      try { (window as any).__activeTournamentHostLobbyId = undefined; } catch {}
      updateNameplates();
      showEndOverlay(msg.detail);
      if (resendTimer != null) { clearInterval(resendTimer); resendTimer = null; }
      return;
    }
  });

  // Announce ourselves using our BRACKET alias (never username)
  ws.addEventListener('open', () => {
    // Choose my tournament alias from the bracket mapping
    let myBracketAlias: string | null = null;
    if (role === 'left') {
      myBracketAlias = (bracketP1Side === 'host') ? (bracketP1Alias || null) : (bracketP2Alias || null);
    } else {
      myBracketAlias = (bracketP1Side === 'host') ? (bracketP2Alias || null) : (bracketP1Alias || null);
    }
    const myAlias = (myBracketAlias && myBracketAlias.trim())
      ? myBracketAlias
      : (localStorage.getItem('display_name') || 'Player');

    // Update my own UI immediately with my alias
    if (role === 'left') setHostAliasMaybe(myAlias);
    else setGuestAliasMaybe(myAlias);

    // Notify opponent/server
    ws.send(JSON.stringify({ type: 'hello', alias: myAlias, role }));
  });

  // Host-only: start once guest joined AND button clicked
  const startHostGame = () => {
    if (!guestConnected) { if (startHint) startHint.textContent = 'Waiting for opponent to join…'; return; }
    if (engineStarted) return;
    engineStarted = true;
    if (hostControls) hostControls.remove();

    try { localStorage.setItem('p1', hostAlias); } catch {}
    if (guestAlias !== WAITING) { try { localStorage.setItem('p2', guestAlias); } catch {} }
    try { localStorage.setItem('p1Score', '0'); localStorage.setItem('p2Score', '0'); } catch {}

    initPongGame(container as HTMLElement, async () => {
      try { localStorage.removeItem('game.inProgress'); } catch {}
      const hostScore  = parseInt(localStorage.getItem('p1Score') || '0', 10);
      const guestScore = parseInt(localStorage.getItem('p2Score') || '0', 10);

      let winnerAlias = '—';
      if (Number.isFinite(hostScore) && Number.isFinite(guestScore)) {
        winnerAlias = hostScore > guestScore ? hostAlias : guestAlias;
      }

      // Map winner_slot relative to bracket P1/P2
      let winner_slot: 'p1' | 'p2' | undefined;
      if (Number.isFinite(hostScore) && Number.isFinite(guestScore) && hostScore !== guestScore) {
        const hostWon = hostScore > guestScore;
        winner_slot = hostWon
          ? (bracketP1Side === 'host' ? 'p1' : 'p2')
          : (bracketP1Side === 'guest' ? 'p1' : 'p2');
      }
      let p1_score: number | undefined;
      let p2_score: number | undefined;
      if (bracketP1Side === 'host') { p1_score = hostScore; p2_score = guestScore; }
      else { p1_score = guestScore; p2_score = hostScore; }

      try { (window as any).__matchInProgress = false; (window as any).__activeTournamentHostLobbyId = undefined; } catch {}
      const detail = winnerAlias !== '—' ? { winner: winnerAlias } : {};
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'gameover', detail })); } catch {}
      }

      if (!postedComplete) {
        postedComplete = true;
        try {
          await fetch(`/api/tournament/${lobbyId}/match/${matchId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              winner_slot,
              host_score: hostScore,
              guest_score: guestScore,
              p1_score, p2_score
            }),
          });
        } catch {}
      }

      showEndOverlay(detail);
    }, {
      control: 'left',
      netMode: 'host',
      emitState: (state: any) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'state', state }));
      },
      onRemoteInput: (register: any) => { pushGuestInputToEngine = register; },
    });
  };

  if (role === 'left' && btnStart) {
    btnStart.addEventListener('click', () => {
      if (!guestConnected) return;
      startHostGame();
    });
  }

  // Guest engine
  if (role === 'right') {
    const pressed = { up: false, down: false };
    const send = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', up: pressed.up, down: pressed.down }));
      }
    };
    resendTimer = window.setInterval(send, 50);

    const onKD = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp')   { pressed.up = true;  e.preventDefault(); send(); }
      if (e.code === 'ArrowDown') { pressed.down = true; e.preventDefault(); send(); }
    };
    const onKU = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp')   { pressed.up = false;  e.preventDefault(); send(); }
      if (e.code === 'ArrowDown') { pressed.down = false; e.preventDefault(); send(); }
    };
    window.addEventListener('keydown', onKD, true);
    window.addEventListener('keyup', onKU, true);

    initPongGame(container as HTMLElement, () => {
      try { localStorage.removeItem('game.inProgress'); } catch {}
      window.removeEventListener('keydown', onKD, true);
      window.removeEventListener('keyup', onKU, true);
      window.removeEventListener('pong:score', onScore as any);
      if (resendTimer != null) { clearInterval(resendTimer); resendTimer = null; }
    }, {
      control: 'right',
      netMode: 'guest',
      applyState: (register: any) => { applyStateFromHost = register; },
    });

    // Seed engine with bracket-driven names
    try {
      const detail: any = {};
      if (hostAlias) detail.left = hostAlias;
      if (guestAlias !== WAITING) detail.right = guestAlias;
      if (Object.keys(detail).length) {
        window.dispatchEvent(new CustomEvent('pong:setNames', { detail }));
      }
    } catch {}
  }
}

// default export
export default renderOnlineTournamentRoom;
