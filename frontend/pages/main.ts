import { setContent } from '../utility.js';


export function renderMain() {
  const alias = localStorage.getItem("alias") || "Guest";
  setContent(`<div class="p-10 text-center text-white text-xl">Main Page — Welcome ${alias}</div>`);
}


