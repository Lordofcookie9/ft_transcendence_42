/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pong.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/30 15:08:09 by rrichard          #+#    #+#             */
/*   Updated: 2025/07/30 16:16:33 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Paddle } from "./Paddle.js";
import { Ball } from "./Ball.js";
import { Wall } from "./Wall.js";
import { draw } from "./draw.js";
import { keysPressed, setupControls, updatePaddles } from "./controls.js";
import { checkPaddleCollision } from "./collision.js";
import { resetBall } from "./gameState.js";
import { getPaddleHeight } from "./utils.js";
import { paused, togglePause } from "./gameState.js";

export function initPongGame(container: HTMLElement)
{
	// Clean up container
	container.innerHTML = '';

	const canvas: HTMLCanvasElement = document.createElement('canvas');
	const GAME_WIDTH = 1000;
	const GAME_HEIGHT = 600;
	const paddleWidth = 20;
	const minPaddleHeight = 60;
	const maxPaddleHeight = 200;
	const paddleHeightRatio = 0.2;
	const paddleSpeed = 10;
	let leftScore = 0;
	let rightScore = 0;
	const BASE_SPEED = 3;
	const ballSize = 15;
	const BASE_SPEED_INCREMENT = 1.05;
	const MAX_EXTRA_INCREMENT = 0.10;
	const wallHeight = 5;
	const wallGap = ballSize * 2;

	canvas.tabIndex = 0;
	canvas.id = 'canvas';
	canvas.width = GAME_WIDTH;
	canvas.height = GAME_HEIGHT;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error("Could not get canvas context");

	const topWall = new Wall(wallGap, 0, canvas.width - wallGap * 2, wallHeight);
	const bottomWall = new Wall(wallGap, canvas.height - wallHeight, canvas.width - wallGap * 2, wallHeight);
	const playAreaTop = topWall.y + topWall.height;
	const playAreaBottom = bottomWall.y;
	const playAreaHeight = playAreaBottom - playAreaTop;
	const paddleY = playAreaTop + (playAreaHeight - getPaddleHeight(canvas.height, minPaddleHeight, maxPaddleHeight, paddleHeightRatio)) / 2;
	const leftPaddle = new Paddle(40, paddleY, paddleWidth, getPaddleHeight(canvas.height, minPaddleHeight, maxPaddleHeight, paddleHeightRatio), "#fff");
	const rightPaddle = new Paddle(canvas.width - paddleWidth - 40, paddleY, paddleWidth, getPaddleHeight(canvas.height, minPaddleHeight, maxPaddleHeight, paddleHeightRatio), "#fff");
	const ball = new Ball(canvas.width / 2, canvas.height / 2, ballSize, "#fff");
	resetBall(ball, canvas, ballSize, BASE_SPEED);

	setupControls();

	function gameLoop()
	{
		if (!paused)
		{
			updatePaddles(leftPaddle, rightPaddle, keysPressed, paddleSpeed, canvas, topWall, bottomWall);
			ball.update(canvas);

			if (checkPaddleCollision(ball, leftPaddle) && ball.vx < 0) {
				const relativeIntersectY = (ball.y + ball.size / 2) - (leftPaddle.y + leftPaddle.height / 2);
				const normalizedIntersectY = relativeIntersectY / (leftPaddle.height / 2);
				const bounceAngle = normalizedIntersectY * Math.PI / 4;

				// Increase speed more for edge hits
				const dynamicIncrement = BASE_SPEED_INCREMENT + Math.abs(normalizedIntersectY) * MAX_EXTRA_INCREMENT;
				const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * dynamicIncrement;

				ball.vx = Math.abs(speed * Math.cos(bounceAngle));
				ball.vy = speed * Math.sin(bounceAngle);
				ball.x = leftPaddle.x + leftPaddle.width;
			}

			if (checkPaddleCollision(ball, rightPaddle) && ball.vx > 0) {
				const relativeIntersectY = (ball.y + ball.size / 2) - (rightPaddle.y + rightPaddle.height / 2);
				const normalizedIntersectY = relativeIntersectY / (rightPaddle.height / 2);
				const bounceAngle = normalizedIntersectY * Math.PI / 4;

				const dynamicIncrement = BASE_SPEED_INCREMENT + Math.abs(normalizedIntersectY) * MAX_EXTRA_INCREMENT;
				const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * dynamicIncrement;

				ball.vx = -Math.abs(speed * Math.cos(bounceAngle));
				ball.vy = speed * Math.sin(bounceAngle);
				ball.x = rightPaddle.x - ball.size;
	  		}

			if (ball.x - ball.size < 0)
			{
				rightScore++;
				resetBall(ball, canvas, ballSize, BASE_SPEED);
			}
			if (ball.x + ball.size > canvas.width)
			{
				leftScore++;
				resetBall(ball, canvas, ballSize, BASE_SPEED);
			}
		}
		draw(ctx as CanvasRenderingContext2D, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);
		requestAnimationFrame(gameLoop);
	}
	gameLoop();
	container.appendChild(canvas);
}