import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml } from '../utility.js';
import { route } from '../router.js';
import { initPongGame } from "../pong/pong.js";
import { updateChatBox, updateCounter } from './chat.js';

export function renderHome() {
  let userHtml = '';

  const userInfo = getUserInfo();
  const profileLabel = userInfo.type === 'loggedInUser'
    ? escapeHtml((userInfo as any).displayName || 'Profile')
    : 'User Profile';
  const profileHref = userInfo.type === 'loggedInUser' ? '/profile' : '/login';

  try { localStorage.removeItem('game.inProgress'); } catch {}
  // Restore default body layout after tournament
  document.body.style.display = '';
  document.body.style.height = '';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  if (userInfo.type === 'loggedInUser'){
    userHtml = `<button type="button" id="logout" class="mt-4 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500">
         Logout and continue as guest
        </button>`;
    }

  setContent(`
    <!-- Floating Chat Box -->
    <div class="fixed top-4 right-4 w-80 max-w-full sm:w-72 bg-gray-800 text-white rounded shadow-lg z-50 text-sm sm:text-base">
      <div class="p-2 border-b border-gray-700 font-semibold">Chat Room</div>
      <div id="chatBox" class="p-2 h-60 sm:h-52 overflow-y-auto text-sm break-words"></div>
      <div class="p-2 flex gap-1">
        <input id="messageInput"
          placeholder="Log in to chat"
          disabled
          class="flex-1 px-2 py-1 rounded text-black"
          onkeydown="if(event.key === 'Enter'){ submitMessage(); }" />
        <button onclick="submitMessage()" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded" disabled title="Log in to use the chat">Send</button>
      </div>
    </div>

    <!-- Main Page -->
    <div class="flex justify-between items-start p-4">
      <a href="${profileHref}" onclick="route('${profileHref}')" class="fixed top-3 left-3 text-2xl font-semibold text-white hover:text-gray-300 z-50">${profileLabel}</a>
    </div>

  <div class="flex flex-col items-center mt-6 space-y-10">
      <h1 class="text-6xl font-bold">Transcendence</h1>

      ${userHtml} 

      <div class="flex space-x-16">
        <div class="text-center">
          <h2 class="text-xl font-semibold mb-2">2 Player</h2>
          <div class="flex space-x-4 justify-center">
            <button onclick="startLocalGame()" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Local</button>
            <button onclick="startLocalVsAI()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Local VS AI</button>
          </div>
        </div>

        <div class="text-center">
          <h2 class="text-xl font-semibold mb-2">Tournament (up to 8 players)</h2>
          <button onclick="startTournamentSetup()" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Local Tournament</button>
          <button onclick="route('/tournament-online-list')" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Online Tournament</button>
        </div>
      </div>
      <div id="active-tournament-slot" class="mt-4"></div>
    </div>
  `);

  // Enable chat controls if the user is authenticated (JWT cookie)
  (async () => {
    try {
      const resp = await fetch('/api/profile', { credentials: 'include' });
      if (resp.ok) {
        const input = document.getElementById('messageInput') as HTMLInputElement | null;
        const btn = document.querySelector('button[onclick="submitMessage()"]') as HTMLButtonElement | null;
        if (input) {
          input.removeAttribute('disabled');
          input.placeholder = 'Message';
        }
        if (btn) {
          btn.removeAttribute('disabled');
          btn.removeAttribute('title');
        }
      }
    } catch (_) {
      // remain disabled if not authenticated
    }
  })();

  document.getElementById('logout')?.addEventListener('click', logout);
  updateChatBox();
  setInterval(updateChatBox, 3000);
  updateCounter(); // harmless if the element isn't present

  // Inject a "Return to Lobby" button if user has an active online tournament
  (async () => {
    let lobbyId: string | null = null;
    try { lobbyId = localStorage.getItem('tourn.lobby'); } catch {}
    if (!lobbyId) return;
    try {
      const res = await fetch(`/api/tournament/${encodeURIComponent(lobbyId)}`, { credentials: 'include' });
      if (!res.ok) return; // silently ignore
      const snap = await res.json();
      if (!snap?.ok) return;
      const myId = Number(localStorage.getItem('userId') || '0');
      const participant = snap.participants?.some((p:any)=> Number(p.user_id) === myId);
      if (!participant) return; // user not in this lobby anymore
      if (snap.lobby.status === 'finished' || snap.lobby.status === 'cancelled') return; // nothing to return to
      const slot = document.getElementById('active-tournament-slot');
      if (!slot) return;
      slot.innerHTML = `
        <button id="return-tourn-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded shadow relative">
          Return to Tournament Lobby #${escapeHtml(String(snap.lobby.id))}
        </button>`;
      document.getElementById('return-tourn-btn')?.addEventListener('click', () => {
        route(`/tournament-online?lobby=${encodeURIComponent(String(snap.lobby.id))}`);
      });
    } catch {}
  })();
}

