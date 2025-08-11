import { getUserInfo, logout } from '../users/userManagement.js';
import { setContent, escapeHtml} from '../utility.js';
import { initPongGame } from "../pong/pong.js";

// --- Entry Page (landing) ---
export function renderEntryPage() {
	const userName = localStorage.getItem("displayName");
	const userId = localStorage.getItem('user.id');

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
export function renderHome() {
	const alias = localStorage.getItem("alias") || "Guest";
	let userHtml = '';

	const userInfo = getUserInfo();

	try { localStorage.removeItem('game.inProgress'); } catch {}
	// Restore default body layout after tournament
	document.body.style.display = '';
	document.body.style.height = '';
	document.body.style.alignItems = '';
	document.body.style.justifyContent = '';
	if (userInfo.type === 'loggedInUser'){
		userHtml = `<a href="/profile" data-link class="text-blue-500 hover:underline">You are logged in</a>
				<button type="button" id="logout" class="mt-4 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500">
					Logout and continue as guest
				</button>`;
	  }

	setContent(`
		<!-- Floating Chat Box -->
		<div class="fixed top-4 right-4 w-80 max-w-full sm:w-72 bg-gray-800 text-white rounded shadow-lg z-50 text-sm sm:text-base">
			<div class="p-2 border-b border-gray-700 font-semibold">Chat Room</div>
			<div id="chatBox" class="p-2 h-60 sm:h-52 overflow-y-auto text-sm break-words"></div>
			<div class="p-2 flex gap-1">
				<input id="messageInput"
					placeholder="Log in to chat"
					disabled
					class="flex-1 px-2 py-1 rounded text-black"
					onkeydown="if(event.key === 'Enter'){ submitMessage(); }" />
				<button onclick="submitMessage()" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded" disabled title="Log in to use the chat">Send</button>
			</div>
		</div>

		<!-- Main Page -->
		<div class="flex justify-between items-start p-4">
			<a href="/profile" onclick="route('/profile')" class="text-gray-400 hover:text-white">User Profile</a>
		</div>

		<div class="flex flex-col items-center mt-10 space-y-10">
			<h1 class="text-4xl font-bold">Transcendence</h1>

			${userHtml} 

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
					<button onclick="startTournamentSetup()" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Local Tournament</button>
				</div>
			</div>
		</div>

		<!-- Counter Button -->
		<div class="fixed bottom-4 left-4 flex items-center gap-2 bg-gray-800 p-2 rounded">
			<button onclick="incrementCounter()" class="bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-600">Counter</button>
			<span id="counterDisplay" class="text-white text-lg">...</span>
		</div>
	`);

	// Enable chat controls if the user is authenticated (JWT cookie)
	(async () => {
		try {
			const resp = await fetch('/api/profile', { credentials: 'include' });
			if (resp.ok) {
				const input = document.getElementById('messageInput') as HTMLInputElement | null;
				const btn = document.querySelector('button[onclick="submitMessage()"]') as HTMLButtonElement | null;
				if (input) {
					input.removeAttribute('disabled');
					input.placeholder = 'Message';
				}
				if (btn) {
					btn.removeAttribute('disabled');
					btn.removeAttribute('title');
				}
			}
		} catch (_) {
			// remain disabled if not authenticated
		}
	})();

	document.getElementById('logout')?.addEventListener('click', logout);
	updateChatBox();
	setInterval(updateChatBox, 3000);
	updateCounter(); // Fetch counter on load
}

// --- API Helpers ---
export async function getCount(id: string): Promise<number> {
	const res = await fetch(`/api/count?id=${id}`);
	const data = await res.json();
	return data.count;
}

export async function incrementCount(id: string): Promise<number> {
	const res = await fetch(`/api/increment?id=${id}`, { method: 'POST' });
	const data = await res.json();
	return data.count;
}

export async function getMessages(): Promise<any[]> {
	const res = await fetch('/api/chat');
	return await res.json();
}

// Keep this function but note: backend now requires auth and derives alias.
// If you call this elsewhere, it should be from a logged-in state.
export async function sendMessage(alias: string, message: string): Promise<any> {
	const res = await fetch('/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',                 // make sure cookie goes with it
		body: JSON.stringify({ message })       // alias ignored; server uses JWT user
	});
	return await res.json();
}

export async function sendPrivateMessage(recipientId: number, message: string): Promise<any> {
	const res = await fetch('/api/chat/private', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ recipient_id: recipientId, message })
	});
	return await res.json();
}

