import { Ball } from "./Ball";

export let paused = false;

export function togglePause() {
	paused = !paused;
}

export function resetBall(ball: Ball, canvas: HTMLCanvasElement, ballSize: number, BASE_SPEED: number) {
	ball.x = canvas.width / 2 - ballSize / 2;
	ball.y = canvas.height / 2 - ballSize / 2;
	ball.vx = BASE_SPEED * (Math.random() > 0.5 ? 1 : -1);
	ball.vy = (Math.random() - 0.5) * BASE_SPEED;
}