let currentPage = 'home';

// DOM elements
const app = document.getElementById('app');

// Routing logic
window.addEventListener('popstate', () => {
  renderPage(document.location.pathname);
});

function navigate(path) {
  history.pushState({}, '', path);
  renderPage(path);
}

async function getCount(id) {
  const res = await fetch(`/api/count?id=${id}`);
  const data = await res.json();
  return data.count;
}

async function incrementCount(id) {
  const res = await fetch(`/api/increment?id=${id}`, {
    method: 'POST',
  });
  const data = await res.json();
  return data.count;
}

async function renderPage(path) {
  app.innerHTML = ''; // clear previous content

  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col items-center justify-center min-h-screen text-center gap-6';

  if (path === '/' || path === '/home') {
    const title = document.createElement('h1');
    title.className = 'text-4xl font-bold';
    title.textContent = 'Transcendance';

    const count = document.createElement('div');
    count.className = 'text-2xl';
    count.textContent = `Loading...`;

    const button = document.createElement('button');
    button.className = 'mt-4 px-4 py-2 bg-blue-500 text-white rounded';
    button.textContent = 'Increment';

    const nav = document.createElement('button');
    nav.className = 'text-blue-600 underline';
    nav.textContent = 'Go to Other Page';
    nav.onclick = () => navigate('/other');

    const countValue = await getCount(1);
    count.textContent = `Count: ${countValue}`;
    button.onclick = async () => {
      const newCount = await incrementCount(1);
      count.textContent = `Count: ${newCount}`;
    };

    wrapper.append(title, count, button, nav);
  } else if (path === '/other') {
    const title = document.createElement('h1');
    title.className = 'text-4xl font-bold';
    title.textContent = 'Other Page';

    const count = document.createElement('div');
    count.className = 'text-2xl';
    count.textContent = `Loading...`;

    const button = document.createElement('button');
    button.className = 'mt-4 px-4 py-2 bg-green-500 text-white rounded';
    button.textContent = 'Other Button';

    const nav = document.createElement('button');
    nav.className = 'text-blue-600 underline';
    nav.textContent = 'Back to Home';
    nav.onclick = () => navigate('/');

    const countValue = await getCount(2);
    count.textContent = `Other Count: ${countValue}`;
    button.onclick = async () => {
      const newCount = await incrementCount(2);
      count.textContent = `Other Count: ${newCount}`;
    };

    wrapper.append(title, count, button, nav);
  }

  app.appendChild(wrapper);
}

// First render
renderPage(location.pathname);
