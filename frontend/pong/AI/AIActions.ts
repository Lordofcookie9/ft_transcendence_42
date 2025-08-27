/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AIActions.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 10:34:18 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/27 13:25:00 by rrichard         ###   ########.fr       */
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

export function makeHandleBallAwayNode(mode: 'center' | 'patrol' | 'followPlayer' | 'anticipate', params?: {
	patrolOffset?: number,       // px from center for patrol
	patrolSpeed?: number,        // fraction of ai speed for oscillation
	mirrorFactor?: number,       // 0..1 how much to follow player (1 = mirror exactly)
	anticipationDt?: number,     // seconds used to predict short return
	aimNoiseSigmaFactor?: number // noise factor
	})
{
	return new ActionNode((ctx: Context) => {
		const ai = ctx.aiPaddle;
		const player = ctx.player;
		const minY = ctx.minWallY;
		const maxY = ctx.maxWallY;
		const halfH = ai.height / 2;

		// center of playable area
		const centerY = (minY + (maxY)) / 2; // si maxY est le bas intérieur
		const aimNoiseSigma = (params?.aimNoiseSigmaFactor ?? 0.08) * ai.height;

		// helper noise
		function addNoise(y: number)
		{
			if (aimNoiseSigma <= 0) return y;
			const u1 = Math.random() || 1e-10;
			const u2 = Math.random();
			const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
			return y + z0 * aimNoiseSigma;
		}

		let targetCenterY = ai.y; // default keep current

		if (mode === 'center') {
			// Return to center with a small random offset
			const offset = (Math.random() - 0.5) * (ai.height * 0.3);
			targetCenterY = centerY + offset;
		}
		else if (mode === 'patrol') {
			// Oscillate around center between center +/- patrolOffset
			const offset = params?.patrolOffset ?? Math.max(ai.height * 0.8, 40);
			// Use time to pick position smoothly
			const t = performance.now() / 1000;
			const phase = Math.sin(t * (params?.patrolSpeed ?? 1.0)); // -1..1
			targetCenterY = centerY + phase * offset * 0.6; // plus doux
		}
		else if (mode === 'followPlayer') {
			// Mirror the player's position a bit to reduce the angle space
			const mirrorFactor = params?.mirrorFactor ?? 0.6; // 0.6 = 60% toward player's center
			// assume player.y is centre as well
			targetCenterY = ai.y + (player.y - ai.y) * mirrorFactor;
		}
		else if (mode === 'anticipate') {
			// Simple short anticipation: estimate where player's paddle will send the ball.
			// We'll do a cheap heuristic: if player is roughly centered, expect a straight return;
			// otherwise bias toward the side the player is pushing.
			// More advanced: run predictBallYDiscrete from player's x toward ai.x after a short delay.
			const dt = params?.anticipationDt ?? 0.35; // seconds into future
			// crude estimate: assume ball will be at player's y when hit; better: use player's paddle vel (if available)
			// we approximate player's paddle velocity from lastTargetY (or from ctx.player.y velocities if you track them)
			// fallback: mirror player's current Y with small bias toward center
			const biasToCenter = 0.25;
			targetCenterY = player.y * 0.75 + centerY * biasToCenter;
		}

		// add noise to avoid robotique
		targetCenterY = addNoise(targetCenterY);

		// clamp so centre of paddle stays in game area
		const minCentre = minY + halfH;
		const maxCentre = maxY - halfH;
		targetCenterY = Math.max(minCentre, Math.min(maxCentre, targetCenterY));

		ctx.lastTargetY = targetCenterY;
		return Status.SUCCESS;
	});
}

export const anticipateWithInvisibleBall = new ActionNode(ctx =>
{
	const	invisibleBallSpeedMultiplier = 1.05;
	const	difficultyBlend = 0.15;
	const	aimNoiseSigma = ctx.aiPaddle.height * 0.06;
	const	{ targetY, timeToImpact } = computeAITargetY(ctx, {
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
					