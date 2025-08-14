/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MathPredicts.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 10:40:27 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 17:54:38 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Ball } from "../Ball.js";
import { Paddle } from "../Paddle.js";

export function predictY(ball: Ball, t: number, minY: number, maxY: number): number
{
	let		y = ball.y;
	let		vy = ball.vy;
	const	size = ball.size || 0;
	let		timeLeft = t;
	let		bounceCount = 0;
	
	while (timeLeft > 0)
	{
		let nextWallY;
		let timeToWall;
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
		if (timeToWall > timeLeft || timeToWall < 0)
		{
			y += vy * timeLeft;
			break;
		}
		else
		{
			y = nextWallY;
			vy = -vy;
			timeLeft -= timeToWall;
			bounceCount++;
		}
	}
	const errorMagnitude = 40 + bounceCount * 40;
	const error = (Math.random() - 0.5) * errorMagnitude;
	y += error;
	return (y);
}

export function computeTimeToReach(ball: Ball, paddle: Paddle): number | null
{
	const dx = paddle.x - ball.x;

	if ((dx > 0 && ball.vx <= 0) || (dx < 0 && ball.vx >= 0))
		return (null);
	const t = dx / ball.vx;

	return (t);
}