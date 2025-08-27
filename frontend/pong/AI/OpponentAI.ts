/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   OpponentAI.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/11 11:19:16 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/27 12:27:04 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Paddle } from "../Paddle.js";
import { Ball } from "../Ball.js";
import { Wall } from "../Wall.js";
import { PongBehaviorTree } from "./PongBehaviorTree.js";
import { Context } from "./BehaviorTreeNodes.js";

export class OpponentAI
{
    private	behavior = new PongBehaviorTree();
	private	lastDecisionTime = 0;
	private	lastUpdateTime = performance.now();
	private	decisionInterval = 1000;
	public	lastTargetY?: number;

    constructor(private player: Paddle, private aiPaddle: Paddle, private keysPressed: { [key: string]: boolean },
				private fieldHeight: number, private topWall: Wall, private bottomWall: Wall) {}

    update(ball: Ball)
    {
		const now = performance.now();
		const	frameDt = (now - this.lastUpdateTime) / 1000;
		this.lastUpdateTime = now;

		if (now - this.lastDecisionTime >= this.decisionInterval)
		{
			const context: Context = {
				ball,
				player: this.player,
				aiPaddle: this.aiPaddle,
				keysPressed: this.keysPressed,
				fieldHeight: this.fieldHeight,
				minWallY: this.topWall.y + this.topWall.height,
				maxWallY: this.bottomWall.y,
				lastTargetY: this.lastTargetY
			};
			this.behavior.run(context);
			this.lastTargetY = context.lastTargetY;

			this.lastDecisionTime = now;
		}
		// if (this.lastTargetY !== undefined && isFinite(this.lastTargetY))
		// {
		// 	const	halfH = this.aiPaddle.height / 2;
		// 	const	minCenter = this.topWall.y + this.topWall.height + halfH;
		// 	const	maxCenter = this.bottomWall.y - halfH;

		// 	const	clampedTarget = clamp(this.lastTargetY, minCenter, maxCenter);

		// 	const	delta = clampedTarget - this.aiPaddle.y;
		// 	if (Math.abs(delta) > 1e-2)
		// 	{
		// 		const	maxStep = this.aiPaddle.speed * frameDt;
		// 		const	move = Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
		// 		this.aiPaddle.y += move;
		// 		this.aiPaddle.y = clamp(this.aiPaddle.y, minCenter, maxCenter);
		// 	}
		// }
    }
}