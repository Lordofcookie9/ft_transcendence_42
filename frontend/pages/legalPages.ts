export function renderLegal() {
    const el = document.getElementById('app');
    if (!el) return;
	el.innerHTML = `
	<div class="prose prose-invert max-w-3xl mx-auto p-6 text-sm">
		<div class="mb-4"><a href="/home" onclick="route('/home');return false;" class="text-indigo-400 hover:text-white text-xs">← Home</a></div>
		<h1 class="text-xl font-bold">Legal Mentions</h1>
		<p><strong>Publisher:</strong> Robin Richard Canavaggio, Judith Meyer, Yulin Zhuang</p>
		<p><strong>Director of Publication:</strong> Judith Meyer</p>
		<p><strong>Contact:</strong> rrichard@student.42.fr</p>
		<p><strong>Hosting Provider:</strong> 42 - Association à but non lucratif, 96 boulevard Bessières, 75017 Paris France, www.42.fr</p>
		<p><strong>Intellectual Property:</strong> All content (text, code, images) is the property of the site operators unless otherwise stated. Any reproduction or use without permission is prohibited.</p>
		<p><strong>Liability:</strong> The publisher is not responsible for external links or content posted by users.</p>
		<p><strong>Data Protection:</strong> Personal data is processed in accordance with the GDPR. See our <a href="/privacy" onclick="route('/privacy');return false;">Privacy Policy</a>.</p>
		<p class="mt-6 text-xs text-gray-400">Last update: ${new Date().toISOString().split('T')[0]}</p>
	</div>`;
}

export function renderPrivacy() {
    const el = document.getElementById('app');
    if (!el) return;
  el.innerHTML = `
  <div class="prose prose-invert max-w-3xl mx-auto p-6 text-sm">
   <div class="mb-4"><a href="/home" onclick="route('/home');return false;" class="text-indigo-400 hover:text-white text-xs">← Home</a></div>
     <h1 class="text-xl font-bold">Privacy Policy</h1>
     <p>This service processes a minimal set of personal data strictly needed to provide gameplay and communication features.</p>
     <h2 class="text-lg font-semibold">Data Collected</h2>
     <ul>
       <li>Email address (account identification, login, security notices).</li>
       <li>Game history (match results, opponents, timestamps) to show stats and rankings.</li>
       <li>Messages sent/received (to deliver chat functionality; may be temporarily stored).</li>
     </ul>
     <h2 class="text-lg font-semibold">Purposes & Legal Bases</h2>
     <ul>
       <li>Account & authentication (email) – contract performance.</li>
       <li>Gameplay features & stats (game history) – contract performance / legitimate interest (improving service).</li>
       <li>Messaging between users (messages) – contract performance.</li>
     </ul>
     <h2 class="text-lg font-semibold">Retention</h2>
     <ul>
       <li>Email: retained while the account is active; deleted upon account deletion.</li>
       <li>Game history: retained while the account exists; may be anonymized afterward for aggregate stats.</li>
       <li>Messages: retained while both participants keep accounts; subject to deletion on request if feasible.</li>
     </ul>
     <h2 class="text-lg font-semibold">Rights (RGPD)</h2>
     <p>You may request access, rectification, deletion, restriction, portability, or object to processing. Contact: <a href="mailto:rrichard@student.42.fr">rrichard@student.42.fr</a>. You can lodge a complaint with the CNIL.</p>
     <h2 class="text-lg font-semibold">Transfers & Sharing</h2>
     <p>No sale of data. Hosting provider only (infrastructure + storage). No extra third-country transfers beyond hosting location.</p>
     <h2 class="text-lg font-semibold">Security</h2>
     <p>Passwords hashed, limited internal access, basic monitoring.</p>
     <p>Last update: ${new Date().toISOString().split('T')[0]}</p>
     <p><em>This summary is informational; a fuller policy can be added if scope expands.</em></p>
    </div>`;
}

