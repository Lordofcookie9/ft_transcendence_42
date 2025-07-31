/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gameState.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/30 15:07:56 by rrichard          #+#    #+#             */
/*   Updated: 2025/07/30 16:06:36 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Ball } from "./Ball";

export let paused = false;

export function togglePause()
{
	paused = !paused;
}

export function resetBall(ball: Ball, canvas: HTMLCanvasElement, ballSize: number, BASE_SPEED: number)
{
	ball.x = canvas.width / 2 - ballSize / 2;
	ball.y = canvas.height / 2 - ballSize / 2;

	const angleRanges = [ 
		[-Math.PI / 4, Math.PI / 4],
		[(3 * Math.PI) / 4, (5 * Math.PI) / 4]
	];
	const range = angleRanges[Math.random() > 0.5 ? 0 : 1];
	const angle = Math.random() * (range[1] - range[0]) + range[0];
	ball.vx = BASE_SPEED * Math.cos(angle);
	ball.vy = BASE_SPEED * Math.sin(angle);
}