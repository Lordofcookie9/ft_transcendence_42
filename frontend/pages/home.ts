import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml, sanitizeAlias } from '../utility.js';
import { initPongGame } from "../pong/pong.js";
import { updateChatBox, updateCounter } from './chat.js';
import { route } from '../router.js';

// --- Chat polling guard to prevent duplicate intervals across re-renders ---
let chatPollTimer: number | undefined;

function stopChatPolling() {
  if (chatPollTimer !== undefined) {
    clearInterval(chatPollTimer);
    chatPollTimer = undefined;
  }
}

function startChatPolling() {
  stopChatPolling();
  const tick = () => {
    if (document.hidden) return;
    updateChatBox().catch(() => {});
  };

  tick();
  chatPollTimer = window.setInterval(tick, 3000);
}

function handleLeftOnce(message?: string) {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem('player.left.ts') || '0');
    if (now - last < 1500) return;
    localStorage.setItem('player.left.ts', String(now));
  } catch {}
  try { alert(message || 'host left. Going back home'); } catch {}
  try { route('/home'); } catch { location.href = '/home'; }
}

export function renderHome() {
  const rawAlias = localStorage.getItem('alias');
  const alias = sanitizeAlias(rawAlias);
  if (alias !== rawAlias) {
    try { localStorage.setItem('alias', alias); } catch {}
  }
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
      <div class="p-2 border-b border-gray-700 font-semibold flex justify-between items-center">
        <span>Chat Room</span>
        <a href="/users" onclick="route('/users'); return false;" class="text-white hover:text-gray-400 text-xs">Users</a>
      </div>
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
          <button id="btnOnlineTournament" onclick="startOnlineTournamentSetup()" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Online Tournament</button>
        </div>
      </div>
    </div>
  `)
  // Disable Online Tournament button for guests
  try {
    const btnOnline = document.getElementById('btnOnlineTournament') as HTMLButtonElement | null;
    if (btnOnline) {
      const ui = getUserInfo();
      const isLogged = ui && (ui as any).type === 'loggedInUser';
      if (!isLogged) {
        btnOnline.setAttribute('disabled', 'true');
        btnOnline.title = 'Log in to play online tournaments';
        btnOnline.classList.add('opacity-50', 'cursor-not-allowed');
      }
    }
  } catch {}
;

  // Enable chat controls and online tournament for logged in users
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
        const btnOnline2 = document.getElementById('btnOnlineTournament') as HTMLButtonElement | null;
        if (btnOnline2) {
          btnOnline2.removeAttribute('disabled');
          btnOnline2.removeAttribute('title');
          btnOnline2.classList.remove('opacity-50', 'cursor-not-allowed');
        }

      }
    } catch (_) {
      // remain disabled if not authenticated
    }
  })();

  document.getElementById('logout')?.addEventListener('click', logout);
  updateChatBox();
  startChatPolling();
  updateCounter();
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

export async function sendMessage(_alias: string, message: string): Promise<any> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message })
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

(window as any).sendPrivateMessage = (window as any).sendPrivateMessage || sendPrivateMessage;

// --- Page Stubs ---
export async function renderLocal1v1() {
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'local'); } catch {}
  try { localStorage.removeItem('game.ai'); } catch {}

  const leftName  = localStorage.getItem("p1") || "P1";
  const rightName = localStorage.getItem("p2") || 
    sanitizeAlias(localStorage.getItem("display_name") || localStorage.getItem("alias") || "P2");
  const s1 = localStorage.getItem("p1Score") || "0";
  const s2 = localStorage.getItem("p2Score") || "0";

  setContent(`
    <div class="relative text-center mt-10">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-4">Local 1v1</h1>

      <div class="flex justify-between items-center max-w-6xl mx-auto mb-4 px-8 text-xl font-semibold text-white">
        <div id="player1-info" class="text-left w-1/3">${escapeHtml(leftName)}: ${escapeHtml(s1)}</div>
        <button id="replay-btn" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded">Replay</button>
         <p class="mt-2 text-sm text-gray-400">
          Controls: left player use <strong>W,S</strong> — right player use <strong>Up</strong> and <strong>Down</strong> arrows
         </p>
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
      // 1v1 finished
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
  try { (window as any).tournament && ((window as any).tournament.uiActive = false); } catch {}
}

