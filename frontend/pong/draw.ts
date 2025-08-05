import { Paddle } from "./Paddle.js";
import { Ball } from "./Ball.js";
import { Wall } from "./Wall.js";

export function draw (
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	leftScore: number,
	rightScore: number,
	topWall: Wall,
	bottomWall: Wall,
	leftPaddle: Paddle,
	rightPaddle: Paddle,
	ball: Ball
) {
	// Clear canvas
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	// Draw center vertical line
	ctx.lineWidth = 1;
	ctx.strokeStyle = "#fff";
	ctx.setLineDash([20, 20]);
	ctx.beginPath();
	ctx.moveTo(canvas.width / 2, 0);
	ctx.lineTo(canvas.width / 2, canvas.height);
	ctx.stroke();


	// Draw left score with shadow
	ctx.font = "60px 'pong-score'";
	ctx.textAlign = "right";
	ctx.shadowColor = '#0ff';
	ctx.shadowBlur = 20;
	ctx.shadowOffsetX = 4;
	ctx.shadowOffsetY = 4;
	ctx.fillStyle = "#0ff";
	ctx.fillText(leftScore.toString(), canvas.width / 2 - 60, 100);

	// Draw right score with shadow
	ctx.textAlign = "left";
	ctx.fillText(rightScore.toString(), canvas.width / 2 + 60, 100);

	// Reset shadow for other elements
	ctx.shadowColor = 'transparent';
	ctx.shadowBlur = 0;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 0;

	topWall.draw(ctx);
	bottomWall.draw(ctx);

	leftPaddle.draw(ctx);
	rightPaddle.draw(ctx);

	ball.draw(ctx);
};