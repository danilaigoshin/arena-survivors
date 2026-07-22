import type { ViewportMetrics } from './viewport';
import { keyFor, type InputAction } from './settings';

const keys = new Set<string>();
const justPressed = new Set<string>();
const gamepadButtonState = new Map<number, boolean>();
let mouseX = 0;
let mouseY = 0;
let mouseClicked = false;
let mouseDown = false;

// ── touch controls (mobile only; desktop keeps keyboard+mouse untouched) ──
let touchMode = false;
/** joystick only claims right-half touches during a run; in menus every tap is a UI tap */
let joyEnabled = false;

export function setJoystickEnabled(v: boolean): void {
  joyEnabled = v;
  if (!v) {
    joy.active = false;
    joy.dx = 0;
    joy.dy = 0;
  }
}
const JOY_MAX = 58;
/** virtual joystick, lives on the RIGHT half of the screen */
const joy = { active: false, id: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };

export interface TouchCircle {
  x: number;
  y: number;
  visualR: number;
  hitR: number;
}

export function isTouchDevice(): boolean {
  return touchMode;
}

export function getJoystick(): { active: boolean; baseX: number; baseY: number; dx: number; dy: number } {
  return joy;
}

/** Ability button circle (bottom-left) — shared by the touch hit-test and the HUD. */
export function abilityButtonCircle(viewport: ViewportMetrics): TouchCircle {
  const visualR = viewport.compactLandscape ? Math.max(34, 50 * viewport.hudScale) : 50;
  return {
    x: viewport.safe.left + visualR + (viewport.compactLandscape ? 18 : 24),
    y: viewport.height - viewport.safe.bottom - visualR - (viewport.compactLandscape ? 24 : 28),
    visualR,
    hitR: Math.max(22, visualR + 4),
  };
}

/** Pause button circle (top, right of center) for touch. */
export function pauseButtonCircle(viewport: ViewportMetrics): TouchCircle {
  const visualR = viewport.compactLandscape ? Math.max(18, 26 * viewport.hudScale) : 26;
  return {
    x: viewport.width / 2 + 150 * viewport.hudScale,
    y: viewport.safe.top + (viewport.compactLandscape ? 32 : 44),
    visualR,
    hitR: Math.max(22, visualR),
  };
}

export function initInput(canvas: HTMLCanvasElement, getViewport: () => ViewportMetrics): void {
  window.addEventListener('keydown', (e) => {
    if (!e.repeat) justPressed.add(e.code);
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  canvas.addEventListener('mousedown', () => {
    mouseDown = true;
    mouseClicked = true;
  });
  canvas.addEventListener('mouseup', () => {
    mouseDown = false;
  });

  // touch: joystick on the right half, ability button bottom-left, everything else = UI tap
  touchMode = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      touchMode = true;
      const viewport = getViewport();
      if (viewport.portraitBlocked) return;
      const w = viewport.width;
      const ab = abilityButtonCircle(viewport);
      const pc = pauseButtonCircle(viewport);
      for (const t of Array.from(e.changedTouches)) {
        // ability/pause circles and the joystick only exist during a run
        if (joyEnabled && (t.clientX - ab.x) ** 2 + (t.clientY - ab.y) ** 2 <= ab.hitR * ab.hitR) {
          justPressed.add('Space');
        } else if (joyEnabled && (t.clientX - pc.x) ** 2 + (t.clientY - pc.y) ** 2 <= pc.hitR * pc.hitR) {
          // pause button sits on the right half — must beat the joystick claim
          mouseX = t.clientX;
          mouseY = t.clientY;
          mouseClicked = true;
          mouseDown = true;
        } else if (joyEnabled && !joy.active && t.clientX > w * 0.5) {
          joy.active = true;
          joy.id = t.identifier;
          joy.baseX = t.clientX;
          joy.baseY = t.clientY;
          joy.dx = 0;
          joy.dy = 0;
        } else {
          // UI tap: behaves like a mouse click
          mouseX = t.clientX;
          mouseY = t.clientY;
          mouseClicked = true;
          mouseDown = true;
        }
      }
    },
    { passive: false },
  );
  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (joy.active && t.identifier === joy.id) {
          const dx = t.clientX - joy.baseX;
          const dy = t.clientY - joy.baseY;
          const len = Math.hypot(dx, dy);
          const k = len > JOY_MAX ? JOY_MAX / len : 1;
          joy.dx = dx * k;
          joy.dy = dy * k;
        } else {
          mouseX = t.clientX;
          mouseY = t.clientY;
        }
      }
    },
    { passive: false },
  );
  const endTouch = (e: TouchEvent) => {
    mouseDown = false;
    for (const t of Array.from(e.changedTouches)) {
      if (joy.active && t.identifier === joy.id) {
        joy.active = false;
        joy.dx = 0;
        joy.dy = 0;
      }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
}

export function isDown(code: string): boolean {
  return keys.has(code);
}

function gamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  return Array.from(navigator.getGamepads()).find((entry): entry is Gamepad => !!entry && entry.connected) ?? null;
}

