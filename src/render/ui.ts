import { playSfx } from './audio';
import { drawIcon } from './icons';

export interface UiInput {
  mx: number;
  my: number;
  clicked: boolean;
  /** pointer is currently held down (for pressed button visuals) */
  down: boolean;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export interface PanelOpts {
  border?: string;
  glow?: string;
  radius?: number;
  fill?: string | [string, string];
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts: PanelOpts = {}): void {
  const r = opts.radius ?? 12;
  ctx.save();
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = 18;
  }
  roundRect(ctx, x, y, w, h, r);
  if (Array.isArray(opts.fill)) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, opts.fill[0]);
    g.addColorStop(1, opts.fill[1]);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = opts.fill ?? '#1d1d2ae8';
  }
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = opts.border ?? '#ffffff1e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export interface ButtonOpts {
  enabled?: boolean;
  primary?: boolean;
  fontSize?: number;
  /** pixel-icon drawn left of the label (sprite name / emoji key for drawIcon) */
  icon?: string;
  /** overrides the label color (e.g. red price when unaffordable) */
  labelColor?: string;
}

export function inRect(ui: UiInput, x: number, y: number, w: number, h: number): boolean {
  return ui.mx >= x && ui.mx <= x + w && ui.my >= y && ui.my <= y + h;
}

/** Immediate-mode canvas button. Returns true when clicked this frame. */
export function button(
  ctx: CanvasRenderingContext2D,
  ui: UiInput,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: ButtonOpts = {},
): boolean {
  const enabled = opts.enabled ?? true;
  const hover = enabled && inRect(ui, x, y, w, h);
  const pressed = hover && ui.down;
  // contents shift 1px down while pressed; the hit rect never moves
  const cy = y + h / 2 + (pressed ? 1 : 0);
  ctx.save();
  if (hover && !pressed) {
    ctx.shadowColor = opts.primary ? '#ffd23e88' : '#8be9fd66';
    ctx.shadowBlur = 16;
  }
  roundRect(ctx, x, y, w, h, 10);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  if (!enabled) {
    g.addColorStop(0, '#26262f');
    g.addColorStop(1, '#1e1e26');
  } else if (opts.primary) {
    g.addColorStop(0, pressed ? '#d9a02e' : hover ? '#ffdf6b' : '#f2b83a');
    g.addColorStop(1, pressed ? '#b87a1e' : hover ? '#f2a83a' : '#d98a26');
  } else {
    g.addColorStop(0, pressed ? '#2c2c40' : hover ? '#45455f' : '#34344a');
    g.addColorStop(1, pressed ? '#222232' : hover ? '#38384e' : '#28283a');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x, y, w, h, 10);
  ctx.strokeStyle = !enabled ? '#ffffff14' : opts.primary ? '#ffe9a8' : hover ? '#8be9fd' : '#ffffff2e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = opts.labelColor ?? (!enabled ? '#666672' : opts.primary ? '#241a08' : '#ffffff');
  const fs = opts.fontSize ?? 16;
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.icon && !label) {
    if (!enabled) ctx.globalAlpha = 0.45;
    drawIcon(ctx, opts.icon, x + w / 2, cy, fs + 6);
    ctx.globalAlpha = 1;
  } else if (opts.icon) {
    const iconSize = fs + 4;
    const labelW = ctx.measureText(label).width;
    const total = iconSize + 7 + labelW;
    if (!enabled) ctx.globalAlpha = 0.45;
    drawIcon(ctx, opts.icon, x + w / 2 - total / 2 + iconSize / 2, cy, iconSize);
    ctx.globalAlpha = 1;
    ctx.fillText(label, x + w / 2 + (iconSize + 7) / 2, cy + 1);
  } else {
    ctx.fillText(label, x + w / 2, cy + 1);
  }
  const clicked = hover && ui.clicked;
  if (clicked) {
    // consume the click: frames without a sim step keep ui.clicked alive,
    // and a second render pass must not fire the same button again
    ui.clicked = false;
    playSfx('click');
  }
  return clicked;
}

/** Rounded progress bar with optional centered label. */
export function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  color: string | [string, string],
  label?: string,
): void {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#00000090';
  ctx.fill();
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0.01) {
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.clip();
    if (Array.isArray(color)) {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, color[0]);
      g.addColorStop(1, color[1]);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = color;
    }
    ctx.fillRect(x, y, w * f, h);
    ctx.restore();
  }
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = '#ffffff28';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (label) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(h * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000000cc';
    ctx.shadowBlur = 3;
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.shadowBlur = 0;
  }
}

export function dimBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(5, 5, 10, 0.78)';
  ctx.fillRect(0, 0, w, h);
}

/** Full-canvas background: radial gradient + subtle vignette. */
export function sceneBackground(ctx: CanvasRenderingContext2D, w: number, h: number, inner = '#191925', outer = '#0b0b10'): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.75);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
