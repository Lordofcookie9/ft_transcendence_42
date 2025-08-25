import { setContent, escapeHtml, formatDbDateTime } from '../utility.js';
import { route } from '../router.js';

export async function renderOnlineTournamentList() {
  setContent(`<div class='p-6 text-white'>Loading tournaments...</div>`);
  let data: any = null;
  try {
    const res = await fetch('/api/tournament', { credentials: 'include' });
    data = await res.json();
  } catch {}
  if (!data || !data.ok) {
    setContent(`<div class='p-6 text-red-400'>Failed to load tournaments. <a class='underline' href='/home' onclick="route('/home');return false;">Home</a></div>`);
    return;
  }
  const lobbies = data.lobbies as any[];
  const myLobbyId = data.my_waiting_lobby_id;

  setContent(`
    <div class="max-w-5xl mx-auto p-6 space-y-6 text-white">
      <div class="flex items-center justify-between">
        <a href="/home" onclick="route('/home');return false;" class="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded">← Home</a>
        <h1 class="text-3xl font-bold">Online Tournaments</h1>
        <div></div>
      </div>
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="text-sm text-gray-300">Showing waiting lobbies (${lobbies.length})</div>
        <div>
          ${myLobbyId ? `<button id="go-my-lobby" class="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded">My Lobby #${escapeHtml(String(myLobbyId))}</button>`
                      : `<button id="create-lobby-btn" class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded">Create Lobby</button>`}
        </div>
      </div>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4" id="lobby-grid">
        ${lobbies.length === 0 ? `<div class='text-gray-400 italic'>No active waiting lobbies. Be the first to create one!</div>` : ''}
        ${lobbies.map(l => `
          <div class="border border-gray-700 rounded p-4 flex flex-col justify-between">
            <div class="space-y-1 mb-3">
              <div class="text-xs text-gray-400">Lobby #${escapeHtml(String(l.id))}</div>
              <div class="font-semibold text-lg truncate">Host: ${escapeHtml(l.host_name || 'User#'+l.host_id)}</div>
              <div class="text-sm text-gray-300">Players: ${l.count}/${l.size} <span class="text-gray-500">(${l.spots_left} left)</span></div>
              <div class="text-xs text-gray-500">Created: ${escapeHtml(formatDbDateTime(l.created_at))}</div>
            </div>
            <div class="flex gap-2">
              <button data-join="${escapeHtml(String(l.id))}" class="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm">Join</button>
              <button data-view="${escapeHtml(String(l.id))}" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm">View</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `);

  if (myLobbyId) {
    document.getElementById('go-my-lobby')?.addEventListener('click', () => route(`/tournament-online?lobby=${encodeURIComponent(String(myLobbyId))}`));
  } else {
    document.getElementById('create-lobby-btn')?.addEventListener('click', () => route('/tournament-online-setup'));
  }

  // Event delegation for join/view
  document.getElementById('lobby-grid')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target?.dataset?.join) {
      const id = target.dataset.join;
      route(`/tournament-online-join?lobby=${encodeURIComponent(id)}`);
    } else if (target?.dataset?.view) {
      const id = target.dataset.view;
      route(`/tournament-online?lobby=${encodeURIComponent(id)}`);
    }
  });
}