export function renderTerms() {
    const el = document.getElementById('app');
    if (!el) return;
  el.innerHTML = `
  <div class="prose prose-invert max-w-3xl mx-auto p-6 text-sm">
   <div class="mb-4"><a href="/home" onclick="route('/home');return false;" class="text-indigo-400 hover:text-white text-xs">← Home</a></div>
     <h1 class="text-xl font-bold">Terms of Use</h1>
     <p>These Terms govern your use of the site (the "Service"). By accessing or using the Service you agree to them. If you do not agree, do not use the Service.</p>

     <h2 class="text-lg font-semibold">1. Account & Eligibility</h2>
     <ul>
       <li>You must provide accurate information (a valid email, a display name).</li>
       <li>You are responsible for keeping credentials confidential and for activity under your account.</li>
       <li>You may request deletion of your account at any time.</li>
     </ul>

     <h2 class="text-lg font-semibold">2. Acceptable Use</h2>
     <ul>
       <li>No harassment, hate speech, threats, or unlawful content.</li>
       <li>No cheating, exploiting bugs, automation/bots, or attempts to disrupt gameplay or infrastructure.</li>
       <li>No impersonation of other users or staff.</li>
       <li>Do not upload malicious code or attempt unauthorized access.</li>
     </ul>

     <h2 class="text-lg font-semibold">3. User Content & Chat</h2>
     <p>You are solely responsible for content you send (messages, display name, avatar). Temporary storage may occur to deliver messages. We may remove content that violates these Terms.</p>

     <h2 class="text-lg font-semibold">4. Intellectual Property</h2>
     <p>Code, game logic, and UI assets are owned by the operator or licensors. Limited personal, non‑commercial use is granted to access and play. Do not copy, reverse engineer, or redistribute significant parts of the Service without permission (except where permitted by applicable law).</p>

     <h2 class="text-lg font-semibold">5. Availability & Changes</h2>
     <p>The Service is provided on an experimental / best-effort basis and may change, suspend, or end at any time without notice. Features can be added or removed.</p>

     <h2 class="text-lg font-semibold">6. Privacy</h2>
     <p>Personal data handling is described in the Privacy Policy (see that page). These Terms incorporate that policy by reference.</p>

     <h2 class="text-lg font-semibold">7. Termination</h2>
     <p>We may restrict or terminate access (temporary or permanent) if you violate these Terms, abuse the Service, or create security / stability risks. You may stop using the Service at any time.</p>

     <h2 class="text-lg font-semibold">8. Disclaimers</h2>
     <p>The Service is provided "AS IS" without warranties of any kind (express or implied), including fitness for a particular purpose, availability, or non-infringement. Use is at your own risk.</p>

     <h2 class="text-lg font-semibold">9. Liability</h2>
     <p>To the maximum extent permitted by law, cumulative liability related to the Service is limited to direct damages not exceeding the amount (if any) you paid (currently zero). We are not liable for indirect, incidental, or consequential damages.</p>

     <h2 class="text-lg font-semibold">10. Updates to Terms</h2>
     <p>We may update these Terms for legal, technical, or operational reasons. Material changes will be posted here with a new date. Continued use after changes constitutes acceptance.</p>

     <h2 class="text-lg font-semibold">11. Governing Law</h2>
     <p>Unless mandatory local law applies, these Terms are governed by French law. Any disputes should first be addressed informally via the contact below.</p>

     <h2 class="text-lg font-semibold">12. Contact</h2>
     <p>Questions or requests: <a href="mailto:rrichard@student.42.fr">rrichard@student.42.fr</a></p>

     <p class="mt-6 text-xs text-gray-400">Last update: ${new Date().toISOString().split('T')[0]}</p>
    </div>`;
}

export function renderCookies() {
    const el = document.getElementById('app');
    if (!el) return;
  el.innerHTML = `
  <div class="prose prose-invert max-w-3xl mx-auto p-6 text-sm">
   <div class="mb-4"><a href="/home" onclick="route('/home');return false;" class="text-indigo-400 hover:text-white text-xs">← Home</a></div>
     <h1 class="text-xl font-bold">Cookie Notice</h1>
     <p>We only use strictly necessary (essential) cookies required for authentication and security. No analytics, advertising, or tracking cookies are used.</p>
     <h2 class="text-lg font-semibold mt-6">No Optional Cookies</h2>
     <p>There are currently no preference, analytics, or marketing cookies. If this changes, this notice will be updated and consent will be requested where required.</p>
     <h2 class="text-lg font-semibold mt-6">Local Storage</h2>
     <p>We also use <em>localStorage</em> for transient UI/game data (e.g., display name cache, scores, presence flags). This data stays in your browser and can be cleared at any time via your browser settings or the logout/delete account features.</p>
     <p class="mt-4 text-xs text-gray-400">Last update: ${new Date().toISOString().split('T')[0]}</p>
    </div>`;
}