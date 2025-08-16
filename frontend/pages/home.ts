import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml } from '../utility.js';
import { initPongGame } from "../pong/pong.js";
import { updateChatBox, updateCounter } from './chat.js';
import { route } from '../router.js';

export function renderHome() {
  const alias = localStorage.getItem("alias") || "Guest";
  let userHtml = '';

  const userInfo = getUserInfo();
  const profileLabel = userInfo.type === 'loggedInUser'
    ? escapeHtml((userInfo as any).displayName || 'Profile')
    : 'User Profile';

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
      <a href="/profile" onclick="route('/profile')" class="text-gray-400 hover:text-white">${profileLabel}</a>
    </div>

    <div class="flex flex-col items-center mt-10 space-y-10">
      <h1 class="text-4xl font-bold">Transcendence</h1>

      ${userHtml} 

      <div class="flex space-x-16">
        <div class="text-center">
          <h2 class="text-xl font-semibold mb-2">2 Player</h2>
          <div class="flex space-x-4 justify-center">
            <button onclick="startLocalGame()" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Local</button>
            <button class="bg-gray-600 text-white px-4 py-2 rounded opacity-50 cursor-not-allowed">Online</button>
          </div>
        </div>

        <div class="text-center">
          <h2 class="text-xl font-semibold mb-2">Tournament (up to 8 players)</h2>
          <button onclick="startTournamentSetup()" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Local Tournament</button>
        </div>
      </div>
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
        <div id="player1-info" class="text-left w-1/3">${escapeHtml(leftName)}: ${escapeHtml(s1)}</div>
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
    initPongGame(container, () => {
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
      if (container) initPongGame(container);
    };
  }

  // Explicitly mark tournament UI inactive when in 1v1
  try { (window as any).tournament && ((window as any).tournament.uiActive = false); } catch {}
}


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

    localStorage.setItem('p1', hostAlias);
    localStorage.setItem('p2', guestAlias);
    localStorage.removeItem('p1Score');
    localStorage.removeItem('p2Score');
  } catch (err: any) {
    console.error(err);
    setContent(`<div class="p-8 text-red-400">Could not join room: ${escapeHtml(err?.message || '')}</div>`);
    return;
  }

  // >>> EXACT PLACE TO PUT THIS <<<
  // Sends the result to the backend so only private 1v1 matches increment PvP W/L.
  async function reportResult(winner?: string) {
    if (!winner) return; // nothing to report without a winner label
    const iWon = (role === 'left') ? (winner === hostAlias) : (winner === guestAlias);
    try {
      await fetch('/api/game/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ room_id: roomId, i_won: iWon }),
      });
    } catch (e) {
      console.error('Failed to report result', e);
    }
  }
  // >>> END PLACEMENT <<<

  setContent(`
    <div class="relative text-center mt-10">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-2">Private 1v1</h1>
      <div class="text-gray-400 text-sm mb-1">
        Room #${escapeHtml(String(roomId))} — You are <strong>${role === 'left' ? 'Left (W/S)' : 'Right (↑/↓)'}</strong>
      </div>
      <div id="prestart" class="text-gray-300 text-sm mb-3">
        Game will start when both players press <strong>↑</strong>.
      </div>

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

  // Helpers for "press ↑ to start" and end overlay
  const prestart = document.getElementById('prestart') as HTMLDivElement | null;
  const hidePrestart = () => { if (prestart) prestart.style.display = 'none'; };

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

  // Cleanly close the socket on SPA nav/reload
  const cleanup = () => { try { ws.close(1001, 'navigate'); } catch {} };
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('popstate', cleanup);

  ws.addEventListener('open', () => {
    console.log('[WS] open →', ws.url, 'protocol=', ws.protocol || '(none)');
    // Presence: tell the other side who I am
    const myAlias = localStorage.getItem('display_name') || localStorage.getItem('alias') || 'Player';
    ws.send(JSON.stringify({ type: 'hello', alias: myAlias, role }));
  });
  ws.addEventListener('error', (e) => {
    console.error('[WS] error', e);
  });
  ws.addEventListener('close', (e) => {
    console.warn('[WS] close', e.code, e.reason);
    window.removeEventListener('beforeunload', cleanup);
    window.removeEventListener('popstate', cleanup);
  });

  // Engine interop holders (the engine will give us these)
  let pushGuestInputToEngine: ((input: { up: boolean; down: boolean }) => void) | null = null;
  let applyStateFromHost: ((state: any) => void) | null = null;
  let resendTimer: number | null = null; // guest input resend loop

  ws.addEventListener('message', (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }

    // Presence → update opponent nameplate
    if (msg.type === 'hello' && msg.alias) {
      if (role === 'left') {
        const name = String(msg.alias);
        localStorage.setItem('p2', name);
        const el = document.getElementById('player2-info');
        if (el) el.innerHTML = `${escapeHtml(name)}: 0`;
      } else {
        const name = String(msg.alias);
        localStorage.setItem('p1', name);
        const el = document.getElementById('player1-info');
        if (el) el.innerHTML = `${escapeHtml(name)}: 0`;
      }
      return;
    }

    // Gameplay streams
    if (role === 'left' && msg.type === 'input' && pushGuestInputToEngine) {
      pushGuestInputToEngine({ up: !!msg.up, down: !!msg.down });
      return;
    }
    if (role === 'right' && msg.type === 'state' && applyStateFromHost) {
      hidePrestart(); // host is producing snapshots → we're live
      applyStateFromHost(msg.state);
      return;
    }

    // Mirrored game over (guest receives this from host)
    if (msg.type === 'gameover') {
      hidePrestart();
      showEndOverlay(msg.detail);
      // REPORT RESULT HERE for the guest (host reports locally below)
      reportResult(msg.detail?.winner);
      if (resendTimer != null) { clearInterval(resendTimer); resendTimer = null; }
      return;
    }
  });

  // Start engine with online hooks
  if (role === 'left') {
    // HOST: simulate and emit state to guest
    initPongGame(container, () => {
      try { localStorage.removeItem('game.inProgress'); } catch {}
    }, {
      control: 'left',
      netMode: 'host',
      emitState: (state) => {
        hidePrestart(); // once we’re producing state, we’re past the prestart
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'state', state }));
        }
      },
      onRemoteInput: (register) => { pushGuestInputToEngine = register; },
    });

    // When the engine ends on host, announce to the guest AND report result
    const onGameEnd = (e: any) => {
      const detail = e?.detail || {};
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'gameover', detail }));
      }
      // REPORT RESULT HERE for the host
      reportResult(detail?.winner);
    };
    window.addEventListener('pong:gameend', onGameEnd, { once: true });

  } else {
    // GUEST: send input; render host snapshots
    const pressed = { up: false, down: false };

    const send = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', up: pressed.up, down: pressed.down }));
      }
    };

    // Periodically resend current input state so host always has the latest (tiny overhead)
    resendTimer = window.setInterval(send, 50); // ~20 fps

    // Capture arrow keys and update `pressed`
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

    // If the socket opens after we pressed, push current state immediately
    ws.addEventListener('open', send);

    initPongGame(container, () => {
      try { localStorage.removeItem('game.inProgress'); } catch {}
      window.removeEventListener('keydown', onKD, true);
      window.removeEventListener('keyup', onKU, true);
      if (resendTimer != null) { clearInterval(resendTimer); resendTimer = null; }
    }, {
      control: 'right',
      netMode: 'guest',
      applyState: (register) => { applyStateFromHost = register; },
    });
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
}
