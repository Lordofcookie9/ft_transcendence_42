import { sendPrivateMessage } from '../pages/pages.js';
import { setContent } from '../utility.js';
import { route } from '../router.js';


import { renderEntryPage } from '../pages/pages.js';


export async function renderRegister() {
	setContent(`
		<h1>Create Account</h1>
		<form id="register-form" class="flex flex-col gap-2 mt-4">
			<input name="display_name" type="text" placeholder="Public Name" required minlength="1" class="p-2 border text-black" />
			<input name="email" type="email" placeholder="Email" required class="p-2 border text-black" />
			<input name="password" type="password" placeholder="Password" required minlength="8" pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@$!%*?&amp;]).{8,}$"
 				title="Must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character '@$!%*?'" class="p-2 border text-black" />
			<input name="avatar" type="file" accept="image/*" class="p-2 border" />

			<label class="flex items-center gap-2">
				<input type="checkbox" id="enable-2fa" /> Enable 2FA
			</label>

			<div id="2fa-options" class="hidden flex-col gap-2 border p-2">
				<label>
					<input type="radio" name="twofa_method" value="email" /> Email
				</label>
				<label>
					<input type="radio" name="twofa_method" value="app" /> Authenticator App
				</label>
			</div>

			<button type="submit" class="bg-green-600 text-white px-4 py-2">Register</button>
		</form>
	`);

	const form = document.getElementById('register-form') as HTMLFormElement;
	const enable2FA = document.getElementById('enable-2fa') as HTMLInputElement;
	const twoFAOptions = document.getElementById('2fa-options') as HTMLDivElement;
	let twofaVerified :number = 0;
	
	enable2FA?.addEventListener('change', () => {
		twoFAOptions.classList.toggle('hidden', !enable2FA.checked);
	});

	form?.addEventListener('submit', async (e) => {
		e.preventDefault();

		const email = (form.querySelector('[name="email"]') as HTMLInputElement).value.trim();
		const twofaMethod = enable2FA.checked ? 
			(form.querySelector('[name="twofa_method"]:checked') as HTMLInputElement)?.value : null;

		const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		if (enable2FA.checked && !twofaMethod) {
			alert('Please select a 2FA method.');
			return;
		}
		
		if (twofaMethod === 'email' && !emailPattern.test(email)) {
			alert('Valid email required for Email 2FA.');
			return;
		}

		if (twofaMethod === 'email') {
			const res = await fetch('/api/2fa/send-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ twofaMethod, email }),
			});

			if (res.ok) {
				const code = prompt(`Enter the code sent to your Email`);
				if (code) {
					const verifyRes = await fetch('/api/2fa/verify-code', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ twofaMethod, email, code}),
					});
					if (verifyRes.ok) {
						alert('Contact verified!');
						twofaVerified = 1;
					} else {
						alert('Verification failed. Please check your email address.');
					}
				} else {
					alert('Your browser seems busy. Try later.');
				}
			} else {
				alert('Error sending verification code. Try later.');
			}
		}
		
		if (twofaMethod === 'app') {
			const setupRes = await fetch('/api/2fa/send-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ twofaMethod, email })
			});
		
			if (setupRes.ok) {
				const { qrCodeDataURL } = await setupRes.json();
		
				let qrWindow = window.open('', 'QR Code', 'width=500,height=600,resizable=yes');

				if (qrWindow) {
					qrWindow.document.open();
					qrWindow.document.write(`<h3>Scan this in your Authenticator App</h3>`);
					qrWindow.document.write(`<img src="${qrCodeDataURL}" />`);
					qrWindow.document.close();
					qrWindow.focus();
				}

				const code = prompt(`Enter the 6-digit code from your Authenticator App`);
				if (code) {
					const verifyRes = await fetch('/api/2fa/verify-code', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ twofaMethod, email, code }),
					});
					if (verifyRes.ok) {
						alert('Authenticator set up successfully!');
						twofaVerified = 1;
					} else {
						alert('Verification failed.');
					}
				}
			} else {
				alert('Error setting up Authenticator App. Try later.');
			}
		}

		if (enable2FA.checked && twofaVerified !== 1) {
			alert('Please complete 2FA verification before registering.');
			return;
		  }

		const formData = new FormData(form);
		if (enable2FA.checked) {
			formData.set('enable_2fa', 'true');}
		else {
			formData.set('enable_2fa', 'false');}
		// if (!enable2FA.checked){
			
		if (enable2FA.checked && twofaMethod) {
			formData.set('twofa_method', twofaMethod);
			formData.set('twofa_verified', String(twofaVerified));
		  }

		try {
			const res = await fetch('/api/register', {
				method: 'POST',
				body: formData
			});

			if (res.ok) {
				alert('Account created!');
				const user = await res.json();
				localStorage.setItem("userId", user.id);
				localStorage.setItem("display_name", user.display_name);
				await route('/profile');
			} else {
				const msg = await res.text();
				alert('Error: ' + msg);
			}
		} catch (err) {
			console.error(err);
			alert(err instanceof Error ? err.message : 'Network error');
		}
	})
}

