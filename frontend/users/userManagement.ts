import { sendPrivateMessage } from '../pages/pages.js';
import { uiAlert, uiConfirm } from '../ui/modal.js';
import { setContent, formatDbDateTime, startPresenceHeartbeat, showToast } from '../utility.js';
import { route } from '../router.js';
import { renderEntryPage } from '../pages/pages.js';

export function escapeHTML(str: string) {
	return String(str).replace(/[&<>"'`=\/]/g,
	  (s) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
		"/": "&#x2F;",
		"`": "&#x60;",
		"=": "&#x3D;"
	  }[s] || s)
	);
}

export async function renderRegister() {
	setContent(`
		<h1>Create Account</h1>
		
		<form id="register-form" class="flex flex-col gap-2 mt-4">
			<input name="display_name" type="text" placeholder="Public Name" required minlength="3" class="p-2 border text-black" />
			<input name="email" type="email" placeholder="Email" required class="p-2 border text-black" />
			<input name="password" type="password" placeholder="Password" required minlength="8" pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@$!%*?&amp;]).{8,}$"
 				title="Must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character '@$!%*?'" class="p-2 border text-black" />

			<div class="flex flex-col gap-2">
                <div class="flex items-center gap-3 flex-wrap">
                    <input id="avatar" name="avatar" type="file" accept="image/*" class="hidden" />
                    <label for="avatar" class="cursor-pointer inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm">
                        <span id="avatar-label-text">Choose avatar</span>
                    </label>
                    <span class="text-xs text-gray-400">(optional)</span>
                </div>
                <div id="avatar-filename" class="text-xs text-gray-400 line-clamp-1"></div>
            </div>	

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

			<br>
			
			<div class="flex justify-center">
			<button type="button" onclick="route('/login')" class="bg-white hover:bg-gray-200 transition-colors text-gray-900 font-medium px-4 py-2 rounded text-sm">Already have an account? Login</button>
			</div>

			<div class="flex items-center my-6">
				<div class="flex-grow h-px bg-gray-500"></div>
				<span class="px-2 text-gray-400 text-sm">OR</span>
				<div class="flex-grow h-px bg-gray-500"></div>
			</div>

			<div class="mt-2 flex flex-col gap-2">
				<button id="oauth" class="flex items-center justify-center gap-3 border border-gray-400 rounded px-4 py-2 hover:bg-gray-100 text-black bg-white">
					<img src="/42_Logo.svg" alt="42" class="w-6 h-6" />
					<span class="font-medium">Continue with 42</span>
				</button>
			</div>

		</form>
	`);

	const form = document.getElementById('register-form') as HTMLFormElement;
	const enable2FA = document.getElementById('enable-2fa') as HTMLInputElement;
	const twoFAOptions = document.getElementById('2fa-options') as HTMLDivElement;
	//const avatarInput = form.querySelector('#avatar') as HTMLInputElement | null;
	const avatarInput = document.getElementById('avatar') as HTMLInputElement | null;
	const avatarFilename = document.getElementById('avatar-filename') as HTMLDivElement | null;
	document.getElementById('oauth-register')?.addEventListener('click', () => {
		window.location.href = '/api/auth/42';
	});
	avatarInput?.addEventListener('change', () => {
		if (avatarInput.files && avatarInput.files[0]) {
			avatarFilename && (avatarFilename.textContent = avatarInput.files[0].name);
		} else if (avatarFilename) {
			avatarFilename.textContent = '';
		}
	});
	let twofaVerified = 0;
	let twofaMethod: string | null = null;
	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	enable2FA?.addEventListener('change', () => {
		twoFAOptions.classList.toggle('hidden', !enable2FA.checked);
	});
	
	form?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const email = (form.querySelector('[name="email"]') as HTMLInputElement).value.trim();
		twofaMethod = enable2FA.checked ? (form.querySelector('[name="twofa_method"]:checked') as HTMLInputElement)?.value : null;

		if (enable2FA.checked && !twofaMethod) {
			alert('Please select a 2FA method or uncheck 2FA.');
			return;
		}

		if (!enable2FA.checked) {

			const formData = new FormData(form);
			formData.set('enable_2fa', 'false');

			if (!avatarInput?.files?.length) {
				formData.delete('avatar');
			}
			registerUser(formData);
		}
		else {

			if (twofaMethod === 'email' && !emailPattern.test(email)) {
				alert('Valid email required for Email 2FA.');
				return;
			}

			if (twofaMethod === 'email' || twofaMethod === 'app') {

				const res = await fetch('/api/2fa/send-code', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ twofaMethod, email }),
							});

				if (!res.ok) {
					alert('Error sending verification code. Try later.');
					renderRegister();
				}
								
				if (twofaMethod === 'email') {

					setContent(`
						<h1 class="text-xl font-bold text-center">Set up your Two-Factor Authentication</h1>
						<p class="mt-2">Enter the 2FA code received in ${twofaMethod}</p>
						<form id="twofa-codes" class="flex flex-col gap-2 mt-4">
						<input type="text" name="code" placeholder="Enter code" class="p-2 border text-black" />
						<button type="submit" class="bg-gray-300 text-black font-bold px-4 py-2">Verify</button>
						</form>

						<br>
						<button onclick="route('/register')" class="bg-gray-400 hover:bg-gray-600 text-white px-6 py-2 rounded">
							Back to create account
						</button>
					`);
				}
				else if (twofaMethod === 'app') {

					const { qrCodeDataURL } = await res.json();

					setContent(`
						<h1 class="text-xl font-bold text-center">Set up your Two-Factor Authentication</h1>				
						<div id="twofa-codes-div" class="mt-4 p-4 border rounded bg-gray-100">
							<p class="mb-2 font-medium text-black text-center">Scan this QR code in your Authenticator App to get your code:</p>
							<img id="twofa-qr" class="mb-4 w-40 h-40 mx-auto" />
							<form id="twofa-codes" class="flex flex-col gap-2 mt-4">
							<input type="text" name="code" placeholder="Enter code" class="p-2 border text-black" />
							<button type="submit" class="bg-gray-300 text-black font-bold px-4 py-2">Verify</button>
							</form>
						</div>
						<br>
						<button onclick="route('/register')" class="bg-gray-400 hover:bg-gray-600 text-white px-6 py-2 rounded">
							Back to create account
						</button>
					`);

					const qrImg = document.getElementById("twofa-qr") as HTMLImageElement;
					qrImg.src = qrCodeDataURL;
				}
				document.getElementById("twofa-codes")!.addEventListener("submit", async (e) => {
					e.preventDefault();
					const formData = new FormData(e.target as HTMLFormElement);
					const code = formData.get("code")?.toString().trim();
					if (!code) return alert("2FA code required");

					const verifyRes = await fetch('/api/2fa/verify-code', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ twofaMethod, email, code }),
					});

					if (verifyRes.ok) {
						twofaVerified = 1;

						const formData = new FormData(form);
						formData.set('enable_2fa', enable2FA.checked ? 'true' : 'false');

						const avatarInput = form.querySelector('#avatar') as HTMLInputElement | null;
						if (!avatarInput?.files?.length) {
						formData.delete('avatar');
						}

						if (enable2FA.checked && twofaMethod) {
							formData.set('twofa_method', twofaMethod);
							formData.set('twofa_verified', String(twofaVerified));
						}

						await registerUser(formData);	
					}
					else {
						alert('Verification failed.');
						return renderRegister();
					}
				});
			}
		}
	});

	document.getElementById("oauth")?.addEventListener("click", () => {
		window.location.href = "/api/auth/42";
	});
}

