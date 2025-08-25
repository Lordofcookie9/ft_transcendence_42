//FRONTEND main Typescript Tailwind
import { renderUserList, renderUserProfile } from './users/userManagement.js';
import { uiPrompt, uiAlert } from './ui/modal.js';
import { renderEntryPage, renderHome, updateCounter, updateChatBox } from './pages/index.js'
import { route, handleLocation } from './router.js';


//const app = document.getElementById('app');

console.log("Main loaded ✅");

function isPageReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation') as any[];
    if (nav && nav[0]) return nav[0].type === 'reload';
    // Fallback (deprecated API, but widely available)
    return (performance as any)?.navigation?.type === 1;
  } catch {
    return false;
  }
}

if (isPageReload()) {
  const ip = localStorage.getItem('game.inProgress');
  if (ip === 'local' || ip === 'tournament') {
    alert("please don't refresh during the game, you will be brought to home");
    // We *don’t* destroy the tournament state; just send them home.
    route('/home');
  }
}

window.addEventListener('popstate', () => {
	handleLocation();
});

// Visitor login logic
(window as any).enterVisitor = () => {
	const input = document.getElementById("aliasInput") as HTMLInputElement;
	const alias = input?.value.trim();
	if (!alias) return;
	localStorage.setItem("alias", alias);
	route("/home");
};

(window as any).startLocalGame = () => { route('/local-setup'); };

// Optional helper to rename opponent before a match (can be bound to a UI button)
(window as any).renameLocalOpponent = async () => {
  const current = localStorage.getItem('lastLocalOpponent') || localStorage.getItem('p1') || 'Player 1';
  const updated = await uiPrompt('Enter new opponent alias:', { title: 'Rename Opponent', defaultValue: current, validate: (v)=> v.length>0 && v.length<=30 ? true : '1-30 chars required' });
  if (updated === null) return; // cancelled
  localStorage.setItem('lastLocalOpponent', updated.trim());
  await uiAlert('Opponent alias updated. Start a new local game to apply.');
};

(window as any).incrementCounter = async function () {
	await fetch("/api/increment?id=main-counter", { method: "POST" });
	updateCounter();
};

(window as any).addFriend = async (id: number) => {
	await fetch(`/api/friends/${id}/add`, { method: 'POST' });
	alert("Friend request sent.");
	await renderUserProfile(id);
};

(window as any).cancelAction = async (id: number) => {
	await fetch(`/api/friends/${id}/cancelAction`, { method: 'POST' });
	alert("Action canceled.");
	await renderUserProfile(id);
};

(window as any).acceptFriend = async (id: number) => {
	await fetch(`/api/friends/${id}/accept`, { method: 'POST' });
	alert("Friend request accepted.");
	await renderUserProfile(id);
};

(window as any).blockUser = async (id: number) => {
	await fetch(`/api/friends/${id}/block`, { method: 'POST' });
	alert("User blocked.");
	await renderUserProfile(id);
};
(window as any).inviteToPlay = async (id: number) => {
	renderHome();
};

// window.addEventListener('beforeunload', () => {
//   const userId = localStorage.getItem('userId');
//   if (sessionStorage.getItem('isReloading')) {
//     return;
//   }
//
//   if (userId) {
//     const data = new FormData();
//     data.append('userId', userId);
//
//     navigator.sendBeacon('/api/logout', data);
//   }
//
//   localStorage.removeItem('token');
//   localStorage.removeItem('userId');
//   localStorage.removeItem('alias');
// });


// --- Initialize ---
handleLocation();

// Global bindings
(window as any).route = route;
(window as any).renderUsers = renderUserList;

