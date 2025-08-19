/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MathPredicts.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 10:40:27 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/19 17:53:07 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Ball } from "../Ball.js";
import { Paddle } from "../Paddle.js";

export function predictInvisibleBallY(ball: Ball, aiPaddle: Paddle, minY: number, maxY: number, invisibleBallSpeedMultiplier: number)
{
	let		x = ball.x;
	let		y = ball.y;
	let		vx = ball.vx * invisibleBallSpeedMultiplier;
	let		vy = ball.vy * invisibleBallSpeedMultiplier;
	const	size = ball.size || 0;
	const	aiX = aiPaddle.x;

	while ((vx > 0 && x < aiX) || (vx < 0 && x > aiX))
	{
		let	timeToWall;
		let	nextWallY;
		if (vy > 0)
		{
			nextWallY = maxY - size;
			timeToWall = (nextWallY - y) / vy;
		}
		else
		{
			nextWallY = minY;
			timeToWall = (nextWallY - y) / vy;
		}
		let	timeToPaddle = (aiX - x) / vx;
		if (timeToPaddle >= 0 && (timeToPaddle < timeToWall || timeToWall < 0))
		{
			y += vy * timeToPaddle;
			break ;
		}
		else
		{
			x += vx * timeToWall;
			y = nextWallY;
			vy = -vy;
		}
	}
	return (y);
}