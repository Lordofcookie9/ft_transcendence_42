type ButtonSpec = { label: string; value: any; classes?: string };

function ensureRoot(): HTMLElement {
  let root = document.getElementById('modal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'modal-root';
    document.body.appendChild(root);
  }
  return root;
}

let queue: (() => void)[] = [];
let active = false;

function runQueue() {
  if (active) return;
  const next = queue.shift();
  if (next) { active = true; next(); }
}

function finish() { active = false; runQueue(); }

function baseOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  return overlay;
}

function buildModal(inner: string): { overlay: HTMLDivElement; panel: HTMLDivElement } {
  const overlay = baseOverlay();
  overlay.innerHTML = `
    <div class="max-w-sm w-full rounded-lg shadow-xl bg-gray-800 border border-gray-700 animate-fade-in scale-100">
      ${inner}
    </div>`;
  const panel = overlay.firstElementChild as HTMLDivElement;
  return { overlay, panel };
}

function mount<T>(html: string, buttons: ButtonSpec[], resolve: (v: T) => void) {
  const { overlay, panel } = buildModal(html + `
    <div class='mt-6 flex flex-wrap gap-2 justify-end'>
      ${buttons.map((b,i)=>`<button data-btn="${i}" class="px-4 py-2 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400 ${b.classes||'bg-indigo-600 hover:bg-indigo-500 text-white'}">${b.label}</button>`).join('')}
    </div>`);

  const previouslyFocused = document.activeElement as HTMLElement | null;
  function cleanup(v: T) {
    overlay.remove();
    if (previouslyFocused) previouslyFocused.focus();
    finish();
    resolve(v);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      // click outside acts like cancel if one provided with value === false or null
      const cancelIdx = buttons.findIndex(b => b.value === false || b.value === null);
      if (cancelIdx !== -1) cleanup(buttons[cancelIdx].value);
    }
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const cancelIdx = buttons.findIndex(b => b.value === false || b.value === null);
      if (cancelIdx !== -1) cleanup(buttons[cancelIdx].value);
    }
  });

  overlay.querySelectorAll('button[data-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-btn')!,10);
      cleanup(buttons[idx].value);
    });
  });

  ensureRoot().appendChild(overlay);
  (overlay.querySelector('button[data-btn]') as HTMLButtonElement)?.focus();
}

export function uiAlert(message: string, title = 'Notice'): Promise<void> {
  return new Promise(res => {
  queue.push(() => mount(`<div class='p-6'><h2 class='text-lg font-semibold text-white mb-2'>${title}</h2><p class='text-gray-300 text-sm whitespace-pre-wrap'>${message}</p></div>`, [{ label: 'OK', value: undefined }], () => res()));
    runQueue();
  });
}

export function uiConfirm(message: string, title = 'Confirm'): Promise<boolean> {
  return new Promise(res => {
    queue.push(() => mount<boolean>(`<div class='p-6'><h2 class='text-lg font-semibold text-white mb-2'>${title}</h2><p class='text-gray-300 text-sm whitespace-pre-wrap'>${message}</p></div>`, [
      { label: 'Cancel', value: false, classes: 'bg-gray-600 hover:bg-gray-500 text-white' },
      { label: 'OK', value: true }
    ], v => res(!!v)));
    runQueue();
  });
}

export function uiPrompt(message: string, options?: { title?: string; placeholder?: string; okLabel?: string; cancelLabel?: string; defaultValue?: string; validate?:(v:string)=>string|true }): Promise<string|null> {
  const { title='Input', placeholder='', okLabel='OK', cancelLabel='Cancel', defaultValue='', validate } = options || {};
  return new Promise(res => {
    queue.push(() => {
      const formHtml = `<div class='p-6'>
        <h2 class='text-lg font-semibold text-white mb-3'>${title}</h2>
        <p class='text-gray-300 text-sm mb-3 whitespace-pre-wrap'>${message}</p>
        <input id='modal-input' type='text' value="${defaultValue.replace(/"/g,'&quot;')}" placeholder='${placeholder}' class='w-full px-3 py-2 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm' />
        <p id='modal-error' class='text-xs text-red-400 mt-1 hidden'></p>
      </div>`;
      const buttons: ButtonSpec[] = [
        { label: cancelLabel, value: null, classes: 'bg-gray-600 hover:bg-gray-500 text-white' },
        { label: okLabel, value: '__OK__' }
      ];
      const { overlay, panel } = buildModal(formHtml + `<div class='mt-4 flex justify-end gap-2'>${buttons.map((b,i)=>`<button data-btn='${i}' class='px-4 py-2 rounded text-sm font-medium ${b.classes||'bg-indigo-600 hover:bg-indigo-500 text-white'}'>${b.label}</button>`).join('')}</div>`);
      const previouslyFocused = document.activeElement as HTMLElement | null;
      function cleanup(v: string|null) { overlay.remove(); finish(); if (previouslyFocused) previouslyFocused.focus(); res(v); }

      const input = overlay.querySelector('#modal-input') as HTMLInputElement;
      const errEl = overlay.querySelector('#modal-error') as HTMLParagraphElement;

      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(null); });
      overlay.addEventListener('keydown', e => { if (e.key === 'Escape') cleanup(null); if (e.key === 'Enter') submit(); });
      overlay.querySelectorAll('button[data-btn]').forEach(btn => btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).getAttribute('data-btn')!,10);
        if (buttons[idx].value === null) return cleanup(null);
        submit();
      }));

      function submit() {
        const val = input.value.trim();
        if (validate) {
          const vr = validate(val);
            if (vr !== true) { errEl.textContent = vr as string; errEl.classList.remove('hidden'); return; }
        }
        cleanup(val);
      }

      ensureRoot().appendChild(overlay);
      input.focus();
      active = true; // mark active since we bypass mount helper
    });
    runQueue();
  });
}

// Optional: convenience replacements (commented to avoid breaking synchronous assumptions)
// window.alert = (msg:any)=>{ uiAlert(String(msg)); };