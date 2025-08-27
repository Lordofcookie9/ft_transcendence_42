/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MathPredicts.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 10:40:27 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/27 15:15:22 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Ball } from "../Ball.js";
import { Paddle } from "../Paddle.js";
import { Context } from "./BehaviorTreeNodes.js";

export function predictBallYDiscrete(
	ball: Ball,
	aiX: number,
	minY: number,
	maxY: number,
	opts?: {
		speedMultiplierX?: number,
		speedMultiplierY?: number,
		dt?: number,
		maxSimTime?: number,
	}
): { y: number, time: number }
{
	const	speedMultiplierX = opts?.speedMultiplierX ?? 1;
	const	speedMultiplierY = opts?.speedMultiplierY ?? 1;
	const	dt = opts?.dt ?? 1 / 480;
	const	maxSimTime = opts?.maxSimTime ?? 10;

	let 	x = ball.x;
	let		y = ball.y;
	let		vx = ball.vx * speedMultiplierX;
	let		vy = ball.vy * speedMultiplierY;
	const	size = ball.size ?? 0;
	
	let		elapsed = 0;
	const	steps = Math.ceil(maxSimTime / dt);
	for (let i = 0; i < steps; i++)
	{
		const nextX = x + vx * dt;
		const nextY = y + vy * dt;
		
		if ((vx > 0 && x <= aiX && nextX >= aiX) || (vx < 0 && x >= aiX && nextX <= aiX))
		{
			const alpha = Math.abs((aiX - x) / (nextX - x)); // 0..1
			const yAtCross = y + (nextY - y) * alpha;
			return { y: yAtCross, time: elapsed + dt * alpha };
    	}

		x = nextX;
		y = nextY;

		// rebonds murs (réflexion simple)
		if (y <= minY)
		{
			y = minY + (minY - y);
			vy = -vy;
		}
		else if (y >= maxY - size)
		{
			y = (maxY - size) - (y - (maxY - size));
			vy = -vy;
		}

		elapsed += dt;
	}
	// fallback si on n'atteint pas aiX dans maxSimTime
	return { y, time: Infinity };
}

function clamp(v: number, a: number, b: number)
{
	return (Math.max(a, Math.min(b, v)));
}
function lerp(a: number, b: number, t: number)
{
	return (a + (b - a) * t);
}

// computeAITargetY : combine réel + distordu, clamp selon ce que la raquette peut atteindre, ajoute bruit.
export function computeAITargetY(
	ctx: Context,
	params?: {
		invisibleVxMultiplier?: number, // ex: 1.6
		difficultyBlend?: number,       // 0..1, 0 = perfect(real), 1 = only distorted
		aimNoiseSigma?: number,         // px
		useDiscrete?: boolean,
		dt?: number
	}
	): { targetY: number, timeToImpact: number }
{
	const invisibleVxMultiplier = params?.invisibleVxMultiplier ?? 1.6;
	const difficultyBlend = clamp(params?.difficultyBlend ?? 0.35, 0, 1);
	const aimNoiseSigma = params?.aimNoiseSigma ?? ctx.aiPaddle.height * 0.12;
	const dt = params?.dt ?? 1 / 480;

	const ball = ctx.ball;
	const aiX = ctx.aiPaddle.x;
	const minY = ctx.minWallY;
	const maxY = ctx.maxWallY;

	// 1) prédiction réelle
	const real = predictBallYDiscrete(ball, aiX, minY, maxY, { dt });

	// 2) prédiction distordue : on modifie uniquement vx (balle invisible)
	const distorted = predictBallYDiscrete(ball, aiX, minY, maxY, {
		speedMultiplierX: invisibleVxMultiplier,
		speedMultiplierY: 1.0,
		dt
	});

	// 3) blend entre réel et distordu
	const blendedY = lerp(real.y, distorted.y, difficultyBlend);

	// 4) temps réel jusqu'à l'impact (préférer real.time)
	const timeToImpact = isFinite(real.time) ? real.time : 0;

	// 5) clamp à ce que la raquette peut raisonnablement atteindre avant l'impact
	const maxMove = ctx.aiPaddle.speed * timeToImpact;
	const minReachCenter = ctx.aiPaddle.y - maxMove;
	const maxReachCenter = ctx.aiPaddle.y + maxMove;
	let target = clamp(blendedY, minReachCenter, maxReachCenter);

	// 6) ajouter bruit d'aim (approx gaussienne Box-Muller)
	if (aimNoiseSigma > 0)
	{
		const u1 = Math.random() || 1e-10;
		const u2 = Math.random();
		const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
		target += z0 * aimNoiseSigma;
	}

	target = clamp(target, minY, maxY);

	return { targetY: target, timeToImpact };
}