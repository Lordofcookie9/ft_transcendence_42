function setContent(html: string) {
  const app = document.getElementById('app');
  if (app) app.innerHTML = html;
}

function route(path: string) {
  history.pushState({}, '', path);
  handleLocation();
}

function handleLocation() {
  const path = window.location.pathname;
  const page = routes[path] || renderNotFound;
  page();
}

const profileBtn = document.createElement('button');
profileBtn.textContent = 'User Profile';
profileBtn.className = 'absolute top-4 left-4 text-sm text-gray-600 z-10';
profileBtn.onclick = () => route('/profile');
document.body.appendChild(profileBtn);


type RouteMap = { [path: string]: () => void };

const routes: RouteMap = {
  '/': renderHome,
  '/login': renderLogin,
  '/register': renderRegister,
  '/profile': renderProfile,
  '/play': renderGame,
};

function renderHome() {
  setContent(`
    <div class="text-center mt-10">
      <h1 class="text-2xl font-bold">Welcome Visitor</h1>
      <button onclick="route('/login')" class="m-2 bg-blue-500 text-white px-4 py-2 rounded">Login</button>
    </div>
  `);
}

function renderLogin() {
  setContent(`
    <h1 class="text-xl font-bold">Login</h1>
    <form id="login-form" class="flex flex-col gap-2 mt-4">
      <input type="email" name="email" placeholder="Email" class="p-2 border" />
      <input type="password" name="password" placeholder="Password" class="p-2 border" />
      <button type="submit" class="bg-blue-600 text-white px-4 py-2">Submit</button>
      <button onclick="route('/register')" class="m-2 bg-green-500 text-white px-4 py-2 rounded">Create Account</button>
    </form>
  `);

  document.getElementById('login-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Call backend API via fetch()
  });
}

function renderRegister() {
  setContent(`
    <h1>Create Account</h1>
    <form id="register-form" class="flex flex-col gap-2 mt-4">
      <input name="public name" type="text" placeholder="Public Name" required class="p-2 border" />
      <input name="email" type="email" placeholder="Email" required class="p-2 border" />
      <input name="password" type="password" placeholder="Password" required class="p-2 border" />
       <button type="submit" class="bg-green-600 text-white px-4 py-2">Register</button>
    </form>
  `);

  const form = document.getElementById('register-form')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form as HTMLFormElement);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
      display_name: formData.get('display_name')
    };

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert('Account created!');
      route('/login');
    } else {
      const msg = await res.text();
      alert('Error: ' + msg);
    }
  });
}

function renderProfile() {
  setContent(`<h1>Profile Page</h1>`);
}

function renderGame() {
  setContent(`<h1>Game Screen</h1><canvas id="pong"></canvas>`);
}

function renderNotFound() {
  setContent(`<h1 class="text-red-600 text-2xl">404 - Page Not Found</h1>`);
}

window.onpopstate = handleLocation;

// Attach to window if needed
(window as any).route = route;


handleLocation();