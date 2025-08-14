/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Wall.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/12 17:29:33 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 17:29:34 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export class Wall {
	constructor(
		public x: number,
		public y: number,
		public width: number,
		public height: number,
		public color: string = "#fff"
	) {}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.shadowColor = "#0ff";
		ctx.shadowBlur = 20;
		ctx.fillStyle = "#0ff";
		ctx.fillRect(this.x, this.y, this.width, this.height);
		ctx.restore();
	}

	checkCollision(rect: { x: number, y: number, width: number, height: number }): boolean {
		const rectLeft = rect.x;
		const rectRight = rect.x + rect.width;
		const rectTop = rect.y;
		const rectBottom = rect.y + rect.height;

		const wallLeft = this.x;
		const wallRight = this.x + this.width;
		const wallTop = this.y;
		const wallBottom = this.y + this.height;

		return (
			rectTop < wallBottom &&
			rectBottom > wallTop && 
			rectLeft < wallRight &&
			rectRight > wallLeft
		);
	}
}