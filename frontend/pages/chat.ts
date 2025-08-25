import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml, formatDbTime } from '../utility.js';
import { initPongGame } from "../pong/pong.js";
import { route } from '../router.js';

async function getMessages() {
  try {
    const res = await fetch('/api/chat');
    if (!res.ok) throw new Error('Failed to fetch messages');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

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
  if (knownUserSet) return;
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    knownUserSet = new Set(users.map((u: any) => u.display_name));
  } catch (err) {
    console.error("Failed to load known users", err);
    knownUserSet = new Set();
  }
}

export async function updateChatBox() {
  const chatBox = document.getElementById('chatBox') as HTMLDivElement | null;
  if (!chatBox) return;

  ensureChatAliasMenuSetup();

  let messages: Array<{ alias: string; message: string; timestamp: string; user_id?: number | null }> = [];
  try {
    messages = await getMessages();
  } catch (err) {
    console.error('Failed to load messages', err);
    return;
  }

  // Preload private 1v1 invite room statuses
  const inviteRoomIds = Array.from(new Set(
    messages.map((m) => {
      const match = /<\(invite\):(\d+)>/.exec(m.message);
      return match ? Number(match[1]) : null;
    }).filter((x): x is number => Number.isFinite(x as number))
  ));
  type RoomStatus = { has_guest: boolean; joinable?: boolean };
  const statusMap: Record<number, RoomStatus> = {};
  await Promise.all(inviteRoomIds.map(async (rid) => {
    try {
      const r = await fetch(`/api/game/room/${rid}`);
      if (!r.ok) return;
      const d = await r.json();
      statusMap[rid] = { has_guest: !!d?.has_guest, joinable: d?.joinable };
    } catch {}
  }));

  // Preload tournament lobby statuses
  const tournamentIds = Array.from(new Set(
    messages.map((m) => {
      const t = /<\(tournament\):(\d+)>/.exec(m.message);
      return t ? Number(t[1]) : null;
    }).filter((x): x is number => Number.isFinite(x as number))
  ));
  type LobbyStatus = { joinable: boolean; count: number; size: number };
  const lobbyStatusMap: Record<number, LobbyStatus> = {};
  await Promise.all(tournamentIds.map(async (tid) => {
    try {
      const resp = await fetch(`/api/tournament/${tid}`, { credentials: 'include' });
      if (!resp.ok) return;
      const d = await resp.json();
      if (d?.lobby) {
        lobbyStatusMap[tid] = {
          joinable: d.lobby.status === 'waiting' && d.spots_left > 0,
          count: d.count,
          size: d.lobby.size,
        };
      }
    } catch {}
  }));

  const html = messages.map((msg) => {
    const ts = parseTimestamp(msg.timestamp);
    const timestamp = ts ? formatDbTime(msg.timestamp) : '';
    const aliasMarkup = renderChatAlias(msg);
    const inviteMatch = /<\(invite\):(\d+)>/.exec(msg.message);
    const tournMatch = /<\(tournament\):(\d+)>/.exec(msg.message);

    if (inviteMatch) {
      const roomId = Number(inviteMatch[1]);
      const st = statusMap[roomId];
      const isFull = st?.has_guest === true || st?.joinable === false;
      if (isFull) return '';
      const buttonHtml = `<button
            class="px-2 py-0.5 border rounded invite-btn border-green-400 hover:bg-green-700"
            data-invite-btn="1"
            data-room-id="${roomId}"
            onclick="joinGameInvite(${roomId})"
          >Join match</button>`;
      return `
        <div class="msg" data-ts="${msg.timestamp}">
          <span class="text-gray-400">[${timestamp}]</span>
          <span class="alias">${aliasMarkup}</span>:
          <span class="inline-flex items-center gap-2">
            <span class="italic text-green-300">invited you to play</span>
            ${buttonHtml}
          </span>
        </div>
      `;
    }

    if (tournMatch) {
      const lobbyId = Number(tournMatch[1]);
      const st = lobbyStatusMap[lobbyId];
      if (!st?.joinable) return '';
      const buttonHtml = `<button
          class="px-2 py-0.5 border rounded border-purple-400 hover:bg-purple-700"
          data-tournament-join="1"
          onclick="joinTournamentInvite(${lobbyId})"
        >Join tournament (${st.count}/${st.size})</button>`;
      return `
        <div class="msg" data-ts="${msg.timestamp}">
          <span class="text-gray-400">[${timestamp}]</span>
          <span class="alias">${aliasMarkup}</span>:
          <span class="inline-flex items-center gap-2">
            <span class="italic text-purple-300">invited you to an online tournament</span>
            ${buttonHtml}
          </span>
        </div>
      `;
    }

    return `
      <div class="msg" data-ts="${msg.timestamp}">
        <span class="text-gray-400">[${timestamp}]</span>
        <span class="alias">${aliasMarkup}</span>:
        <span class="body break-words">${escapeHtml(msg.message)}</span>
      </div>
    `;
  }).filter(Boolean).join('');

  chatBox.innerHTML = html;
  chatBox.scrollTop = chatBox.scrollHeight;

  function parseTimestamp(s: string): number | null {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.getTime();
    const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
    const t = Date.parse(iso);
    return isNaN(t) ? null : t;
  }
}

