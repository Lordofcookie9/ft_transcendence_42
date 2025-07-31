// Unified main.ts — full SPA routing in TypeScript

import { initPongGame } from "./pong/pong.js";

const app = document.getElementById('app');

function setContent(html: string) {
  if (app) app.innerHTML = html;
}

function route(path: string) {
  history.pushState({}, '', path);
  handleLocation();
}

window.addEventListener('popstate', handleLocation);

type RouteMap = { [path: string]: () => void };

const routes: RouteMap = {
  '/': renderEntryPage,
  '/home': renderHome,
  '/local': renderLocal1v1,
  '/login': renderLogin,
  '/register': renderRegister,
  '/profile': renderProfile,
  '/play': renderGame,
  '/chat': renderChat,
  '/main': renderMain, // optional extra screen if needed
};

function handleLocation() {
  const path = window.location.pathname;
  const page = routes[path] || renderNotFound;
  page();
}

// --- Entry Page (landing) ---
function renderEntryPage() {
  setContent(`
    <div class="text-center mt-10 space-y-6">
      <h1 class="text-3xl font-bold mb-6">Welcome to Transcendence</h1>

      <div class="space-y-4">
        <button onclick="route('/register')" class="bg-gray-600 text-white px-6 py-3 rounded hover:bg-gray-700">
          Create Account
        </button>
        <button onclick="route('/login')" class="bg-gray-600 text-white px-6 py-3 rounded hover:bg-gray-700">
          Login
        </button>
      </div>

      <div class="mt-8 space-y-4">
        <h2 class="text-lg font-semibold">Continue as Visitor</h2>
        <input id="aliasInput" type="text" placeholder="Enter your alias"
          class="border border-gray-400 px-4 py-2 rounded text-black" />
        <br />
        <button onclick="enterVisitor()" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
          Continue
        </button>
      </div>
    </div>
  `);
}
// --- Main Homepage ---
function renderHome() {
  const alias = localStorage.getItem("alias") || "Guest";
  setContent(`
    <!-- Floating Chat Box -->
    <div class="fixed top-4 right-4 w-80 max-w-full sm:w-72 bg-gray-800 text-white rounded shadow-lg z-50 text-sm sm:text-base">
      <div class="p-2 border-b border-gray-700 font-semibold">Chat Room</div>
      <div id="chatBox" class="p-2 h-60 sm:h-52 overflow-y-auto text-sm break-words"></div>
      <div class="p-2 flex gap-1">
      <input id="messageInput" placeholder="Message" class="flex-1 px-2 py-1 rounded text-black"
        onkeydown="if(event.key === 'Enter'){ submitMessage(); }" />
          <button onclick="submitMessage()" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded">Send</button>
    </div>
  </div>

    <!-- Main Page -->
    <div class="flex justify-between items-start p-4">
      <a href="/profile" onclick="route('/profile')" class="text-gray-400 hover:text-white">User Profile</a>
    </div>

    <div class="flex flex-col items-center mt-10 space-y-10">
      <h1 class="text-4xl font-bold">Transcendence</h1>

      <div class="flex space-x-16">
        <div class="text-center">
          <h2 class="text-xl font-semibold mb-2">2 Player</h2>
          <div class="flex space-x-4 justify-center">
            <button onclick="startLocalGame()" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Local</button>
            <button class="bg-gray-600 text-white px-4 py-2 rounded opacity-50 cursor-not-allowed">Online</button>
          </div>
        </div>

        <div class="text-center">
          <h2 class="text-xl font-semibold mb-2">Tournament (up to 8 players)</h2>
          <button class="bg-gray-600 text-white px-4 py-2 rounded opacity-50 cursor-not-allowed">Local</button>
        </div>
      </div>
    </div>
  `);

  updateChatBox();
  setInterval(updateChatBox, 3000);
}


// Visitor login logic
(window as any).enterVisitor = () => {
  const input = document.getElementById("aliasInput") as HTMLInputElement;
  const alias = input?.value.trim();
  if (!alias) return;
  localStorage.setItem("alias", alias);
  route("/home");
};

(window as any).startLocalGame = () => {
  const p1 = localStorage.getItem("alias") || "Player 1";
  const p2 = prompt("Enter Player 2 alias:");
  if (!p2 || p2.trim().length === 0) return;

  localStorage.setItem("p1", p1);
  localStorage.setItem("p2", p2.trim());
  localStorage.setItem("p1Score", "0");
  localStorage.setItem("p2Score", "0");
  route("/local");
};
// --- API Helpers ---
async function getCount(id: string): Promise<number> {
  const res = await fetch(`/api/count?id=${id}`);
  const data = await res.json();
  return data.count;
}

async function incrementCount(id: string): Promise<number> {
  const res = await fetch(`/api/increment?id=${id}`, { method: 'POST' });
  const data = await res.json();
  return data.count;
}

async function getMessages(): Promise<any[]> {
  const res = await fetch('/api/chat');
  return await res.json();
}

