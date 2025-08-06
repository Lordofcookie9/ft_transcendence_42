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
	renderGame,
	renderChat,
	renderMain,
} from './pages/pages.js';

import { renderNotFound } from './utility.js';

type RouteMap = { [path: string]: () => void | Promise<void> };

export const routes: RouteMap = {
	'/': renderEntryPage,
	'/home': renderHome,
	'/local': renderLocal1v1,
	'/login': renderLogin,
	'/register': renderRegister,
	'/profile': renderProfile,
	'/play': renderGame,
	'/chat': renderChat,
	'/main': renderMain,
	'/users':renderUserList,
};

export async function route(path: string) {
	const currPath = window.location.pathname;

	if (path === currPath) {
		history.replaceState({}, '', path);
		handleLocation();
	}
	else {
		history.pushState({}, '', path);
		handleLocation();
	}
}

export async function handleLocation() {
	const path = window.location.pathname;
	if (path.startsWith('/profile/')) {
		const id = parseInt(path.split('/')[2]);
		await renderUserProfile(id);
		return;
	}
	const page = routes[path] || renderNotFound;
	await page();
}

