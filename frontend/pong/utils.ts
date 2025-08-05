export function getPaddleHeight(canvasHeight: number, min: number, max: number, ratio: number) {
	return Math.max(min, Math.min(max, canvasHeight * ratio));
}