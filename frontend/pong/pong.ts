
import { Paddle } from "./Paddle.js";
import { Ball } from "./Ball.js";
import { Wall } from "./Wall.js";
import { draw } from "./draw.js";
import { keysPressed, setupControls, updatePaddle, teardownControls} from "./controls.js";
import { checkPaddleCollision } from "./collision.js";
import { resetBall, freezeBallCenter } from "./gameState.js";
import { getPaddleHeight } from "./utils.js";
import { paused } from "./gameState.js";

let currentTeardown: (() => void) | null = null;

export function initPongGame(container: HTMLElement) {
  if (currentTeardown) { currentTeardown(); currentTeardown = null; }
  container.innerHTML = '';

  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const GAME_WIDTH = 1280;
  const GAME_HEIGHT = 720;
  const paddleWidth = 20;
  const minPaddleHeight = 60;
  const maxPaddleHeight = 200;
  const paddleHeightRatio = 0.2;
  const paddleSpeed = 5;
  const BASE_SPEED = 3;
  const NORMAL_SPEED = 6;
  const ballSize = 15;
  const wallHeight = 5;
  const wallGap = ballSize * 2;
  const WINNING_SCORE = 10;

  canvas.tabIndex = 0;
  canvas.id = 'canvas';
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get canvas context");

  const p1Name = localStorage.getItem("display_name") || localStorage.getItem("p1") || "Player 1";
  const p2Name = localStorage.getItem("p2") || "Player 2";

  let leftScore = parseInt(localStorage.getItem("p1Score") || "0");
  let rightScore = parseInt(localStorage.getItem("p2Score") || "0");

  const updateScoreDisplay = () => {
    const leftEl = document.getElementById("player1-info");
    const rightEl = document.getElementById("player2-info");
    if (leftEl) leftEl.textContent = `${p1Name}: ${leftScore}`;
    if (rightEl) rightEl.textContent = `${p2Name}: ${rightScore}`;
  };
  updateScoreDisplay();

  const topWall = new Wall(wallGap, 0, canvas.width - wallGap * 2, wallHeight);
  const bottomWall = new Wall(wallGap, canvas.height - wallHeight, canvas.width - wallGap * 2, wallHeight);
  const playAreaTop = topWall.y + topWall.height;
  const playAreaBottom = bottomWall.y;
  const playAreaHeight = playAreaBottom - playAreaTop;
  const paddleY = playAreaTop + (playAreaHeight - getPaddleHeight(canvas.height, minPaddleHeight, maxPaddleHeight, paddleHeightRatio)) / 2;

  const leftPaddle = new Paddle(40, paddleY, paddleWidth, getPaddleHeight(canvas.height, minPaddleHeight, maxPaddleHeight, paddleHeightRatio), "#fff");
  const rightPaddle = new Paddle(canvas.width - paddleWidth - 40, paddleY, paddleWidth, getPaddleHeight(canvas.height, minPaddleHeight, maxPaddleHeight, paddleHeightRatio), "#fff");
  const ball = new Ball(canvas.width / 2, canvas.height / 2, ballSize, "#fff");

  // ------- only for the very first serve -------
  let needInitialReady = true;
  ball.vx = 0; ball.vy = 0;
  ball.x = canvas.width / 2 - ballSize / 2;
  ball.y = canvas.height / 2 - ballSize / 2;
  // ---------------------------------------------

  setupControls();

  let gameEnded = false;

  let rafId = 0;
  let alive = true;

  function destroy() {
    alive = false;
    if (rafId) cancelAnimationFrame(rafId);
    teardownControls();
  }
  currentTeardown = destroy;

  function gameLoop() {
    if (!alive) return;

    // ===== FIRST-SERVE READY GATE (runs only once) =====
    if (needInitialReady && leftScore === 0 && rightScore === 0) {
      // allow paddle positioning during the ready phase (optional)
      updatePaddle(leftPaddle,  { up: 'w',       down: 's' },         keysPressed, paddleSpeed, canvas, topWall, bottomWall);
      updatePaddle(rightPaddle, { up: 'ArrowUp', down: 'ArrowDown' }, keysPressed, paddleSpeed, canvas, topWall, bottomWall);

      draw(ctx!, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);

      ctx!.save();
      ctx!.font = '28px sans-serif';
      ctx!.textAlign = 'center';
      ctx!.fillStyle = 'white';
      ctx!.shadowColor = 'black';
      ctx!.shadowBlur = 6;
      ctx!.fillText('Game will start when players press their UP keys (W and ↑)', canvas.width / 2, canvas.height / 2 - 40);
      ctx!.fillText('Hold both keys at the same time to serve!', canvas.width / 2, canvas.height / 2);
      ctx!.restore();

      if (keysPressed['w'] && keysPressed['ArrowUp']) {
        needInitialReady = false;                 // <- never set to true again
        resetBall(ball, canvas, ballSize, BASE_SPEED);
      }

      rafId = requestAnimationFrame(gameLoop);
      return;
    }

    // ===== Normal loop =====
    if (!paused && !gameEnded) {
      updatePaddle(leftPaddle,  { up: 'w',       down: 's' },         keysPressed, paddleSpeed, canvas, topWall, bottomWall);
      updatePaddle(rightPaddle, { up: 'ArrowUp', down: 'ArrowDown' }, keysPressed, paddleSpeed, canvas, topWall, bottomWall);
      ball.update(canvas);

      if (checkPaddleCollision(ball, leftPaddle) && ball.vx < 0) {
        const relY = (ball.y + ball.size / 2) - (leftPaddle.y + leftPaddle.height / 2);
        const normY = relY / (leftPaddle.height / 2);
        const angle = normY * Math.PI / 4;
        ball.vx = Math.abs(NORMAL_SPEED * Math.cos(angle));
        ball.vy = NORMAL_SPEED * Math.sin(angle);
        ball.x = leftPaddle.x + leftPaddle.width;
      }

      if (checkPaddleCollision(ball, rightPaddle) && ball.vx > 0) {
        const relY = (ball.y + ball.size / 2) - (rightPaddle.y + rightPaddle.height / 2);
        const normY = relY / (rightPaddle.height / 2);
        const angle = normY * Math.PI / 4;
        ball.vx = -Math.abs(NORMAL_SPEED * Math.cos(angle));
        ball.vy = NORMAL_SPEED * Math.sin(angle);
        ball.x = rightPaddle.x - ball.size;
      }

      if (ball.x - ball.size < 0) {
        rightScore++;
        localStorage.setItem("p2Score", rightScore.toString());
        updateScoreDisplay();

        if (rightScore >= WINNING_SCORE) {
          gameEnded = true;
          const winner = p2Name;
          container.innerHTML = `
            <div class="text-white text-center space-y-4">
              <h2 class="text-4xl font-bold">${winner} wins!</h2>
            </div>
          `;
          destroy();
        } else {
          // serve immediately after a point (no overlay)
          resetBall(ball, canvas, ballSize, BASE_SPEED);
        }
      }

      if (!gameEnded && ball.x + ball.size > canvas.width) {
        leftScore++;
        localStorage.setItem("p1Score", leftScore.toString());
        updateScoreDisplay();

        if (leftScore >= WINNING_SCORE) {
          gameEnded = true;
          const winner = p1Name;
          container.innerHTML = `
            <div class="text-white text-center space-y-4">
              <h2 class="text-4xl font-bold">${winner} wins!</h2>
            </div>
          `;
          destroy();
        } else {
          // serve immediately after a point (no overlay)
          resetBall(ball, canvas, ballSize, BASE_SPEED);
        }
      }
    }

    draw(ctx!, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);
    rafId = requestAnimationFrame(gameLoop);
  }

  gameLoop();
  container.appendChild(canvas);
}