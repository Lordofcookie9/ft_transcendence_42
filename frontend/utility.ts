export function setContent(html: string) {
	const app = document.getElementById('app');
	if (app) app.innerHTML = html;
  }
  
export function escapeHtml(str: string) {
	return str.replace(/&/g, "&amp;")
						.replace(/</g, "&lt;")
						.replace(/>/g, "&gt;")
						.replace(/"/g, "&quot;")
						.replace(/'/g, "&#039;");
}

export function formatDbDateTime(ts: string): string {
  if (!ts) return '';
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export function formatDbTime(ts: string): string {
  if (!ts) return '';
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function renderNotFound() {
	setContent('<div class="p-10 text-red-500 text-xl">404: Page not found</div>');
}