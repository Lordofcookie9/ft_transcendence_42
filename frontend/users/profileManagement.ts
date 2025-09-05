import { sendPrivateMessage } from '../pages/pages.js';
import { uiAlert, uiConfirm } from '../ui/modal.js';
import { setContent, formatDbDateTime, startPresenceHeartbeat, showToast } from '../utility.js';
import { route } from '../router.js';
import { logout, escapeHTML} from './userManagement.js';

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

function sanitizeDisplayName(raw: string)
{
  return String(raw || '').replace(/[\r\n\t]/g,' ').trim().replace(/\s+/g,' ').slice(0,32);
}

function validDisplayName(n: string)
{
  return /^[A-Za-z0-9_ ]{3,32}$/.test(n);
}

function sanitizeEmail(raw: string)
{
  return String(raw || '').trim().toLowerCase().slice(0,190);
}

function validEmail(e: string)
{
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

function sanitizeAvatarURL(url: string)
{
	if (!url) 
		return ('/default-avatar.png');
	try {
		const u = new URL(url, window.location.origin);
		if (u.origin === window.location.origin && u.pathname.startsWith('/uploads/'))
			return (u.pathname);
		if (u.protocol === 'https:')
			return (u.href.slice(0,300)); 
	} catch {}
	return ('/default-avatar.png');
}

function renderProfileHTML(user: User): string {
	const joined = new Date(user.created_at).toLocaleString();
	const lastOnline = new Date(user.last_online).toLocaleString();
	const safeName = escapeHTML(user.display_name);
	const safeEmail = escapeHTML(user.email);
	const safeAvatar = sanitizeAvatarURL(user.avatar_url);
	const statusBubble = `<span class="inline-block w-3 h-3 rounded-full ${user.account_status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}"></span>`;
	return `
	    <div class="flex justify-between items-start p-4">
        <a href="/home" onclick="route('/home'); return false;" class="text-gray-400 hover:text-white text-sm">Home</a>
        <a href="/users" onclick="route('/users'); return false;" class="text-gray-400 hover:text-white text-sm">Users</a>
		</div>

		<div class="max-w-3xl mx-auto mt-10 text-white">	
		<div class="flex justify-between items-start mb-4">
		<button id="edit-profile-toggle" class="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-sm">Edit</button>
		<button id="edit-profile-cancel" class="hidden bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-sm">Cancel</button>
		</div>
		<div id="profile-readonly" class="space-y-6">
		<div class="bg-gray-800/70 backdrop-blur border border-gray-700 rounded-xl p-6 shadow-lg">
			<div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
			<img id="avatar-preview" src="${safeAvatar}" alt="Current avatar" class="w-32 h-32 rounded-full object-cover border-4 border-gray-700" />
			<div class="flex-1 space-y-2 text-center sm:text-left">
				<h1 id="profile-display-name" class="text-3xl font-bold flex items-center gap-2 justify-center sm:justify-start">${statusBubble}<span>${safeName}</span></h1>
				<div class="text-sm text-gray-400 flex flex-col sm:flex-row sm:gap-4">
				<span>Joined: ${escapeHTML(joined)}</span>
				<span>Last Online: ${escapeHTML(lastOnline)}</span>
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
			<button type="button" onclick="route('/users')" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded">Find Friends</button>
			<button type="button" onclick="route('/home')" class="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded">Play Game</button>
			<a href="/profile/${user.id}" onclick="route('/profile/${user.id}'); return false;" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded">Public Page</a>
		</div>
		</div>

		<div id="profile-edit" class="hidden space-y-8 bg-gray-800/70 backdrop-blur border border-gray-700 rounded-xl p-6 shadow-lg">
		<form id="avatar-form" class="space-y-4 text-sm">
			<div class="flex flex-col items-center gap-4">
			<img id="avatar-edit-preview" src="${safeAvatar}" alt="Avatar preview while editing" class="w-32 h-32 rounded-full object-cover border-4 border-gray-700" />
			<div class="flex flex-wrap items-center gap-3">
				<input id="avatar-upload" name="avatar" type="file" accept="image/*" class="hidden" />
				<label for="avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-white">Choose New Avatar</label>
				<button type="submit" class="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded">Save Avatar</button>
				<button type="button" id="avatar-cancel" class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded">Reset</button>
			</div>
			<div id="avatar-file-name" class="text-xs text-gray-400"></div>
			</div>
		</form>
		<div class="flex flex-wrap gap-2 text-xs">
			<button id="gdpr-export" type="button" class="bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded text-white">Download My Data (JSON)</button>
		</div>
		<div id="twofa-verification-container" class="text-sm"></div>
		<form id="profile-info-form" class="space-y-3">
			<div class="flex gap-2 flex-wrap items-center">
			<input type="text" name="display_name" value="${safeName}" placeholder="Display name" class="flex-grow p-2 rounded bg-gray-900 text-white text-sm border border-gray-600 focus:border-indigo-500 focus:outline-none" />
			<input type="email" name="email" value="${safeEmail}" placeholder="Email" class="flex-grow p-2 rounded bg-gray-900 text-white text-sm border border-gray-600 focus:border-indigo-500 focus:outline-none" />
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

function setProfileEvents(user: User)
{
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
		if (updatedName && nameHeading)
			nameHeading.textContent = updatedName;
	}

	toggle?.addEventListener('click', enterEdit);
	cancel?.addEventListener('click', () => leaveEdit());

	document.getElementById('delete-profile-btn')?.addEventListener('click', async () => {
		const really = await uiConfirm('Are you sure you want to delete your profile? This cannot be undone.','Delete Account');
		if (!really)
			return;
		const res = await fetch('/api/delete-account', {
			method: 'DELETE',
			credentials: 'include',
		});

		if (res.ok)
		{
			try {
				if (navigator.sendBeacon) {
					const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
					navigator.sendBeacon('/api/presence/offline', blob);
				} else {
					await fetch('/api/presence/offline', { method: 'POST', credentials: 'include' });
				}
			} catch {}
			localStorage.clear();
			route('/home');
			setTimeout(() => showToast('Account deleted', 'info'), 40);
		}
		else
		{
			const err = await res.text();
			showToast('Delete failed: ' + err, 'error');
		}
	});

	document.getElementById('anonymize-account-btn')?.addEventListener('click', async () => {
		if (user.anonymized)
		{
			showToast('Already anonymized', 'info');
			return;
		}
		const ok = await uiConfirm(
					`IRREVERSIBLE ACTION

		Your display name, email, avatar, password and OAuth links will be destroyed.
		You WILL lose access and cannot log back in (even with 42 OAuth).

		Your stats and past matches stay, but no recovery is possible.

		Proceed?`,
					'Erase & Anonymize'
		);
		if (!ok)
			return;
		try {
			const res = await fetch('/api/account/anonymize', { method: 'POST', credentials: 'include' });
			if (res.ok)
			{
				localStorage.clear();
				route('/home');
				setTimeout(()=>showToast('Account anonymized (access lost)', 'info'), 40);
			}
			else 
				showToast('Failed: ' + (await res.text()), 'error');
		} catch (e) {
			console.error(e);
			showToast('Network error', 'error');
		}
	});
  
	// Unified profile info form (name + email)
	const profileInfoForm = document.getElementById('profile-info-form') as HTMLFormElement | null;
	if (profileInfoForm && !profileInfoForm.querySelector('#profile-info-error'))
	{
		const div = document.createElement('div');
		div.id = 'profile-info-error';
		div.className = 'hidden mt-2 bg-red-900/70 border border-red-600 text-red-200 px-3 py-2 rounded text-sm';
		profileInfoForm.appendChild(div);
	}

	profileInfoForm?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		let newName = (form.display_name?.value || '').trim();
		let newEmail = (form.email?.value || '').trim();
		const errorBox = form.querySelector('#profile-info-error') as HTMLDivElement | null;
		if (errorBox)
		{
			errorBox.classList.add('hidden');
			errorBox.textContent = '';
		}

		if (newName)
		{
			newName = sanitizeDisplayName(newName);
			if (!validDisplayName(newName))
			{
				if (errorBox)
				{
					errorBox.textContent = 'Display name invalid (3-32: letters, digits, underscore, space).';
					errorBox.classList.remove('hidden');
				}
				return ;
			}
		}

		if (newEmail)
		{
			newEmail = sanitizeEmail(newEmail);
			if (!validEmail(newEmail))
			{
				if (errorBox)
				{
					errorBox.textContent = 'Invalid email format.';
					errorBox.classList.remove('hidden');
				}
				return ;
			}
		}

		const origName = localStorage.getItem('display_name')?.trim() || user.display_name;
		const origEmail = user.email;
		const tasks: Promise<Response>[] = [];

		if (newName && newName !== origName)
		{
			tasks.push(fetch('/api/name', {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ display_name: newName })
			}));

		}
		if (newEmail && newEmail !== origEmail)
		{
			tasks.push(fetch('/api/email', {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: newEmail }) }));
		}
		if (!tasks.length)
		{
			alert('Nothing changed.');
			return;
		}
		try {
			const results = await Promise.all(tasks);
			const failed = results.find(r => !r.ok);
			if (failed)
			{
				let msg = await failed.text();
				try {
					const j = JSON.parse(msg);
					if (j?.error)
						msg = j.error;
				} catch {}
				if (errorBox)
				{
					if (/already exists|already in use|duplicate/i.test(msg))
						errorBox.textContent = 'That username is already used.';
					else
						errorBox.textContent = msg || 'Update failed';
					errorBox.classList.remove('hidden');
				}
				else
					alert('Update failed: ' + msg);
				return;
			}
			if (newName && newName !== origName)
				localStorage.setItem('display_name', newName);
			showToast('Profile updated.', 'success');
			leaveEdit(newName || origName);
			renderProfile();
		} catch (err) {
			console.error(err);
			if (errorBox)
			{
				errorBox.textContent = 'Network error.';
				errorBox.classList.remove('hidden');
			}
			else
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

	const avatarForm          = document.getElementById('avatar-form') as HTMLFormElement | null;
	const avatarUpload        = document.getElementById('avatar-upload') as HTMLInputElement | null;
	const avatarEditPreview   = document.getElementById('avatar-edit-preview') as HTMLImageElement | null;
	const avatarReadonly      = document.getElementById('avatar-preview') as HTMLImageElement | null;
	const avatarCancelBtn     = document.getElementById('avatar-cancel');
	const avatarFileNameLabel = document.getElementById('avatar-file-name');

	avatarUpload?.addEventListener('change', () => {
		const file = avatarUpload.files?.[0];
		if (file)
		{
			const url = URL.createObjectURL(file);
			if (avatarEditPreview)
				avatarEditPreview.src = url;
			if (avatarFileNameLabel)
				avatarFileNameLabel.textContent = file.name;
		}
		else
		{
			if (avatarEditPreview && avatarReadonly)
				avatarEditPreview.src = avatarReadonly.src;
			if (avatarFileNameLabel)
				avatarFileNameLabel.textContent = '';
		}
	});

	avatarCancelBtn?.addEventListener('click', () => {
		if (avatarUpload)
			avatarUpload.value = '';
		if (avatarReadonly && avatarEditPreview)
			avatarEditPreview.src = avatarReadonly.src;
		if (avatarFileNameLabel)
			avatarFileNameLabel.textContent = '';
	});

	avatarForm?.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (!avatarUpload?.files?.[0])
		{
			alert('No new avatar selected.');
			return;
		}
		const fd = new FormData();
		fd.append('avatar', avatarUpload.files[0]);
		const res = await fetch('/api/avatar', {
			method: 'PATCH',
			credentials: 'include',
			body: fd
		});
		if (res.ok)
		{
			showToast('Avatar updated', 'success');
			renderProfile();
		} else
			alert('Error: ' + (await res.text()));
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

	// GDPR export
	document.getElementById('gdpr-export')?.addEventListener('click', async () => {
		try {
			const res = await fetch('/api/account/export', { credentials: 'include' });
			if (!res.ok) { showToast('Export failed', 'error'); return; }
			const data = await res.json();
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'my_account_export.json';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			showToast('Download started', 'success');
		} catch (e) {
			console.error(e);
			showToast('Export error', 'error');
		}
	});

	document.getElementById('save-2fa')?.addEventListener('click', async () => {
		const method = (document.querySelector('[name="twofa_method"]:checked') as HTMLInputElement)?.value;
		if (!method) return alert('Please select a 2FA method.');
		if (enable2FA.checked && user.twofa_enabled && method === user.twofa_method) return alert('Nothing changed.');
		if (!enable2FA.checked && !user.twofa_enabled) return alert('Nothing changed.');

		if (enable2FA.checked && (method === 'email' || method === 'app')) {
			if (!user.password_hash) return alert("You don't have password, set a password first.");
			const sendRes = await fetch('/api/2fa/send-code', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ twofaMethod: method, email: user.email })});
			if (!sendRes.ok) { alert('Error sending verification code.'); return renderProfile(); }
			if (method === 'app') {
				const { qrCodeDataURL } = await sendRes.json();
				const w = window.open('', 'QR Code', 'width=500,height=600,resizable=yes');
				if (w) { w.document.write(`<h3>Scan this in your Authenticator App</h3><img src="${qrCodeDataURL}" />`); }
			}
			const container = document.getElementById('twofa-verification-container');
			if (!container) return;
			container.innerHTML = `
				<div class="mt-4 p-4 border rounded bg-gray-100 text-black">
					<p class="mb-2">Enter the verification code:</p>
					<form id="verify-2fa-form" class="flex flex-col gap-2">
						<input type="text" name="code" placeholder="123456" class="p-2 border flex-grow" />
						<div class="flex gap-2">
							<button type="submit" class="bg-blue-700 text-white px-4 py-2 rounded">Verify</button>
							<button type="button" id="cancel-2fa" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">Cancel</button>
						</div>
					</form>
				</div>`;
			document.getElementById('cancel-2fa')?.addEventListener('click', () => route('/profile'));
			document.getElementById('verify-2fa-form')?.addEventListener('submit', async ev => {
				ev.preventDefault();
				const fd = new FormData(ev.target as HTMLFormElement);
				const code = fd.get('code')?.toString().trim();
				if (!code) return alert('Please enter the code');
				const verify = await fetch('/api/2fa/verify-code', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ twofaMethod: method, email: user.email, code })});
				if (!verify.ok) return alert('Verification failed.');
				const changeRes = await fetch('/api/2fa/change', { method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ twofaMethod: method, email: user.email })});
				if (changeRes.ok) { alert('Updated!'); renderProfile(); } else { alert('Error: ' + await changeRes.text()); }
			});
		} else if (!enable2FA.checked && user.twofa_enabled) {
			const disableRes = await fetch('/api/2fa/change', { method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ twofaMethod: null, email: user.email })});
			if (disableRes.ok) { alert('2FA disabled'); renderProfile(); } else { alert('Error: ' + await disableRes.text()); }
		}
	});

}

export async function renderProfile() {
  
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
	} catch {
		setContent(`<div class="text-white-600">Not authorized to view this page.</div>`);
	}
}