// Block visitors from posting; backend derives alias from JWT
(window as any).submitMessage = async function () {
  const input = document.getElementById('messageInput') as HTMLInputElement | null;
  const message = input?.value?.trim() ?? '';
  if (!message) return;

  // Client-side guard (nice UX; backend still enforces)
  if (message.length > 1000) {
    alert('Message must be under 1000 characters long');
    return;
  }

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      // Try JSON -> text -> fallback message
      let msg = `Error: ${res.status} ${res.statusText}`;
      try {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await res.json();
          if (data && typeof data.error === 'string' && data.error.trim()) {
            msg = data.error;
          }
        } else {
          const text = await res.text();
          if (text && text.trim()) msg = text.trim();
        }
      } catch { /* ignore parse errors */ }

      if (res.status === 401) msg = "Please log in to use the chat.";
      if (res.status === 403 && msg === `Error: 403 ${res.statusText}`) {
        // explicit fallback for your length rule if server didn't include a body
        msg = "Message must be under 1000 characters long";
      }

      alert(msg);
      return;
    }

    if (input) input.value = "";
    updateChatBox();
  } catch (err) {
    console.error("Failed to send message", err);
    alert("Network error while sending message");
  }
};

// ======== TOURNAMENT ENGINE (Single Elimination, 3–8 players) ========
type Match = { id: string; p1: string|null; p2: string|null; winner: string|null; round: number; index: number };
type TournamentState = {
  participants: string[];
  rounds: Match[][];
  current: { round: number; index: number };
  active: boolean;
};

