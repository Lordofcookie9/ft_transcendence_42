import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml } from '../utility.js';
import { initPongGame } from "../pong/pong.js";
import { route } from '../router.js';

// --- Entry Page (landing) ---
export function renderEntryPage() {
  const userName = localStorage.getItem("display_name");
  const userId = localStorage.getItem('user.id');

  console.log('check entry page:', userName, userId);

  let identification = "";

  if (userId) {
    identification = `
      <div class="p-4">
        <h1 class="text-2xl font-bold">Hello, ${escapeHtml(userName || 'User')}!</h1>
        <a href="/profile" data-link class="text-blue-500 hover:underline">You are logged in</a>
        <br />
        <button type="button" id="logout" class="mt-4 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500">
          Logout
        </button>
        <button onclick="route('/home')" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
          Go Play Game
        </button>
      </div>
    `;
  } else {
    identification = `
      <div class="space-y-4">
        <button onclick="route('/register')" class="bg-gray-600 text-white px-6 py-3 rounded hover:bg-gray-700">
          Create Account
        </button>
        <button onclick="route('/login')" class="bg-gray-600 text-white px-6 py-3 rounded hover:bg-gray-700">
          Login
        </button>
      </div>      
      <div class="mt-8 space-y-4">
        <h2 class="text-lg font-semibold">Continue as Guest</h2>
        <input id="aliasInput" type="text" placeholder="Enter your alias"
          class="border border-gray-400 px-4 py-2 rounded text-black" />
        <br />
        <button onclick="enterVisitor()" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
          Continue
        </button>
      </div>
    `;
  }

  setContent(`
    <div class="text-center mt-10 space-y-6">
      <h1 class="text-3xl font-bold mb-6">Welcome to Transcendence</h1>
      ${identification}
      <div class="mt-10">
        <button onclick="route('/users')" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
          See users
        </button>
        <div id="users-list" class="mt-6 max-w-2xl mx-auto"></div>
      </div>
    </div>
  `);

  document.getElementById('logout')?.addEventListener('click', logout);
}


