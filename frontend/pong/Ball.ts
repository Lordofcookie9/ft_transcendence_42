export class Ball {
    constructor(
        public x: number,
        public y: number,
        public size: number,
        public color: string = "#fff",
        public vx: number = 0,
        public vy: number = 0
    ) {}

    draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }

    update(canvas: HTMLCanvasElement) {
        this.x += this.vx;
        this.y += this.vy;

        if (this.y < 0 || this.y + this.size > canvas.height) {
            this.vy = -this.vy;

			if (Math.abs(this.vy) < 1)
				this.vy = (this.vy < 0 ? -1 : 1) * 2;
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