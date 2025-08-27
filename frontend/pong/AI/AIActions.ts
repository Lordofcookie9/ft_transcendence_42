/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AIActions.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 10:34:18 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/27 15:41:25 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ActionNode, Status } from "./BehaviorTreeNodes.js";
import { computeAITargetY } from "./MathPredicts.js";
import { Context } from "./BehaviorTreeNodes.js";

// export const followBall = new ActionNode(ctx =>
// {
// 	const	invisibleBallSpeedMultiplier = 1.1;
// 	let		predictedY = predictInvisibleBallY(ctx.ball, ctx.aiPaddle, ctx.minWallY, ctx.maxWallY, invisibleBallSpeedMultiplier);

// 	if (!isFinite(predictedY) || isNaN(predictedY))
// 		return (Status.FAILURE);

// 	ctx.lastTargetY = Math.max(ctx.minWallY, Math.min(predictedY, ctx.maxWallY));
// 	return (Status.SUCCESS);
// });

export function makeHandleBallAwayNode(mode: 'center' | 'patrol' | 'followPlayer', params?:
	{
		patrolOffset?: number,
		patrolSpeed?: number,        
		mirrorFactor?: number,
		aimNoiseSigmaFactor?: number
	})
{
	return new ActionNode((ctx: Context) => {
		const ai = ctx.aiPaddle;
		const player = ctx.player;
		const minY = ctx.minWallY;
		const maxY = ctx.maxWallY;
		const halfH = ai.height / 2;

		const centerY = (minY + (maxY)) / 2;
		const aimNoiseSigma = (params?.aimNoiseSigmaFactor ?? 0.08) * ai.height;

		function addNoise(y: number)
		{
			if (aimNoiseSigma <= 0) return y;
			const u1 = Math.random() || 1e-10;
			const u2 = Math.random();
			const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
			return y + z0 * aimNoiseSigma;
		}

		let targetCenterY = ai.y;

		if (mode === 'center')
		{
			const offset = (Math.random() - 0.5) * (ai.height * 0.3);
			targetCenterY = centerY + offset;
		}
		else if (mode === 'patrol')
		{
			const offset = params?.patrolOffset ?? Math.max(ai.height * 0.8, 40);
			
			const t = performance.now() / 1000;
			const phase = Math.sin(t * (params?.patrolSpeed ?? 1.0));
			targetCenterY = centerY + phase * offset * 0.6;
		}
		else if (mode === 'followPlayer')
		{
			const mirrorFactor = params?.mirrorFactor ?? 0.6;
			targetCenterY = ai.y + (player.y - ai.y) * mirrorFactor;
		}

		targetCenterY = addNoise(targetCenterY);

		const minCentre = minY + halfH;
		const maxCentre = maxY - halfH;
		targetCenterY = Math.max(minCentre, Math.min(maxCentre, targetCenterY));

		ctx.lastTargetY = targetCenterY;
		return (Status.SUCCESS);
	});
}

export const anticipateWithInvisibleBall = new ActionNode(ctx =>
{
	const	invisibleBallSpeedMultiplier = 1.2;
	const	difficultyBlend = 0.4;
	const	aimNoiseSigma = ctx.aiPaddle.height * 0.2;
	const	{ targetY } = computeAITargetY(ctx, {
		invisibleVxMultiplier: invisibleBallSpeedMultiplier,
		difficultyBlend,
		aimNoiseSigma,
		dt: 1 / 480
	});

	if (!isFinite(targetY) || isNaN(targetY))
		return (Status.FAILURE);

	ctx.lastTargetY = Math.max(ctx.minWallY, Math.min(targetY, ctx.maxWallY));
	return (Status.SUCCESS);
});
					