export function renderLegal() {
    const el = document.getElementById('app');
    if (!el) return;
    el.innerHTML = `
    <div class="prose prose-invert max-w-3xl mx-auto p-6 text-sm">
     <h1 class="text-xl font-bold">Legal Mentions</h1>
     <p>Publisher: rrichard</p>
     <p>Host: rrichard</p>
     <p>Contact: rrichard@student.42.fr</p>
    </div>`;
}

export function renderPrivacy() {
    const el = document.getElementById('app');
    if (!el) return;
    el.innerHTML = `
    <div class="prose prose-invert max-w-3xl mx-auto p-6 text-sm">
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
     <h1 class="text-xl font-bold">Terms of Use</h1>
     <p>Rules, acceptable use, liability, termination.</p>
    </div>`;
}

export function renderCookies() {
    const el = document.getElementById('app');
    if (!el) return;
    el.innerHTML = `
    <div class="prose prose-invert max-w-3xl mx-auto p-6 text-sm">
     <h1 class="text-xl font-bold">Cookie Notice</h1>
     <p>List essential vs optional cookies, consent info.</p>
    </div>`;
}