// --- API Helpers ---
export async function getCount(id: string): Promise<number> {
  const res = await fetch(`/api/count?id=${id}`);
  const data = await res.json();
  return data.count;
}

export async function incrementCount(id: string): Promise<number> {
  const res = await fetch(`/api/increment?id=${id}`, { method: 'POST' });
  const data = await res.json();
  return data.count;
}

export async function getMessages(): Promise<any[]> {
  const res = await fetch('/api/chat');
  return await res.json();
}

// Keep this function but note: backend now requires auth and derives alias.
// If you call this elsewhere, it should be from a logged-in state.
export async function sendMessage(_alias: string, message: string): Promise<any> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message }) // alias ignored; server uses JWT user
  });
  return await res.json();
}

export async function sendPrivateMessage(recipientId: number, message: string): Promise<any> {
  const text = (message ?? '').trim();
  if (!text) throw new Error('Message is empty');
  if (text.length > 1000) throw new Error('Message must be under 1000 characters long');

  const res = await fetch('/api/chat/private', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ recipient_id: recipientId, message: text })
  });

  if (!res.ok) {
    let errMsg = `Failed to send DM (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {}
    throw new Error(errMsg);
  }

  return res.json();
}

// Make it callable from the chat popover (bind once)
(window as any).sendPrivateMessage = (window as any).sendPrivateMessage || sendPrivateMessage;

// --- Page Stubs ---
export async function renderLocal1v1() {
  // Use Option A layout override and mark 1v1 in progress
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'local'); } catch {}
  try { localStorage.removeItem('game.ai'); } catch {}

  // Left = opponent alias (p1), Right = you (p2).
  const leftName  = localStorage.getItem("p1") || "P1";
  const rightName = localStorage.getItem("p2") || (localStorage.getItem("display_name") || localStorage.getItem("alias") || "P2");
  const s1 = localStorage.getItem("p1Score") || "0";
  const s2 = localStorage.getItem("p2Score") || "0";

  setContent(`
    <div class="relative text-center mt-10">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-4">Local 1v1</h1>

      <div class="flex justify-between items-center max-w-6xl mx-auto mb-4 px-8 text-xl font-semibold text-white">
        <div id="player1-info" class="text-left w-1/3">
          <span id="p1-name-text">${escapeHtml(leftName)}</span>
          <span class="ml-2" id="p1-score-label">: ${escapeHtml(s1)}</span>
        </div>
        <button id="replay-btn" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded">Replay</button>
        <div id="player2-info" class="text-right w-1/3">${escapeHtml(rightName)}: ${escapeHtml(s2)}</div>
      </div>

      <div class="flex justify-center">
        <div id="pong-root" class="border-2 border-white bg-black"></div>
      </div>
    </div>
  `);

  const container = document.getElementById("pong-root");
  if (container) {
    try { localStorage.setItem('p1Score','0'); localStorage.setItem('p2Score','0'); } catch {}
    initPongGame(container as HTMLElement, () => {
      // 1v1 finished — clear the flag
      try { localStorage.removeItem('game.inProgress'); } catch {}
    });
  }

  const replayBtn = document.getElementById("replay-btn") as HTMLButtonElement | null;
  if (replayBtn) {
    replayBtn.onclick = () => {
      localStorage.setItem("p1Score", "0");
      localStorage.setItem("p2Score", "0");
      const container = document.getElementById("pong-root");
      if (container)
      { 
        try { localStorage.setItem('p1Score','0'); localStorage.setItem('p2Score','0'); } catch {}
        initPongGame(container as HTMLElement);
      }
    };
  }

  // Explicitly mark tournament UI inactive when in 1v1
  try { (window as any).tournament && ((window as any).tournament.uiActive = false); } catch {}

  // Inline name editing removed: name now fixed from setup/localStorage
}

// Pre-game setup page to collect opponent name without a popup
export function renderLocalSetup1v1() {
  const defaultOpponent = localStorage.getItem('lastLocalOpponent') || 'Player 1';
  const me = localStorage.getItem('display_name') || localStorage.getItem('alias') || 'Player 2';
  setContent(`
    <div class="max-w-md mx-auto mt-16 p-6 bg-gray-800 rounded-lg shadow">
      <a href="/home" onclick="route('/home'); return false;" class="text-gray-400 hover:text-white text-sm">← Back</a>
      <h1 class="text-2xl font-bold mb-4 text-center">Local Match Setup</h1>
      <form id="local-setup-form" class="space-y-4">
        <div>
          <label class="block text-sm mb-1">Opponent (Left Paddle)</label>
          <input id="opponent-name" type="text" value="${escapeHtml(defaultOpponent)}" maxlength="30" class="w-full px-3 py-2 rounded text-black" required />
          <p class="text-xs text-gray-400 mt-1">You will appear as: <strong>${escapeHtml(me)}</strong></p>
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" id="cancel-setup" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white">Start Game</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('cancel-setup')?.addEventListener('click', () => route('/home'));
  document.getElementById('local-setup-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('opponent-name') as HTMLInputElement | null;
    const val = (input?.value || '').trim();
    if (!val) { input?.focus(); return; }
    localStorage.setItem('p1', val);
    localStorage.setItem('lastLocalOpponent', val);
    const meName = localStorage.getItem('display_name') || localStorage.getItem('alias') || 'Player 2';
    localStorage.setItem('p2', meName);
    localStorage.setItem('p1Score','0');
    localStorage.setItem('p2Score','0');
    route('/local');
  });
}

