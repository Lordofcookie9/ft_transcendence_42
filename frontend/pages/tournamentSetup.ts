import { setContent, escapeHtml } from '../utility.js';
import { route } from '../router.js';

// Renders a form to configure a local tournament (3–8 players) without using browser prompts.
export function renderLocalTournamentSetup() {
  const prev = safeLoadParticipants();
  const defaultCount = Math.min(8, Math.max(3, prev.length || 4));

  setContent(`
    <div class="max-w-xl mx-auto mt-12 bg-gray-800 border border-gray-700 rounded-lg shadow p-6 space-y-6">
      <a href="/home" onclick="route('/home'); return false;" class="text-sm text-gray-400 hover:text-white">← Back</a>
      <h1 class="text-2xl font-bold">Local Tournament Setup</h1>
      <form id="tournament-setup-form" class="space-y-5">
        <div>
          <label for="player-count" class="block text-sm mb-1">Number of participants (3–8)</label>
          <input id="player-count" type="number" min="3" max="8" value="${defaultCount}" class="w-32 px-3 py-2 rounded text-black" />
        </div>
        <div id="aliases-wrapper" class="space-y-2"></div>
        <div class="flex items-center gap-3 text-xs text-gray-400">
          <button type="button" id="autofill" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs">Auto-fill Empty</button>
          <button type="button" id="clear-all" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs">Clear All</button>
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" id="cancel" class="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold">Start Tournament</button>
        </div>
      </form>
    </div>
  `);

  const countEl = document.getElementById('player-count') as HTMLInputElement;
  const wrap = document.getElementById('aliases-wrapper')!;

  function renderAliasInputs() {
    const n = clamp(parseInt(countEl.value,10) || defaultCount, 3, 8);
    countEl.value = String(n);
    wrap.innerHTML = '';
    for (let i=0;i<n;i++) {
      const existing = prev[i] || '';
      const p = document.createElement('div');
      p.innerHTML = `
        <label class="block text-sm mb-1 text-gray-300">Player ${i+1}</label>
        <input data-alias-index="${i}" type="text" maxlength="40" value="${escapeHtml(existing)}" placeholder="Player ${i+1}" class="w-full px-3 py-2 rounded text-black" />
      `;
      wrap.appendChild(p);
    }
  }

  countEl.addEventListener('change', renderAliasInputs);
  renderAliasInputs();

  document.getElementById('autofill')?.addEventListener('click', () => {
    wrap.querySelectorAll('input[data-alias-index]').forEach((inp, idx) => {
      const el = inp as HTMLInputElement;
      if (!el.value.trim()) el.value = `Player ${idx+1}`;
    });
  });
  document.getElementById('clear-all')?.addEventListener('click', () => {
    wrap.querySelectorAll('input[data-alias-index]').forEach(inp => { (inp as HTMLInputElement).value=''; });
  });
  document.getElementById('cancel')?.addEventListener('click', () => route('/home'));

  document.getElementById('tournament-setup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const aliases: string[] = [];
    wrap.querySelectorAll('input[data-alias-index]').forEach((inp, idx) => {
      let v = (inp as HTMLInputElement).value.trim();
      if (!v) v = `Player ${idx+1}`;
      aliases.push(v);
    });
    if (aliases.length < 3) return; // safety guard
    localStorage.setItem('tournament.participants', JSON.stringify(aliases));
    try { localStorage.removeItem('game.ai'); } catch {}
    // Announce
    const message = `🏓 A tournament is about to begin with ${aliases.length} players: ${aliases.join(', ')}. Good luck!`;
    try { await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ message }) }); } catch {}
    // Start
    (window as any).tournament.start(aliases);
    route('/tournament');
  });
}

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
function safeLoadParticipants(): string[] { try { const raw = localStorage.getItem('tournament.participants'); return raw ? JSON.parse(raw) : []; } catch { return []; } }
