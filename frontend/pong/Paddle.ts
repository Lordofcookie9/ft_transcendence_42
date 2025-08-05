export class Paddle {
	constructor(
		public x: number,
		public y: number,
		public width: number,
		public height: number,
		public color: string = "#fff"
	) {}

	draw(ctx: CanvasRenderingContext2D) {
		// Draw paddle rectangle
		ctx.fillStyle = this.color;
		ctx.fillRect(this.x, this.y, this.width, this.height);
	}
}