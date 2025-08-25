import { setContent, escapeHtml } from '../utility.js';
import { route } from '../router.js';

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
  // Safety: remove any leftover overlay from older builds
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
  <div id="host-controls-bar" class="flex items-center gap-3 items-end">
        <div class="flex-1 text-sm text-gray-400" id="host-note"></div>
        <button id="start-btn" class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded disabled:opacity-50" disabled>Start tournament</button>
      </div>
  <div id="progress-msg" class="hidden text-sm text-amber-300">Tournament in progress…</div>
  <div id="invite-token" class="text-sm text-gray-400">Copy & paste this token in chat to invite: <code class="bg-gray-800 px-2 py-0.5 rounded">&lt;(tournament):${lobbyId}&gt;</code></div>
      <div id="participants" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"></div>
    </div>
  `);

  const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
  startBtn?.addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/tournament/${lobbyId}/start`, { method:'POST', credentials:'include' });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to start');
  // Inline feedback instead of blocking alert popup
  const note = document.getElementById('host-note');
  if (note) note.textContent = 'Seeding bracket…';
  // Force a redraw (with refresh) so bracket appears
  await draw(true);
  if (note) note.textContent = 'Bracket seeded. Good luck!';
    } catch (err:any) {
  // Non-blocking inline error (avoid native alert)
  const note = document.getElementById('host-note');
  if (note) note.textContent = (err?.message || 'Failed to start tournament');
    }
  });

  async function syncMatchesIfAny(snap: LobbySnapshot): Promise<boolean> {
    if (!snap.state) return false;
    const rounds = snap.state.rounds;
    const candidates: TM[] = [];
    for (const round of rounds) {
      for (const m of round) {
        // Include finished BYE matches (status 'finished' but no room_id) so they propagate too
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
      snap = await res.json();
    } catch {}

    const info = document.getElementById('lobby-info');
    const list = document.getElementById('participants');
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
    const note = document.getElementById('host-note') as HTMLDivElement | null;
  const hostBar = document.getElementById('host-controls-bar');
  const invite = document.getElementById('invite-token');
  const progressMsg = document.getElementById('progress-msg');
    if (!info || !list || !snap || !snap.ok) return;

    // Persist lobby membership for Home page rejoin button
    try {
      const myIdPersist = Number(localStorage.getItem('userId') || '0');
      const amParticipant = snap.participants?.some(p => Number(p.user_id) === myIdPersist);
      if (amParticipant && (snap.lobby.status === 'waiting' || snap.lobby.status === 'started')) {
        localStorage.setItem('tourn.lobby', String(snap.lobby.id));
      } else if (snap.lobby.status === 'finished' || snap.lobby.status === 'cancelled' || !amParticipant) {
        localStorage.removeItem('tourn.lobby');
      }
    } catch {}

    renderWinnerBanner(snap);

    info.innerHTML = `
      <div>Status: <span class="font-semibold">${escapeHtml(snap.lobby.status)}</span></div>
      <div>Players: <span class="font-semibold">${snap.count}/${snap.lobby.size}</span></div>
      <div>Lobby ID: <span class="font-mono">${snap.lobby.id}</span></div>
      ${Number(localStorage.getItem('userId')||'0') === Number(snap.lobby.host_id) ? `<div class="text-green-300">You are the host</div>` : ``}
    `;

    const myId = Number(localStorage.getItem('userId') || '0');
    const iAmHost = myId && Number(snap.lobby.host_id) === myId;
    const isFull = snap.count === snap.lobby.size;
    const canStart = snap.lobby.status === 'waiting' && isFull && iAmHost;

    if (note) {
      if (!iAmHost) note.textContent = 'Only the host can start the tournament.';
      else if (!isFull) note.textContent = `Waiting for ${snap.spots_left} more…`;
      else note.textContent = 'Ready to start.';
    }

    if (snap.lobby.status === 'waiting') {
      if (startBtn) {
        startBtn.style.display = iAmHost ? '' : 'none';
        startBtn.disabled = !canStart;
      }
      if (hostBar) hostBar.classList.remove('hidden');
      if (invite) invite.classList.remove('hidden');
      if (progressMsg) progressMsg.classList.add('hidden');
    } else {
      // Hide controls & invite once started / finished / cancelled
      if (hostBar) hostBar.classList.add('hidden');
      if (invite) invite.classList.add('hidden');
      if (progressMsg) {
        if (snap.lobby.status === 'started') progressMsg.classList.remove('hidden');
        else progressMsg.classList.add('hidden');
      }
    }

    list.innerHTML = snap.participants.map(p => `
      <div class="border border-gray-700 rounded p-3">
        <div class="text-sm text-gray-400">${escapeHtml(p.display_name)}</div>
        <div class="text-xl font-semibold">${escapeHtml(p.alias)}</div>
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
      // if we are not started, ensure banner cleared
      renderWinnerBanner(snap);
    }
  }

  clearInterval(pollTimer); pollTimer = window.setInterval(() => { if (!syncing) draw(); }, 2000);
  await draw();
}
