import { initPongGame } from "./pong/pong.js";

//FRONTEND Typescript Tailwind
const app = document.getElementById('app');


function setContent(html: string) {
  if (app) app.innerHTML = html;
}

async function route(path: string) {
  history.pushState({}, '', path);
  handleLocation();
}

window.addEventListener('popstate', () => {
  handleLocation();
});


type RouteMap = { [path: string]: () => void | Promise<void> };

const routes: RouteMap = {
  '/': renderEntryPage,
  '/home': renderHome,
  '/local': renderLocal1v1,
  '/login': renderLogin,
  '/register': renderRegister,
  '/profile': renderProfile,
  '/play': renderGame,
  '/chat': renderChat,
  '/main': renderMain,
};

async function handleLocation() {
  const path = window.location.pathname;
  if (path.startsWith('/profile/')) {
    const id = parseInt(path.split('/')[2]);
    await renderUserProfile(id);
    return;
  }
  const page = routes[path] || renderNotFound;
  await page();
}

// --- Entry Page (landing) ---
function renderEntryPage() {
  const userName = localStorage.getItem("display_name");
  const token = localStorage.getItem('token');

  let identification = "";

  if (token) {
    identification = `
      <div class="p-4">
        <h1 class="text-2xl font-bold">Hello, ${escapeHtml(userName || 'User')}!</h1>
        <p class="mt-2">You are logged in.</p>
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
        <button onclick="renderUsers()" class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
          See Users
        </button>
        <div id="users-list" class="mt-6 max-w-2xl mx-auto"></div>
      </div>
    </div>
  `);

  document.getElementById('logout')?.addEventListener('click', logout);
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
  const token = localStorage.getItem('token');
  if (token) {
    alert("You are already logged in");
    route('/profile');
  }

  setContent(`
    <h1 class="text-xl font-bold">Login</h1>
    <form id="login-form" class="flex flex-col gap-2 mt-4">
      <input type="email" name="email" placeholder="Email" class="p-2 border text-black" />
      <input type="password" name="password" placeholder="Password" class="p-2 border text-black" />
      <button type="submit" class="bg-blue-600 text-white px-4 py-2">Submit</button>
      <button type="button" onclick="route('/register')" class="m-2 bg-green-500 text-white px-4 py-2 rounded">Create Account</button>
    </form>
  `);

  document.getElementById('login-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const payload = {
      email: formData.get('email')?.toString().trim(),
      password: formData.get('password')?.toString().trim()
    };

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {

        const data = await res.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.user_id);
        localStorage.setItem('display_name', data.display_name);
        alert('Login successful!');
        route('/profile');
      } else {
        const msg = await res.text();
        alert('Error: ' + msg);
      }
    } catch (err) {
      alert('Network error');
      console.error(err);
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


async function renderRegister() {
    setContent(`
    <h1>Create Account</h1>
    <form id="register-form" class="flex flex-col gap-2 mt-4">
      <input name="display_name" type="text" placeholder="Public Name" required class="p-2 border text-black" />
      <input name="email" type="email" placeholder="Email" required class="p-2 border text-black" />
      <input name="password" type="password" placeholder="Password" required class="p-2 border text-black" />
      <input name="avatar" type="file" accept="image/*" class="p-2 border" />
      <button type="submit" class="bg-green-600 text-white px-4 py-2">Register</button>
    </form>
  `);

  const form = document.getElementById('register-form') as HTMLFormElement;

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
  
    const formData = new FormData(form);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        body: formData
      });
  
      if (res.ok) {
        alert('Account created!');
        await route('/profile');
      } else {
        const msg = await res.text();
        alert('Error: ' + msg);
      }
    } catch (err) {
      alert('Network error');
      console.error(err);
    }
  });
}

interface User {
  id: number;
  display_name: string;
  avatar_url: string;
  account_status: string;
  created_at: string;
  last_online: string; 
}

