/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pong.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/12 17:56:51 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 18:00:43 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Paddle } from "./Paddle.js";
import { Ball } from "./Ball.js";
import { Wall } from "./Wall.js";
import { draw } from "./draw.js";
import { keysPressed, updatePaddle, teardownControls } from "./controls.js"; // no setupControls here
import { checkPaddleCollision } from "./collision.js";
import { resetBall, paused, togglePause } from "./gameState.js";
import { OpponentAI } from "./AI/OpponentAI.js";

let currentTeardown: (() => void) | null = null;

export function initPongGame(container: HTMLElement, onGameEnd?: (winner: string) => void)
{
	// Teardown any previous instance
	if (currentTeardown)
	{
		try
		{
			currentTeardown();
		}
		catch {} 
		currentTeardown = null;
	}
	container.innerHTML = "";

	// Canvas
	const canvas: HTMLCanvasElement = document.createElement("canvas");
	const GAME_WIDTH = 1280;
	const GAME_HEIGHT = 720;
	canvas.tabIndex = 0;
	canvas.id = "canvas";
	canvas.width = GAME_WIDTH;
	canvas.height = GAME_HEIGHT;

	const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
	if (!ctx)
		throw new Error("Could not get canvas context");

	// Ensure not paused; keyboard handlers fresh for this match
	try
	{
		if (paused)
			togglePause();
	}
	catch {}

	// Remove any global listeners from previous matches
	try
	{
		teardownControls();
	}
	catch {}

	// Clear stale key state
	for (const k in keysPressed)
	{
		try
		{
			delete (keysPressed as any)[k];
		}
		catch {}
	}

	// Local key listeners with preventDefault for arrow keys
	const onKeyDown = (e: KeyboardEvent) => {
		keysPressed[e.key] = true;
		if (e.key === "ArrowUp" || e.key === "ArrowDown")
			e.preventDefault();
	};
	const onKeyUp = (e: KeyboardEvent) => {
		keysPressed[e.key] = false;
		if (e.key === "ArrowUp" || e.key === "ArrowDown")
			e.preventDefault();
	};
	window.addEventListener("keydown", onKeyDown, { passive: false });
	window.addEventListener("keyup", onKeyUp, { passive: false });

	// Names & scores (left = p1, right = p2)
	const p1Name = localStorage.getItem("p1") || "Player 1";
	const p2Name = localStorage.getItem("p2") || "Player 2";
	let leftScore  = parseInt(localStorage.getItem("p1Score") || "0", 10);
	let rightScore = parseInt(localStorage.getItem("p2Score") || "0", 10);

	const updateScoreDisplay = () => {
		const leftEl = document.getElementById("player1-info");
		const rightEl = document.getElementById("player2-info");
		if (leftEl)
			leftEl.textContent  = `${p1Name}: ${leftScore}`;
		if (rightEl)
			rightEl.textContent = `${p2Name}: ${rightScore}`;
	};
	updateScoreDisplay();

	// Game constants
	const paddleWidth = 20;
	const paddleHeight = 110;
	const paddleSpeed = 5;
	const BASE_SPEED = 3;
	const NORMAL_SPEED = 8;
	const ballSize = 15;
	const wallHeight = 5;
	const wallGap = ballSize * 2;
	const WINNING_SCORE = 10;

	// Walls & paddles
	const topWall = new Wall(wallGap, 0, canvas.width - wallGap * 2, wallHeight);
	const bottomWall = new Wall(wallGap, canvas.height - wallHeight, canvas.width - wallGap * 2, wallHeight);
	const playAreaTop = topWall.y + topWall.height;
	const playAreaBottom = bottomWall.y;
	const playAreaHeight = playAreaBottom - playAreaTop;
	const paddleY = playAreaTop + (playAreaHeight - paddleHeight) / 2;

	const leftPaddle = new Paddle(40, paddleY, paddleWidth, paddleHeight, "#fff");
	const rightPaddle = new Paddle(canvas.width - paddleWidth - 40, paddleY, paddleWidth, paddleHeight, "#fff");
	const ball = new Ball(canvas.width / 2, canvas.height / 2, ballSize, "#fff");

	// First-serve "ready" gate (both players hold UP to start)
	let needInitialReady = true;
	ball.vx = 0; ball.vy = 0;
	ball.x = canvas.width / 2 - ballSize / 2;
	ball.y = canvas.height / 2 - ballSize / 2;

	let gameEnded = false;
	let rafId = 0;
	let alive = true;

	function destroy()
	{
		alive = false;
		if (rafId)
			cancelAnimationFrame(rafId);
		window.removeEventListener("keydown", onKeyDown);
		window.removeEventListener("keyup", onKeyUp);
	}
	currentTeardown = destroy;

	function gameLoop()
	{
		if (!alive)
			return;

		// First-serve overlay (only once at 0–0)
		if (needInitialReady && leftScore === 0 && rightScore === 0)
		{
			updatePaddle(leftPaddle,  { up: "w",       down: "s" },         keysPressed, paddleSpeed, canvas, topWall, bottomWall);
			updatePaddle(rightPaddle, { up: "ArrowUp", down: "ArrowDown" }, keysPressed, paddleSpeed, canvas, topWall, bottomWall);

			draw(ctx, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);

			ctx.save();
			ctx.font = "28px sans-serif";
			ctx.textAlign = "center";
			ctx.fillStyle = "white";
			ctx.shadowColor = "black";
			ctx.shadowBlur = 6;
			ctx.fillText("Game will start when players press their UP keys (W and ↑)", canvas.width / 2, canvas.height / 2 - 40);
			ctx.fillText("Hold both keys at the same time to serve!", canvas.width / 2, canvas.height / 2);
			ctx.restore();

			if (keysPressed["w"] && keysPressed["ArrowUp"])
			{
				needInitialReady = false;
				resetBall(ball, canvas, ballSize, BASE_SPEED);
			}

			rafId = requestAnimationFrame(gameLoop);
			return;
		}

		// Normal loop
		if (!paused && !gameEnded)
		{
			updatePaddle(leftPaddle,  { up: "w",       down: "s" },         keysPressed, paddleSpeed, canvas, topWall, bottomWall);

			// opponentAI.update(ball);
			// const aiCenter = rightPaddle.y + rightPaddle.height / 2;
			// const tolerance = 5;
			// if (opponentAI.lastTargetY !== undefined)
			// {
			// 	if (aiCenter < opponentAI.lastTargetY - tolerance)
			// 	{
			// 		keysPressed['ArrowUp'] = false;
			// 		keysPressed['ArrowDown'] = true;
			// 	}
			// 	else if (aiCenter > opponentAI.lastTargetY + tolerance)
			// 	{
			// 		keysPressed['ArrowUp'] = true;
			// 		keysPressed['ArrowDown'] = false;
			// 	}
			// 	else
			// 	{
			// 		keysPressed['ArrowUp'] = false;
			// 		keysPressed['ArrowDown'] = false;
			// 	}
			// }
			updatePaddle(rightPaddle, { up: "ArrowUp", down: "ArrowDown" }, keysPressed, paddleSpeed, canvas, topWall, bottomWall);
			ball.update(playAreaTop, playAreaBottom);

			// Collisions
			if (checkPaddleCollision(ball, leftPaddle) && ball.vx < 0)
			{
				const relY = (ball.y + ball.size / 2) - (leftPaddle.y + leftPaddle.height / 2);
				const normY = relY / (leftPaddle.height / 2);
				const angle = normY * Math.PI / 4;
				ball.vx = Math.abs(NORMAL_SPEED * Math.cos(angle));
				ball.vy = NORMAL_SPEED * Math.sin(angle);
				ball.x = leftPaddle.x + leftPaddle.width;
			}

			if (checkPaddleCollision(ball, rightPaddle) && ball.vx > 0)
			{
				const relY = (ball.y + ball.size / 2) - (rightPaddle.y + rightPaddle.height / 2);
				const normY = relY / (rightPaddle.height / 2);
				const angle = normY * Math.PI / 4;
				ball.vx = -Math.abs(NORMAL_SPEED * Math.cos(angle));
				ball.vy = NORMAL_SPEED * Math.sin(angle);
				ball.x = rightPaddle.x - ball.size;
			}

			// Right scores (p2)
			if (ball.x - ball.size < 0)
			{
				rightScore++;
				localStorage.setItem("p2Score", rightScore.toString());
				updateScoreDisplay();

				if (rightScore >= WINNING_SCORE)
				{
					gameEnded = true;
					const winner = p2Name;
					try
					{
						window.dispatchEvent(new CustomEvent("pong:gameend", { detail: { winner } }));
					}
					catch {}
					try
					{
						onGameEnd?.(winner);
					}
					catch {}
					container.innerHTML = `
						<div class="text-white text-center space-y-4">
							<h2 class="text-4xl font-bold">${winner} wins!</h2>
						</div>
					`;
					destroy();
				}
				else
					resetBall(ball, canvas, ballSize, BASE_SPEED);
			}

			// Left scores (p1)
			if (!gameEnded && ball.x + ball.size > canvas.width)
			{
				leftScore++;
				localStorage.setItem("p1Score", leftScore.toString());
				updateScoreDisplay();

				if (leftScore >= WINNING_SCORE)
				{
					gameEnded = true;
					const winner = p1Name;
					try
					{
						window.dispatchEvent(new CustomEvent("pong:gameend", { detail: { winner } }));
					}
					catch {}
					try
					{
						onGameEnd?.(winner);
					}
					catch {}
					container.innerHTML = `
					<div class="text-white text-center space-y-4">
						<h2 class="text-4xl font-bold">${winner} wins!</h2>
					</div>
					`;
					destroy();
				} 
				else
					resetBall(ball, canvas, ballSize, BASE_SPEED);
			}
		}

		draw(ctx, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);
		rafId = requestAnimationFrame(gameLoop);
	}

	gameLoop();
	container.appendChild(canvas);
	try
	{
		canvas.focus();
	}
	catch {}
}