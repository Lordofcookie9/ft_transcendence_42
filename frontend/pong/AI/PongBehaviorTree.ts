/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PongBehaviorTree.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 12:22:46 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/19 17:53:50 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { SequenceNode, SelectorNode, Context, Node } from "./BehaviorTreeNodes.js";
import { followBall, anticipateWithInvisibleBall } from "./AIActions.js";
import { ballMovingAwayFromAI, ballMovingTowardAI } from "./AIConditions.js";

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
				followBall,
			]),
		]);
	}

	run(context: Context)
	{
		this.tree.execute(context);
	}
}