function renderProfileHTML(user: User) {
	return `
	<div class="flex justify-between items-start p-4">
	  <a href="/" onclick="route('/')" class="text-gray-400 hover:text-white">Home</a>
	</div>
  
	<div class="max-w-xl mx-auto mt-10 space-y-6">
	  <div class="text-center space-y-2">
		<img src="${user.avatar_url}" alt="Avatar" class="w-36 h-36 rounded-full mx-auto shadow" id="avatar-preview" />
  
		<form id="avatar-form" class="flex items-center justify-center space-x-2 mt-2">
		  <input
			id="avatar-upload"
			name="avatar"
			type="file"
			accept="image/*"
			class="hidden"
		  />
		  <label
			for="avatar-upload"
			class="cursor-pointer w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-400"
			title="Change avatar"
		  >
			📁
		  </label>
		  <button
			type="submit"
			class="text-xs text-gray-600 bg-gray-100 rounded px-2 py-0.5 hover:bg-gray-200"
		  >
			Save
		  </button>
		</form>
	  </div>
  
	  <h2 class="text-center text-white font-bold text-2xl">${user.display_name}</h2>
  
	  <div class="text-center max-w-xs mx-auto">
		<form id="name-form" class="flex items-center space-x-2">
		  <input
			type="text"
			name="display_name"
			placeholder="Enter new name"
			value=""
			class="flex-grow p-1 border border-gray-300 rounded text-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
		  />
		  <button
			type="submit"
			class="text-xs text-gray-700 bg-gray-100 rounded px-3 py-1 hover:bg-gray-200"
			title="Save new name"
		  >
			Change name
		  </button>
		</form>
	  </div>
  
	  <div class="text-center max-w-xs mx-auto space-y-1">
		<p class="text-sm text-gray-500">${user.email}</p>
			<form id="email-form" class="flex items-center space-x-2 max-w-xs mx-auto">
				<input type="email" name="email" placeholder="Enter new email" value="${user.email}" class="flex-grow p-1 border border-gray-300 rounded text-gray-600 text-sm" />
				<button type="submit" class="text-xs text-gray-700 bg-gray-100 rounded px-3 py-1 hover:bg-gray-200">Change email</button>
			</form>

		<p class="text-sm text-gray-500">
		${user.twofa_enabled 
		? `You are using 2FA ${user.twofa_method === 'email' ? 'email authentification' : 'Authenticator App'}` 
		: 'You are not using 2FA authentification'}
		</p>
	<div class="max-w-xs mx-auto border p-3 rounded bg-gray-50  text-gray-700">

		<label class="flex items-center gap-2 mb-2">
			<input type="checkbox" id="enable-2fa" ${user.twofa_enabled ? "checked" : ""}/>
			<span>Enable 2FA</span>
			${user.twofa_verified ? `<span class="text-green-600 text-sm">✅ Verified</span>` : ""}
		</label>
		<div id="2fa-options" class="${user.twofa_enabled ? "" : "hidden"} flex flex-col gap-2">
			<label>
				<input type="radio" name="twofa_method" value="email" ${user.twofa_method === 'email' ? "checked" : ""}/> Email
				<input type="radio" name="twofa_method" value="app" ${user.twofa_method === 'app' ? "checked" : ""}/> Authenticator App
			</label>
			<button id="save-2fa" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded text-sm">Save 2FA Settings</button>
		</div>
	</div>


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
  
		<button id="logout" class="bg-gray-400 text-white px-4 py-2 rounded">Logout</button>
		<button id="delete-profile-btn" class="bg-gray-400 text-white px-4 py-2 rounded">Delete Account</button>
  
		<div class="mt-10">
		  <button onclick="route('/users')" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
			Find New Friends
		  </button>
		  <div id="users-list" class="mt-6 max-w-2xl mx-auto"></div>
		</div>

			<button onclick="route('/home')" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
			Go Play Game
		</button>
	  </div>
	</div>
  `;
}

