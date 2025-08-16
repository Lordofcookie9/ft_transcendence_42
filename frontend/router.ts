import {
  renderLogin,
  renderRegister,
  renderProfile,
  renderUserList,
  renderUserProfile,
} from './users/userManagement.js';

import {
  renderEntryPage,
  renderHome,
  renderLocal1v1,
  renderPrivate1v1,
  renderTournament,
  renderGame,
  renderChat,
  renderMain,
} from './pages/index.js';

import { startPresenceHeartbeat } from './utility.js';

// Start presence heartbeat once on app load if a session already exists
try {
  if (localStorage.getItem('userId')) startPresenceHeartbeat();
} catch {}

function renderNotFound() {
  const el = document.getElementById('app');
  if (el) el.innerHTML = `<div class="text-white p-8">Page not found</div>`;
}

// Route table
const routes: Record<string, () => Promise<void> | void> = {
  '/': renderEntryPage,
  '/home': renderHome,
  '/local': renderLocal1v1,
  '/private1v1': renderPrivate1v1,
  '/tournament': renderTournament,
  '/login': renderLogin,
  '/register': renderRegister,
  '/profile': renderProfile,
  '/users': renderUserList,
  '/game': renderGame,
  '/chat': renderChat,
  '/main': renderMain,
};

export function route(path: string) {
  history.pushState({}, '', path);
  handleLocation();
}

export async function handleLocation() {
  const path = window.location.pathname;
  // dynamic profile route /profile/:id
  if (path.startsWith('/profile/')) {
    const id = parseInt(path.split('/')[2]);
    await renderUserProfile(id);
    return;
  }
  const page = routes[path] || renderNotFound;
  await page();
}
