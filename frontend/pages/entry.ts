import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml } from '../utility.js';
import { initPongGame } from "../pong/pong.js";
import { route } from '../router.js';

export function renderEntryPage() {
  const userName = localStorage.getItem("display_name");
  const userId = localStorage.getItem('user.id');

  console.log('check entry page:', userName, userId);

  let identification = "";

  if (userId) {
    identification = `
      <div class="p-4">
        <h1 class="text-2xl font-bold">Hello, ${escapeHtml(userName || 'User')}!</h1>
        <a href="/profile" data-link class="text-blue-500 hover:underline">You are logged in</a>
        <br />
        <button type="button" id="logout" class="mt-4 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500">
          Logout
        </button>
        <button onclick="route('/home')" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
          Go Play Game
        </button>
      </div>
    `;
  } else {
    identification = `
      <div class="space-y-4">
        <button onclick="route('/register')" class="bg-gray-600 text-white px-6 py-3 rounded hover:bg-gray-700">
          Create Account
        </button>
        <button onclick="route('/login')" class="bg-gray-600 text-white px-6 py-3 rounded hover:bg-gray-700">
          Login
        </button>
      </div>      
      <div class="mt-8 space-y-4">
        <h2 class="text-lg font-semibold">Continue as Guest</h2>
        <input id="aliasInput" type="text" placeholder="Enter your alias"
          class="border border-gray-400 px-4 py-2 rounded text-black" />
        <br />
        <button onclick="enterVisitor()" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
          Continue
        </button>
      </div>
    `;
  }

  setContent(`
    <div class="text-center mt-10 space-y-6">
      <h1 class="text-3xl font-bold mb-6">Welcome to Transcendence</h1>
      ${identification}
      <div class="mt-10">
        <button onclick="route('/users')" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
          See users
        </button>
        <div id="users-list" class="mt-6 max-w-2xl mx-auto"></div>
      </div>
    </div>
  `);

  document.getElementById('logout')?.addEventListener('click', logout);
}


// --- Main Homepage ---
