/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Paddle.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/12 17:30:20 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 17:30:30 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export class Paddle {
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
	}
}