async function registerUser(formData: FormData) {
	try {
	  const res = await fetch('/api/register', {
		method: 'POST',
		body: formData,
	  });
  
	  if (res.ok) {
		alert('Well done! Account created!');
		const user = await res.json();
		localStorage.setItem("userId", user.id);
		localStorage.setItem("display_name", user.display_name);
		startPresenceHeartbeat();
		await route('/profile');
	  } else {
		const msg = await res.text();
		alert('Error: ' + msg);
		renderRegister();
	  }
	} catch (err) {
	  console.error(err);
	  alert(err instanceof Error ? err.message : 'Network error');
	}
}

export function renderOauthSuccess()
{
	setContent(`
	  <div class="text-center mt-10">
		<h2 class="text-xl font-bold text-green-600">✅ Account created!</h2>
		<p class="mt-2">Redirecting to your profile...</p>
	  </div>
	`);
	setTimeout(() => route('/profile'), 2000);
}

export function renderLogin() {

	const userId = localStorage.getItem('userId');
	if (userId) {
		// Already authenticated: go straight to home (no popup)
		route('/home');
		return;
	}

	setContent(`
	<div class="max-w-md mx-auto mt-12 bg-gray-800/70 backdrop-blur rounded-xl shadow-lg border border-gray-700 p-6 text-white">
		<h1 class="text-2xl font-bold mb-4 text-center">Login</h1>
		<form id="login-form" class="flex flex-col gap-4">
			<input type="email" name="email" placeholder="Email" class="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-indigo-500 focus:outline-none autofill:bg-gray-900" />
			<input type="password" name="password" placeholder="Password" class="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-indigo-500 focus:outline-none autofill:bg-gray-900" />
			<button type="submit" class="bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-medium px-4 py-2 rounded">Sign In</button>
			<button type="button" onclick="route('/register')" class="bg-gray-700 hover:bg-gray-600 transition-colors text-white font-medium px-4 py-2 rounded text-sm">Create Account</button>
		</form>
		<div id="login-error" class="hidden mt-4 bg-red-900/70 border border-red-600 text-red-200 px-3 py-2 rounded text-sm"></div>
		<div class="flex items-center my-6">
			<div class="flex-grow h-px bg-gray-600"></div>
			<span class="px-2 text-gray-400 text-xs tracking-wide">OR</span>
			<div class="flex-grow h-px bg-gray-600"></div>
		</div>
		<div class="mt-2 flex flex-col gap-2">
			<button id="oauth" class="flex items-center justify-center gap-3 border border-gray-400 rounded px-4 py-2 hover:bg-gray-100 text-black bg-white">
				<img src="/42_Logo.svg" alt="42" class="w-6 h-6" />
				<span class="font-medium">Login with 42</span>
			</button>
		</div>
	</div>`);

	document.getElementById("oauth")?.addEventListener("click", () => {
		window.location.href = "/api/auth/42";
	  });

		const loginError = document.getElementById('login-error') as HTMLDivElement | null;
		document.getElementById('login-form')!.addEventListener('submit', async (e) => {
		e.preventDefault();
		const formData = new FormData(e.target as HTMLFormElement);
		const email = formData.get('email')?.toString().trim();
		const password = formData.get('password')?.toString().trim();
		if (!email || !password) {
			if (loginError) { loginError.textContent = 'Email and password are both required'; loginError.classList.remove('hidden'); }
			return;
		  }		  
	  
		try {
		  const res = await fetch('/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password })
		  });

		  if (res.status === 429) {
			throw new Error("Too many login attempts. Please wait a few minutes.");
		  }

		  if (!res.ok) {
			const msg = (await res.text()) || '';
			if (loginError) { loginError.textContent = msg || 'Invalid credentials'; loginError.classList.remove('hidden'); }
			return;
		  }

		const data = await res.json();

		  if (!data.requires2FA) {
			localStorage.setItem('userId', data.user_id);
			localStorage.setItem('display_name', data.display_name);
			startPresenceHeartbeat();
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
			if (!code) { if (loginError) { loginError.textContent = '2FA code required'; loginError.classList.remove('hidden'); } return; }
	  
			const verifyRes = await fetch('/api/2fa/verify-code', {
			  method: 'POST',
			  headers: { 'Content-Type': 'application/json' },
			  body: JSON.stringify({ twofaMethod: data.method, email: data.email, code })
			});

			if (!verifyRes.ok) {
				const msg = await verifyRes.text();
				if (loginError) { loginError.textContent = msg || '2FA verification failed'; loginError.classList.remove('hidden'); }
				return;
			}

			const finalRes = await fetch('/api/final-login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			  });
			  
			if (!finalRes.ok) {
				const msg = await finalRes.text();
				if (loginError) { loginError.textContent = msg || 'Login failed'; loginError.classList.remove('hidden'); }
				return;
			}else {
				const finalData = await finalRes.json();
				localStorage.setItem('userId', finalData.user_id);
				localStorage.setItem('display_name', finalData.display_name);
				startPresenceHeartbeat();
				route('/profile');
			  } 
		  } 
		} catch (err) {

				console.error(err);
				if (loginError) { loginError.textContent = err instanceof Error ? err.message : 'Network error'; loginError.classList.remove('hidden'); }
			  }
	  });	  
}

