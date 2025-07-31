/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   controls.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/30 15:08:02 by rrichard          #+#    #+#             */
/*   Updated: 2025/07/30 15:10:21 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Paddle } from "./Paddle.js";
import { Wall } from "./Wall.js";
import { togglePause } from "./gameState.js";

export const keysPressed: { [key: string]: boolean } = {};

export function setupControls()
{
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

export function updatePaddles(
	leftPaddle: Paddle,
	rightPaddle: Paddle,
	keysPressed: { [key: string]: boolean },
	paddleSpeed: number,
	canvas: HTMLCanvasElement,
	topWall: Wall,
	bottomWall: Wall
)
{
	if (keysPressed['w'] || keysPressed['W']) {
		leftPaddle.y = Math.max(0, leftPaddle.y - paddleSpeed);
	}
	if (keysPressed['s'] || keysPressed['S']) {
		leftPaddle.y = Math.min(canvas.height - leftPaddle.height, leftPaddle.y + paddleSpeed);
	}
	if (keysPressed['ArrowUp']) {
		rightPaddle.y = Math.max(0, rightPaddle.y - paddleSpeed);
	}
	if (keysPressed['ArrowDown']) {
		rightPaddle.y = Math.min(canvas.height - rightPaddle.height, rightPaddle.y + paddleSpeed);
	}

	if (topWall.checkCollision(leftPaddle)) {
		leftPaddle.y = topWall.y + topWall.height;
	}
	if (topWall.checkCollision(rightPaddle)) {
		rightPaddle.y = topWall.y + topWall.height;
	}

	if (bottomWall.checkCollision(leftPaddle)) {
		leftPaddle.y = bottomWall.y - leftPaddle.height;
	}
	if (bottomWall.checkCollision(rightPaddle)) {
		rightPaddle.y = bottomWall.y - rightPaddle.height;
	}
}