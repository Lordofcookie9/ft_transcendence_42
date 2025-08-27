import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml } from '../utility.js';
import { initPongGame } from "../pong/pong.js";
import { route } from '../router.js';

export function renderGame() {
  setContent('<div class="p-4">Game Placeholder (WIP)</div>');
}