// --- Page Stubs ---
export async function renderLocal1v1() {
  // Use Option A layout override and mark 1v1 in progress
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'local'); } catch {}

  // Left = opponent alias (p1), Right = you (p2).
  const leftName  = localStorage.getItem("p1") || "P1";
  const rightName = localStorage.getItem("p2") || (localStorage.getItem("display_name") || localStorage.getItem("alias") || "P2");
  const s1 = localStorage.getItem("p1Score") || "0";
  const s2 = localStorage.getItem("p2Score") || "0";

  setContent(`
    <div class="relative text-center mt-10">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-4">Local 1v1</h1>

      <div class="flex justify-between items-center max-w-6xl mx-auto mb-4 px-8 text-xl font-semibold text-white">
        <div id="player1-info" class="text-left w-1/3">${escapeHtml(leftName)}: ${escapeHtml(s1)}</div>
        <button id="replay-btn" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded">Replay</button>
        <div id="player2-info" class="text-right w-1/3">${escapeHtml(rightName)}: ${escapeHtml(s2)}</div>
      </div>

      <div class="flex justify-center">
        <div id="pong-root" class="border-2 border-white bg-black"></div>
      </div>
    </div>
  `);

  const container = document.getElementById("pong-root");
  if (container) {
    initPongGame(container, () => {
      // 1v1 finished — clear the flag
      try { localStorage.removeItem('game.inProgress'); } catch {}
    });
  }

  const replayBtn = document.getElementById("replay-btn") as HTMLButtonElement | null;
  if (replayBtn) {
    replayBtn.onclick = () => {
      localStorage.setItem("p1Score", "0");
      localStorage.setItem("p2Score", "0");
      const container = document.getElementById("pong-root");
      if (container) initPongGame(container);
    };
  }

  // Explicitly mark tournament UI inactive when in 1v1
  try { (window as any).tournament && ((window as any).tournament.uiActive = false); } catch {}
}


export function renderGame() {
	setContent('<div class="p-4">Game Placeholder (WIP)</div>');
}

export function renderMain() {
	const alias = localStorage.getItem("alias") || "Guest";
	setContent(`<div class="p-10 text-center text-white text-xl">Main Page — Welcome ${alias}</div>`);
}


// --- Chat ---
export function renderChat() {
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

let knownUserSet: Set<string> | null = null;

async function loadKnownUsers() {
	if (knownUserSet) return; // already loaded

	try {
		const res = await fetch('/api/users');
		const users = await res.json();
		knownUserSet = new Set(users.map((u: any) => u.displayName));
	} catch (err) {
		console.error("Failed to load known users", err);
		knownUserSet = new Set(); // fallback
	}
}

export async function updateChatBox() {
	const chatBox = document.getElementById('chatBox');
	if (!chatBox) return;

	await loadKnownUsers();

	const messages = await getMessages();

	chatBox.innerHTML = messages.map(msg => {
		const timestamp = new Date(msg.timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
		});

		const isRegisteredUser = knownUserSet?.has(msg.alias);

		const aliasHTML = (isRegisteredUser && msg.user_id)
			? `<a href="/profile/${msg.user_id}" data-link class="text-blue-400 hover:underline">${msg.alias}</a>`
			: `<strong>${msg.alias}</strong>`;

		return `<div><span class="text-gray-400">[${timestamp}]</span> ${aliasHTML}: ${msg.message}</div>`;
	}).join('');

	chatBox.scrollTop = chatBox.scrollHeight;
}

export async function updateCounter() {
	const span = document.getElementById("counterDisplay");
	if (!span) return;
	const res = await fetch("/api/count?id=main-counter");
	const data = await res.json();
	span.textContent = data.count;
}

export async function renderTournament() {
  // Mark UI active so pong:gameend listener advances bracket.
  try { (window as any).tournament && ((window as any).tournament.uiActive = true); } catch {}

  const s1 = localStorage.getItem("p1Score") || "0";
  const s2 = localStorage.getItem("p2Score") || "0";
  const leftName  = localStorage.getItem("p1") || "—";
  const rightName = localStorage.getItem("p2") || "—";

  //ensure ui for tournament.
  document.body.style.display = 'block';
  document.body.style.height = 'auto';
  document.body.style.alignItems = '';
  document.body.style.justifyContent = '';
  try { localStorage.setItem('game.inProgress', 'tournament'); } catch {}

  setContent(`
    <div class="relative mt-10 min-h-screen text-white">
      <a href="/home" onclick="route('/home')" class="absolute top-0 left-0 ml-4 bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm">← Home</a>
      <h1 class="text-3xl font-bold mb-4 text-center">Local Tournament</h1>

      <!-- Sticky player header -->
      <div id="scorebar" class="sticky top-0 z-20 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/50 py-2">
        <div class="flex justify-between items-center max-w-6xl mx-auto px-8 text-xl font-semibold">
          <div id="player1-info" class="text-left w-1/3">${escapeHtml(leftName)}: ${escapeHtml(s1)}</div>
          <div class="text-gray-300 text-base">Current Match</div>
          <div id="player2-info" class="text-right w-1/3">${escapeHtml(rightName)}: ${escapeHtml(s2)}</div>
        </div>
      </div>

      <div id="pong-wrap" class="flex justify-center pt-4">
        <div id="pong-root" class="border-2 border-white bg-black"></div>
      </div>

      <div class="max-w-6xl mx-auto text-left mt-8">
        <div class="text-sm text-gray-300 mb-2">tournament state:</div>
        <div class="rounded-lg border border-white/10 bg-black/30 p-3">
          <div id="tournament-state"
               class="overflow-x-auto overflow-y-auto text-sm leading-6 space-y-4 max-h-[45vh]"
               style="max-height:45vh;"></div>
        </div>
      </div>
    </div>
  `);

  // IMPORTANT: nuke any inline styles left by previous dynamic offset code
  document.getElementById('pong-wrap')?.removeAttribute('style');

  const container = document.getElementById("pong-root");
  if (container) {
    // Rely on the global 'pong:gameend' listener gated by uiActive.
    initPongGame(container);
  }

  // Render current bracket
  try { (window as any).updateTournamentStateDOM?.(); } catch {}
}