// --- Main Homepage ---
export function renderHome() {
  const alias = localStorage.getItem("alias") || "Guest";
  let userHtml = '';

  const userInfo = getUserInfo();

  try { localStorage.removeItem('game.inProgress'); } catch {}
  // Restore default body layout after tournament
  document.body.style.display = '';
  document.body.style.height = '';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  if (userInfo.type === 'loggedInUser'){
    userHtml = `<a href="/profile" data-link class="text-blue-500 hover:underline">You are logged in</a>
        <button type="button" id="logout" class="mt-4 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500">
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
      <a href="/profile" onclick="route('/profile')" class="text-gray-400 hover:text-white">User Profile</a>
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

    // Mirrored game over
    if (msg.type === 'gameover') {
      hidePrestart();
      showEndOverlay(msg.detail);
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

    // When the engine ends, announce to the guest
    const onGameEnd = (e: any) => {
      const detail = e?.detail || {};
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'gameover', detail }));
      }
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



export function renderGame() {
  setContent('<div class="p-4">Game Placeholder (WIP)</div>');
}

export function renderMain() {
  const alias = localStorage.getItem("alias") || "Guest";
  setContent(`<div class="p-10 text-center text-white text-xl">Main Page — Welcome ${alias}</div>`);
}


// --- Chat ---
export function renderChat() {
  setContent(`
    <div class="p-4">
      <h2 class="text-xl font-semibold mb-2">Chat Room</h2>
      <div id="chatBox" class="border rounded p-2 mb-2 h-60 overflow-y-auto"></div>
      <input id="alias" placeholder="Alias" class="border p-1 mr-1" />
      <input id="message" placeholder="Message" class="border p-1 mr-1" />
      <button class="bg-blue-500 text-white px-2 py-1" onclick="submitMessage()">Send</button>
    </div>
  `);
  updateChatBox();
}

let knownUserSet: Set<string> | null = null;

async function loadKnownUsers() {
  if (knownUserSet) return; // already loaded

  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    knownUserSet = new Set(users.map((u: any) => u.display_name));
  } catch (err) {
    console.error("Failed to load known users", err);
    knownUserSet = new Set(); // fallback
  }
}

export async function updateChatBox() {
  const chatBox = document.getElementById('chatBox') as HTMLDivElement | null;
  if (!chatBox) return;

  // one-time wiring for the alias popover + document-level click interception
  ensureChatAliasMenuSetup();

  // Load messages
  let messages: Array<{ alias: string; message: string; timestamp: string; user_id?: number | null }> = [];
  try {
    messages = await getMessages();
  } catch (err) {
    console.error('Failed to load messages', err);
    return;
  }

  // Build chat HTML
  const html = messages.map((msg) => {
    const ts = parseTimestamp(msg.timestamp);
    const timestamp = ts
      ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const aliasMarkup = renderChatAlias(msg); // shows the clickable name that opens the menu
    let bodyHtml = '';
    const inviteMatch = /<\(invite\):(\d+)>/.exec(msg.message);
    if (inviteMatch) {
      const roomId = inviteMatch[1];
      bodyHtml = `
        <span class="inline-flex items-center gap-2">
          <span class="italic text-green-300">invited you to play</span>
          <button class="px-2 py-0.5 border border-green-400 rounded hover:bg-green-700"
                  onclick="joinGameInvite(${Number(roomId)})">
            Join match
          </button>
        </span>
      `;
    } else {
      bodyHtml = `<span class="body break-words">${escapeHtml(msg.message)}</span>`;
    }

    return `
      <div class="msg" data-ts="${msg.timestamp}">
        <span class="text-gray-400">[${timestamp}]</span>
        <span class="alias">${aliasMarkup}</span>:
        ${bodyHtml}
      </div>
    `;
  }).join('');

  chatBox.innerHTML = html;
  chatBox.scrollTop = chatBox.scrollHeight;

  // --- small helper for SQLite timestamps like "YYYY-MM-DD HH:MM:SS" ---
  function parseTimestamp(s: string): number | null {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.getTime();
    // fallback: treat as UTC "YYYY-MM-DD HH:MM:SS"
    const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
    const t = Date.parse(iso);
    return isNaN(t) ? null : t;
  }
}

function renderChatAlias(msg: { user_id?: number | null; alias: string }): string {
  const name = escapeHtml(msg.alias);
  if (msg.user_id) {
    // No data-link here; the document-level handler will open our menu instead of routing
    return `<a href="/profile/${msg.user_id}"
              class="chat-alias text-blue-400 hover:underline cursor-pointer"
              data-chat-user-id="${msg.user_id}"
              data-chat-alias="${name}">${name}</a>`;
  }
  return `<strong>${name}</strong>`;
}

// --- Chat alias popover menu ---
let __chatAliasMenuInit = false;
let __chatAliasMenuEl: HTMLDivElement | null = null;

function ensureChatAliasMenuSetup() {
  if (__chatAliasMenuInit) return;
  __chatAliasMenuInit = true;

  // Create the floating menu once
  __chatAliasMenuEl = document.createElement('div');
  __chatAliasMenuEl.id = 'chat-user-menu';
  __chatAliasMenuEl.className = 'fixed z-[100] bg-gray-800 text-white border border-gray-700 rounded shadow-lg hidden';
  __chatAliasMenuEl.style.width = '240px';
  restoreAliasMenuButtons();
  document.body.appendChild(__chatAliasMenuEl);

  // Intercept clicks anywhere (capture=true) so we beat the SPA router
  document.addEventListener('click', (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const a = t.closest('a.chat-alias') as HTMLAnchorElement | null;
    if (!a) return;

    // Optional: only for links inside the chat box
    if (!a.closest('#chatBox')) return;

    e.preventDefault();
    e.stopPropagation();

    const uid = a.getAttribute('data-chat-user-id');
    const alias = a.getAttribute('data-chat-alias') || '';
    if (!uid) return;

    showChatAliasMenu(Number(uid), alias, e.clientX, e.clientY);
  }, true); // capture

  // Menu button clicks
  __chatAliasMenuEl.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!btn) return;

    const act = btn.getAttribute('data-act') as 'profile' | 'dm' | 'invite' | 'back' | 'send' | null;
    const uidAttr = __chatAliasMenuEl!.getAttribute('data-user-id');
    const alias = __chatAliasMenuEl!.getAttribute('data-alias') || '';
    if (!act || !uidAttr) return;

    const uid = Number(uidAttr);

    switch (act) {
      case 'profile': {
        hideChatAliasMenu();
        const href = `/profile/${uid}`;
        if ((window as any).route) (window as any).route(href);
        else window.location.href = href;
        break;
      }

      case 'dm': {
        hideChatAliasMenu();

        // Prefer the full composer if it exists (same as profile page)
        if (typeof (window as any).startPrivateChat === 'function') {
          (window as any).startPrivateChat(uid, alias);
          break;
        }

        // Fallback: simple prompt using the same sender function
        if (typeof (window as any).sendPrivateMessage === 'function') {
          const text = prompt(`Send a private message to ${alias}:`);
          if (!text || !text.trim()) break;
          (window as any).sendPrivateMessage(uid, text.trim())
            .then(() => alert('Private message sent!'))
            .catch((err: any) => {
              console.error(err);
              alert(err?.message || 'Failed to send private message');
            });
          break;
        }

        // Last resort: navigate to profile and let it open the composer
        (window as any).route?.(`/profile/${uid}?compose=1`);
        break;
      }

      case 'invite': {
        hideChatAliasMenu();
        try {
          const res = await fetch('/api/game/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ recipient_id: uid }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `Failed to invite (${res.status})`);

          // Set names for the Private 1v1 page
          const me = localStorage.getItem('display_name') || 'You';
          localStorage.setItem('p1', me);
          localStorage.removeItem('p1Score');
          localStorage.removeItem('p2Score');

          // Navigate host to the room
          (window as any).route?.(`/private1v1?room=${data.room_id}`);
          alert('Invite sent! The other player can click it in chat to join.');
        } catch (err: any) {
          console.error(err);
          alert(err?.message || 'Failed to send invite');
        }
        break;
      }

      case 'back': {
        restoreAliasMenuButtons();
        break;
      }

      case 'send': {
        // Only used if you ever swap the menu to a textarea composer
        const ta = document.getElementById('chat-dm-input') as HTMLTextAreaElement | null;
        const text = ta?.value?.trim() || '';
        if (!text) break;

        try {
          if (typeof (window as any).sendPrivateMessage === 'function') {
            await (window as any).sendPrivateMessage(uid, text);
          } else {
            const res = await fetch('/api/chat/private', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ recipient_id: uid, message: text }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data?.error || `Failed to send DM (${res.status})`);
            }
          }
          hideChatAliasMenu();
          alert('Private message sent!');
        } catch (err) {
          console.error(err);
          alert('Failed to send private message');
        }
        break;
      }
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!__chatAliasMenuEl || __chatAliasMenuEl.classList.contains('hidden')) return;
    const t = e.target as HTMLElement;
    if (!t.closest('#chat-user-menu')) hideChatAliasMenu();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideChatAliasMenu();
  });
}

(window as any).joinGameInvite = async function (roomId: number) {
  try {
    const res = await fetch(`/api/game/room/${roomId}/join`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Failed to join match (${res.status})`);

    if (data.host_alias) localStorage.setItem('p1', data.host_alias);
    if (data.guest_alias) localStorage.setItem('p2', data.guest_alias);
    localStorage.removeItem('p1Score');
    localStorage.removeItem('p2Score');

    (window as any).route?.(`/private1v1?room=${data.room_id}`);
  } catch (err: any) {
    console.error(err);
    alert(err?.message || 'Could not join match');
  }
};

