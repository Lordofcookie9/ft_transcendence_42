import { sendPrivateMessage } from '../pages/pages.js';
import { uiAlert, uiConfirm, uiPrompt } from '../ui/modal.js';
import { setContent, formatDbDateTime, startPresenceHeartbeat } from '../utility.js';
import { route } from '../router.js';
import { renderEntryPage } from '../pages/pages.js';

// Restored original (simplified) registration renderer
export async function renderRegister() {
	setContent(`
	<div class="max-w-md mx-auto mt-10 bg-gray-800/70 backdrop-blur rounded-xl shadow-lg border border-gray-700 p-6 text-white">
		<h1 class="text-2xl font-bold mb-4 text-center">Create Account</h1>
		<form id="register-form" class="flex flex-col gap-4">
			<input name="display_name" type="text" placeholder="Public name" required minlength="1" class="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-indigo-500 focus:outline-none" />
			<input name="email" type="email" placeholder="Email" required class="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-indigo-500 focus:outline-none" />
			<input name="password" type="password" placeholder="Password" required minlength="8" pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@$!%*?&amp;]).{8,}$" title="Must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character '@$!%*?'" class="w-full p-2 rounded bg-gray-900 border border-gray-600 focus:border-indigo-500 focus:outline-none" />
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
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" id="enable-2fa" class="accent-indigo-500" /> Enable 2FA
				</label>
				<div id="2fa-options" class="hidden flex-col gap-2 border border-gray-600 rounded p-3 bg-gray-900/60 text-sm">
					<label class="flex items-center gap-2"><input type="radio" name="twofa_method" value="email" class="accent-indigo-500"/> Email</label>
					<label class="flex items-center gap-2"><input type="radio" name="twofa_method" value="app" class="accent-indigo-500"/> Authenticator App</label>
				</div>
			</div>
			<button type="submit" class="mt-2 bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-medium px-4 py-2 rounded">Register</button>
		</form>
	</div>`);
	const form = document.getElementById('register-form') as HTMLFormElement | null;
	const enable2FA = document.getElementById('enable-2fa') as HTMLInputElement | null;
	const twoFAOptions = document.getElementById('2fa-options') as HTMLDivElement | null;
	const avatarInput = document.getElementById('avatar') as HTMLInputElement | null;
	const avatarFilename = document.getElementById('avatar-filename') as HTMLDivElement | null;
	avatarInput?.addEventListener('change', () => {
		if (avatarInput.files && avatarInput.files[0]) {
			avatarFilename && (avatarFilename.textContent = avatarInput.files[0].name);
		} else if (avatarFilename) {
			avatarFilename.textContent = '';
		}
	});
	let twofaVerified = 0;
	enable2FA?.addEventListener('change', () => twoFAOptions?.classList.toggle('hidden', !enable2FA.checked));
	form?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const formData = new FormData(form);
		if (enable2FA?.checked) formData.set('enable_2fa', 'true'); else formData.set('enable_2fa', 'false');
		try {
			const res = await fetch('/api/register', { method: 'POST', body: formData });
			if (res.ok) {
				const user = await res.json();
				localStorage.setItem('userId', user.id);
				localStorage.setItem('display_name', user.display_name);
				startPresenceHeartbeat();
				route('/profile');
			} else {
				uiAlert('Error: ' + (await res.text()));
			}
		} catch (err: any) { uiAlert(err?.message || 'Network error'); }
	});
}

export function renderOauthSuccess() {
	setContent(`
	  <div class="text-center mt-10">
		<h2 class="text-xl font-bold text-green-600">✅ Account created!</h2>
		<p class="mt-2">Redirecting to your profile...</p>
	  </div>
	`);
	setTimeout(() => route('/profile'), 2000);
  }
  