export async function renderLocalVsAI() {
  // Layout tweaks like renderLocal1v1
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'local-ai'); } catch {}
  try { localStorage.setItem('game.ai', 'left'); } catch {}

  // Left = AI, Right = you
  const me = localStorage.getItem("display_name") || localStorage.getItem("alias") || "You";
  const leftName  = localStorage.getItem("p1") || "AI";
  const rightName = localStorage.getItem("p2") || me;

  const s1 = localStorage.getItem("p1Score") || "0";
  const s2 = localStorage.getItem("p2Score") || "0";

  setContent(`
    <div class="relative text-center mt-10">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-4">Local VS AI</h1>

      <div class="flex justify-between items-center max-w-6xl mx-auto mb-4 px-8 text-xl font-semibold text-white">
        <div id="player1-info" class="text-left w-1/3">${escapeHtml(leftName)}: ${escapeHtml(s1)}</div>
        <button id="replay-btn" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded">Replay</button>
        <div id="player2-info" class="text-right w-1/3">${escapeHtml(rightName)}: ${escapeHtml(s2)}</div>
      </div>

      <div class="flex justify-center">
        <div id="pong-root" class="border-2 border-white bg-black"></div>
      </div>

      <div class="mt-6 text-gray-300 text-sm">
        <p><strong>Controls:</strong> You (right paddle) — ArrowUp / ArrowDown. The left paddle is controlled by the AI.</p>
      </div>
    </div>
  `);

  // Start the match: user controls the right paddle; local mode.
  const container = document.getElementById("pong-root");
  if (container) {
    initPongGame(
      container as HTMLElement,
      () => {
        // game finished
        try { localStorage.removeItem('game.inProgress'); } catch {}
        try { localStorage.removeItem('game.ai'); } catch {}
      },
      ({ control: 'right', netMode: 'local', ai: 'left' } as any)
    );
  }

  // Simple replay handler: reset scores and reload this page
  const replayBtn = document.getElementById("replay-btn") as HTMLButtonElement | null;
  if (replayBtn) {
    replayBtn.onclick = () => {
      localStorage.setItem("p1Score", "0");
      localStorage.setItem("p2Score", "0");
      localStorage.setItem("game.ai", "left");
      (window as any).route?.('/local-ai');  // or: (window as any).startLocalVsAI?.();
    };
  }
}