async function renderProfile() {
  const token = localStorage.getItem('token');
  if (!token) {
    alert("Please login");
    return route('/login');
  }

  const res = await fetch('/api/profile', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    setContent(`<div class="text-white-600">Not authorized to view this page.</div>`);
    return;
  }

  const user = await res.json();
  localStorage.setItem("userId", user.id);
  localStorage.setItem("display_name", user.display_name);

  setContent(`
    <div class="flex justify-between items-start p-4">
      <a href="/" data-link class="text-gray-400 hover:underline">Home</a>
    </div>

    <div class="max-w-xl mx-auto mt-10 bg-white p-6 rounded-lg shadow-md text-center space-y-4">
      <img src="${user.avatar_url}" alt="Avatar" class="w-24 h-24 rounded-full mx-auto shadow" />
      <h2 class="text-2xl font-bold text-gray-800">${user.display_name}</h2>
      <p class="text-sm text-gray-500">${user.email}</p>
      <span class="inline-block text-xs px-2 py-1 rounded-full ${
        user.account_status === 'online'
          ? 'bg-green-200 text-green-800'
          : user.account_status === 'offline'
          ? 'bg-gray-200 text-gray-600'
          : 'bg-red-200 text-red-700'
      }">${user.account_status}</span>
      <div class="text-sm text-gray-600">
        <p><strong>Joined: </strong> ${new Date(user.created_at).toLocaleString()}</p>
        <p><strong>Last Online: </strong> Online now</p>
      </div>
      <button id="edit-profile-btn" class="bg-blue-600 text-white px-4 py-2 rounded">Edit Profile</button>

      <button type="button" id="logout" class="bg-gray-400 text-white px-4 py-2 rounded">Logout</button>

      <div class="mt-10">
        <button onclick="renderUsers()" class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
          Find New Friends
        </button>
      <div id="users-list" class="mt-6 max-w-2xl mx-auto"></div>
      </div>

      <button id="delete-profile-btn" class="bg-gray-400 text-white px-4 py-2 rounded">Delete Account</button>
   
    </div>
  `);

  document.getElementById('edit-profile-btn')?.addEventListener('click', () => renderProfileEdit(user));
  document.getElementById('logout')?.addEventListener('click', logout);
  document.getElementById('delete-profile-btn')?.addEventListener('click', async () => {
    const confirmed = confirm('Are you sure you want to delete your profile? This action cannot be undone.');
    if (!confirmed) return;

    try {
      const res = await fetch('/api/delete-account', {
        method: 'DELETE',
        headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        localStorage.clear();
        alert('Your account has been deleted.');
        route('/');
      } else {
        const error = await res.text();
        alert('Error: ' + error);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while deleting account.');
    }
  });
}


function renderProfileEdit(user: any) {
  setContent(`
    <form id="profile-form" class="max-w-xl mx-auto mt-10 bg-white p-6 rounded-lg shadow-md space-y-4 text-center">
      <img src="${escapeHtml(user.avatar_url)}" alt="Avatar" class="w-24 h-24 rounded-full mx-auto shadow" />
      
      <input 
        name="display_name" 
        value="${escapeHtml(user.display_name)}" 
        placeholder="New display name" 
        class="w-full border p-2 rounded text-black"
        required 
      />

      <input 
        name="avatar" 
        type="file" 
        accept="image/*" 
        class="w-full p-2 border rounded" 
      />

      <div class="flex justify-center space-x-4">
        <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Save</button>
        <button type="button" id="cancel-edit" class="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500">Cancel</button>
      </div>
    </form>
  `);

  // Cancel button handler
  document.getElementById('cancel-edit')?.addEventListener('click', () => renderProfile());

  // Avatar preview
  const avatarInput = document.querySelector<HTMLInputElement>('input[name="avatar"]');
  avatarInput?.addEventListener('change', () => {
    const file = avatarInput.files?.[0];
    if (file) {
      const img = document.querySelector<HTMLImageElement>('form img');
      if (img) img.src = URL.createObjectURL(file);
    }
  });

  // Form submit
  const form = document.getElementById('profile-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = new FormData(form);
    const newName = data.get("display_name")?.toString().trim();
    const avatarFile = data.get("avatar") as File | null;

    const nameChanged = newName && newName !== user.display_name;
    const avatarChanged = avatarFile instanceof File && avatarFile.size > 0;

    if (!nameChanged && !avatarChanged) {
      alert("Nothing changed.");
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      alert("You are not authenticated.");
      return;
    }

    try {

      if (!nameChanged) {
        data.delete("display_name");
      }
      if (!avatarChanged) {
        data.delete("avatar");
      }      

      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: data
      });

      if (res.ok) {
        const result = await res.json();
        localStorage.setItem('display_name', result.user.display_name);
        alert('Profile updated!');
        renderProfile();
      } else {
        const msg = await res.text();
        alert('Error: ' + msg);
      }
    } catch (err) {
      alert("Something went wrong while updating your profile.");
      console.error(err);
    }
  });
}

