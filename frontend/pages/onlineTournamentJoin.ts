import { setContent, escapeHtml } from '../utility.js';
import { route } from '../router.js';

// Page where a user configures how to join an existing online tournament lobby (alias mode / custom alias)
export async function renderOnlineTournamentJoin() {
  const params = new URLSearchParams(location.search);
  const lobbyId = Number(params.get('lobby'));
  if (!lobbyId) {
    setContent('<div class="p-6 text-red-400">Missing lobby id</div>');
    return;
  }

  // Fetch lobby snapshot (lightweight) to show current participants and size
  let snap: any = null;
  try {
    const res = await fetch(`/api/tournament/${lobbyId}`, { credentials: 'include' });
    snap = await res.json();
  } catch {}

  if (!snap || !snap.ok) {
    setContent(`<div class="p-6 text-red-400">Tournament lobby ${escapeHtml(String(lobbyId))} not found.</div>`);
    return;
  }
  const myId = Number(localStorage.getItem('userId') || '0');
  const alreadyIn = myId && snap.participants.some((p: any) => Number(p.user_id) === myId);
  if (alreadyIn) {
    setContent(`
      <div class="p-6 max-w-lg mx-auto space-y-6 text-white">
        <a href="/home" onclick="route('/home')" class="inline-block bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded">← Home</a>
        <div class="rounded border border-blue-600/40 bg-blue-900/30 p-4 space-y-3">
          <h1 class="text-2xl font-bold">Already Joined</h1>
          <p>You are already a participant in lobby <span class="font-mono">${escapeHtml(String(lobbyId))}</span>.</p>
          <div class="flex gap-3">
            <button id="go-lobby" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">Go to Lobby</button>
            <button id="leave-join" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">Home</button>
          </div>
        </div>
      </div>
    `);
    document.getElementById('go-lobby')?.addEventListener('click', () => route(`/tournament-online?lobby=${encodeURIComponent(String(lobbyId))}`));
    document.getElementById('leave-join')?.addEventListener('click', () => route('/home'));
    return;
  }
  if (snap.lobby.status !== 'waiting') {
    setContent(`<div class="p-6 text-yellow-400">Tournament already ${escapeHtml(snap.lobby.status)}.</div>`);
    return;
  }
  if (snap.count >= snap.lobby.size) {
    setContent(`<div class="p-6 text-yellow-400">Tournament lobby is full.</div>`);
    return;
  }

  setContent(`
    <div class="p-6 max-w-xl mx-auto space-y-6 text-white">
      <a href="/home" onclick="route('/home')" class="inline-block bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded">← Home</a>
      <h1 class="text-3xl font-bold">Join Tournament</h1>
      <div class="space-y-1 text-sm text-gray-300">
        <div>Lobby ID: <span class="font-mono">${escapeHtml(String(snap.lobby.id))}</span></div>
        <div>Players: ${snap.count}/${snap.lobby.size} (spots left: ${snap.spots_left})</div>
      </div>
      <form id="join-form" class="space-y-4">
        <fieldset class="space-y-2">
          <legend class="text-sm font-semibold tracking-wide uppercase text-gray-400">Alias Mode</legend>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="alias_mode" value="username" checked class="form-radio"> <span>Use my username</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="alias_mode" value="custom" class="form-radio"> <span>Use a custom alias</span>
          </label>
        </fieldset>
        <div id="custom-alias-wrap" class="hidden">
          <label class="block text-sm font-medium mb-1">Custom Alias</label>
          <input id="alias-input" type="text" maxlength="40" class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600" placeholder="Enter alias (1–40 chars)">
          <div id="alias-error" class="text-red-400 text-xs mt-1"></div>
        </div>
        <div class="pt-2">
          <button type="submit" class="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded font-medium">Join Lobby</button>
          <button type="button" id="cancel-btn" class="ml-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">Cancel</button>
        </div>
      </form>
      <div class="text-sm text-gray-400">
        Share token for others to join: <code class="bg-gray-800 px-2 py-0.5 rounded">&lt;(tournament):${escapeHtml(String(lobbyId))}&gt;</code>
      </div>
      <div>
        <h2 class="text-xl font-semibold mb-2">Current Participants</h2>
        <div class="grid gap-2" id="participant-list">
          ${snap.participants.map((p: any)=>`<div class='border border-gray-700 rounded px-3 py-2'><div class='text-xs text-gray-400'>${escapeHtml(p.display_name)}</div><div class='text-lg font-semibold'>${escapeHtml(p.alias)}</div></div>`).join('')}
          ${snap.spots_left>0?`<div class='border border-dashed border-gray-700 rounded px-3 py-2 text-gray-500 italic'>${snap.spots_left} spot(s) open…</div>`:''}
        </div>
      </div>
    </div>
  `);

  const form = document.getElementById('join-form') as HTMLFormElement | null;
  const aliasWrap = document.getElementById('custom-alias-wrap')!;
  const aliasInput = document.getElementById('alias-input') as HTMLInputElement | null;
  const aliasError = document.getElementById('alias-error');

  form?.addEventListener('change', (e) => {
    const mode = (form.querySelector('input[name="alias_mode"]:checked') as HTMLInputElement).value;
    if (mode === 'custom') aliasWrap.classList.remove('hidden');
    else aliasWrap.classList.add('hidden');
  });

  document.getElementById('cancel-btn')?.addEventListener('click', () => route('/home'));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    aliasError!.textContent = '';
    const mode = (form.querySelector('input[name="alias_mode"]:checked') as HTMLInputElement).value as 'username'|'custom';
    let alias: string | undefined;
    if (mode === 'custom') {
      const v = (aliasInput?.value || '').trim();
      if (v.length === 0 || v.length > 40) {
        aliasError!.textContent = 'Alias must be 1–40 characters';
        aliasInput?.focus();
        return;
      }
      alias = v;
    }
    try {
      const res = await fetch(`/api/tournament/${lobbyId}/join`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias_mode: mode, alias })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to join');
      route(`/tournament-online?lobby=${encodeURIComponent(String(lobbyId))}`);
    } catch (err: any) {
      aliasError!.textContent = err?.message || 'Failed to join lobby';
    }
  });
}
