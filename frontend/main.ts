//FRONTEND main Typescript Tailwind
import { renderUserList, renderUserProfile } from './users/userManagement.js';
import { renderEntryPage, renderHome, renderLocal1v1, updateCounter,sendMessage, updateChatBox } from './pages/pages.js';
import { route, handleLocation } from './router.js';

//const app = document.getElementById('app');

console.log("Main loaded ✅");


window.addEventListener('popstate', () => {
	handleLocation();
});

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

(window as any).incrementCounter = async function () {
	await fetch("/api/increment?id=main-counter", { method: "POST" });
	updateCounter();
};

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

// window.addEventListener('beforeunload', () => {
//   const userId = localStorage.getItem('userId');
//   if (sessionStorage.getItem('isReloading')) {
//     return;
//   }
//
//   if (userId) {
//     const data = new FormData();
//     data.append('userId', userId);
//
//     navigator.sendBeacon('/api/logout', data);
//   }
//
//   localStorage.removeItem('token');
//   localStorage.removeItem('userId');
//   localStorage.removeItem('alias');
// });


// --- Initialize ---
handleLocation();

// Global bindings
(window as any).route = route;
(window as any).renderUsers = renderUserList;

// Block visitors from posting; backend derives alias from JWT
(window as any).submitMessage = async function () {
  const input = document.getElementById('messageInput') as HTMLInputElement;
  const message = input?.value.trim();
  if (!message) return;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",              // send the JWT cookie
    body: JSON.stringify({ message }),   // server derives alias from JWT
  });

  if (res.status === 401) {
    alert("Please log in to use the chat.");
    return;
  }
  if (!res.ok) {
    alert("Failed to send message.");
    return;
  }

  input.value = "";
  updateChatBox();
};