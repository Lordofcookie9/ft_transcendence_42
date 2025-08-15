/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pong.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/12 17:56:51 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/12 18:00:43 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Paddle } from "./Paddle.js";
import { Ball } from "./Ball.js";
import { Wall } from "./Wall.js";
import { draw } from "./draw.js";
import { keysPressed, updatePaddle, teardownControls } from "./controls.js"; // no setupControls here
import { checkPaddleCollision } from "./collision.js";
import { resetBall, paused, togglePause } from "./gameState.js";
import { OpponentAI } from "./AI/OpponentAI.js";

let currentTeardown: (() => void) | null = null;

type ControlSide = 'left' | 'right' | 'both';
type NetMode = 'local' | 'host' | 'guest';

type GuestInput = { up: boolean; down: boolean };

type Snapshot = {
  ball:    { x: number; y: number };
  paddles: { leftY: number; rightY: number };
  scores:  { left: number; right: number };
};

interface PongNetOpts {
  control: 'left' | 'right' | 'both';
  netMode: 'local' | 'host' | 'guest';
  emitState?: (state: Snapshot) => void;
  onRemoteInput?: (register: (input: GuestInput) => void) => void;
  applyState?: (register: (state: Snapshot) => void) => void;
}

export function initPongGame(
  container: HTMLElement,
  onGameEnd?: (winner: string) => void,
   opts: Partial<PongNetOpts> = {}
) {
  // Teardown previous instance
  if (currentTeardown) {
    try { currentTeardown(); } catch {}
    currentTeardown = null;
  }
  container.innerHTML = '';

  // --- Net options / defaults
  const control: ControlSide = opts.control ?? 'both';
  const netMode: NetMode = opts.netMode ?? 'local';
  const emitState = opts.emitState;

  // --- Canvas
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const GAME_WIDTH = 1280, GAME_HEIGHT = 720;
  canvas.tabIndex = 0;
  canvas.id = 'canvas';
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (!ctx) throw new Error('Could not get canvas context');

  // Ensure not paused; keyboard handlers fresh for this match
  try { if (paused) togglePause(); } catch {}
  try { teardownControls(); } catch {}

  // Clear stale key state
  for (const k in keysPressed) { try { delete (keysPressed as any)[k]; } catch {} }

// --- Key filtering by role AND write both e.key and e.code
function setPressed(e: KeyboardEvent, down: boolean) {
  (keysPressed as any)[e.code] = down; // KeyW / ArrowUp
  const raw = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key; // "w"/"s"/"ArrowUp"
  if (raw) (keysPressed as any)[raw] = down;
}

function onKeyDown(e: KeyboardEvent) {
  // Allow host to press ArrowUp/Down during initial ready screen
  const allowHostArrowsForReady = (netMode === 'host' && needInitialReady);

  if (!allowHostArrowsForReady) {
    if (control === 'right' && (e.code === 'KeyW' || e.code === 'KeyS')) return;
    if (control === 'left'  && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) return;
  }

  setPressed(e, true);
  if (e.code.startsWith('Arrow')) { e.preventDefault(); e.stopPropagation(); }
}

function onKeyUp(e: KeyboardEvent) {
  const allowHostArrowsForReady = (netMode === 'host' && needInitialReady);

  if (!allowHostArrowsForReady) {
    if (control === 'right' && (e.code === 'KeyW' || e.code === 'KeyS')) return;
    if (control === 'left'  && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) return;
  }

  setPressed(e, false);
  if (e.code.startsWith('Arrow')) { e.preventDefault(); e.stopPropagation(); }
}

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  
// --- Host receives guest input; Guest receives host state
let remoteRightUp = false, remoteRightDown = false;

if (opts.onRemoteInput) {
  opts.onRemoteInput((input: GuestInput) => {
    remoteRightUp = !!input.up;
    remoteRightDown = !!input.down;
  });
}

let latestState: Snapshot | null = null;

if (opts.applyState) {
  opts.applyState((state: Snapshot) => {
    latestState = state;
  });
}

  // Names & scores (left = p1, right = p2)
  const p1Name = localStorage.getItem('p1') || 'Player 1';
  const p2Name = localStorage.getItem('p2') || 'Player 2';
  let leftScore  = parseInt(localStorage.getItem('p1Score') || '0', 10);
  let rightScore = parseInt(localStorage.getItem('p2Score') || '0', 10);

  const updateScoreDisplay = () => {
    const leftEl = document.getElementById('player1-info');
    const rightEl = document.getElementById('player2-info');
    if (leftEl)  leftEl.textContent  = `${p1Name}: ${leftScore}`;
    if (rightEl) rightEl.textContent = `${p2Name}: ${rightScore}`;
  };
  updateScoreDisplay();

  // Game constants
  const paddleWidth = 20, paddleHeight = 110, paddleSpeed = 5;
  const BASE_SPEED = 3, NORMAL_SPEED = 8, ballSize = 15;
  const wallHeight = 5, wallGap = ballSize * 2, WINNING_SCORE = 10;

  // Walls & paddles
  const topWall = new Wall(wallGap, 0, canvas.width - wallGap * 2, wallHeight);
  const bottomWall = new Wall(wallGap, canvas.height - wallHeight, canvas.width - wallGap * 2, wallHeight);
  const playAreaTop = topWall.y + topWall.height;
  const playAreaBottom = bottomWall.y;
  const playAreaHeight = playAreaBottom - playAreaTop;
  const paddleY = playAreaTop + (playAreaHeight - paddleHeight) / 2;

  const leftPaddle  = new Paddle(40, canvas.height / 2 - paddleHeight / 2, paddleWidth, paddleHeight, '#fff');
  const rightPaddle = new Paddle(canvas.width - paddleWidth - 40, canvas.height / 2 - paddleHeight / 2, paddleWidth, paddleHeight, '#fff');
  const ball = new Ball(canvas.width / 2, canvas.height / 2, ballSize, '#fff');

  // First-serve "ready" gate (both players hold UP to start)
  let needInitialReady = true;
  ball.vx = 0; ball.vy = 0;
  ball.x = canvas.width / 2 - ballSize / 2;
  ball.y = canvas.height / 2 - ballSize / 2;

  let gameEnded = false;
  let rafId = 0;
  let alive = true;

  function destroy() {
    alive = false;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
  }
  currentTeardown = destroy;

  function gameLoop() {
    if (!alive) return;

    // --- Guest: render-snapshot only (no physics)
	if (netMode === 'guest') {
	if (latestState) {
		// Draw the latest authoritative state
		ball.x = latestState.ball.x;
		ball.y = latestState.ball.y;
		leftPaddle.y  = latestState.paddles.leftY;
		rightPaddle.y = latestState.paddles.rightY;

		if (leftScore !== latestState.scores.left || rightScore !== latestState.scores.right) {
		leftScore  = latestState.scores.left;
		rightScore = latestState.scores.right;
		updateScoreDisplay();
		}

		draw(ctx, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);
	} else {
		// No snapshot yet – draw a centered “waiting” message
		draw(ctx, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);
		ctx.save();
		ctx.font = '24px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillStyle = 'white';
		ctx.shadowColor = 'black';
		ctx.shadowBlur = 6;
		ctx.fillText('Connected. Waiting for host…', canvas.width / 2, canvas.height / 2 - 20);
		ctx.fillText('Press ↑ to signal ready.', canvas.width / 2, canvas.height / 2 + 10);
		ctx.restore();
	}
	rafId = requestAnimationFrame(gameLoop);
	return;
	}

    // --- Host / Local simulation
    if (needInitialReady && leftScore === 0 && rightScore === 0) {
	// Normalize the union so TS doesn't over-narrow
	const mode = netMode as NetMode; // 'local' | 'host' | 'guest'

	// Readiness:
	const readyLeft  = !!keysPressed['w'] || !!keysPressed['ArrowUp'];     // host: W or ArrowUp
	const guestUp    = (mode === 'host') ? !!remoteRightUp : !!keysPressed['ArrowUp'];
	const readyRight = guestUp;

	// Update paddles (right uses guest input when hosting)
	updatePaddle(leftPaddle, { up: 'w', down: 's' }, keysPressed, paddleSpeed, canvas, topWall, bottomWall);

	const keysForRight: Record<string, boolean> = { ...(keysPressed as any) };
	if (mode === 'host') {
		keysForRight['ArrowUp']   = !!remoteRightUp;
		keysForRight['ArrowDown'] = !!remoteRightDown;
	}
	updatePaddle(rightPaddle, { up: 'ArrowUp', down: 'ArrowDown' }, keysForRight, paddleSpeed, canvas, topWall, bottomWall);

	// Draw + role-specific prompt
	draw(ctx, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);

	ctx.save();
	ctx.font = '28px sans-serif';
	ctx.textAlign = 'center';
	ctx.fillStyle = 'white';
	ctx.shadowColor = 'black';
	ctx.shadowBlur = 6;

	const cx = canvas.width / 2, cy = canvas.height / 2;
	const promptByMode: Record<NetMode, string> = {
		host:  'Press W or ↑ to ready. Waiting for opponent (↑)…',
		guest: 'Press ↑ to ready. Waiting for host (W or ↑)…',
		local: 'Game will start when players press their UP keys (W and ↑)',
	};
	ctx.fillText(promptByMode[mode], cx, cy - 20);
	ctx.fillText('Hold both keys at the same time to serve!', cx, cy + 12);
	ctx.restore();

	// Start when both are ready
	if (readyLeft && readyRight) {
		needInitialReady = false;
		resetBall(ball, canvas, ballSize, BASE_SPEED);
	}

	// Host broadcasts snapshot so guest can render waiting screen immediately
	if (mode === 'host' && emitState) {
		emitState({
		ball: { x: ball.x, y: ball.y },
		paddles: { leftY: leftPaddle.y, rightY: rightPaddle.y },
		scores: { left: leftScore, right: rightScore },
		});
	}

	rafId = requestAnimationFrame(gameLoop);
	return;
	}


    if (!paused && !gameEnded) {
      // Left paddle from local keys (W/S)
      updatePaddle(leftPaddle,  { up: 'w',       down: 's' },         keysPressed, paddleSpeed, canvas, topWall, bottomWall);

      // Right paddle: merge remote guest input when hosting
      const keysForRight: Record<string, boolean> = { ...(keysPressed as any) };
      if (netMode === 'host') {
        keysForRight['ArrowUp']   = remoteRightUp;
        keysForRight['ArrowDown'] = remoteRightDown;
      }
      updatePaddle(rightPaddle, { up: 'ArrowUp', down: 'ArrowDown' }, keysForRight, paddleSpeed, canvas, topWall, bottomWall);

      // Physics
      ball.update(playAreaTop, playAreaBottom);

      // Collisions
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

      // Right scores (p2)
      if (ball.x - ball.size < 0) {
        rightScore++;
        localStorage.setItem('p2Score', String(rightScore));
        updateScoreDisplay();

        if (rightScore >= WINNING_SCORE) {
          gameEnded = true;
          const winner = p2Name;
          try { window.dispatchEvent(new CustomEvent('pong:gameend', { detail: { winner } })); } catch {}
          try { onGameEnd?.(winner); } catch {}
          container.innerHTML = `
            <div class="text-white text-center space-y-4">
              <h2 class="text-4xl font-bold">${winner} wins!</h2>
            </div>
          `;
          destroy();
        } else {
          resetBall(ball, canvas, ballSize, BASE_SPEED);
        }
      }

      // Left scores (p1)
      if (!gameEnded && ball.x + ball.size > canvas.width) {
        leftScore++;
        localStorage.setItem('p1Score', String(leftScore));
        updateScoreDisplay();

        if (leftScore >= WINNING_SCORE) {
          gameEnded = true;
          const winner = p1Name;
          try { window.dispatchEvent(new CustomEvent('pong:gameend', { detail: { winner } })); } catch {}
          try { onGameEnd?.(winner); } catch {}
          container.innerHTML = `
            <div class="text-white text-center space-y-4">
              <h2 class="text-4xl font-bold">${winner} wins!</h2>
            </div>
          `;
          destroy();
        } else {
          resetBall(ball, canvas, ballSize, BASE_SPEED);
        }
      }
    }

    // Draw
    draw(ctx, canvas, leftScore, rightScore, topWall, bottomWall, leftPaddle, rightPaddle, ball);

    // Host broadcasts a snapshot each frame
    if (netMode === 'host' && emitState) {
      emitState({
        ball: { x: ball.x, y: ball.y },
        paddles: { leftY: leftPaddle.y, rightY: rightPaddle.y },
        scores: { left: leftScore, right: rightScore }
      });
    }

    rafId = requestAnimationFrame(gameLoop);
  }

  gameLoop();
  container.appendChild(canvas);
  try { canvas.focus(); } catch {}
}
