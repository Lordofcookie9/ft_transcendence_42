import { logout } from '../users/userManagement.js';
import { setContent, escapeHtml} from '../utility.js';
import { initPongGame } from "../pong/pong.js";

// --- Entry Page (landing) ---
export function renderEntryPage() {
	const userName = localStorage.getItem("display_name");
	const token = localStorage.getItem('token');

	let identification = "";

	if (token) {
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
				<h2 class="text-lg font-semibold">Continue as Visitor</h2>
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

		<!-- Counter Button -->
		<div class="fixed bottom-4 left-4 flex items-center gap-2 bg-gray-800 p-2 rounded">
			<button onclick="incrementCounter()" class="bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-600">Counter</button>
			<span id="counterDisplay" class="text-white text-lg">...</span>
		</div>
	`);

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

export async function sendMessage(alias: string, message: string): Promise<any> {
	const res = await fetch('/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ alias, message })
	});
	return await res.json();
}

// --- Page Stubs ---

export function renderLocal1v1() {
	const p1 = localStorage.getItem("p1") || "P1";
	const p2 = localStorage.getItem("p2") || "P2";
	const s1 = localStorage.getItem("p1Score") || "0";
	const s2 = localStorage.getItem("p2Score") || "0";

	setContent(`
		<div class="text-center mt-10">
		  <h1 class="text-3xl font-bold mb-4">Local 1v1</h1>
		  <div class="flex justify-between items-center max-w-2xl mx-auto mb-6 text-xl font-semibold">
			<span>${p1}: ${s1}</span>
			<div class="w-64 h-40 border-2 border-white bg-black text-white flex items-center justify-center">
			  <div id="pong-root" class="w-64 h-40 border-2 border-white bg-black text-white flex items-center justify-center"></div>
			</div>
			<span>${p2}: ${s2}</span>
		  </div>
		</div>
	  `);
		const container = document.getElementById('pong-root');
		if (container)
		{
			initPongGame(container);
		}
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

export async function updateChatBox() {
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

export async function updateCounter() {
	const span = document.getElementById("counterDisplay");
	if (!span) return;
	const res = await fetch("/api/count?id=main-counter");
	const data = await res.json();
	span.textContent = data.count;
}
