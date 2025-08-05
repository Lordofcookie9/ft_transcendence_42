import { Paddle } from "./Paddle.js";
import { Wall } from "./Wall.js";
import { togglePause } from "./gameState.js";

export const keysPressed: { [key: string]: boolean } = {};

export function setupControls() {
	window.addEventListener('keydown', (e) => {
		keysPressed[e.key] = true;
		if (e.key === 'p' || e.key === 'P') {
			togglePause();
		}
	});
	window.addEventListener('keyup', (e) => {
		keysPressed[e.key] = false;
	});
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