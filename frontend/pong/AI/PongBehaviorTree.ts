/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PongBehaviorTree.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 12:22:46 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 16:43:15 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { SequenceNode, SelectorNode, Context, Node } from "./BehaviorTreeNodes.js";
import { aimStraight, aimOpposite, followBall, returnToCenter } from "./AIActions.js";
import { ballMovingAwayFromAI, ballMovingTowardAI, isShallowAngle, isCenterZone, isWallZone } from "./AIConditions.js";

export class PongBehaviorTree
{
	private tree: Node;

	constructor()
	{
		this.tree = new SelectorNode([
			new SequenceNode([
				ballMovingTowardAI,
				new SelectorNode([
					new SequenceNode([isWallZone, aimStraight]),
					new SequenceNode([isCenterZone, isShallowAngle, aimOpposite]),
					new SequenceNode([isCenterZone, aimStraight]),
				]),
			]),
			new SequenceNode([
				ballMovingAwayFromAI,
				followBall,
			]),
		]);
	}

	run(context: Context)
	{
		this.tree.execute(context);
	}
}