// frontend/pages/router.ts (snippet)
import {
  renderLogin,
  renderRegister,
  renderProfile,
  renderUserList,
  renderUserProfile,
  renderOauthSuccess,
} from './users/userManagement.js';

import {
  renderEntryPage,
  renderHome,
  renderLocal1v1,
  renderLocalSetup1v1,
  renderLocalTournamentSetup,
  renderOnlineTournamentSetup,
  renderOnlineTournamentJoin,
  renderLocalVsAI,
  renderPrivate1v1,
  renderTournament,
  renderOnlineTournamentLobby,
  renderOnlineTournamentRoom,
  renderOnlineTournamentList,
  renderGame,
  renderChat,
  renderMain,
} from './pages/index.js';

import { startPresenceHeartbeat } from './utility.js';
import { renderLegal, renderPrivacy, renderTerms, renderCookies } from './pages/legalPages.js';

try {
  if (localStorage.getItem('userId')) startPresenceHeartbeat();
} catch {}

function renderNotFound() {
  const el = document.getElementById('app');
  if (el) el.innerHTML = `<div class="text-white p-8">Page not found</div>`;
}

const routes: Record<string, () => Promise<void> | void> = {
  '/': renderEntryPage,
  '/home': renderHome,
  '/local': renderLocal1v1,
  '/local-setup': renderLocalSetup1v1,
  '/local-ai': renderLocalVsAI,
  '/private1v1': renderPrivate1v1,
  '/tournament': renderTournament,
  '/login': renderLogin,
  '/register': renderRegister,
  '/profile': renderProfile,
  '/users': renderUserList,
  '/game': renderGame,
  '/chat': renderChat,
  '/main': renderMain,
  '/oauth-success': renderOauthSuccess,
  '/tournament-online-lobby': renderOnlineTournamentLobby, // legacy alias
  '/tournament-online': renderOnlineTournamentLobby,
  '/tournament-online-list': renderOnlineTournamentList,
  '/tournament-room': renderOnlineTournamentRoom,
  '/tournament-online-setup': renderOnlineTournamentSetup,
  '/tournament-online-join': renderOnlineTournamentJoin,
  '/tournament-setup': renderLocalTournamentSetup,
  '/legal': renderLegal,
  '/privacy': renderPrivacy,
  '/terms': renderTerms,
  '/cookies': renderCookies,
};

export function route(path: string) {
  history.pushState({}, '', path);
  handleLocation();
}

export async function handleLocation() {
  const path = window.location.pathname;
  if (path.startsWith('/profile/')) {
    const id = parseInt(path.split('/')[2]);
    await renderUserProfile(id);
    (window as any).maybeCenter?.();
    return;
  }
  if (path === '/login' && new URLSearchParams(location.search).get('created') === '1') {
    renderOauthSuccess();
    (window as any).maybeCenter?.();
    return;
  }
  const page = routes[path] || renderNotFound;
  await page();
  (window as any).maybeCenter?.();
}
