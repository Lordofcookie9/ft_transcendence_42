// frontend/pages/tournamentRoom.ts
import { setContent, escapeHtml } from '../utility.js';
import { route } from '../router.js';
import { getUserInfo } from '../users/userManagement.js';
import { initPongGame } from '../pong/pong.js';

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

  // Base UI with a single, controllable Start button for HOST
  setContent(`
    <a
      href="/tournament-online?lobby=${lobbyId}"
      onclick="route('/tournament-online?lobby=${lobbyId}')"
      class="fixed top-4 left-4 z-[60] bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm"
    >← Back to lobby</a>

    <div class="text-center mt-10">
      <h1 class="text-3xl font-bold mb-2">Tournament Match</h1>
      <div class="text-gray-400 text-sm mb-1">
        Lobby #${escapeHtml(String(lobbyId))} — Match #${escapeHtml(String(matchId))}
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

  // Identity + alias help
  let me: any = null;
  try { me = await getUserInfo(); } catch { me = null; }
  const myId: number | null = me?.id ?? null;

  // Join room for role & names
  let role: 'left' | 'right' = 'left';
  let hostAlias = 'P1';
  let guestAlias = '— waiting —';
  try {
    const res = await fetch(`/api/game/room/${roomId}/join`, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Join failed (${res.status})`);
    role = data.role;
    hostAlias  = data.host_alias || 'P1';
    guestAlias = data.guest_alias || '— waiting —';
  } catch (e: any) {
    setContent(`<div class="p-6 text-red-400">Could not join room: ${escapeHtml(e?.message || '')}</div>`);
    return;
  }

  // Snapshot to map bracket P1 ↔ room host/guest for winner_slot & p1/p2 score mapping
  let match: MatchLite | null = null;
  let bracketP1Side: 'host' | 'guest' = 'host';
  let bracketP1Alias: string | null = null;
  let bracketP2Alias: string | null = null;
  try {
    const res = await fetch(`/api/tournament/${lobbyId}`, { credentials: 'include' });
    const snap = await res.json();
    if (res.ok && snap?.state?.rounds) {
      outer:
      for (const r of snap.state.rounds as MatchLite[][]) {
        for (const m of r) {
          if (m.id === matchId) { match = m; break outer; }
        }
      }
      bracketP1Alias = match?.p1_alias || null;
      bracketP2Alias = match?.p2_alias || null;
      if (bracketP1Alias) {
        if (bracketP1Alias === hostAlias) bracketP1Side = 'host';
        else if (bracketP1Alias === guestAlias) bracketP1Side = 'guest';
      }
    }
  } catch {}

  // UI helpers
  const updateNameplates = () => {
    const p1Name = localStorage.getItem('p1') || hostAlias;
    const p2Name = localStorage.getItem('p2') || guestAlias;
    const s1 = localStorage.getItem('p1Score') || '0';
    const s2 = localStorage.getItem('p2Score') || '0';
    const el1 = document.getElementById('player1-info');
    const el2 = document.getElementById('player2-info');
    if (el1) el1.innerHTML = `${escapeHtml(p1Name)}: ${escapeHtml(s1)}`;
    if (el2) el2.innerHTML = `${escapeHtml(p2Name)}: ${escapeHtml(s2)}`;
  };
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
      route(`/tournament-online?lobby=${encodeURIComponent(String(lobbyId))}`);
    });
  };

  // Build WebSocket
  const wsProto  = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsURL    = `${wsProto}://${location.host}/ws/game/${roomId}?role=${role}`;
  const ws = new WebSocket(wsURL);

  // Clean shutdown
  const cleanup = () => { try { ws.close(1001, 'navigate'); } catch {} };
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('popstate', cleanup);

  // Presence & streaming hooks
  let pushGuestInputToEngine: ((input: { up: boolean; down: boolean }) => void) | null = null;
  let applyStateFromHost: ((state: any) => void) | null = null;
  let resendTimer: number | null = null;
  let guestJoined = guestAlias && guestAlias !== '— waiting —';
  let engineStarted = false;
  let postedComplete = false;

  // Show/enable Start button only for host
  if (role === 'left' && hostControls && btnStart) {
    hostControls.classList.remove('hidden');
    btnStart.disabled = !guestJoined;
    if (guestJoined) startHint && (startHint.textContent = 'Opponent is here. You can start!');
  }

  ws.addEventListener('open', () => {
    const myAlias = (myId && myId === (role === 'left' ? match?.p1_user_id : match?.p2_user_id))
      ? (role === 'left' ? bracketP1Alias || hostAlias : bracketP2Alias || guestAlias)
      : (localStorage.getItem('display_name') || 'Player');
    ws.send(JSON.stringify({ type: 'hello', alias: myAlias, role }));
  });

  ws.addEventListener('message', (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'hello' && msg.alias) {
      // Update opponent alias and enable Start for host
      if (role === 'left') {
        localStorage.setItem('p2', String(msg.alias));
        guestAlias = String(msg.alias);
        guestJoined = true;
        updateNameplates();
        if (btnStart) btnStart.disabled = false;
        if (startHint) startHint.textContent = 'Opponent is here. You can start!';
        // Tell engine (if started) names
        try { window.dispatchEvent(new CustomEvent('pong:setNames', { detail: { right: guestAlias } })); } catch {}
      } else {
        localStorage.setItem('p1', String(msg.alias));
        hostAlias = String(msg.alias);
        updateNameplates();
        try { window.dispatchEvent(new CustomEvent('pong:setNames', { detail: { left: hostAlias } })); } catch {}
      }
      return;
    }

    if (role === 'left' && msg.type === 'input' && pushGuestInputToEngine) {
      pushGuestInputToEngine({ up: !!msg.up, down: !!msg.down });
      return;
    }
    if (role === 'right' && msg.type === 'state' && applyStateFromHost) {
      applyStateFromHost(msg.state);
      try {
        const scores = (msg.state && (msg.state.scores || {})) || {};
        const left  = Number((scores.left  ?? msg.state?.leftScore  ?? msg.state?.p1Score ?? msg.state?.scoreLeft)  ?? 0);
        const right = Number((scores.right ?? msg.state?.rightScore ?? msg.state?.p2Score ?? msg.state?.scoreRight) ?? 0);
        if (Number.isFinite(left) && Number.isFinite(right)) {
          localStorage.setItem('p1Score', String(left));
          localStorage.setItem('p2Score', String(right));
          updateNameplates();
          window.dispatchEvent(new CustomEvent('pong:score', { detail: { left, right } }));
        }
      } catch {}
      return;
    }

    if (msg.type === 'gameover') {
      updateNameplates();
      showEndOverlay(msg.detail);
      if (resendTimer != null) { clearInterval(resendTimer); resendTimer = null; }
      return;
    }
  });

  // Host-only: start once guest joined AND button clicked
  const startHostGame = () => {
    if (engineStarted) return;
    engineStarted = true;
    // remove our start UI
    if (hostControls) hostControls.remove();

    try { localStorage.setItem('p1', hostAlias); } catch {}
    try {
      if (guestJoined) localStorage.setItem('p2', guestAlias);
      localStorage.setItem('p1Score', '0');
      localStorage.setItem('p2Score', '0');
    } catch {}

    initPongGame(container as HTMLElement, async () => {
      // Host end-of-match handler: compute winner, POST /complete, notify guest, overlay
      try { localStorage.removeItem('game.inProgress'); } catch {}
      const hostScore = parseInt(localStorage.getItem('p1Score') || '0', 10);
      const guestScore = parseInt(localStorage.getItem('p2Score') || '0', 10);

      // compute winner text for overlay
      let winnerAlias = '—';
      if (Number.isFinite(hostScore) && Number.isFinite(guestScore)) {
        winnerAlias = hostScore > guestScore ? hostAlias : guestAlias;
      }

      // Derive winner_slot and p1/p2 scores relative to bracket
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

      // Notify guest
      const detail = winnerAlias !== '—' ? { winner: winnerAlias } : {};
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'gameover', detail })); } catch {}
      }

      // Post completion exactly once
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

      // Show local overlay with Back to lobby
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
      if (!guestJoined) return;
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

    try {
      // initialize nameplates for the engine
      const detail: any = {};
      const maybeLeft  = (localStorage.getItem('p1') || hostAlias  || '').trim();
      const maybeRight = (localStorage.getItem('p2') || guestAlias || '').trim();
      if (maybeLeft) detail.left = maybeLeft;
      if (maybeRight && maybeRight !== '— waiting —') detail.right = maybeRight;
      window.dispatchEvent(new CustomEvent('pong:setNames', { detail }));
    } catch {}
  }
}

// default export
export default renderOnlineTournamentRoom;