async function sendMessage(alias: string, message: string): Promise<any> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias, message })
  });
  return await res.json();
}

// --- Page Stubs ---
function renderLogin() {
  setContent(`
    <div class="max-w-md mx-auto mt-10 p-6 bg-gray-800 rounded-lg shadow">
      <h1 class="text-xl font-bold mb-4">Login</h1>
      <form id="login-form" class="flex flex-col gap-4">
        <input type="email" name="email" placeholder="Email" class="p-2 border border-gray-600 rounded bg-gray-700 text-white" required />
        <input type="password" name="password" placeholder="Password" class="p-2 border border-gray-600 rounded bg-gray-700 text-white" required />
        <div class="flex gap-2">
          <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded w-full">Login</button>
          <button type="button" onclick="window.route('/register')" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded w-full">Create Account</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('login-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    // TODO: Implement actual login API call
    console.log("Login payload", payload);
    alert("Login not yet implemented.");
  });
}

function renderRegister() {
  setContent(`
    <div class="max-w-md mx-auto mt-10 p-6 bg-gray-800 rounded-lg shadow">
      <h1 class="text-xl font-bold mb-4">Create Account</h1>
      <form id="register-form" class="flex flex-col gap-4">
        <input name="display_name" type="text" placeholder="Public Name" required class="p-2 border border-gray-600 rounded bg-gray-700 text-white" />
        <input name="email" type="email" placeholder="Email" required class="p-2 border border-gray-600 rounded bg-gray-700 text-white" />
        <input name="password" type="password" placeholder="Password" required class="p-2 border border-gray-600 rounded bg-gray-700 text-white" />
        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Register</button>
      </form>
    </div>
  `);

  const form = document.getElementById('register-form')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form as HTMLFormElement);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
      display_name: formData.get('display_name'),
    };

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert('Account created!');
        route('/login');
      } else {
        const msg = await res.text();
        alert('Error: ' + msg);
      }
    } catch (err) {
      console.error("Registration error:", err);
      alert("An error occurred during registration.");
    }
  });
}
function renderLocal1v1() {
  const p1 = localStorage.getItem("p1") || "P1";
  const p2 = localStorage.getItem("p2") || "P2";
  const s1 = localStorage.getItem("p1Score") || "0";
  const s2 = localStorage.getItem("p2Score") || "0";

  setContent(`
    <div class="text-center mt-10">
      <h1 class="text-3xl font-bold mb-4">Local 1v1</h1>
      <div class="flex justify-between items-center max-w-2xl mx-auto mb-6 text-xl font-semibold">
        <span>${p1}: ${s1}</span>
        <div id="pong-root" class="w-64 h-40 border-2 border-white bg-black text-white flex items-center justify-center"></div>
        <span>${p2}: ${s2}</span>
      </div>
    </div>
  `);
  const container = document.getElementById('pong-root');
  if (container) {
    initPongGame(container);
  }
}


function renderProfile() {
  setContent('<div class="p-4">User Profile (WIP)</div>');
}

function renderGame() {
  setContent('<div class="p-4">Game Placeholder (WIP)</div>');
}

function renderMain() {
  const alias = localStorage.getItem("alias") || "Guest";
  setContent(`<div class="p-10 text-center text-white text-xl">Main Page — Welcome ${alias}</div>`);
}

function renderNotFound() {
  setContent('<div class="p-10 text-red-500 text-xl">404: Page not found</div>');
}

// --- Chat ---
function renderChat() {
  setContent(`
    <div class="p-4">
      <h2 class="text-xl font-semibold mb-2">Chat Room</h2>
      <div id="chatBox" class="border rounded p-2 mb-2 h-60 overflow-y-auto"></div>
      <input id="alias" placeholder="Alias" class="border p-1 mr-1" />
      <input id="message" placeholder="Message" class="border p-1 mr-1" />
      <button class="bg-blue-500 text-white px-2 py-1" onclick="submitMessage()">Send</button>
    </div>
  `);
  updateChatBox();
}

async function updateChatBox() {
  const chatBox = document.getElementById('chatBox');
  if (!chatBox) return;

  const messages = await getMessages();
  chatBox.innerHTML = messages.map(msg => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div><span class="text-gray-400">[${timestamp}]</span> <strong>${msg.alias}</strong>: ${msg.message}</div>`;
  }).join('');

  // Auto-scroll to bottom
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Global bindings
(window as any).route = route;
(window as any).submitMessage = async function () {
  const alias = (document.getElementById('alias') as HTMLInputElement)?.value;
  const message = (document.getElementById('message') as HTMLInputElement)?.value;
  if (!alias || !message) return;
  await sendMessage(alias, message);
  updateChatBox();
};

(window as any).submitMessage = async function () {
  const alias = localStorage.getItem("alias") || "Anonymous";
  const input = document.getElementById('messageInput') as HTMLInputElement;
  const message = input?.value.trim();
  if (!message) return;
  await sendMessage(alias, message);
  input.value = '';
  updateChatBox();
};

// --- Initialize ---
handleLocation();
