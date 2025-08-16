import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml } from '../utility.js';
import { initPongGame } from "../pong/pong.js";
import { route } from '../router.js';

export function renderMain() {
  const alias = localStorage.getItem("alias") || "Guest";
  setContent(`<div class="p-10 text-center text-white text-xl">Main Page — Welcome ${alias}</div>`);
}


// --- Chat ---
