/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AIConditions.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 11:14:32 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/19 17:52:30 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ConditionNode } from "./BehaviorTreeNodes.js";

export const ballMovingTowardAI = new ConditionNode(ctx =>
{
	return ((ctx.aiPaddle.x > ctx.player.x && ctx.ball.vx > 0)
			|| (ctx.aiPaddle.x < ctx.player.x && ctx.ball.vx < 0));
});

export const ballMovingAwayFromAI = new ConditionNode(ctx =>
{
	return !((ctx.aiPaddle.x > ctx.player.x && ctx.ball.vx > 0)
			|| (ctx.aiPaddle.x < ctx.player.x && ctx.ball.vx < 0));
});