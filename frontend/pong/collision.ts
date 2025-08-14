/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collision.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/12 17:37:54 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 17:37:55 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Ball } from "./Ball.js";
import { Paddle } from "./Paddle.js";

export function checkPaddleCollision(ball: Ball, paddle: Paddle): boolean
{
	const ballLeft = ball.x;
	const ballRight = ball.x + ball.size;
	const ballTop = ball.y;
	const ballBottom = ball.y + ball.size;

	const paddleLeft = paddle.x;
	const paddleRight = paddle.x + paddle.width;
	const paddleTop = paddle.y;
	const paddleBottom = paddle.y + paddle.height;

	return (
		ballRight > paddleLeft &&
		ballLeft < paddleRight &&
		ballBottom > paddleTop &&
		ballTop < paddleBottom
	);
}