/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Ball.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/30 15:07:59 by rrichard          #+#    #+#             */
/*   Updated: 2025/07/30 16:15:57 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export class Ball {
	constructor(
		public x: number,
		public y: number,
		public size: number,
		public color: string = "#fff",
		public vx: number = 0,
		public vy: number = 0
	) {}

	draw(ctx: CanvasRenderingContext2D)
	{
		ctx.fillStyle = this.color;
		ctx.fillRect(this.x, this.y, this.size, this.size);
	}

	update(canvas: HTMLCanvasElement)
	{
		this.x += this.vx;
		this.y += this.vy;

		if (this.y < 0 || this.y + this.size > canvas.height)
			this.vy = -this.vy;
	}
}