function setProfileEvents(user: User) {

	console.log('in set profile', user);

		document.getElementById('logout')?.addEventListener('click', logout);
		// Edit mode toggling
		const toggle = document.getElementById('edit-profile-toggle');
		const cancel = document.getElementById('edit-profile-cancel');
		const editPanel = document.getElementById('profile-edit');
		const roPanel = document.getElementById('profile-readonly');
		const nameHeading = document.getElementById('profile-display-name');
		function enterEdit() {
			editPanel?.classList.remove('hidden');
			roPanel?.classList.add('hidden');
			toggle?.classList.add('hidden');
			cancel?.classList.remove('hidden');
		}
		function leaveEdit(updatedName?: string) {
			editPanel?.classList.add('hidden');
			roPanel?.classList.remove('hidden');
			toggle?.classList.remove('hidden');
			cancel?.classList.add('hidden');
			if (updatedName && nameHeading) nameHeading.textContent = updatedName;
		}
		toggle?.addEventListener('click', () => enterEdit());
		cancel?.addEventListener('click', () => leaveEdit());
	document.getElementById('delete-profile-btn')?.addEventListener('click', async () => {
		  const really = await uiConfirm('Are you sure you want to delete your profile? This cannot be undone.','Delete Account');
		  if (!really) return;
  
		  const res = await fetch('/api/delete-account', {
		  method: 'DELETE',
		  credentials: 'include',
		  });
  
		  if (res.ok) {
		  try {
		  if (navigator.sendBeacon) {
			const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
			navigator.sendBeacon('/api/presence/offline', blob);
		  } else {
			await fetch('/api/presence/offline', { method: 'POST', credentials: 'include' });
		  }
		  } catch {}
		  localStorage.clear();
		  alert('Account deleted.');
		  route('/');
		  } else {
		  const err = await res.text();
		  alert('Error: ' + err);
		  }
	  });

	document.getElementById('anonymize-account-btn')?.addEventListener('click', async () => {
		if (user.anonymized) return uiAlert('Already anonymized.');
		const ok = await uiConfirm('This will irreversibly anonymize your account (you will be logged out). Continue?','Anonymize Account');
		if (!ok) return;
		try {
		  const res = await fetch('/api/account/anonymize', { method: 'POST', credentials: 'include' });
		  if (res.ok) {
			await uiAlert('Account anonymized. You can now log in again if needed.');
			localStorage.clear();
			route('/');
		  } else {
			await uiAlert('Failed: ' + (await res.text()));
		  }
		} catch (e) {
		  console.error(e);
		  uiAlert('Network error');
		}
	});
  
	// Unified profile info form (name + email)
	const profileInfoForm = document.getElementById('profile-info-form') as HTMLFormElement | null;
	profileInfoForm?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const newName = (form.display_name?.value || '').trim();
		const newEmail = (form.email?.value || '').trim();
		const origName = localStorage.getItem('display_name')?.trim() || user.display_name;
		const origEmail = user.email;
		const tasks: Promise<Response>[] = [];
		if (newName && newName !== origName) {
			tasks.push(fetch('/api/name', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: newName }) }));
		}
		if (newEmail && newEmail !== origEmail) {
			tasks.push(fetch('/api/email', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail }) }));
		}
		if (!tasks.length) {
			alert('Nothing changed.');
			return;
		}
		try {
			const results = await Promise.all(tasks);
			const failed = results.find(r => !r.ok);
			if (failed) {
				const msg = await failed.text();
				alert('Update failed: ' + msg);
				return;
			}
			if (newName && newName !== origName) localStorage.setItem('display_name', newName);
			alert('Profile updated.');
			renderProfile();
		} catch (err) {
			console.error(err);
			alert('Network error.');
		}
	});

	document.getElementById('password-form')?.addEventListener('submit', async (e) => {
		e.preventDefault();
		
		const form = e.target as HTMLFormElement;
		const newPassword = form.password.value.trim();
	  
		if (!newPassword || newPassword.length < 8) {
		  alert("Password must be at least 8 characters.");
		  return;
		}
	  
		try {
		  const res = await fetch('/api/password', {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password: newPassword })
		  });
	  
		  if (res.ok) {
			alert('Password set!');
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

	// (Email form removed; handled by unified form)
	
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

		if (!user.password_hash) {
			  alert("You don't have password, set a password first.");
			  return;
			}
		
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

				// console.log('save-2fa clicked; user=', user, 'method=', method);


				// let password: string | null = null;
				// if (user.oauth_provider) {
				// 	password = prompt("To activate 2fa, confirm, set or reset your password:");
				// if (!password || password.length < 8) {
				// 	alert("Password must be at least 8 characters.");
				// 	return;
				// }
				// }

				const verifyRes = await fetch('/api/2fa/verify-code', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ twofaMethod: method, email: user.email, code})
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

// New profile HTML with toggleable edit panel
function renderProfileHTML(user: User): string {
	const joined = new Date(user.created_at).toLocaleString();
	const lastOnline = new Date(user.last_online).toLocaleString();
	const statusBubble = `<span class="inline-block w-3 h-3 rounded-full ${user.account_status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}"></span>`;
	return `
	<div class="max-w-3xl mx-auto mt-10 text-white">
		<div class="flex justify-between items-start mb-4">
			<button id="edit-profile-toggle" class="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-sm">Edit</button>
			<button id="edit-profile-cancel" class="hidden bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-sm">Cancel</button>
		</div>
		<div id="profile-readonly" class="space-y-6">
			<div class="bg-gray-800/70 backdrop-blur border border-gray-700 rounded-xl p-6 shadow-lg">
				<div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
					<img id="avatar-preview" src="${user.avatar_url}" class="w-32 h-32 rounded-full object-cover border-4 border-gray-700" />
					<div class="flex-1 space-y-2 text-center sm:text-left">
						<h1 id="profile-display-name" class="text-3xl font-bold flex items-center gap-2 justify-center sm:justify-start">${statusBubble}<span>${user.display_name}</span></h1>
						<div class="text-sm text-gray-400 flex flex-col sm:flex-row sm:gap-4">
							<span>Joined: ${joined}</span>
							<span>Last Online: ${lastOnline}</span>
						</div>
					</div>
				</div>
				<div class="flex flex-wrap gap-2 justify-center sm:justify-end pt-4">
					<button id="anonymize-account-btn" class="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white px-3 py-1 rounded text-sm" ${user.anonymized ? 'disabled title="Already anonymized"' : ''}>${user.anonymized ? 'Account Anonymized' : 'Anonymize Account'}</button>
					<button id="delete-profile-btn" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">Delete Account</button>
					<button id="logout" class="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm">Logout</button>
				</div>
			</div>
			<div class="flex flex-wrap gap-4 justify-center">
				<button onclick="route('/users')" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded">Find Friends</button>
				<button onclick="route('/home')" class="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded">Play Game</button>
				<a href="/profile/${user.id}" onclick="route('/profile/${user.id}'); return false;" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded">Public Page</a>
			</div>
		</div>
		<div id="profile-edit" class="hidden space-y-8 bg-gray-800/70 backdrop-blur border border-gray-700 rounded-xl p-6 shadow-lg">
			<form id="avatar-form" class="flex items-center justify-center gap-3 text-sm flex-wrap">
				<input id="avatar-upload" name="avatar" type="file" accept="image/*" class="hidden" />
				<label for="avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-white">Change Avatar</label>
				<button type="submit" class="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded">Save Avatar</button>
			</form>
			<form id="profile-info-form" class="space-y-3">
				<div class="flex gap-2 flex-wrap items-center">
					<input type="text" name="display_name" value="${user.display_name}" placeholder="Display name" class="flex-grow p-2 rounded bg-gray-900 text-white text-sm border border-gray-600 focus:border-indigo-500 focus:outline-none" />
					<input type="email" name="email" value="${user.email}" placeholder="Email" class="flex-grow p-2 rounded bg-gray-900 text-white text-sm border border-gray-600 focus:border-indigo-500 focus:outline-none" />
					<button type="submit" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm">Save Changes</button>
				</div>
			</form>
			<form id="password-form" class="flex gap-2 flex-wrap items-center">
				<input type="password" name="password" placeholder="New password" minlength="8" class="flex-grow p-2 rounded bg-gray-900 text-white text-sm border border-gray-600 focus:border-indigo-500 focus:outline-none" />
				<button type="submit" class="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded text-sm">Save Password</button>
			</form>
			<div class="border border-gray-700 rounded p-4 space-y-2 bg-gray-900/60">
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" id="enable-2fa" ${user.twofa_enabled ? 'checked' : ''}/> <span>Enable 2FA</span>
					${user.twofa_verified ? '<span class="text-green-500">Verified</span>' : ''}
				</label>
				<div id="2fa-options" class="${user.twofa_enabled ? '' : 'hidden'} flex flex-wrap items-center gap-4 text-sm">
					<label><input type="radio" name="twofa_method" value="email" ${user.twofa_method === 'email' ? 'checked' : ''}/> Email</label>
					<label><input type="radio" name="twofa_method" value="app" ${user.twofa_method === 'app' ? 'checked' : ''}/> Auth App</label>
					<button id="save-2fa" type="button" class="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white text-sm">Save 2FA</button>
				</div>
			</div>
		</div>
	</div>`;
}
export type User = {
	id: number;
	email: string;
	password_hash: string;
	display_name: string;
	avatar_url: string;
	anonymized?: number; // 0 | 1
  
	twofa_method: 'app' | 'email' | null;
	twofa_secret: string | null;
	twofa_verified: 0 | 1;
	twofa_enabled: 0 | 1;
	oauth_provider: string | null;
  
	created_at: string;
	last_online: string;
	account_status: 'active' | 'online' | 'offline' | 'banned';
  }; 

export async function renderProfile() {
	// const userId = localStorage.getItem('userId');
	// if (!userId) {
	//   alert("Please login");
	//   return route('/login');
	// }
  
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
	startPresenceHeartbeat();

	try {
	setContent(renderProfileHTML(user));
	setProfileEvents(user);
	// setTimeout(() => {
	// 	document.getElementById('welcome-banner')?.remove();
	//   }, 2000);
	} catch {
		setContent(`<div class="text-white-600">Not authorized to view this page.</div>`);
	}
}

  export async function logout(): Promise<void> {
	  try {
		
		// const userId = localStorage.getItem('userId');
		  
		//   if (!userId) {
		// 	  alert("Please login");
		// 	  return route('/login');
		//   }
  
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

	try {const res = await fetch('/api/users');

		const users = await res.json();
		if (!users.length) {
			app.innerHTML = `<div class="text-center text-xl">No registered users yet, but the first one :) </div>`;
			return;
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
								friendStatusHTML = `<div class="text-sm text-gray-400">Friendship: ${u.friend_status}</div>`;
							}
						}
						return `
							<li class="bg-gray-800 p-4 rounded shadow flex items-center space-x-4">
								<img src="${u.avatar_url}" class="w-24 h-24 rounded-full border-4 border-grey-400 object-cover" />
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
  setContent(`<div class="text-center text-xl">Loading profile...</div>`);

  try {
    const res = await fetch(`/api/user/${userId}`);
    if (!res.ok) throw new Error("User not found");

    const { user, history } = await res.json();
    const formatDate = (d: string) => formatDbDateTime(d);

    const currUser = getUserInfo();
    const isSelf = userId.toString() === localStorage.getItem("userId");

    let friendButtons = "";
    let goProfile = "";

    // ---- Match History (last 50 private 1v1) ----
	let historyBlock = `
	<h2 class="text-xl font-semibold mb-2">Match History</h2>
	<div class="max-h-64 md:max-h-80 overflow-y-auto pr-2">
		<ul class="space-y-2">
		${
			Array.isArray(history) && history.length
			? history.map((m: any) => {
				const score =
					(m?.your_score ?? null) !== null && (m?.opponent_score ?? null) !== null
					? `${m.your_score} - ${m.opponent_score}`
					: '—';
				const when = m?.date ? formatDbDateTime(m.date) : '';
				const opp  = m?.opponent_name || `User #${m?.opponent_id ?? '?'}`;
				return `
					<li class="bg-gray-700 px-4 py-2 rounded flex justify-between">
					<span>${opp}</span>
					<span>${score}</span>
					<span class="text-gray-300">${when}</span>
					</li>`;
				}).join('')
			: `<li class="bg-gray-700 px-4 py-2 rounded text-center text-gray-300">No matches yet.</li>`
		}
		</ul>
	</div>
	`;

    // ---- Friend buttons / self link ----
    if (currUser.type === "loggedInUser") {
      if (!isSelf) {
        if (user.friend_status === "adding") {
          friendButtons = `
            <div class="text-white-600">This user has sent you a friend request</div>
            <div class="flex gap-2 mb-8">
              <button class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded" onclick="window.acceptFriend(${user.id})">Accept</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-2" onclick="window.startPrivateChat(${user.id}, '${user.display_name}')">Private Chat</button>
            </div>`;
        } else if (user.friend_status === "pending") {
          friendButtons = `
            <div class="text-white-600">Awaiting response to your friend request.</div>
            <div class="flex gap-2 mb-8">
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.cancelAction(${user.id})">Cancel request</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-2" onclick="window.startPrivateChat(${user.id}, '${user.display_name}')">Private Chat</button>
            </div>`;
        } else if (user.friend_status === "accepted" || user.friend_status === "added") {
          friendButtons = `
            <div class="text-white-600">You are friends.</div>
            <div class="flex gap-2 mb-8">
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.cancelAction(${user.id})">Unfriend</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-2" onclick="window.startPrivateChat(${user.id}, '${user.display_name}')">Private Chat</button>
            </div>`;
        } else if (user.friend_status === "blocked") {
          friendButtons = `
            <div class="flex gap-2 mb-8">
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.cancelAction(${user.id})">Unblock</button>
            </div>`;
        } else {
          friendButtons = `
            <div class="flex gap-2 mb-8">
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded" onclick="window.addFriend(${user.id})">Add Friend</button>
              <button class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded" onclick="window.blockUser(${user.id})">Block</button>
              <button class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded" onclick="window.inviteToPlay(${user.id})">Go to Play</button>
              <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-2" onclick="window.startPrivateChat(${user.id}, '${user.display_name}')">Private Chat</button>
            </div>`;
        }
      } else {
        goProfile = `<a href="/profile" data-link class="text-white-400 hover:underline">Manage your profile</a>`;
      }
    }

    // ---- Render ----
    setContent(`
      <div class="flex justify-between items-start p-4">
        <a href="/home" onclick="route('/home'); return false;" class="text-gray-400 hover:text-white">Home</a>
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

        <div class="mt-8">
          ${historyBlock}
        </div>
      </div>
    `);
  } catch (err) {
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
		<button id="oauth" class="flex items-center justify-center gap-3 border border-gray-600 rounded px-4 py-2 hover:bg-gray-700 bg-gray-900 text-gray-200 transition-colors">
			<img src="/uploads/42_Logo.svg" alt="42" class="w-6 h-6" />
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
