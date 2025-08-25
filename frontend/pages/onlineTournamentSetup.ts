import { setContent, escapeHtml } from '../utility.js';
import { route } from '../router.js';

export function renderOnlineTournamentSetup() {
  setContent(`
    <div class="max-w-md mx-auto mt-12 p-6 bg-gray-800 rounded-lg shadow space-y-6">
      <a href="/home" onclick="route('/home'); return false;" class="text-sm text-gray-400 hover:text-white">← Back</a>
      <h1 class="text-2xl font-bold">Online Tournament Setup</h1>
      <form id="online-tournament-form" class="space-y-5">
        <div>
          <label class="block text-sm mb-1" for="size">Number of participants (3–8)</label>
          <input id="size" type="number" min="3" max="8" value="4" class="w-28 px-3 py-2 rounded text-black" required />
        </div>
        <fieldset class="space-y-2">
          <legend class="text-sm font-medium">Alias</legend>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="alias_mode" value="username" checked /> Use my username</label>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="alias_mode" value="custom" /> Custom alias</label>
          <div id="custom-alias-wrap" class="mt-2 hidden">
            <input id="custom-alias" type="text" maxlength="40" placeholder="Your alias (1–40 chars)" class="w-full px-3 py-2 rounded text-black" />
          </div>
        </fieldset>
        <div class="flex justify-end gap-3">
          <button type="button" id="cancel" class="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold">Create Lobby</button>
        </div>
      </form>
    </div>
  `);

  const form = document.getElementById('online-tournament-form') as HTMLFormElement;
  const sizeEl = document.getElementById('size') as HTMLInputElement;
  const customWrap = document.getElementById('custom-alias-wrap')!;
  const customInput = document.getElementById('custom-alias') as HTMLInputElement;

  form.querySelectorAll('input[name="alias_mode"]').forEach(r => {
    r.addEventListener('change', () => {
      const val = (form.querySelector('input[name="alias_mode"]:checked') as HTMLInputElement).value;
      customWrap.classList.toggle('hidden', val !== 'custom');
      if (val === 'custom') customInput.focus();
    });
  });

  document.getElementById('cancel')?.addEventListener('click', () => route('/home'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let size = parseInt(sizeEl.value, 10);
    if (!Number.isInteger(size) || size < 3 || size > 8) {
      sizeEl.focus();
      return;
    }
    const mode = (form.querySelector('input[name="alias_mode"]:checked') as HTMLInputElement).value as 'username'|'custom';
    let alias: string | undefined;
    if (mode === 'custom') {
      let v = customInput.value.trim().slice(0,40);
      if (!v) { customInput.focus(); return; }
      alias = v;
    }
    try {
      const res = await fetch('/api/tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ size, alias_mode: mode, alias })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok || !data?.lobby_id) throw new Error(data?.error || 'Failed to create tournament');
      const lobbyId = data.lobby_id;
      // Announce lobby (optional)
      try {
        const msg = `<(tournament):${lobbyId}>`;
        await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ message: msg }) });
      } catch {}
      route(`/tournament-online?lobby=${encodeURIComponent(String(lobbyId))}`);
    } catch (err:any) {
      console.error('Create tournament failed', err);
      // Optionally integrate uiAlert here if already imported elsewhere.
      alert(err?.message || 'Failed to create tournament.');
    }
  });
}