export async function logout(): Promise<void> {
	try {

		const response = await fetch('/api/logout', {
		method: 'POST',
		credentials: 'include',
			});

		if (!response.ok) {
			throw new Error(`Can not log out! status: ${response.status}`);
		}
		try {
		if (navigator.sendBeacon) {
			const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
			navigator.sendBeacon('/api/presence/offline', blob);
		} else {
			await fetch('/api/presence/offline', { method: 'POST', credentials: 'include' });
		}
		} catch {}
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

	try {
		const res = await fetch('/api/users');

		const users = await res.json();
		if (!users.length) {
			app.innerHTML = `<div class="text-center text-xl">No registered users yet, but the first one :) </div>`;
			return ;
		}
		
		app.innerHTML = `

		  <div class="flex justify-between items-start p-4">
	           <a href="/home" onclick="route('/home'); return false;" class="text-gray-400 hover:text-white">Home</a>
			</div>
				<div class="max-w-4xl mx-auto p-4">
					<h1 class="text-2xl font-bold mb-4">Users</h1>
					<div class="border border-gray-700 rounded-lg bg-gray-800/70 backdrop-blur p-3" style="max-height:70vh; overflow-y:auto;" id="user-scroll">
					<ul class="space-y-3 pr-2">
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
								friendStatusHTML = `<div class="text-sm text-gray-400">Friendship: ${escapeHTML(u.friend_status)}</div>`;
							}
						}
						return `
							<li class="bg-gray-800 p-4 rounded shadow flex items-center space-x-4">
								<img src="${u.avatar_url}" class="w-24 h-24 rounded-full border-4 border-grey-400 object-cover" />
								<div class="flex-1">
									<div class="font-semibold">${escapeHTML(u.display_name)}</div>
									<div class="text-sm text-gray-400">Status: ${escapeHTML(u.account_status)}</div>
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
			</div>
		`;
		// Ensure scroll starts at top each render
		const scrollBox = document.getElementById('user-scroll');
		if (scrollBox) scrollBox.scrollTop = 0;
	} catch (err) {
		console.error(err);
		app.innerHTML = `<div class="text-red-500 text-center">Failed to load users</div>`;
	}
}

export async function renderUserProfile(userId: number) {
  setContent(`<div class="text-center text-xl mt-10">Loading profile...</div>`);

  try {
    const res = await fetch(`/api/user/${userId}`);
    if (!res.ok) throw new Error("User not found");

    const { user, history } = await res.json();
    const formatDate = (d: string) => formatDbDateTime(d);
    const currUser = getUserInfo();
    const isSelf = userId.toString() === localStorage.getItem("userId");

    // Status bubble like private profile
    const statusBubble = `<span class="inline-block w-3 h-3 rounded-full ${user.account_status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}"></span>`;

    // Match history reused styling
    const historyBlock = `
      <h2 class="text-xl font-semibold mb-3">Recent Matches</h2>
      <div class="max-h-72 overflow-y-auto pr-2">
        <ul class="space-y-2">
          ${
            Array.isArray(history) && history.length
              ? history.map((m: any) => {
                  const score = (m?.your_score ?? null) !== null && (m?.opponent_score ?? null) !== null
                    ? `${m.your_score} - ${m.opponent_score}`
                    : '—';
                  const when = m?.date ? formatDbDateTime(m.date) : '';
                  const opp  = m?.opponent_name || `User #${m?.opponent_id ?? '?'}`;
                  return `
                    <li class="bg-gray-800/70 border border-gray-700 px-4 py-2 rounded flex flex-wrap gap-2 justify-between text-sm">
                      <span class="font-medium">${escapeHTML(opp)}</span>
                      <span class="text-indigo-300">${score}</span>
                      <span class="text-gray-400">${when}</span>
                    </li>`;
                }).join('')
              : `<li class="bg-gray-800/70 border border-gray-700 px-4 py-4 rounded text-center text-gray-400">No matches yet.</li>`
          }
        </ul>
      </div>
    `;

    // Friend action buttons (reuse existing logic)
    let friendButtons = "";
    let manageOwnProfile = "";

    if (currUser.type === "loggedInUser") {
      if (!isSelf) {
        if (user.friend_status === "adding") {
          friendButtons = `
            <div class="text-gray-300 text-sm">This user has sent you a friend request</div>
            <div class="flex flex-wrap gap-2">
              <button class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm" onclick="window.acceptFriend(${JSON.stringify(user.id)})">Accept</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm" onclick="window.blockUser(${JSON.stringify(user.id)})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm" onclick="window.startPrivateChat(${user.id}, '${escapeHTML(user.display_name)}')">Private Chat</button>
            </div>`;
        } else if (user.friend_status === "pending") {
          friendButtons = `
            <div class="text-gray-300 text-sm">Awaiting response to your friend request.</div>
            <div class="flex flex-wrap gap-2">
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm" onclick="window.cancelAction(${JSON.stringify(user.id)})">Cancel request</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm" onclick="window.blockUser(${JSON.stringify(user.id)})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm" onclick="window.startPrivateChat(${user.id}, '${escapeHTML(user.display_name)}')">Private Chat</button>
            </div>`;
        } else if (user.friend_status === "accepted" || user.friend_status === "added") {
          friendButtons = `
            <div class="text-gray-300 text-sm">You are friends.</div>
            <div class="flex flex-wrap gap-2">
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm" onclick="window.cancelAction(${JSON.stringify(user.id)})">Unfriend</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm" onclick="window.blockUser(${JSON.stringify(user.id)})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm" onclick="window.startPrivateChat(${user.id}, '${escapeHTML(user.display_name)}')">Private Chat</button>
            </div>`;
        } else if (user.friend_status === "blocked") {
          friendButtons = `
            <div class="flex flex-wrap gap-2">
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm" onclick="window.cancelAction(${JSON.stringify(user.id)})">Unblock</button>
            </div>`;
        } else {
          friendButtons = `
            <div class="flex flex-wrap gap-2">
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm" onclick="window.addFriend(${JSON.stringify(user.id)})">Add Friend</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm" onclick="window.blockUser(${JSON.stringify(user.id)})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm" onclick="window.startPrivateChat(${user.id}, '${escapeHTML(user.display_name)}')">Private Chat</button>
            </div>`;
        }
      } else {
        manageOwnProfile = `<a href="/profile" onclick="route('/profile'); return false;" class="text-indigo-400 hover:underline text-sm">Manage your profile</a>`;
      }
    }

    // Render redesigned public profile
    setContent(`
      <div class="flex justify-between items-start p-4">
        <a href="/home" onclick="route('/home'); return false;" class="text-gray-400 hover:text-white text-sm">Home</a>
        <a href="/users" onclick="route('/users'); return false;" class="text-gray-400 hover:text-white text-sm">Users</a>
      </div>

      <div class="max-w-4xl mx-auto space-y-8 px-4 pb-10">
        <div class="bg-gray-800/70 backdrop-blur border border-gray-700 rounded-xl shadow-lg p-6">
          <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <img src="${user.avatar_url}" class="w-32 h-32 rounded-full object-cover border-4 border-gray-700" />
            <div class="flex-1 space-y-2 text-center sm:text-left">
              <h1 class="text-3xl font-bold flex items-center gap-2 justify-center sm:justify-start">
                ${statusBubble}
                <span>${escapeHTML(user.display_name)}</span>
              </h1>
              <div class="flex flex-col sm:flex-row sm:gap-4 text-sm text-gray-400">
                <span>Joined: ${formatDate(user.created_at)}</span>
                <span>Last Online: ${formatDate(user.last_online)}</span>
              </div>
              <div class="flex gap-4 justify-center sm:justify-start pt-2">
                <div class="bg-gray-900/60 border border-gray-700 rounded px-4 py-2 text-sm">
                  🏆 <span class="font-semibold">${user.wins}</span> Wins
                </div>
                <div class="bg-gray-900/60 border border-gray-700 rounded px-4 py-2 text-sm">
                  💥 <span class="font-semibold">${user.losses}</span> Losses
                </div>
              </div>
              ${manageOwnProfile ? `<div class="pt-2">${manageOwnProfile}</div>` : ''}
            </div>
          </div>
          <div class="mt-6">
            ${friendButtons}
          </div>
        </div>

        <div class="bg-gray-800/70 backdrop-blur border border-gray-700 rounded-xl shadow-lg p-6">
          ${historyBlock}
        </div>
      </div>
    `);
  } catch (err) {
    setContent(`<div class="text-red-500 text-center mt-10">Failed to load profile. It may not exist.</div>`);
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