function restoreAliasMenuButtons() {
  if (!__chatAliasMenuEl) return;
  __chatAliasMenuEl.innerHTML = `
    <button data-act="profile" class="block w-full text-left px-3 py-2 hover:bg-gray-700">Go to profile</button>
    <button data-act="dm" class="block w-full text-left px-3 py-2 hover:bg-gray-700">Send private message</button>
    <button data-act="invite" class="block w-full text-left px-3 py-2 hover:bg-gray-700">Invite to play</button>
  `;
}


function showChatAliasMenu(userId: number, alias: string, x: number, y: number) {
  if (!__chatAliasMenuEl) return;
  __chatAliasMenuEl.setAttribute('data-user-id', String(userId));
  __chatAliasMenuEl.setAttribute('data-alias', alias);

  // position near cursor; keep inside viewport
  const pad = 8, w = 240, h = 120;
  const left = Math.min(window.innerWidth - w - pad, x + pad);
  const top  = Math.min(window.innerHeight - h - pad, y + pad);
  __chatAliasMenuEl.style.left = `${left}px`;
  __chatAliasMenuEl.style.top  = `${top}px`;

  restoreAliasMenuButtons();
  __chatAliasMenuEl.classList.remove('hidden');
}

function hideChatAliasMenu() {
  __chatAliasMenuEl?.classList.add('hidden');
}