export async function renderLocalVsAI() {
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'local-ai'); } catch {}
  try { localStorage.setItem('game.ai', 'left'); } catch {}

  // Left = AI, Right = you
  const me = sanitizeAlias(localStorage.getItem("display_name") || localStorage.getItem("alias") || "You");
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
         <p class="mt-2 text-sm text-gray-400">
          Controls: left player use <strong>W,S</strong> — right player use <strong>Up</strong> and <strong>Down</strong> arrows
         </p>
        <div id="player2-info" class="text-right w-1/3">${escapeHtml(rightName)}: ${escapeHtml(s2)}</div>
      </div>

      <div class="flex justify-center">
        <div id="pong-root" class="border-2 border-white bg-black"></div>
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

  const replayBtn = document.getElementById("replay-btn") as HTMLButtonElement | null;
  if (replayBtn) {
    replayBtn.onclick = () => {
      localStorage.setItem("p1Score", "0");
      localStorage.setItem("p2Score", "0");
      localStorage.setItem("game.ai", "left");
      (window as any).route?.('/local-ai'); 
    };
  }
}

(window as any).startLocalVsAI = (window as any).startLocalVsAI || (() => {
  const me = sanitizeAlias(localStorage.getItem("display_name") || localStorage.getItem("alias") || "Player");
  localStorage.setItem("p1", "AI"); // left = AI
  localStorage.setItem("p2", me);   // right = you
  localStorage.setItem("p1Score", "0");
  localStorage.setItem("p2Score", "0");
  localStorage.setItem("game.ai", "left");
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

    // Store host name
    localStorage.setItem('p1', hostAlias);

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

  // Sends result to the backend.
  async function reportResult() {
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
    if (el1) el1.textContent = `${p1Name}: ${p1Score}`;
    if (el2) el2.textContent = `${p2Name}: ${p2Score}`;
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

  // Build wss://
  const wsProto  = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsURL    = `${wsProto}://${location.host}/ws/game/${roomId}?role=${role}`;
  const ws = new WebSocket(wsURL);

  const cleanup = () => { try { ws.close(1001, 'navigate'); } catch {} };
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('popstate', cleanup);

  const onScore = () => updateNameplates();
  window.addEventListener('pong:score', onScore as any);

  const handlePresence = (incomingAlias?: any) => {
    const name = (typeof incomingAlias === 'string' ? incomingAlias : '').trim() || 'Player';
    if (role === 'left') {
      localStorage.setItem('p2', name);
      lockedGuestName = name;
      guestPresent = true;
      if (hostStartBtn) {
        hostStartBtn.disabled = false;
        hostStartBtn.textContent = 'Start match';
      }
      const el = document.getElementById('player2-info');
      if (el) el.textContent = `${name}: 0`;
    } else {
      localStorage.setItem('p1', name);
      lockedHostName = name;
      const el = document.getElementById('player1-info');
      if (el) el.textContent = `${name}: 0`;
    }
    updateNameplates();
    try {
      window.dispatchEvent(new CustomEvent('pong:setNames', {
        detail: role === 'left' ? { right: name } : { left: name }
      }));
    } catch {}
  };

  let presencePollTimer: number | null = null;
  const startPresenceSync = () => {
    if (presencePollTimer != null) return;
    const poll = async () => {
      try {
        const r = await fetch(`/api/game/room/${roomId}`, { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json().catch(() => ({}));
        const ga = (data?.guest_alias || '').trim();
        if (ga && ga !== '— waiting —') {
          handlePresence(ga);
          if (presencePollTimer != null) { clearInterval(presencePollTimer); presencePollTimer = null; }
        }
      } catch {}
    };
    poll();
    presencePollTimer = window.setInterval(poll, 1000);
  };

  ws.addEventListener('message', (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }

    // go home on host leaving
    if (msg.type === 'info' && typeof msg.message === 'string') { handleLeftOnce(msg.message); return; }

    if (msg.type === 'opponent:left' && msg.role === 'host' && role === 'right') { handleLeftOnce('host left. Going back home'); return; }
    if (msg.type === 'opponent:joined') { handlePresence(msg.alias); return; }
    if (msg.type === 'hello') { handlePresence(msg.alias); return; }
    if (role === 'left' && msg.type === 'input' && pushGuestInputToEngine) {
      pushGuestInputToEngine({ up: !!msg.up, down: !!msg.down });
      return;
    }
    if (role === 'right' && msg.type === 'state' && applyStateFromHost) {
      hidePrestart();
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
      const s = msg?.detail?.scores;
      if (s && Number.isFinite(s.left) && Number.isFinite(s.right)) {
        try {
          localStorage.setItem('p1Score', String(s.left));
          localStorage.setItem('p2Score', String(s.right));
        } catch {}
      }
      hidePrestart();
      updateNameplates();
      if (role === 'left') {
        reportResult();
      }
      showEndOverlay(msg.detail);
      if (resendTimer != null) { clearInterval(resendTimer); resendTimer = null; }
      return;
    }

  });

  ws.addEventListener('open', () => {
    const raw = localStorage.getItem('display_name') || localStorage.getItem('alias') || '';
    const myAlias = (sanitizeAlias(raw) || '').trim() || 'Player';
    ws.send(JSON.stringify({ type: 'hello', alias: myAlias, role }));

    if (role === 'left' && !guestPresent) startPresenceSync();
  });

  ws.addEventListener('close', () => {
    window.removeEventListener('beforeunload', cleanup);
    window.removeEventListener('popstate', cleanup);
    window.removeEventListener('pong:score', onScore as any);
    if (presencePollTimer != null) { clearInterval(presencePollTimer); presencePollTimer = null; }
  });

  let pushGuestInputToEngine: ((input: { up: boolean; down: boolean }) => void) | null = null;
  let applyStateFromHost: ((state: any) => void) | null = null;
  let resendTimer: number | null = null;

  // start function
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

    try {
      const maybeRight = (localStorage.getItem('p2') || lockedGuestName || '').trim();
      const detail: any = { left: lockedHostName };
      if (maybeRight && maybeRight !== '— waiting —') detail.right = maybeRight;
      window.dispatchEvent(new CustomEvent('pong:setNames', { detail }));
    } catch {}
  };

  if (role === 'left' && hostStartBtn) {
    hostStartBtn.disabled = !guestPresent;
    if (guestPresent) hostStartBtn.textContent = 'Start match';
    hostStartBtn.addEventListener('click', () => {
      if (!guestPresent) return;
      startHostGame();
    });
  }

  if (role === 'right') {
    // GUEST: send input, render host snapshots
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

declare global { interface Window { startOnlineTournamentSetup?: () => void; } }

window.startOnlineTournamentSetup = async function startOnlineTournamentSetup() {
  // Require authentication
  try {
    const resp = await fetch('/api/profile', { credentials: 'include' });
    if (!resp.ok) {
      alert('Please log in to create an online tournament.');
      return;
    }
  } catch {
    alert('Please log in to create an online tournament.');
    return;
  }

  // Ask for size (3–8)
  let numStr = prompt('How many players (3–8)?');
  if (numStr === null) return;
  let size = parseInt(numStr, 10);
  while (!Number.isInteger(size) || size < 3 || size > 8) {
    numStr = prompt('Please enter a valid number between 3 and 8:');
    if (numStr === null) return;
    size = parseInt(numStr, 10);
  }

  // Alias mode
  const useUsername = confirm('Use your username as your tournament alias? Click "Cancel" to type a custom alias.');
  let alias_mode: 'username' | 'custom' = useUsername ? 'username' : 'custom';
  let alias: string | undefined;
  if (alias_mode === 'custom') {
    let a = prompt('Enter your alias (1–40 chars):');
    if (a === null) return;
    a = a.trim().slice(0, 40);
    while (!a) {
      a = prompt('Alias required (1–40 chars):') || '';
      if (a === null) return;
      a = a.trim().slice(0, 40);
    }
    alias = a;
  }

  // Create lobby
  let lobbyId: number | null = null;
  try {
    const res = await fetch('/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ size, alias_mode, alias })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.lobby_id) throw new Error(data?.error || 'Failed to create tournament');
    lobbyId = data.lobby_id;
  } catch (err: any) {
    alert(err?.message || 'Failed to create tournament.');
    return;
  }

  // Announce invite in public chat
  try {
    const msg = `<(tournament):${lobbyId}>`;
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: msg })
    });
  } catch {}

  (window as any).route?.(`/tournament-online?lobby=${encodeURIComponent(String(lobbyId))}`);
};


// Clean chat when join tournament
window.addEventListener('beforeunload', stopChatPolling);
window.addEventListener('popstate', stopChatPolling);


try { (window as any).__stopChatPolling = stopChatPolling; } catch {}
