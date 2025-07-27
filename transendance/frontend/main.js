// Current page tracker
let currentPage = 'landing';
const app = document.getElementById('app');

// Routing
window.addEventListener('popstate', () => {
  renderPage(document.location.pathname);
});

function navigate(path) {
  history.pushState({}, '', path);
  renderPage(path);
}

// API Helpers
async function getCount(id) {
  const res = await fetch(`/api/count?id=${id}`);
  const data = await res.json();
  return data.count;
}

async function incrementCount(id) {
  const res = await fetch(`/api/increment?id=${id}`, { method: 'POST' });
  const data = await res.json();
  return data.count;
}

async function getMessages() {
  const res = await fetch('/api/chat');
  return await res.json();
}

async function sendMessage(alias, message) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias, message })
  });
  return await res.json();
}

// Chat box
function createChatBox(alias) {
  const chatBox = document.createElement('div');
  chatBox.className = 'absolute top-0 right-0 w-1/3 h-full bg-white border-l border-gray-300 flex flex-col';

  const messagesDiv = document.createElement('div');
  messagesDiv.className = 'flex-1 overflow-y-auto p-2 text-sm';
  messagesDiv.id = 'chat-messages';

  const form = document.createElement('form');
  form.className = 'p-2 border-t flex';
  const input = document.createElement('input');
  input.className = 'flex-1 border rounded px-2 py-1 mr-2';
  input.maxLength = 2000;
  input.placeholder = 'Type a message...';

  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'bg-blue-500 text-white px-3 py-1 rounded';
  send.textContent = 'Send';

  form.append(input, send);
  chatBox.append(messagesDiv, form);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text.length === 0 || text.length > 2000) return;
    await sendMessage(alias, text);
    input.value = '';
    loadMessages();
  };

  async function loadMessages() {
    const messages = await getMessages();
    messagesDiv.innerHTML = '';
    messages.forEach(msg => {
      const p = document.createElement('p');
      p.textContent = msg;
      messagesDiv.appendChild(p);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  loadMessages();
  setInterval(loadMessages, 3000);
  return chatBox;
}

// Page rendering
async function renderPage(path) {
  app.innerHTML = '';
  document.body.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col items-center justify-center min-h-screen text-center gap-6';

  if (!sessionStorage.getItem('alias') && path !== '/' && path !== '/landing') {
    navigate('/');
    return;
  }

  if (path === '/' || path === '/landing') {
  const hasAlias = sessionStorage.getItem('alias');

  // Clear body & app content
  app.innerHTML = '';
  document.body.innerHTML = '';
  const alias = sessionStorage.getItem('alias');

  // Absolute user profile button
  const profileBtn = document.createElement('button');
  profileBtn.textContent = 'User Profile';
  profileBtn.className = 'absolute top-4 left-4 text-sm text-gray-600 z-10';
  document.body.appendChild(profileBtn);

  // Centered title
  const title = document.createElement('h1');
  title.className = 'text-5xl font-bold my-8 text-center';
  title.textContent = 'Transcendance';

  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col items-center justify-center min-h-screen gap-6';

  wrapper.append(title);

  if (!hasAlias) {
    const input = document.createElement('input');
    input.className = 'border px-2 py-1 rounded';
    input.placeholder = 'Enter your alias';

    const error = document.createElement('div');
    error.className = 'text-red-500 text-sm';

    const submit = document.createElement('button');
    submit.textContent = 'Submit';
    submit.className = 'px-4 py-2 bg-green-600 text-white rounded';

    submit.onclick = () => {
      const alias = input.value.trim();
      if (
        alias.length === 0 ||
        alias.length > 32 ||
        !/^[a-zA-Z0-9 ]+$/.test(alias) ||
        /^[ ]+$/.test(alias)
      ) {
        error.textContent = 'Alias must be 1–32 characters, letters/numbers/spaces only.';
      } else {
        sessionStorage.setItem('alias', alias);
        navigate('/');
      }
    };

    wrapper.append(input, submit, error);
  } else {
    // Layout area
    const layout = document.createElement('div');
    layout.className = 'w-full max-w-6xl flex justify-between items-start px-8';

    // Left: 2 Player Options
    const twoPlayer = document.createElement('div');
    twoPlayer.className = 'w-1/4 flex flex-col items-start gap-2';
    const tpTitle = document.createElement('h2');
    tpTitle.textContent = '2 Player';
    tpTitle.className = 'text-xl font-semibold';
    const localBtn = document.createElement('button');
    localBtn.textContent = 'Local';
    localBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded';
    localBtn.onclick = () => navigate('/local-alias');
    const onlineBtn = document.createElement('button');
    onlineBtn.textContent = 'Online';
    onlineBtn.className = 'px-4 py-2 bg-gray-400 text-white rounded';
    twoPlayer.append(tpTitle, localBtn, onlineBtn);

    // Right: Tournament Options
    const tournament = document.createElement('div');
    tournament.className = 'w-1/4 flex flex-col items-start gap-2';
    const tourTitle = document.createElement('h2');
    tourTitle.textContent = 'Tournament (up to 8 players)';
    tourTitle.className = 'text-xl font-semibold';
    const localTourBtn = document.createElement('button');
    localTourBtn.textContent = 'Local Tournament';
    localTourBtn.className = 'px-4 py-2 bg-gray-400 text-white rounded';
    tournament.append(tourTitle, localTourBtn);

    layout.append(twoPlayer, tournament);
    wrapper.append(layout);
  }

  app.appendChild(wrapper);
  document.body.appendChild(app);

  // Show chat if alias exists
  if (hasAlias) {
    const chat = createChatBox(sessionStorage.getItem('alias'));
    chat.className = 'absolute top-0 right-0 w-[16.66%] h-1/4 bg-white border-l border-b border-gray-300 flex flex-col text-xs';
    document.body.appendChild(chat);
  }

  return;
}


  const alias = sessionStorage.getItem('alias');

  if (path === '/local-alias') {
    const title = document.createElement('h2');
    title.className = 'text-3xl font-bold';
    title.textContent = 'Enter second player alias';

    const input = document.createElement('input');
    input.className = 'border px-2 py-1 rounded';
    input.placeholder = 'Player 2 alias';

    const error = document.createElement('div');
    error.className = 'text-red-500 text-sm';

    const submit = document.createElement('button');
    submit.textContent = 'Start Match';
    submit.className = 'px-4 py-2 bg-green-600 text-white rounded';

    submit.onclick = () => {
      const alias2 = input.value.trim();
      if (
        alias2.length === 0 ||
        alias2.length > 32 ||
        !/^[a-zA-Z0-9 ]+$/.test(alias2) ||
        /^[ ]+$/.test(alias2)
      ) {
        error.textContent = 'Alias must be 1–32 characters, letters/numbers/spaces only.';
      } else {
        sessionStorage.setItem('alias2', alias2);
        navigate('/local-match');
      }
    };

    wrapper.append(title, input, submit, error);
  }

  else if (path === '/local-match') {
    const alias2 = sessionStorage.getItem('alias2');
    const header = document.createElement('div');
    header.className = 'w-full flex justify-between p-4';

    const profileBtn = document.createElement('button');
    profileBtn.textContent = 'User Profile';
    profileBtn.className = 'text-sm text-gray-600';

    const homeBtn = document.createElement('button');
    homeBtn.textContent = 'Home';
    homeBtn.className = 'text-sm text-blue-600 underline';
    homeBtn.onclick = () => navigate('/');

    header.append(profileBtn, homeBtn);

    const title = document.createElement('h1');
    title.className = 'text-4xl font-bold';
    title.textContent = 'Local 1v1';

    const layout = document.createElement('div');
    layout.className = 'flex justify-between items-center w-full max-w-4xl mt-8';

    const left = document.createElement('div');
    left.textContent = `${alias}: 0`;

    const middle = document.createElement('div');
    middle.className = 'border border-dashed p-12 text-gray-400';
    middle.textContent = 'Pong Placeholder';

    const right = document.createElement('div');
    right.textContent = `${alias2}: 0`;

    layout.append(left, middle, right);

    const rules = document.createElement('div');
    rules.className = 'text-sm text-gray-600 mt-6 max-w-xl';
    rules.textContent = 'Rules: Classic Pong. Player 1 controls: Z/S. Player 2 controls: 2/5. Press R to restart.';

    wrapper.append(header, title, layout, rules);
  }

  app.appendChild(wrapper);
  document.body.appendChild(app);
  if (path !== '/' && path !== '/landing' && path !== '/local-match' && path != '/local-alias') {
  const chat = createChatBox(alias);
  chat.className = 'absolute top-0 right-0 w-1/3 h-1/2 bg-white border-l border-b border-gray-300 flex flex-col';
  document.body.appendChild(chat);
}
}

renderPage(location.pathname);