function setProfileEvents(user: User) {

	document.getElementById('logout')?.addEventListener('click', logout);
	document.getElementById('delete-profile-btn')?.addEventListener('click', async () => {
		  if (!confirm('Are you sure you want to delete your profile?')) return;
  
		  const res = await fetch('/api/delete-account', {
		  method: 'DELETE',
		  credentials: 'include',
		  });
  
		  if (res.ok) {
		  localStorage.clear();
		  alert('Account deleted.');
		  route('/');
		  } else {
		  const err = await res.text();
		  alert('Error: ' + err);
		  }
	  });
  
	document.getElementById('name-form')?.addEventListener('submit', async (e) => {
		e.preventDefault();
  
	  const form = e.target as HTMLFormElement;
	  const newName = form.display_name.value.trim();
	  const originalName = localStorage.getItem("display_name")?.trim();
  
	  if (!newName) {
		  alert("Display name cannot be empty.");
		  return;
	  }
  
	  if (newName === originalName) {
		  alert("Nothing changed.");
		  return;
	  }
  
	  try {const res = await fetch('/api/name', {
		  method: 'PATCH',
		  credentials: 'include',
		  headers: {
			  'Content-Type': 'application/json',
		  },
		  body: JSON.stringify({ display_name: newName })
		  });
  
		  if (res.ok) {
		  const result = await res.json();
		  localStorage.setItem('display_name', result.user.display_name);
		  alert('Name updated!');
		  renderProfile();
		  } else {
		  const msg = await res.text();
		  alert('Error: ' + msg);
		  }
	  } catch (err) {
		  console.error(err);
		  alert("Something went wrong while updating your profile.");
	  }
	  });
  
	// Avatar preview
	const avatarInput = document.querySelector<HTMLInputElement>('input[name="avatar"]');
	avatarInput?.addEventListener('change', () => {
	  const file = avatarInput.files?.[0];
	  if (file) {
		const img = document.getElementById('avatar-preview') as HTMLImageElement;
		img.src = URL.createObjectURL(file);
	  }
	});
  
	// Avatar update
	const avatarForm = document.getElementById('avatar-form') as HTMLFormElement;
	avatarForm?.addEventListener('submit', async (e) => {
	  e.preventDefault();
	  const formData = new FormData(avatarForm);
	  const file = formData.get('avatar') as File;
  
	  if (!file || file.size === 0) {
		alert('Nothing changed.');
		return;
	  }
  
	  const res = await fetch('/api/avatar', {
		method: 'PATCH',
		credentials: 'include',
		body: formData
	  });
  
	  if (res.ok) {
		alert('Avatar updated.');
		renderProfile();
	  } else {
		const msg = await res.text();
		alert('Error: ' + msg);
	  }
	});

	// Email update
	document.getElementById('email-form')?.addEventListener('submit', async (e) => {
			e.preventDefault();
			const newEmail = (e.target as HTMLFormElement).email.value.trim();
			if (!newEmail) return alert("Email cannot be empty");
	
			const res = await fetch('/api/email', {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: newEmail })
			});
			if (res.ok) {
				if (user.twofa_method === 'email') {
					alert('Email changed, please login again.');
					localStorage.clear(); 
					route('/login');
				}
				else {
					alert('Email updated!');
					renderProfile();}
			} else {
				alert(await res.text());
			}
		});
	
	// 2fa update
	const enable2FA = document.getElementById('enable-2fa') as HTMLInputElement;
	const twoFAOptions = document.getElementById('2fa-options') as HTMLDivElement;
	//twoFAOptions.classList.toggle('hidden', !enable2FA.checked);

	enable2FA?.addEventListener('change', async() => {
		twoFAOptions.classList.toggle('hidden', !enable2FA.checked);

		if (!enable2FA.checked && user.twofa_enabled ){
			try {const res = await fetch('/api/2fa/change', {
				method: 'PATCH',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ twofaMethod: null, email: user.email})
				});
				if (res.ok) {
				alert('2FA methode updated!');
				renderProfile();
				} else {
				const msg = await res.text();
				alert('Error: ' + msg);
				}
				
			} catch (err) {
				console.error(err);
				alert("Can not update your profile.");
			}
		renderProfile();
		}
	});

	document.getElementById('save-2fa')?.addEventListener('click', async () => {

	const method = (document.querySelector('[name="twofa_method"]:checked') as HTMLInputElement)?.value;
	if (!method) return alert('Please select a 2FA method.');

	if (enable2FA.checked && user.twofa_enabled && method === user.twofa_method) {
		return alert("Nothing changed.");
	}

	if (!enable2FA.checked && !user.twofa_enabled) {
		return alert("Nothing changed.");
	}

	let res: Response | null = null;

	if (enable2FA.checked && (method === 'email' || method === 'app')) {
		
		res = await fetch('/api/2fa/send-code', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ twofaMethod: method , email: user.email })
		});

		if (res && res.ok) {
			if (method === 'app') {

				const { qrCodeDataURL } = await res.json();
				let qrWindow = window.open('', 'QR Code', 'width=500,height=600,resizable=yes');

				if (qrWindow) {
					qrWindow.document.open();
					qrWindow.document.write(`<h3>Scan this in your Authenticator App</h3>`);
					qrWindow.document.write(`<img src="${qrCodeDataURL}" />`);
					qrWindow.document.close();
					qrWindow.focus();
				}	
			}
			const code = prompt('Enter the verification code :');
			if (code) {
				const verifyRes = await fetch('/api/2fa/verify-code', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ twofaMethod: method, email: user.email, code })
				});
			
				if (verifyRes.ok) {
				try {const res = await fetch('/api/2fa/change', {
					method: 'PATCH',
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ twofaMethod: method, email: user.email})
					});
					if (res.ok) {
					alert('Updated!');
					} else {
					const msg = await res.text();
					alert('Error: ' + msg);
					}
				} catch (err) {
					console.error(err);
					alert("Something went wrong while updating your profile.");
				}
			} else {
				alert('Verification failed.');}
			}
			}
		}
		renderProfile();
});
}

