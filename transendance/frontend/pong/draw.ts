/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   draw.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/30 15:08:04 by rrichard          #+#    #+#             */
/*   Updated: 2025/07/30 15:09:57 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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
)
{
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

	// Draw center horizontal line
	ctx.beginPath();
	ctx.moveTo(0, canvas.height / 2);
	ctx.lineTo(canvas.width, canvas.height / 2);
	ctx.stroke();
	ctx.setLineDash([]);

	// Draw left score
	ctx.font = "80px Arial";
	ctx.fillStyle = "#fff";
	ctx.textAlign = "right";
	ctx.fillText(leftScore.toString(), canvas.width / 2 - 60, 100);

	// Draw right score
	ctx.textAlign = "left";
	ctx.fillText(rightScore.toString(), canvas.width / 2 + 60, 100);

	topWall.draw(ctx);
	bottomWall.draw(ctx);

	leftPaddle.draw(ctx);
	rightPaddle.draw(ctx);

	ball.draw(ctx);
}