(window as any).startLocalVsAI = (window as any).startLocalVsAI || (() => {
  const me = localStorage.getItem("display_name") || localStorage.getItem("alias") || "Player";
  localStorage.setItem("p1", "AI"); // left = AI
  localStorage.setItem("p2", me);   // right = you
  localStorage.setItem("p1Score", "0");
  localStorage.setItem("p2Score", "0");
  localStorage.setItem("game.ai", "left"); // hint for the engine; we'll use this next
  (window as any).route?.('/local-ai');
});


export async function renderPrivate1v1() {
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'private'); } catch {}

  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (!roomId) {
    setContent(`<div class="p-8 text-red-400">Missing room id</div>`);
    return;
  }

  // Join to get role & names
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

    // Store host name immediately
    localStorage.setItem('p1', hostAlias);

    // IMPORTANT: do NOT store the "— waiting —" placeholder in localStorage.
    if (guestAlias && guestAlias !== '— waiting —') {
      localStorage.setItem('p2', guestAlias);
    } else {
      localStorage.removeItem('p2');
    }

    // Reset scores
    localStorage.removeItem('p1Score');
    localStorage.removeItem('p2Score');
  } catch (err: any) {
    console.error(err);
    setContent(`<div class="p-8 text-red-400">Could not join room: ${escapeHtml(err?.message || '')}</div>`);
    return;
  }

  // Sends the result to the backend.
  async function reportResult() {
    // host=left=P1, guest=right=P2 in this view
    const p1 = parseInt(localStorage.getItem('p1Score') || '0', 10);
    const p2 = parseInt(localStorage.getItem('p2Score') || '0', 10);
    if (Number.isNaN(p1) || Number.isNaN(p2) || p1 === p2) return;
    const iWon = (role === 'left') ? (p1 > p2) : (p2 > p1);
    const host_score  = p1;
    const guest_score = p2;

    try {
      await fetch('/api/game/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ room_id: roomId, i_won: iWon, host_score, guest_score }),
      });
    } catch (e) {
      console.error('Failed to report result', e);
    }
  }

  // Base UI with our own Start (host-only, disabled until guest arrives)
  const hostStartHtml = role === 'left' ? `
    <div id="host-start-wrap" class="mb-3">
      <button id="host-start" class="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:opacity-60 text-white px-4 py-2 rounded" disabled>
        Start match (waiting for opponent…)
      </button>
    </div>` : '';

  setContent(`
    <div class="relative text-center mt-10">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-2">Private 1v1</h1>
      <div class="text-gray-400 text-sm mb-1">
        Room #${escapeHtml(String(roomId))} — You are <strong>${role === 'left' ? 'Left (W/S)' : 'Right (↑/↓)'}</strong>
      </div>
      <div id="prestart" class="text-gray-300 text-sm mb-3">
        ${role === 'left' ? 'Waiting for opponent to join…' : 'Waiting for host to start…'}
      </div>

      ${hostStartHtml}

      <div class="flex justify-between items-center max-w-6xl mx-auto mb-4 px-8 text-xl font-semibold text-white">
        <div id="player1-info" class="text-left w-1/3">${escapeHtml(hostAlias)}: 0</div>
        <div class="text-gray-300 text-base">Match</div>
        <div id="player2-info" class="text-right w-1/3">${escapeHtml(guestAlias)}: 0</div>
      </div>

      <div class="flex justify-center">
        <div id="pong-root" class="border-2 border-white bg-black"></div>
      </div>
    </div>
  `);

  const container = document.getElementById('pong-root') as HTMLDivElement | null;
  if (!container) return;

  const prestart = document.getElementById('prestart') as HTMLDivElement | null;
  const hostStartBtn = document.getElementById('host-start') as HTMLButtonElement | null;
  const hostStartWrap = document.getElementById('host-start-wrap') as HTMLDivElement | null;
  const hidePrestart = () => { if (prestart) prestart.style.display = 'none'; };
  const removeStartUI = () => { if (hostStartWrap) hostStartWrap.remove(); };

  let lockedHostName = hostAlias;
  let lockedGuestName = guestAlias;

  let guestPresent = (guestAlias && guestAlias !== '— waiting —');
  let hostStarted = false;

  const updateNameplates = () => {
    const p1Name = (localStorage.getItem('p1') && localStorage.getItem('p1') !== '— waiting —')
      ? localStorage.getItem('p1')!
      : lockedHostName;
    const p2Stored = localStorage.getItem('p2');
    const p2Name = (p2Stored && p2Stored !== '— waiting —') ? p2Stored : lockedGuestName;
    const p1Score = localStorage.getItem('p1Score') || '0';
    const p2Score = localStorage.getItem('p2Score') || '0';
    const el1 = document.getElementById('player1-info');
    const el2 = document.getElementById('player2-info');
    if (el1) el1.innerHTML = `${escapeHtml(p1Name)}: ${escapeHtml(p1Score)}`;
    if (el2) el2.innerHTML = `${escapeHtml(p2Name)}: ${escapeHtml(p2Score)}`;
  };

  function showEndOverlay(detail?: any) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-40';
    el.innerHTML = `
      <div class="text-white text-center space-y-4">
        <div class="text-3xl font-bold">Match Over</div>
        ${detail?.winner ? `<div class="text-xl">Winner: ${escapeHtml(String(detail.winner))}</div>` : ''}
        <button id="end-ok" class="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">OK</button>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('#end-ok')?.addEventListener('click', () => el.remove());
  }

  // Build ws:// or wss:// correctly
  const wsProto  = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsURL    = `${wsProto}://${location.host}/ws/game/${roomId}?role=${role}`;
  const ws = new WebSocket(wsURL);

  const cleanup = () => { try { ws.close(1001, 'navigate'); } catch {} };
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('popstate', cleanup);

  const onScore = () => updateNameplates();
  window.addEventListener('pong:score', onScore as any);

  ws.addEventListener('open', () => {
    const myAlias = localStorage.getItem('display_name') || localStorage.getItem('alias') || 'Player';
    ws.send(JSON.stringify({ type: 'hello', alias: myAlias, role }));
  });

  ws.addEventListener('close', () => {
    window.removeEventListener('beforeunload', cleanup);
    window.removeEventListener('popstate', cleanup);
    window.removeEventListener('pong:score', onScore as any);
  });

  // Engine interop holders
  let pushGuestInputToEngine: ((input: { up: boolean; down: boolean }) => void) | null = null;
  let applyStateFromHost: ((state: any) => void) | null = null;
  let resendTimer: number | null = null;

  // HOST: start function (deferred until guest is present + button click)
  const startHostGame = () => {
    if (hostStarted || !container) return;
    hostStarted = true;
    removeStartUI();
    hidePrestart();
    try { localStorage.setItem('p1Score','0'); localStorage.setItem('p2Score','0'); } catch {}

    initPongGame(
      container as HTMLElement,
      () => {
        try { localStorage.removeItem('game.inProgress'); } catch {}

        const p1 = parseInt(localStorage.getItem('p1Score') || '0', 10);
        const p2 = parseInt(localStorage.getItem('p2Score') || '0', 10);
        const winner =
          Number.isFinite(p1) && Number.isFinite(p2)
            ? (p1 > p2 ? (lockedHostName || 'P1') : (localStorage.getItem('p2') || lockedGuestName || 'P2'))
            : undefined;

        const detail: any = winner ? { winner } : {};
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'gameover', detail })); } catch {}
        }
        reportResult();
        showEndOverlay(detail);
      },
      {
        control: 'left',
        netMode: 'host',
        emitState: (state) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'state', state }));
        },
        onRemoteInput: (register) => { pushGuestInputToEngine = register; },
      }
    );

    // Tell engine the names
    try {
      const maybeRight = (localStorage.getItem('p2') || lockedGuestName || '').trim();
      const detail: any = { left: lockedHostName };
      if (maybeRight && maybeRight !== '— waiting —') detail.right = maybeRight;
      window.dispatchEvent(new CustomEvent('pong:setNames', { detail }));
    } catch {}
  };

  // Wire Start button
  if (role === 'left' && hostStartBtn) {
    hostStartBtn.disabled = !guestPresent;
    if (guestPresent) hostStartBtn.textContent = 'Start match';
    hostStartBtn.addEventListener('click', () => {
      if (!guestPresent) return;
      startHostGame();
    });
  }

  ws.addEventListener('message', (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }

      // go home on host leaving
    if (msg.type === 'info' && typeof msg.message === 'string') {
      try { alert(msg.message); } catch {}
      try { route('/home'); } catch { location.href = '/home'; }
      return;
    }

    if (msg.type === 'opponent:left' && msg.role === 'host' && role === 'right') {
      try { alert('host left. Going back home'); } catch {}
      try { route('/home'); } catch { location.href = '/home'; }
      return;
    }
    if (msg.type === 'hello' && msg.alias) {
      const name = String(msg.alias);
      if (role === 'left') {
        localStorage.setItem('p2', name);
        lockedGuestName = name;
        guestPresent = true;
        if (hostStartBtn) {
          hostStartBtn.disabled = false;
          hostStartBtn.textContent = 'Start match';
        }
        const el = document.getElementById('player2-info');
        if (el) el.innerHTML = `${escapeHtml(name)}: 0`;
      } else {
        localStorage.setItem('p1', name);
        lockedHostName = name;
        const el = document.getElementById('player1-info');
        if (el) el.innerHTML = `${escapeHtml(name)}: 0`;
      }
      updateNameplates();
      try {
        if (role === 'left') {
          window.dispatchEvent(new CustomEvent('pong:setNames', { detail: { right: name } }));
        } else {
          window.dispatchEvent(new CustomEvent('pong:setNames', { detail: { left: name } }));
        }
      } catch {}
      return;
    }

    if (role === 'left' && msg.type === 'input' && pushGuestInputToEngine) {
      pushGuestInputToEngine({ up: !!msg.up, down: !!msg.down });
      return;
    }
    if (role === 'right' && msg.type === 'state' && applyStateFromHost) {
      hidePrestart(); // once host is sending
      applyStateFromHost(msg.state);
      try {
        const scores = (msg.state && (msg.state.scores || {})) || {};
        const left  = Number((scores.left ?? msg.state?.leftScore ?? msg.state?.p1Score ?? msg.state?.scoreLeft) ?? 0);
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
      hidePrestart();
      updateNameplates();
      showEndOverlay(msg.detail);
      reportResult();
      if (resendTimer != null) { clearInterval(resendTimer); resendTimer = null; }
      return;
    }
  });

  if (role === 'right') {
    // GUEST: send input; render host snapshots
    const pressed = { up: false, down: false };
    const send = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', up: pressed.up, down: pressed.down }));
      }
    };
    resendTimer = window.setInterval(send, 50);
    const onKD = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp')   { pressed.up = true;  e.preventDefault(); hidePrestart(); send(); }
      if (e.code === 'ArrowDown') { pressed.down = true; e.preventDefault(); hidePrestart(); send(); }
    };
    const onKU = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp')   { pressed.up = false;  e.preventDefault(); send(); }
      if (e.code === 'ArrowDown') { pressed.down = false; e.preventDefault(); send(); }
    };
    window.addEventListener('keydown', onKD, true);
    window.addEventListener('keyup', onKU, true);

    ws.addEventListener('open', send);

    try { localStorage.setItem('p1Score','0'); localStorage.setItem('p2Score','0'); } catch {}
    initPongGame(
      container as HTMLElement,
      () => {
        try { localStorage.removeItem('game.inProgress'); } catch {}
        window.removeEventListener('keydown', onKD, true);
        window.removeEventListener('keyup', onKU, true);
        window.removeEventListener('pong:score', onScore as any);
        if (resendTimer != null) { clearInterval(resendTimer); resendTimer = null; }
      },
      {
        control: 'right',
        netMode: 'guest',
        applyState: (register) => { applyStateFromHost = register; },
      }
    );

    try {
      const maybeLeft  = (localStorage.getItem('p1') || hostAlias  || '').trim();
      const maybeRight = (localStorage.getItem('p2') || guestAlias || '').trim();
      const detail: any = {};
      if (maybeLeft) detail.left = maybeLeft;
      if (maybeRight && maybeRight !== '— waiting —') detail.right = maybeRight;
      window.dispatchEvent(new CustomEvent('pong:setNames', { detail }));
    } catch {}
  }

  const replayBtn = document.getElementById('replay-btn') as HTMLButtonElement | null;
  if (replayBtn) {
    replayBtn.onclick = () => {
      localStorage.setItem('p1Score', '0');
      localStorage.setItem('p2Score', '0');
      (window as any).route?.(`/private1v1?room=${roomId}`);
    };
  }

  try { (window as any).tournament && ((window as any).tournament.uiActive = false); } catch {}
  updateNameplates();
}

// (Removed prompt-based startOnlineTournamentSetup in favor of dedicated setup page)
