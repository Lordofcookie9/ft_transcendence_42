/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AIActions.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 10:34:18 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 17:28:51 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ActionNode, Status } from "./BehaviorTreeNodes.js";
import { predictY, computeTimeToReach } from "./MathPredicts.js";

export const aimOpposite = new ActionNode(ctx =>
{
	const thinkInterval = 1.0;
	const tRaw = computeTimeToReach(ctx.ball, ctx.aiPaddle);
	const t = tRaw === null ? null : tRaw + thinkInterval;

	if (t === null || !isFinite(t) || t < 0)
		return (Status.FAILURE);

	let predictedY = predictY(ctx.ball, t, ctx.minWallY, ctx.maxWallY);

	if (!isFinite(predictedY) || isNaN(predictedY))
		return (Status.FAILURE);

    const playerCenter = ctx.player.y + ctx.player.height / 2;
    const contactOffset = 0.4 * ctx.aiPaddle.height / 2;
    let targetContactY = playerCenter < predictedY ? predictedY + contactOffset : predictedY - contactOffset;
    targetContactY = Math.max(ctx.minWallY, Math.min(targetContactY, ctx.maxWallY));

    ctx.lastTargetY = targetContactY;
    return (Status.SUCCESS);
});

export const aimStraight = new ActionNode(ctx =>
{
	const thinkInterval = 1.0;
	const tRaw = computeTimeToReach(ctx.ball, ctx.aiPaddle);
	const t = tRaw === null ? null : tRaw + thinkInterval;
    if (t === null || !isFinite(t) || t < 0)
		return Status.FAILURE;

	let predictedY = predictY(ctx.ball, t, ctx.minWallY, ctx.maxWallY);
	if (!isFinite(predictedY) || isNaN(predictedY))
		return (Status.FAILURE);
	
	ctx.lastTargetY = Math.max(ctx.minWallY, Math.min(predictedY, ctx.maxWallY));
	return (Status.SUCCESS);
});

export const followBall = new ActionNode(ctx =>
{
	const	thinkInterval = 1.3;
	let		predictedY = predictY(ctx.ball, thinkInterval, ctx.minWallY, ctx.maxWallY);

	if (!isFinite(predictedY) || isNaN(predictedY))
		return (Status.FAILURE);
	ctx.lastTargetY = Math.max(ctx.minWallY, Math.min(predictedY, ctx.maxWallY));
	return (Status.SUCCESS);
});

export const returnToCenter = new ActionNode(ctx =>
{
	const centerY = ctx.fieldHeight / 2;
	
	ctx.lastTargetY = centerY;
	return (Status.SUCCESS);
});