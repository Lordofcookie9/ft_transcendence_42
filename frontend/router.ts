// frontend/pages/router.ts
import {
  renderLogin,
  renderRegister,
  renderUserList,
  renderUserProfile,
  renderOauthSuccess,
} from './users/userManagement.js';

import {
  renderEntryPage,
  renderHome,
  renderLocal1v1,
  renderLocalVsAI,
  renderPrivate1v1,
  renderTournament,
  renderOnlineTournamentLobby,
  renderOnlineTournamentRoom,
  renderGame,
  renderChat,
  renderMain,
} from './pages/index.js';

import { startPresenceHeartbeat } from './utility.js';
import { renderProfile } from './users/profileManagement.js';
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
  '/tournament-room': renderOnlineTournamentRoom,
  '/legal': renderLegal,
  '/privacy': renderPrivacy,
  '/terms': renderTerms,
  '/cookies': renderCookies,
};

export function route(path: string) {
  const lid = (window as any).__activeTournamentHostLobbyId;
  const inProg = !!(window as any).__matchInProgress;

  // If a host left mid-game abort and send everyone home.
  if (lid && inProg) {
    const already = !!(window as any).__abortNotified;
    if (!already) {
      try { fetch(`/api/tournament/${lid}/abort`, { method: 'POST' }); } catch {}
      try { alert('A host left mid game, the tournament is canceled. You will be brought home.'); } catch {}
      (window as any).__abortNotified = true;
    }
    // clear state and suppress spammed 404
    (window as any).__activeTournamentHostLobbyId = undefined;
    (window as any).__matchInProgress = false;
    (window as any).__suppressLobby404Until = Date.now() + 4000;

    path = '/home';
    history.pushState({}, '', path);
    handleLocation();
    return;
  }

  history.pushState({}, '', path);
  handleLocation();
}

export async function handleLocation() {
  try { (window as any).__tournRoomCleanup?.(); } catch {}

  const lid = (window as any).__activeTournamentHostLobbyId;
  const inProg = !!(window as any).__matchInProgress;
  if (lid && inProg) {
    const already = !!(window as any).__abortNotified;
    if (!already) {
      try { fetch(`/api/tournament/${lid}/abort`, { method: 'POST' }); } catch {}
      try { alert('a host left mid game, the tournament is canceled. You will be brought home'); } catch {}
      (window as any).__abortNotified = true;
    }
    (window as any).__activeTournamentHostLobbyId = undefined;
    (window as any).__matchInProgress = false;
    history.replaceState({}, '', '/home');
    await renderHome?.();
    return;
  }

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

  try {
    (window as any).__stopChatPolling && (window as any).__stopChatPolling();
    (window as any).__tournLobbyCleanup && (window as any).__tournLobbyCleanup();
    (window as any).__tournRoomCleanup && (window as any).__tournRoomCleanup();
  } catch (e) {
    console.warn('Cleanup on route change failed:', e);
  }

  const page = routes[path] || renderNotFound;
  await page();
  (window as any).maybeCenter?.();
}
