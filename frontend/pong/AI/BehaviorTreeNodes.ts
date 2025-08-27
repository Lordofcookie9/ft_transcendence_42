/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BehaviorTreeNodes.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 10:26:58 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 17:54:44 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Ball } from "../Ball.js";
import { Paddle } from "../Paddle.js";

export enum Status
{
	SUCCESS = "SUCCESS",
	FAILURE = "FAILURE",
	RUNNING = "RUNNING",
}

export interface Node
{
	execute(context: Context): Status;
}

export interface Context {
	ball: Ball;
	player: Paddle;
	aiPaddle: Paddle;
	keysPressed:{ [key: string]: boolean };
	fieldHeight: number;
	minWallY: number;
	maxWallY: number;
	lastTargetY?: number;
};

export class SequenceNode implements Node
{
	constructor(private children: Node[]) {}
	execute(ctx: Context): Status
	{
		for (const child of this.children)
		{
			const status = child.execute(ctx);
			if (status !== Status.SUCCESS)
				return (status);
		}
		return (Status.SUCCESS);
	}
}

export class SelectorNode implements Node
{
	constructor(private children: Node[]) {}
	execute(ctx: Context): Status
	{
		for (const child of this.children)
		{
			const status = child.execute(ctx);
			if (status !== Status.FAILURE)
				return (status);
		}
		return (Status.FAILURE);
	}
}

export class ConditionNode implements Node
{
	constructor(private condition: (ctx: Context) => boolean) {}
	execute(ctx: Context): Status
	{
		return (this.condition(ctx) ? Status.SUCCESS : Status.FAILURE);
	}
}

export class ActionNode implements Node
{
	constructor(private action: (ctx: Context) => Status) {}
	execute(ctx: Context): Status
	{
		return (this.action(ctx));
	}
}