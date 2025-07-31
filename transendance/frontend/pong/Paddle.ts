/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Paddle.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/30 15:07:37 by rrichard          #+#    #+#             */
/*   Updated: 2025/07/30 15:09:27 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export class Paddle
{
	constructor(
		public x: number,
		public y: number,
		public width: number,
		public height: number,
		public color: string = "#fff"
	) {}

	draw(ctx: CanvasRenderingContext2D)
	{
		ctx.fillStyle = this.color;
		ctx.fillRect(this.x, this.y, this.width, this.height);

		// Draw centered vertical line
		ctx.strokeStyle = "#000";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(this.x + this.width / 2, this.y);
		ctx.lineTo(this.x + this.width / 2, this.y + this.height);
		ctx.stroke();

		// Draw centered horizontal line
		ctx.beginPath();
		ctx.moveTo(this.x, this.y + this.height / 2);
		ctx.lineTo(this.x + this.width, this.y + this.height / 2);
		ctx.stroke();
	}
}