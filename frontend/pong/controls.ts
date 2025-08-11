import { Paddle } from "./Paddle.js";
import { Wall } from "./Wall.js";
import { togglePause } from "./gameState.js";

export const keysPressed: { [key: string]: boolean } = {};

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let keyupHandler: ((e: KeyboardEvent) => void) | null = null;


export function setupControls() {
  // avoid double-binding
  if (keydownHandler && keyupHandler) return;

  keydownHandler = (e: KeyboardEvent) => {
    keysPressed[e.key] = true;
    if (e.key === 'p' || e.key === 'P') togglePause();
  };

  keyupHandler = (e: KeyboardEvent) => {
    keysPressed[e.key] = false;
  };

  // non-null assertion (!) — we just assigned them above
  window.addEventListener('keydown', keydownHandler!);
  window.addEventListener('keyup', keyupHandler!);
}

export function teardownControls() {
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  if (keyupHandler) {
    window.removeEventListener('keyup', keyupHandler);
    keyupHandler = null;
  }
  // clear sticky keys between games
  for (const k of Object.keys(keysPressed)) delete keysPressed[k];
}

export function updatePaddle(
	paddle: Paddle,
	keys: { up: string, down: string },
	keysPressed: { [key: string]: boolean },
	paddleSpeed: number,
	canvas: HTMLCanvasElement,
	topWall: Wall,
	bottomWall: Wall
) {
	if (keysPressed[keys.up]) {
		paddle.y = Math.max(0, paddle.y - paddleSpeed);
	}
	if (keysPressed[keys.down]) {
		paddle.y = Math.min(canvas.height - paddle.height, paddle.y + paddleSpeed);
	}

	if (topWall.checkCollision(paddle)) {
		paddle.y = topWall.y + topWall.height;
	}
	if (bottomWall.checkCollision(paddle)) {
		paddle.y = bottomWall.y - paddle.height;
	}
}