export type User = {
	id: number;
	email: string;
	password_hash: string;
	display_name: string;
	avatar_url: string;
  
	twofa_method: 'app' | 'email' | null;
	twofa_secret: string | null;
	twofa_verified: 0 | 1;
	twofa_enabled: 0 | 1;
  
	created_at: string;
	last_online: string;
	account_status: 'active' | 'online' | 'offline' | 'banned';
  }; 

export async function renderProfile() {
	const userId = localStorage.getItem('userId');
	if (!userId) {
	  alert("Please login");
	  return route('/login');
	}
  
	const res = await fetch('/api/profile', {
	  method: 'GET',
	  credentials: 'include',
	});
  
	if (!res.ok) {
	  setContent(`<div class="text-white-600">Not authorized to view this page.</div>`);
	  return;
	}
  
	const user = await res.json();
	localStorage.setItem("userId", user.id);
	localStorage.setItem("display_name", user.display_name);
  
	try {
	setContent(renderProfileHTML(user));
	setProfileEvents(user);
	} catch {
		setContent(`<div class="text-white-600">Not authorized to view this page.</div>`);
	}
}

  export async function logout(): Promise<void> {
	  try {const userId = localStorage.getItem('userId');
		  
		  if (!userId) {
			  alert("Please login");
			  return route('/login');
		  }
  
		  const response = await fetch('/api/logout', {
			method: 'POST',
			credentials: 'include',
			  });
  
		  if (!response.ok) {
			  throw new Error(`HTTP error! status: ${response.status}`);
		  }
  
		  localStorage.clear(); 
		
		  renderEntryPage(); 
	  } catch (err) {
		  console.error('Logout failed:', err instanceof Error ? err.message : err);
		  alert('Logout failed. Please try again.');
	  }
  }

