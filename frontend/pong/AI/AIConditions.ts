/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AIConditions.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 11:14:32 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/11 12:02:18 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ConditionNode } from "./BehaviorTreeNodes.js";
import { predictY, computeTimeToReach } from "./MathPredicts.js";

export const ballMovingTowardAI = new ConditionNode(ctx =>
{
	return (
		(ctx.aiPaddle.x > ctx.player.x && ctx.ball.vx > 0) ||
		(ctx.aiPaddle.x < ctx.player.x && ctx.ball.vx < 0)
	);
});

export const ballMovingAwayFromAI = new ConditionNode(ctx =>
{
	return !(
		(ctx.aiPaddle.x > ctx.player.x && ctx.ball.vx > 0) ||
		(ctx.aiPaddle.x < ctx.player.x && ctx.ball.vx < 0)
	);
});

export const isWallZone = new ConditionNode(ctx =>
{
	const wallZone = 0.2 * (ctx.maxWallY - ctx.minWallY);
	const t = computeTimeToReach(ctx.ball, ctx.aiPaddle);

	if (t === null || !isFinite(t) || t < 0)
		return (false);

	const predictedY = predictY(ctx.ball, t, ctx.minWallY, ctx.maxWallY);

	return (
		predictedY < ctx.minWallY + wallZone ||
		predictedY > ctx.maxWallY - wallZone
	);
});

export const isCenterZone = new ConditionNode(ctx =>
{
	const wallZone = 0.2 * (ctx.maxWallY - ctx.minWallY);
	const t = computeTimeToReach(ctx.ball, ctx.aiPaddle);
	if (t === null || !isFinite(t) || t < 0)
		return (false);
	let predictedY = predictY(ctx.ball, t, ctx.minWallY, ctx.maxWallY);

	const humanError = (Math.random() - 0.5) * 60;
	predictedY += humanError;

	return (
		predictedY >= ctx.minWallY + wallZone &&
		predictedY <= ctx.maxWallY - wallZone
	);
});

export const isShallowAngle = new ConditionNode(ctx =>
{
	const angle = Math.abs(Math.atan2(ctx.ball.vy, ctx.ball.vx));
	return (angle < Math.PI / 6);
});

export const isBallInPlayerCamp = new ConditionNode(ctx =>
{
	const fieldMax = ctx.aiPaddle.x + ctx.aiPaddle.width + 40;
	const middleX = fieldMax / 2;

	if (ctx.ball.x > middleX)
		return (false);
	return (true);
});