async function logout(): Promise<void> {
  try {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token');
    
    if (!userId) {
      throw new Error('No user ID found');
    }
    if (!token) {
      alert("Please login");
      return route('/login');
    }

    const response = await fetch('/api/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    localStorage.clear(); 
    
    window.location.href = '/';
  } catch (err) {
    console.error('Logout failed:', err instanceof Error ? err.message : err);
    alert('Logout failed. Please try again.');
  }
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

async function updateCounter() {
  const span = document.getElementById("counterDisplay");
  if (!span) return;
  const res = await fetch("/api/count?id=main-counter");
  const data = await res.json();
  span.textContent = data.count;
}

(window as any).incrementCounter = async function () {
  await fetch("/api/increment?id=main-counter", { method: "POST" });
  updateCounter();
};

// async function fetchAllUsers(): Promise<User[]> {
//   const res = await fetch('/api/users');

//   if (!res.ok) throw new Error('Failed to fetch users');
//   return await res.json();
// }

function getUserInfo() {
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const displayName = localStorage.getItem("display_name");
  const alias = localStorage.getItem("alias");

  if (token && userId) {
    return { type: "loggedInUser", userId, displayName, token };
  } else if (alias) {
    return { type: "visitor", alias };
  } else {
    return { type: "anonymous" };
  }
}

async function renderUserProfile(userId: number) {

  
  setContent(`<div class="text-center text-xl">Loading profile...</div>`);

  try {
    const res = await fetch(`/api/user/${userId}`);
    if (!res.ok) throw new Error("User not found");
    const { user, stats } = await res.json();
    const formatDate = (d: string) => new Date(d).toLocaleString();

    const currUser = getUserInfo();
    const isSelf = userId.toString() === localStorage.getItem("userId");
    let friendButtons = "";
    let statsForm = "";
    let goProfile = "";

    if (currUser.type === "loggedInUser") {
      if (Array.isArray(stats) && stats.length) {
        statsForm = `
          <h2 class="text-xl font-semibold mb-2">Recent Matches</h2>
          <ul class="space-y-2">
            ${stats.map((match: any) => `
              <li class="bg-gray-700 px-4 py-2 rounded flex justify-between">
                <span>${(match?.result || 'N/A').toUpperCase()} vs User #${match?.opponent_id ?? '?'}</span>
                <span>Score: ${match?.score ?? '-'}</span>
              </li>
            `).join('')}
          </ul>`;
      }
 
        if (!isSelf){
          if (user.friend_status === "adding"){
            friendButtons = `
              <div class="text-white-600">This user has sent you a friend request</div>
              <div class="flex gap-2 mb-8">
              <button class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded" onclick="window.acceptFriend(${user.id})">Accept</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
            </div>`}
          else if (user.friend_status === "pending"){
              friendButtons = `
                <div class="text-white-600">Awaiting response to your friend request.</div>
                <div class="flex gap-2 mb-8">
                <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.cancelAction(${user.id})">Cancel request</button>
                <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
                <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              </div>`}
          else if (user.friend_status === "accepted" || user.friend_status === "added") {
            friendButtons = `
            <div class="text-white-600">You are friends.</div>
            <div class="flex gap-2 mb-8">
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.cancelAction(${user.id})">Unfriend</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
            </div>`}
            else if (user.friend_status === "blocked"){
                  friendButtons = `
                  <div class="flex gap-2 mb-8">
                  <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.cancelAction(${user.id})">Unblock</button>
                  </div>`} 
            else if (!user.friend_status){
                friendButtons = `
                <div class="flex gap-2 mb-8">
                  <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded" onclick="window.addFriend(${user.id})">Add Friend</button>
                  <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
                  <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
                </div>`}
         }
         else {
              goProfile = `<a href="/profile" data-link class="text-white-400 hover:underline">Manage your profile</a>`}   
      }

     setContent(`
      <div class="max-w-3xl mx-auto p-6 bg-gray-800 rounded-xl shadow-xl">
        <div class="flex items-center gap-6 mb-6">
          <img src="${user.avatar_url}" class="w-24 h-24 rounded-full border-4 border-indigo-500" />
          <div>
            <h1 class="text-3xl font-bold">${user.display_name}</h1>
            <p class="text-sm text-gray-400">Status: ${user.account_status}</p>
            <p class="text-sm text-gray-400">Created: ${formatDate(user.created_at)}</p>
            <p class="text-sm text-gray-400">Last Online: ${formatDate(user.last_online)}</p>
          </div>
        </div>

        <div class="flex gap-4 mb-6">
          <div class="bg-gray-700 px-4 py-2 rounded">🏆 Wins: <strong>${user.wins}</strong></div>
          <div class="bg-gray-700 px-4 py-2 rounded">💥 Losses: <strong>${user.losses}</strong></div>
        </div>

        ${friendButtons}
        ${goProfile}
        ${statsForm}

      </div>`)}
    catch (err) {
      setContent(`<div class="text-red-500 text-center">Failed to load profile.</div>`);
  }
}

(window as any).addFriend = async (id: number) => {
  await fetch(`/api/friends/${id}/add`, { method: 'POST' });
  alert("Friend request sent.");
  await renderUserProfile(id);
};

(window as any).cancelAction = async (id: number) => {
  await fetch(`/api/friends/${id}/cancelAction`, { method: 'POST' });
  alert("Action canceled.");
  await renderUserProfile(id);
};

(window as any).acceptFriend = async (id: number) => {
  await fetch(`/api/friends/${id}/accept`, { method: 'POST' });
  alert("Friend request accepted.");
  await renderUserProfile(id);
};

(window as any).blockUser = async (id: number) => {
  await fetch(`/api/friends/${id}/block`, { method: 'POST' });
  alert("User blocked.");
  await renderUserProfile(id);
};
(window as any).inviteToPlay = async (id: number) => {
  renderHome();
};


async function renderUserList() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="text-center text-xl">Loading users...</div>`;

  const currUser = getUserInfo();

  try {
    const res = await fetch('/api/users');

    const users = await res.json();
    if (!users.length) {
      app.innerHTML = `<div class="text-center text-xl">No registered users</div>`;
      return;
    }
    const currUser = getUserInfo();
    
    app.innerHTML = `
      <div class="max-w-4xl mx-auto p-4">
        <h1 class="text-2xl font-bold mb-4">Users</h1>
        <ul class="space-y-3">
          ${users.map((u: any) => {
            let friendStatusHTML = '';
            const isSelf = u.id.toString() === currUser.userId;
            if (isSelf){
              friendStatusHTML = `<div class="text-sm text-gray-400">You </div>`;
            }

            if (u.friend_status && currUser.type === "loggedInUser") {
         
              if (u.friend_status == 'blocking'){
                friendStatusHTML = ``;
                }
              else {
                friendStatusHTML = `<div class="text-sm text-gray-400">Friendship: ${u.friend_status}</div>`;
              }
            }
            return `
              <li class="bg-gray-800 p-4 rounded shadow flex items-center space-x-4">
                <img src="${u.avatar_url}" class="w-24 h-24 rounded-full border-4 border-indigo-500" />
                <div class="flex-1">
                  <div class="font-semibold">${u.display_name}</div>
                  <div class="text-sm text-gray-400">Status: ${u.account_status}</div>
                  <div class="text-sm text-gray-400">Joined: ${new Date(u.created_at).toLocaleDateString()}</div>
                  <div class="text-sm text-gray-400">Last online: ${new Date(u.last_online).toLocaleDateString()}</div>
                  <div class="text-sm">🏆 ${u.wins} Wins / 💥 ${u.losses} Losses</div>
                  ${friendStatusHTML}
                </div>
                <a href="/profile/${u.id}" data-link class="text-blue-400 hover:underline">View Profile</a>
              </li>`;
          }).join('')}
        </ul>
      </div>
    `;
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="text-red-500 text-center">Failed to load users</div>`;
  }
}


// window.addEventListener('beforeunload', () => {
//   const userId = localStorage.getItem('userId');
//   if (sessionStorage.getItem('isReloading')) {
//     return;
//   }

//   if (userId) {
//     const data = new FormData();
//     data.append('userId', userId);

//     navigator.sendBeacon('/api/logout', data);
//   }

//   localStorage.removeItem('token');
//   localStorage.removeItem('userId');
//   localStorage.removeItem('alias');
// });

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}


// --- Initialize ---
handleLocation();



// Global bindings
(window as any).route = route;
(window as any).renderUsers = renderUserList;
(window as any).submitMessage = async function () {
  const alias = (document.getElementById('alias') as HTMLInputElement)?.value;
  const message = (document.getElementById('message') as HTMLInputElement)?.value;
  if (!alias || !message) return;
  await sendMessage(alias, message);
  updateChatBox();
};