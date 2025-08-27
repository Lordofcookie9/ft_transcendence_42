/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PongBehaviorTree.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 12:22:46 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/27 13:32:10 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { SequenceNode, SelectorNode, Context, Node } from "./BehaviorTreeNodes.js";
import { anticipateWithInvisibleBall, makeHandleBallAwayNode } from "./AIActions.js";
import { ballMovingAwayFromAI, ballMovingTowardAI } from "./AIConditions.js";

const awayEasyNode = makeHandleBallAwayNode('center', { aimNoiseSigmaFactor: 0.18 });
const awayMediumNode = makeHandleBallAwayNode('followPlayer', { mirrorFactor: 0.6, aimNoiseSigmaFactor: 0.12 });
const awayHardNode = makeHandleBallAwayNode('anticipate', { anticipationDt: 0.45, aimNoiseSigmaFactor: 0.06 });

export class PongBehaviorTree
{
	private tree: Node;

	constructor()
	{
		this.tree = new SelectorNode([
			new SequenceNode([
				ballMovingTowardAI,
				anticipateWithInvisibleBall,
			]),
			new SequenceNode([
				ballMovingAwayFromAI,
				awayMediumNode,
			]),
		]);
	}

	run(context: Context)
	{
		this.tree.execute(context);
	}
}