function nextPow2(n: number) { let p = 1; while (p < n) p <<= 1; return p; }
function shuffle<T>(a: T[]) { for (let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

function createTournament(aliases: string[]): TournamentState {
  const players = shuffle(aliases.slice());
  const size = Math.max(3, Math.min(8, players.length));
  const target = nextPow2(size); // e.g., 5..8 -> 8, 3..4 -> 4

  // Preliminary pairing math:
  // - prelimMatches = number of proper matches in Round 1
  // - byes = number of players skipping Round 1
  const prelimMatches = Math.max(0, size - target / 2);
  const byes = target - size;

  // Build Round 1 pairs:
  //   prelimMatches pairs as (player, player)
  //   byes pairs as (player, null)
  const fullPlayers = players.slice(0, 2 * prelimMatches);
  const byePlayers = players.slice(2 * prelimMatches, 2 * prelimMatches + byes);
  let idxFull = 0;
  let idxBye = 0;

  const round0Pairs: { p1: string | null, p2: string | null }[] = [];
  for (let k = 0; k < target / 2; k++) {
    if (k < prelimMatches) {
      const p1 = fullPlayers[idxFull++] || null;
      const p2 = fullPlayers[idxFull++] || null;
      round0Pairs.push({ p1, p2 });
    } else {
      const p1 = byePlayers[idxBye++] || null;
      round0Pairs.push({ p1, p2: null });
    }
  }

  // Construct rounds scaffold
  const rounds: Match[][] = [];
  const r0: Match[] = [];
  for (let i = 0; i < round0Pairs.length; i++) {
    const pair = round0Pairs[i];
    r0.push({ id: `R1M${i+1}`, p1: pair.p1, p2: pair.p2, winner: null, round: 0, index: i });
  }
  rounds.push(r0);

  let currentLen = r0.length;
  let roundIdx = 1;
  while (currentLen > 1) {
    const matches: Match[] = [];
    for (let i = 0; i < currentLen; i += 2) {
      matches.push({ id: `R${roundIdx+1}M${i/2+1}`, p1: null, p2: null, winner: null, round: roundIdx, index: i/2 });
    }
    rounds.push(matches);
    currentLen = matches.length;
    roundIdx++;
  }

  const st: TournamentState = { participants: players, rounds, current: { round: 0, index: 0 }, active: true };
  propagateByes(st); // Only processes round-0 byes per our earlier fix
  return st;
}

function propagateByes(st: TournamentState) {
  // Only auto-advance BYES in the FIRST round to avoid premature champions.
  if (st.rounds.length === 0) return;

  const r = 0; // first round only
  for (let m = 0; m < st.rounds[r].length; m++) {
    const match = st.rounds[r][m];
    if (!match.winner) {
      if (match.p1 && !match.p2) match.winner = match.p1;
      else if (!match.p1 && match.p2) match.winner = match.p2;

      if (match.winner && r + 1 < st.rounds.length) {
        const nxt = st.rounds[r + 1][Math.floor(m / 2)];
        if (m % 2 === 0) nxt.p1 = match.winner; else nxt.p2 = match.winner;
      }
    }
  }

  // Point to the first playable match (both players set, no winner)
  for (let r2 = 0; r2 < st.rounds.length; r2++) {
    for (let i2 = 0; i2 < st.rounds[r2].length; i2++) {
      const mt = st.rounds[r2][i2];
      if (mt.p1 && mt.p2 && !mt.winner) {
        st.current = { round: r2, index: i2 };
        return;
      }
    }
  }

  // Only finished if the final actually has a winner set.
  st.active = !Boolean(st.rounds[st.rounds.length - 1]?.[0]?.winner);
}

function saveT(st: TournamentState) { localStorage.setItem('tournament.state', JSON.stringify(st)); }
function loadT(): TournamentState | null { try { const raw = localStorage.getItem('tournament.state'); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function getChampion(st: TournamentState | null) { return st?.rounds[st.rounds.length-1]?.[0]?.winner || null; }

function ensureTournamentUI() {
  // append tournament state UI under the pong game if not present
  const root = document.getElementById('pong-root');
  if (!root) return;
  let holder = document.getElementById('tournament-state-holder');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'tournament-state-holder';
    holder.className = 'max-w-6xl mx-auto text-left mt-8';
    holder.innerHTML = '<div class="text-sm text-gray-300 mb-2">tournament state:</div><div id="tournament-state"></div>';
    root.parentElement?.parentElement?.appendChild(holder);
  }
  (window as any).updateTournamentStateDOM?.();
}

function waitForPongAndInjectUI(retries=40) {
  const tryAttach = () => {
    if ((window as any).tournament?.isActive() && document.getElementById('pong-root')) {
      ensureTournamentUI();
      return;
    }
    if (retries-- > 0) setTimeout(tryAttach, 100);
  };
  tryAttach();
}

function generateBracketPre(st: TournamentState): string {
  if (!st) return '<em class="text-gray-400">No tournament running.</em>';

  const total = st.rounds.length;
  const esc = (s: string | null) =>
    (s ?? "—").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  const labelFor = (r: number) => {
    const idxFromEnd = total - 1 - r;
    if (idxFromEnd === 0) return "Final";
    if (idxFromEnd === 1) return "Semifinals";
    if (idxFromEnd === 2) return "Quarterfinals";
    return `Round ${r + 1}`;
  };

  const isCurrent = (r: number, i: number) =>
    st.current && st.current.round === r && st.current.index === i;

  const matchBlock = (m: Match, r: number, i: number) => {
    const status = m.winner
      ? `<span class="ml-2 text-[10px] rounded bg-emerald-600/30 px-2 py-0.5">winner: ${esc(m.winner)}</span>`
      : (m.p1 && m.p2)
        ? (isCurrent(r, i)
            ? `<span class="ml-2 text-[10px] rounded bg-amber-500/20 px-2 py-0.5">current</span>`
            : `<span class="ml-2 text-[10px] rounded bg-sky-500/20 px-2 py-0.5">up next</span>`)
        : `<span class="ml-2 text-[10px] rounded bg-gray-500/20 px-2 py-0.5">waiting</span>`;

    const row = (name: string | null) => {
      const w = m.winner && name && m.winner === name;
      return `<div class="flex items-center justify-between">
                <div class="truncate ${w ? 'text-emerald-300 font-semibold' : ''}">${esc(name)}</div>
              </div>`;
    };

    return `
      <div class="rounded-lg border border-white/10 bg-black/40 p-3">
        <div class="text-[11px] text-gray-400 mb-2">Match ${i + 1}${status}</div>
        <div class="space-y-1">
          ${row(m.p1)}
          ${row(m.p2)}
        </div>
      </div>
    `;
  };

  const roundsHTML = st.rounds.map((round, r) => `
    <section class="space-y-2">
      <div class="text-xs uppercase tracking-wide text-gray-400 mb-1">${labelFor(r)}</div>
      <div class="grid gap-2">
        ${round.map((m, i) => matchBlock(m, r, i)).join("")}
      </div>
    </section>
  `).join("");

  // Vertical layout output
  return `<div class="space-y-4">${roundsHTML}</div>`;
}

// Global API
(window as any).tournament = {
  start(aliases: string[]) {
    const st = createTournament(aliases);
    saveT(st);
    this.startNextMatch();
  },
  isActive() { const st = loadT(); return Boolean(st && st.active); },
  startNextMatch() {
    const st = loadT(); if (!st || !st.active) return;
    propagateByes(st);
    let { round, index } = st.current;
    // find first playable match
    outer: {
      for (let r = st.current.round; r < st.rounds.length; r++) {
        for (let m = (r===st.current.round?st.current.index:0); m < st.rounds[r].length; m++) {
          const mt = st.rounds[r][m];
          if (mt.p1 && mt.p2 && !mt.winner) { st.current = { round: r, index: m }; break outer; }
        }
      }
    }
    const cur = st.rounds[st.current.round][st.current.index];
    if (!cur || !cur.p1 || !cur.p2) {
      saveT(st);
      const champ = getChampion(st);
      if (champ) {
        alert(`🏆 ${champ} wins the tournament!`);
        this.postChat(`🏆 Tournament winner: ${champ}!`);
        st.active = false;
        saveT(st);
        try { localStorage.removeItem('game.inProgress'); } catch {}
        try { (window as any).updateTournamentStateDOM?.(); } catch {}
      }
      return;
    }
    localStorage.setItem('p1', cur.p1);
    localStorage.setItem('p2', cur.p2);
    localStorage.setItem('p1Score', '0');
    localStorage.setItem('p2Score', '0');
    saveT(st);
    route('/tournament');},
  onGameEnd(winner: string) {
    const st = loadT(); if (!st) return;
    const { round, index } = st.current;
    const cur = st.rounds[round][index];
    cur.winner = winner;
    if (round + 1 < st.rounds.length) {
      const nxt = st.rounds[round+1][Math.floor(index/2)];
      if (index % 2 === 0) nxt.p1 = winner; else nxt.p2 = winner;
    }
    // advance pointer to next playable
    // scan same round
    for (let m=index+1; m<st.rounds[round].length; m++){
      const mt = st.rounds[round][m];
      if (mt.p1 && mt.p2 && !mt.winner) { st.current = { round, index: m }; saveT(st); (window as any).updateTournamentStateDOM?.(); return this.startNextMatch(); }
    }
    // scan subsequent rounds
    for (let r=round+1; r<st.rounds.length; r++){
      for (let m=0; m<st.rounds[r].length; m++){
        const mt = st.rounds[r][m];
        if (mt.p1 && mt.p2 && !mt.winner) { st.current = { round: r, index: m }; saveT(st); (window as any).updateTournamentStateDOM?.(); return this.startNextMatch(); }
      }
    }
    saveT(st);
    const champ = getChampion(st);
    if (champ) {
      alert(`🏆 ${champ} wins the tournament!`);
      this.postChat(`🏆 Tournament winner: ${champ}!`);
      st.active = false; saveT(st);
      try { localStorage.removeItem('game.inProgress'); } catch {}
      (window as any).updateTournamentStateDOM?.();
    }

  },
  postChat(message: string) {
    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ message }) });
  },
  renderStateHTML(): string {
    const st = loadT();
    if (!st) return '<em class="text-gray-400">No tournament running.</em>';
    return generateBracketPre(st);
  }
};

// Listen for pong game end to progress tournament (only if active)
window.addEventListener('pong:gameend', (ev: any) => {
  const winner = ev?.detail?.winner;
  if (!winner) return;
  if ((window as any).tournament?.isActive() && (window as any).tournament?.uiActive === true) {
    (window as any).tournament.onGameEnd(winner);
  }
});

// Expose helpers to DOM
(window as any).renderTournamentState = () => (window as any).tournament?.renderStateHTML() || '';
(window as any).updateTournamentStateDOM = () => {
  const el = document.getElementById('tournament-state');
  if (el) el.innerHTML = (window as any).renderTournamentState();
};

// Setup flow
(window as any).startTournamentSetup = () => { route('/tournament-setup'); };


// Hook: pages.ts calls this when a local game ends
(window as any).__onLocalGameEnd = (winner: string) => { (window as any).tournament?.onGameEnd?.(winner); };