export async function updateCounter() {
  const span = document.getElementById("counterDisplay");
  if (!span) return;
  const res = await fetch("/api/count?id=main-counter");
  const data = await res.json();
  span.textContent = data.count;
}

export async function renderTournament() {
  // Mark UI active so pong:gameend listener advances bracket.
  try { (window as any).tournament && ((window as any).tournament.uiActive = true); } catch {}

  const s1 = localStorage.getItem("p1Score") || "0";
  const s2 = localStorage.getItem("p2Score") || "0";
  const leftName  = localStorage.getItem("p1") || "—";
  const rightName = localStorage.getItem("p2") || "—";

  // ensure ui for tournament.
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'tournament'); } catch {}

  setContent(`
    <div class="relative mt-10 min-h-screen text-white">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-4 text-center">Local Tournament</h1>

      <!-- Sticky player header -->
      <div id="scorebar" class="sticky top-0 z-20 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/50 py-2">
        <div class="flex justify-between items-center max-w-6xl mx-auto px-8 text-xl font-semibold">
          <div id="player1-info" class="text-left w-1/3">${escapeHtml(leftName)}: ${escapeHtml(s1)}</div>
          <div class="text-gray-300 text-base">Current Match</div>
          <div id="player2-info" class="text-right w-1/3">${escapeHtml(rightName)}: ${escapeHtml(s2)}</div>
        </div>
      </div>

      <div id="pong-wrap" class="flex justify-center pt-4">
        <div id="pong-root" class="border-2 border-white bg-black"></div>
      </div>

      <div class="max-w-6xl mx-auto text-left mt-8">
        <div class="text-sm text-gray-300 mb-2">tournament state:</div>
        <div class="rounded-lg border border-white/10 bg-black/30 p-3">
          <div id="tournament-state"
               class="overflow-x-auto overflow-y-auto text-sm leading-6 space-y-4 max-h-[45vh]"
               style="max-height:45vh;"></div>
        </div>
      </div>
    </div>
  `);

  // IMPORTANT: nuke any inline styles left by previous dynamic offset code
  document.getElementById('pong-wrap')?.removeAttribute('style');

  const container = document.getElementById("pong-root");
  if (container) {
    // Rely on the global 'pong:gameend' listener gated by uiActive.
    initPongGame(container);
  }

  // Render current bracket
  try { (window as any).updateTournamentStateDOM?.(); } catch {}
}