function gamepadPressed(index: number): boolean {
  const down = (gamepad()?.buttons[index]?.value ?? 0) > 0.55;
  const previous = gamepadButtonState.get(index) ?? false;
  gamepadButtonState.set(index, down);
  return down && !previous;
}

export function consumeUiDirection(): -1 | 0 | 1 {
  if (gamepadPressed(12) || gamepadPressed(14)) return -1;
  if (gamepadPressed(13) || gamepadPressed(15)) return 1;
  return 0;
}

export function consumeUiConfirm(): boolean {
  return gamepadPressed(0);
}

export function isActionDown(action: InputAction): boolean {
  return isDown(keyFor(action));
}

export function consumeActionPress(action: InputAction): boolean {
  const bound = keyFor(action);
  if (consumeKeyPress(bound)) return true;
  // Touch controls intentionally remain usable after keyboard rebinding.
  if (action === 'ability' && bound !== 'Space' && consumeKeyPress('Space')) return true;
  if (action === 'ability') return gamepadPressed(0);
  if (action === 'pause') return gamepadPressed(9);
  return false;
}

/** Used by the controls screen while waiting for a replacement binding. */
export function consumeAnyKeyPress(): string | null {
  const code = justPressed.values().next().value as string | undefined;
  if (!code) return null;
  justPressed.delete(code);
  return code;
}

/** -1..1 on each axis from WASD/arrows, or the virtual joystick on touch. */
export function moveAxis(out: { x: number; y: number }): void {
  if (joy.active) {
    const mx = joy.dx / JOY_MAX;
    const my = joy.dy / JOY_MAX;
    if (Math.hypot(mx, my) > 0.16) {
      out.x = mx;
      out.y = my;
      return;
    }
    out.x = 0;
    out.y = 0;
    return;
  }
  const gp = gamepad();
  if (gp) {
    const gx = (gp.axes[0] ?? 0) + ((gp.buttons[15]?.pressed ? 1 : 0) - (gp.buttons[14]?.pressed ? 1 : 0));
    const gy = (gp.axes[1] ?? 0) + ((gp.buttons[13]?.pressed ? 1 : 0) - (gp.buttons[12]?.pressed ? 1 : 0));
    if (Math.hypot(gx, gy) > 0.18) {
      out.x = Math.max(-1, Math.min(1, gx));
      out.y = Math.max(-1, Math.min(1, gy));
      return;
    }
  }
  out.x = (isActionDown('moveRight') || isDown('ArrowRight') ? 1 : 0)
    - (isActionDown('moveLeft') || isDown('ArrowLeft') ? 1 : 0);
  out.y = (isActionDown('moveDown') || isDown('ArrowDown') ? 1 : 0)
    - (isActionDown('moveUp') || isDown('ArrowUp') ? 1 : 0);
}

export function getMouse(): { x: number; y: number; down: boolean } {
  return { x: mouseX, y: mouseY, down: mouseDown };
}

/** True once per click; consumed by the caller. */
export function consumeClick(): boolean {
  const c = mouseClicked;
  mouseClicked = false;
  return c;
}

/** One-shot key press; consumed on read. Survives until a sim step reads it. */
export function consumeKeyPress(code: string): boolean {
  if (justPressed.has(code)) {
    justPressed.delete(code);
    return true;
  }
  return false;
}

/** Called by the game loop after a frame that ran at least one sim step. */
export function clearFrameKeys(): void {
  justPressed.clear();
}
