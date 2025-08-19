/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AIActions.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 10:34:18 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/19 17:52:16 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ActionNode, Status } from "./BehaviorTreeNodes.js";
import { predictInvisibleBallY } from "./MathPredicts.js";

export const followBall = new ActionNode(ctx =>
{
	const	invisibleBallSpeedMultiplier = 1.1;
	let		predictedY = predictInvisibleBallY(ctx.ball, ctx.aiPaddle, ctx.minWallY, ctx.maxWallY, invisibleBallSpeedMultiplier);

	if (!isFinite(predictedY) || isNaN(predictedY))
		return (Status.FAILURE);

	ctx.lastTargetY = Math.max(ctx.minWallY, Math.min(predictedY, ctx.maxWallY));
	return (Status.SUCCESS);
});

export const anticipateWithInvisibleBall = new ActionNode(ctx =>
{
	const	invisibleBallSpeedMultiplier = 1.6;
	let		predictedY = predictInvisibleBallY(ctx.ball, ctx.aiPaddle, ctx.minWallY, ctx.maxWallY, invisibleBallSpeedMultiplier);

	if (!isFinite(predictedY) || isNaN(predictedY))
		return (Status.FAILURE);

	const	randomOffset = (Math.random() - 0.5) * ctx.aiPaddle.height;
	let		targetY = predictedY + randomOffset;
	
	ctx.lastTargetY = Math.max(ctx.minWallY, Math.min(targetY, ctx.maxWallY));
	return (Status.SUCCESS);
});