export async function renderUserList() {
	const app = document.getElementById('app');
	if (!app) return;

	app.innerHTML = `<div class="text-center text-xl">Loading users...</div>`;

	const currUser = getUserInfo();

	try {const res = await fetch('/api/users');

		const users = await res.json();
		if (!users.length) {
			app.innerHTML = `<div class="text-center text-xl">No registered users yet, but the first one :) </div>`;
			return;
		}
		
		app.innerHTML = `

		  <div class="flex justify-between items-start p-4">
      <a href="/" onclick="route('/')" class="text-gray-400 hover:text-white">Home</a>
    	</div>
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


export async function renderUserProfile(userId: number) {

	setContent(`<div class="text-center text-xl">Loading profile...</div>`);

	try {const res = await fetch(`/api/user/${userId}`);
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
							<button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-2" onclick="window.startPrivateChat(${user.id}, '${user.display_name}')">Private Chat</button>
						</div>`}
					else if (user.friend_status === "pending"){
							friendButtons = `
								<div class="text-white-600">Awaiting response to your friend request.</div>
								<div class="flex gap-2 mb-8">
								<button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.cancelAction(${user.id})">Cancel request</button>
								<button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
								<button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
								<button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-2" onclick="window.startPrivateChat(${user.id}, '${user.display_name}')">Private Chat</button>	
							</div>`}
					else if (user.friend_status === "accepted" || user.friend_status === "added") {
						friendButtons = `
						<div class="text-white-600">You are friends.</div>
						<div class="flex gap-2 mb-8">
							<button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.cancelAction(${user.id})">Unfriend</button>
							<button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
							<button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
							<button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-2" onclick="window.startPrivateChat(${user.id}, '${user.display_name}')">Private Chat</button>
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
									<button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-2" onclick="window.startPrivateChat(${user.id}, '${user.display_name}')">Private Chat</button>
								</div>`}
				 }
				 else {
							goProfile = `<a href="/profile" data-link class="text-white-400 hover:underline">Manage your profile</a>`}   
			}

		 setContent(`
				<div class="flex justify-between items-start p-4">
				<a href="/" onclick="route('/')" class="text-gray-400 hover:text-white">Home</a>
				</div>

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

export function getUserInfo() {
	const userId = localStorage.getItem("userId");
	const displayName = localStorage.getItem("display_name");
	const alias = localStorage.getItem("alias");

	if (userId) {
		return { type: "loggedInUser", userId, displayName};
	} else if (alias) {
		return { type: "visitor", alias };
	} else {
		return { type: "anonymous" };
	}
}

export function renderLogin() {

	const userId = localStorage.getItem('userId');
	if (userId) {
		alert("You are already logged in");
		route('/profile');
		return;
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
		const email = formData.get('email')?.toString().trim();
		const password = formData.get('password')?.toString().trim();
		if (!email || !password) {
			return alert('Email and password are both required');
		  }		  
	  
		try {
		  const res = await fetch('/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password })
		  });

		  if (!res.ok) {
			const msg = await res.text();  
			alert(msg || 'Invalide credentials');
			//route('/login');
			return;
			}

		const data = await res.json();

		  if (!data.requires2FA) {
			localStorage.setItem('userId', data.user_id);
			localStorage.setItem('display_name', data.display_name);
			route('/profile');
		  } 
		  else if (data.requires2FA) {
			if (data.method === 'email') {
			  await fetch('/api/2fa/send-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ twofaMethod: 'email', email: data.email })
			  });
			}
			const code = prompt(`Enter 2FA code in your ${data.method}`);
			if (!code) return alert('2FA code required');
	  
			const verifyRes = await fetch('/api/2fa/verify-code', {
			  method: 'POST',
			  headers: { 'Content-Type': 'application/json' },
			  body: JSON.stringify({ twofaMethod: data.method, email: data.email, code })
			});

			if (!verifyRes.ok) {
				const msg = await verifyRes.text();
				console.log('verifyRes status:', verifyRes.status, 'message:', msg);
				throw new Error(msg || '2FA verification failed');
			  }

			//const verifyData = await verifyRes.json();
			const finalRes = await fetch('/api/final-login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			  });
			  
			  if (!finalRes.ok) {
				const msg = await finalRes.text();
				throw new Error(msg || 'Something went wrong');
			}else {
				const finalData = await finalRes.json();
				localStorage.setItem('userId', finalData.user_id);
				localStorage.setItem('display_name', finalData.display_name);
				route('/profile');
			  } 
		  } 
		} catch (err) {

				console.error(err);
				alert(err instanceof Error ? err.message : 'Network error');
			  }
	  });	  
}

// Simple prompt-based private chat starter
(window as any).startPrivateChat = async (userId: number, displayName?: string) => {
	const toName = displayName ? ` to ${displayName}` : '';
	const text = prompt(`Send a private message${toName}:`);
	if (!text || !text.trim()) return;
	try {
		await sendPrivateMessage(userId, text.trim());
		route('/home');
	} catch (e) {
		alert('Failed to send private message');
		console.error(e);
	}
};
