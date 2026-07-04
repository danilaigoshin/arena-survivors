const keys = new Set<string>();
const justPressed = new Set<string>();
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

export function isTouchDevice(): boolean {
  return touchMode;
}

export function getJoystick(): { active: boolean; baseX: number; baseY: number; dx: number; dy: number } {
  return joy;
}

/** Ability button circle (bottom-left) — shared by the touch hit-test and the HUD. */
export function abilityButtonCircle(_w: number, h: number): { x: number; y: number; r: number } {
  return { x: 74, y: h - 78, r: 50 };
}

/** Pause button circle (top, right of center) for touch. */
export function pauseButtonCircle(w: number): { x: number; y: number; r: number } {
  return { x: w / 2 + 150, y: 44, r: 26 };
}

export function initInput(canvas: HTMLCanvasElement): void {
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
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ab = abilityButtonCircle(w, h);
      const pc = pauseButtonCircle(w);
      for (const t of Array.from(e.changedTouches)) {
        // ability/pause circles and the joystick only exist during a run
        if (joyEnabled && (t.clientX - ab.x) ** 2 + (t.clientY - ab.y) ** 2 <= ab.r * ab.r) {
          justPressed.add('Space');
        } else if (joyEnabled && (t.clientX - pc.x) ** 2 + (t.clientY - pc.y) ** 2 <= pc.r * pc.r) {
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
  out.x = (isDown('KeyD') || isDown('ArrowRight') ? 1 : 0) - (isDown('KeyA') || isDown('ArrowLeft') ? 1 : 0);
  out.y = (isDown('KeyS') || isDown('ArrowDown') ? 1 : 0) - (isDown('KeyW') || isDown('ArrowUp') ? 1 : 0);
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
