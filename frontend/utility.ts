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

export function renderNotFound() {
	setContent('<div class="p-10 text-red-500 text-xl">404: Page not found</div>');
}