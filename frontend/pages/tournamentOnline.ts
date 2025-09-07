import { setContent, escapeHtml, getJSON, toastOnce } from '../utility.js';
import { route } from '../router.js';

function handleAbortOnce(payload?: any) {
  // Prevent repeat alerts for the same lobby
  try {
    const lidStr = String(payload?.lobbyId || localStorage.getItem('tourn.lobby') || '');
    const lastLid = localStorage.getItem('tourn.abort.lobby') || '';
    if (lidStr && lidStr === lastLid) {
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
  try { (window as any).__matchInProgress = false; (window as any).__activeTournamentHostLobbyId = undefined; } catch {}
  alert(String(payload?.message || 'a host left mid game, the tournament is canceled. You will be brought home'));
  try { route('/home'); } catch { location.href = '/home'; }
}


type LobbySnapshot = {
  ok: boolean;
  lobby: { id:number; host_id:number; size:number; status:'waiting'|'started'|'cancelled'|'finished' };
  participants: Array<{ user_id:number; alias:string; display_name:string }>;
  count: number;
  spots_left: number;
  is_host?: boolean;
  can_start?: boolean;
  state?: {
    lobby: any;
    participants: Array<{ user_id:number, alias:string }>;
    rounds: TM[][];
  } | null;
};

type TM = {
  id: number; lobby_id: number; round: number; match_index: number;
  p1_user_id: number|null; p1_alias: string|null;
  p2_user_id: number|null; p2_alias: string|null;
  room_id: number|null; status: 'pending'|'active'|'finished'; winner_user_id: number|null;
};

let pollTimer: number | undefined;

;(window as any).__tournLobbyCleanup = () => {
  try {
    if (pollTimer) {
      clearInterval(pollTimer as any);
      pollTimer = null as any;
    }
  } catch (e) {
    console.warn('tournament lobby cleanup failed', e);
  }
};


let syncing = false;

function labelOf(u: number|null, p1: string|null, p2: string|null, isP1: boolean): string {
  const a = isP1 ? p1 : p2;
  return a || (u ? `User#${u}` : '—');
}

async function joinMyMatch(lobbyId: number, matchId: number) {
  try {
    const res = await fetch(`/api/tournament/${lobbyId}/match/${matchId}/room`, {
      method: 'POST', credentials: 'include'
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data?.error || 'join_match_failed');
    const roomId = data.room_id;
    try {
      localStorage.setItem('tourn.lobby', String(lobbyId));
      localStorage.setItem(`tourn.room2lobby.${roomId}`, String(lobbyId));
      localStorage.setItem('tourn.match', String(matchId));
    } catch {}
    (window as any).route?.(`/tournament-room?room=${roomId}&lobby=${lobbyId}&mid=${matchId}`);
  } catch (e: any) {
    alert(e?.message || 'Failed to join match');
  }
}

function renderBracket(snap?: LobbySnapshot | null) {
  if (!snap || !snap.ok || !snap.state) return;
  const meId = Number(localStorage.getItem('userId') || '0');
  const holder = document.getElementById('lobby-info')!;
  const bracketEl = document.createElement('div');
  bracketEl.className = 'mt-6';
  const rounds = snap.state.rounds;
  bracketEl.innerHTML = `
    <h2 class="text-2xl font-bold mb-2">Bracket</h2>
    <div class="grid md:grid-cols-${Math.max(1, rounds.length)} gap-4">
      ${rounds.map((round: TM[], rIdx: number) => `
        <div class="space-y-3">
          <div class="text-sm uppercase tracking-wide text-gray-400">Round ${rIdx + 1}</div>
          ${round.map((m: TM) => {
            const p1 = labelOf(m.p1_user_id, m.p1_alias, m.p2_alias, true);
            const p2 = labelOf(m.p2_user_id, m.p1_alias, m.p2_alias, false);
            const mine = m.p1_user_id === meId || m.p2_user_id === meId;
            const bothPresent = !!m.p1_user_id && !!m.p2_user_id;
            const canJoin = mine && bothPresent && m.status !== 'finished';
            const winner = m.winner_user_id === m.p1_user_id ? p1
                         : m.winner_user_id === m.p2_user_id ? p2 : null;
            return `
              <div class="border border-gray-700 rounded p-3">
                <div class="flex items-center justify-between">
                  <div>
                    <div>${escapeHtml(p1)}</div>
                    <div>${escapeHtml(p2)}</div>
                  </div>
                  <div class="text-right">
                    ${winner ? `<div class="text-green-400 text-sm">Winner: ${escapeHtml(winner)}</div>` : ''}
                    ${canJoin ? `<button class="mt-2 bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
                                 onclick="joinMyMatch(${snap.lobby.id}, ${m.id})">Join my match</button>` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `).join('')}
    </div>
  `;
  const old = document.getElementById('bracket-holder');
  if (old) old.remove();
  bracketEl.id = 'bracket-holder';
  holder.insertAdjacentElement('afterend', bracketEl);
  (window as any).joinMyMatch = joinMyMatch;
}

function getFinalWinnerName(snap?: LobbySnapshot | null): string | null {
  if (!snap || !snap.state || !snap.ok) return null;
  const rounds = snap.state.rounds;
  if (!rounds || rounds.length === 0) return null;
  const last = rounds[rounds.length - 1] || [];
  const final = last[0];
  if (!final || final.status !== 'finished' || !final.winner_user_id) return null;
  if (final.winner_user_id === final.p1_user_id && final.p1_alias) return final.p1_alias;
  if (final.winner_user_id === final.p2_user_id && final.p2_alias) return final.p2_alias;
  const m = new Map(snap.participants.map(p => [p.user_id, p.alias]));
  return m.get(final.winner_user_id) || `User#${final.winner_user_id}`;
}

function renderWinnerBanner(snap?: LobbySnapshot | null): void {
  const wrap = document.getElementById('winner-banner');
  if (!wrap) return;
  const name = getFinalWinnerName(snap);
  if (snap && snap.lobby.status === 'finished' && name) {
    wrap.innerHTML = `
      <div class="rounded-lg border border-green-600/30 bg-green-900/20 p-4 text-center text-white space-y-3">
        <div class="text-xl font-bold">We have a winner:</div>
        <div class="text-3xl font-extrabold text-green-400">${escapeHtml(name)}</div>
        <button id="winner-home-btn" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded">Home</button>
      </div>
    `;
    const btn = document.getElementById('winner-home-btn');
    btn?.addEventListener('click', () => {
      if (typeof (window as any).route === 'function') (window as any).route('/home');
      else route('/home');
    });
  } else {
    wrap.innerHTML = '';
  }
}

export async function renderOnlineTournamentLobby() {
  
  try { document.getElementById('tourn-winner-overlay')?.remove(); } catch {}

  const params = new URLSearchParams(location.search);
  const lobbyId = Number(params.get('lobby'));
  if (!lobbyId) {
    setContent(`<div class="p-6 text-red-400">Missing lobby id</div>`);
    return;
  }

  setContent(`
    <div id="tourn-root" class="p-6 pt-16 space-y-6">
      <a href="/home" onclick="route('/home')" class="inline-block bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-white">← Home</a>
      <h1 class="text-3xl font-bold">Online Tournament Lobby</h1>
      <div id="winner-banner"></div>
      <div id="lobby-info" class="text-white"></div>
      <div class="flex items-center gap-3 items-end" id="start-area">
        <div class="flex-1 text-sm text-gray-400" id="host-note"></div>
        <button id="start-btn" class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded disabled:opacity-50" disabled>Start tournament</button>
      </div>
      <div id="participants" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"></div>
    </div>
  `);

  // ---- Abort WS that used to bring everyone home ----
  let __tournamentFinished = false; // once set, ignore aborts and close the socket
  try { (window as any).__tLobbyAbortWS?.close(1000); } catch {}
  const __wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const __uid = Number(localStorage.getItem('userId') || '0');
  const __abortURL = `${__wsProto}://${location.host}/ws/?lobbyId=${encodeURIComponent(String(lobbyId))}&userId=${__uid}`;
  const __abortWS = new WebSocket(__abortURL);
  (window as any).__tLobbyAbortWS = __abortWS;

  __abortWS.addEventListener('message', (ev) => {
    if (__tournamentFinished) return; // do nothing after winner is crowned
    let msg: any; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg && msg.type === 'tournament:aborted') {
      try { alert(String(msg.message || 'A player has left the tournament, you will be brought home.')); } catch {}
      try { route('/home'); } catch { location.href = '/home'; }
    }
  });
  const __cleanupAbort = () => { try { __abortWS.close(1001, 'navigate'); } catch {} };
  window.addEventListener('beforeunload', __cleanupAbort, { once: true });
  window.addEventListener('popstate', __cleanupAbort, { once: true });

  const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
  startBtn?.addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/tournament/${lobbyId}/start`, { method:'POST', credentials:'include' });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to start');
      alert('Tournament started!');
      await draw(true);
    } catch (err:any) {
      alert(err?.message || 'Failed to start tournament');
    }
  });

  async function syncMatchesIfAny(snap: LobbySnapshot): Promise<boolean> {
    if (!snap.state) return false;
    const rounds = snap.state.rounds;
    const candidates: TM[] = [];
    for (const round of rounds) {
      for (const m of round) {
        if (m.status !== 'pending' && (m.winner_user_id || m.room_id)) candidates.push(m);
      }
    }
    if (candidates.length === 0) return false;
    try {
      syncing = true;
      await Promise.all(candidates.map(m =>
        fetch(`/api/tournament/${snap.lobby.id}/match/${m.id}/complete`, { method: 'POST', credentials: 'include' })
          .catch(() => {})
      ));
      return true;
    } finally {
      syncing = false;
    }
  }

  async function draw(forceRefreshAfterSync = false) {
    let snap: LobbySnapshot | null = null;
    try {
      const res = await fetch(`/api/tournament/${lobbyId}`, { credentials:'include' });
      if (!res.ok) {
        const suppress = (window as any).__suppressLobby404Until || 0;
        if (res.status === 404 && Date.now() < suppress) {
          route('/home');
          return;
        }
        toastOnce('tournament-missing', 'This tournament no longer exists.');
        route('/home');
        return;
      }
      snap = await res.json();
      } catch {}

    const info = document.getElementById('lobby-info');
    const list = document.getElementById('participants');
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
    const note = document.getElementById('host-note') as HTMLDivElement | null;
    
    const startArea = document.getElementById('start-area') as HTMLDivElement | null;
    if (!info || !list || !snap || !snap.ok) return;
    if (snap.lobby.status === 'finished' && !__tournamentFinished) {
      __tournamentFinished = true;
      try { __abortWS.close(1000, 'tournament_finished'); } catch {}
    }

    renderWinnerBanner(snap);

    info.innerHTML = `
        <div>Status: <span class="font-semibold">${escapeHtml(snap.lobby.status)}</span></div>
        <div>Players: <span class="font-semibold">${snap.count}/${snap.lobby.size}</span></div>
        ${Number(localStorage.getItem('userId')||'0') === Number(snap.lobby.host_id) ? `<div class="text-green-300">You are the host</div>` : ``}
      `;

    const myId = Number(localStorage.getItem('userId') || '0');
    const iAmHost = myId && Number(snap.lobby.host_id) === myId;
    const isFull = snap.count === snap.lobby.size;
    const canStart = snap.lobby.status === 'waiting' && isFull && iAmHost;

    
    
    if (startArea) startArea.classList.toggle('hidden', snap.lobby.status !== 'waiting');
    if (snap.lobby.status === 'waiting') {
      if (startArea) startArea.classList.remove('hidden');
      if (note) {
      if (snap.lobby.status !== 'waiting') {
        note.textContent = '';
      } else if (iAmHost) {
        if (!isFull) {
          note.textContent = `Waiting for ${snap.spots_left} more…`;
        } else {
          note.textContent = 'Ready to start.';
        }
      } else {
        note.textContent = '';
      }
    }
      if (startBtn) {
        startBtn.style.display = iAmHost ? '' : 'none';
        startBtn.disabled = !canStart;
      }
    } else {
      if (startArea) startArea.classList.add('hidden');
      if (note) note.textContent = '';
      if (startBtn) startBtn.style.display = 'none';
    }
list.innerHTML = snap.participants.map(p => `
      <div class="border border-gray-700 rounded p-3">
        <div class="text-xl font-semibold">${escapeHtml(p.alias || p.display_name)}</div>
      </div>
    `).join('') + (snap.spots_left > 0 ? `
      <div class="border border-dashed border-gray-700 rounded p-3 text-gray-500 italic">
        Waiting for ${snap.spots_left} more…
      </div>` : '');

    if (snap.lobby.status !== 'waiting' && snap.state) {
      const didSync = await syncMatchesIfAny(snap);
      if (didSync || forceRefreshAfterSync) {
        try {
          const res2 = await fetch(`/api/tournament/${lobbyId}`, { credentials: 'include' });
          const snap2: LobbySnapshot = await res2.json();
          if (snap2?.ok) snap = snap2;
        } catch {}
        // re-render banner if we refreshed
        renderWinnerBanner(snap);
      }
      renderBracket(snap);
    } else {
      renderWinnerBanner(snap);
    }
  }

  clearInterval(pollTimer); pollTimer = window.setInterval(() => { if (!syncing) draw(); }, 2000);
  await draw();
}
