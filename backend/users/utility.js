	function sanitizeDisplayName(raw = '')
	{
		let s = String(raw).replace(/[\r\n\t]/g,' ').trim();
		s = s.replace(/\s+/g,' ').slice(0,32);
		return s;
	}

	function validDisplayName(s)
	{
    	return /^[A-Za-z0-9_ ]{3,32}$/.test(s);
	}

	function sanitizeEmail(raw = '')
	{
		return String(raw).trim().toLowerCase().slice(0,190);
	}

	function validEmail(e)
	{
		return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
	
	}

	function sanitizeAvatar(raw = '', allowRemote = false)
	{
		if (!raw)
			return '/default-avatar.png';
		if (raw.startsWith('/uploads/'))
			return raw.slice(0,200);
		if (allowRemote)
		{
			try {
				const u = new URL(raw);
				if (u.protocol === 'https:')
				{
					u.hash = '';
					return u.href.slice(0, 300);
				}
			} catch {}
		}
		return '/default-avatar.png';
	}

	module.exports = {
	sanitizeDisplayName,
	validDisplayName,
	sanitizeEmail,
	validEmail,
	sanitizeAvatar,
	};