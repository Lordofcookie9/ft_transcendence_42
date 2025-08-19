/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Ball.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/12 17:38:05 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/19 17:54:22 by rrichard         ###   ########.fr       */
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

    update(minY: number, maxY: number, deltaTime: number)
	{
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

		const top = minY;
		const bottom = maxY - this.size;

		if (this.y <= top)
		{
			this.y = top;
			this.vy = Math.abs(this.vy);
			if (Math.abs(this.vy) < 2)
				this.vy = 2;
		}
		else if (this.y >= bottom)
		{
			this.y = bottom;
			this.vy = -Math.abs(this.vy);
			if (Math.abs(this.vy) < 2)
				this.vy = -2;
		}
    }
}

export function resetBall(ball: Ball, canvas: HTMLCanvasElement, ballSize: number, speed: number)
{
	ball.x = canvas.width / 2 - ballSize / 2;
	ball.y = canvas.height / 2 - ballSize / 2;

	const angleRanges = [ 
		[-Math.PI / 4, Math.PI / 4],
		[(3 * Math.PI) / 4, (5 * Math.PI) / 4]
	];
	const range = angleRanges[Math.random() > 0.5 ? 0 : 1];
	const angle = Math.random() * (range[1] - range[0]) + range[0];
	ball.vx = speed * Math.cos(angle);
	ball.vy = speed * Math.sin(angle);
}