function renderChatAlias(msg: { user_id?: number | null; alias: string }): string {
  const name = escapeHtml(msg.alias);
  if (msg.user_id) {
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
  __chatAliasMenuEl = document.createElement('div');
  __chatAliasMenuEl.id = 'chat-user-menu';
  __chatAliasMenuEl.className = 'fixed z-[100] bg-gray-800 text-white border border-gray-700 rounded shadow-lg hidden';
  __chatAliasMenuEl.style.width = '240px';
  restoreAliasMenuButtons();
  document.body.appendChild(__chatAliasMenuEl);

  document.addEventListener('click', (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const a = t.closest('a.chat-alias') as HTMLAnchorElement | null;
    if (!a) return;
    if (!a.closest('#chatBox')) return;
    e.preventDefault();
    e.stopPropagation();
    const uid = a.getAttribute('data-chat-user-id');
    const alias = a.getAttribute('data-chat-alias') || '';
    if (!uid) return;
    showChatAliasMenu(Number(uid), alias, e.clientX, e.clientY);
  }, true);

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
        (window as any).route ? (window as any).route(href) : window.location.assign(href);
        break;
      }
      case 'dm': {
        hideChatAliasMenu();
        if (typeof (window as any).startPrivateChat === 'function') {
          (window as any).startPrivateChat(uid, alias);
          break;
        }
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
          const me = localStorage.getItem('display_name') || 'You';
          localStorage.setItem('p1', me);
          localStorage.removeItem('p1Score');
          localStorage.removeItem('p2Score');
          (window as any).route?.(`/private1v1?room=${data.room_id}`);
          alert('Invite sent! The other player can click it in chat to join.');
        } catch (err: any) {
          console.error(err);
          alert(err?.message || 'Failed to send invite');
        }
        break;
      }
      case 'back': { restoreAliasMenuButtons(); break; }
      case 'send': {
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

  document.addEventListener('click', (e) => {
    if (!__chatAliasMenuEl || __chatAliasMenuEl.classList.contains('hidden')) return;
    const t = e.target as HTMLElement;
    if (!t.closest('#chat-user-menu')) hideChatAliasMenu();
  });

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
  try { (window as any).tournament && ((window as any).tournament.uiActive = true); } catch {}
  try { localStorage.removeItem('game.ai'); } catch {}
  const s1 = localStorage.getItem("p1Score") || "0";
  const s2 = localStorage.getItem("p2Score") || "0";
  const leftName  = localStorage.getItem("p1") || "—";
  const rightName = localStorage.getItem("p2") || "—";
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'tournament'); } catch {}
  setContent(`
    <div class="relative mt-10 min-h-screen text-white">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-4 text-center">Local Tournament</h1>
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
          <div id="tournament-state" class="overflow-x-auto overflow-y-auto text-sm leading-6 space-y-4 max-h-[45vh]" style="max-height:45vh;"></div>
        </div>
      </div>
    </div>
  `);
  document.getElementById('pong-wrap')?.removeAttribute('style');
  const container = document.getElementById("pong-root");
  if (container) {
    try {
      localStorage.setItem('p1Score','0');
      localStorage.setItem('p2Score','0');
    } catch {}
    initPongGame(container);
  }
  try { (window as any).updateTournamentStateDOM?.(); } catch {}
}

declare global { interface Window { joinTournamentInvite?: (id:number) => void; } }

// Redirect to dedicated join setup page (no native prompts)
window.joinTournamentInvite = async function joinTournamentInvite(id: number) {
  // Lightweight fetch to see if already participant; if yes go straight to lobby
  try {
    const res = await fetch(`/api/tournament/${id}`, { credentials: 'include' });
    const snap = await res.json().catch(()=>null);
    if (snap?.ok) {
      const myId = Number(localStorage.getItem('userId') || '0');
      if (myId && snap.participants?.some((p: any)=> Number(p.user_id) === myId)) {
        (window as any).route?.(`/tournament-online?lobby=${encodeURIComponent(String(id))}`);
        return;
      }
    }
  } catch {}
  (window as any).route?.(`/tournament-online-join?lobby=${encodeURIComponent(String(id))}`);
};
