import { playSfx } from './audio';
import { drawIcon } from './icons';
import { t } from '../core/i18n';
import { displayFont } from './font';
import type { ViewportMetrics } from '../core/viewport';
import { consumeKeyPress, consumeUiConfirm, consumeUiDirection, isDown } from '../core/input';

let focusedButton = 0;
let renderedButtons = 0;
let previousButtonCount = 0;
let activateFocused = false;

/** Starts one immediate-mode UI pass and handles keyboard/gamepad-like focus. */
export function beginUiFrame(): void {
  renderedButtons = 0;
  activateFocused = false;
  if (previousButtonCount <= 0) return;
  const tab = consumeKeyPress('Tab');
  const gamepadDirection = consumeUiDirection();
  const backwards = tab && (isDown('ShiftLeft') || isDown('ShiftRight'));
  const forwards = !backwards && (
    tab
    || consumeKeyPress('ArrowDown')
    || consumeKeyPress('ArrowRight')
    || gamepadDirection > 0
  );
  const back = backwards || consumeKeyPress('ArrowUp') || consumeKeyPress('ArrowLeft') || gamepadDirection < 0;
  if (forwards) focusedButton = (focusedButton + 1) % previousButtonCount;
  if (back) focusedButton = (focusedButton - 1 + previousButtonCount) % previousButtonCount;
  activateFocused = consumeKeyPress('Enter') || consumeKeyPress('NumpadEnter') || consumeUiConfirm();
}

export function endUiFrame(): void {
  previousButtonCount = renderedButtons;
  if (previousButtonCount <= 0) focusedButton = 0;
  else focusedButton = Math.min(focusedButton, previousButtonCount - 1);
}

export function resetUiFocus(): void {
  focusedButton = 0;
  renderedButtons = 0;
  previousButtonCount = 0;
  activateFocused = false;
}

export interface UiInput {
  mx: number;
  my: number;
  clicked: boolean;
  /** pointer is currently held down (for pressed button visuals) */
  down: boolean;
}

/**
 * Renders a desktop-authored scene into the safe logical viewport. Both the
 * canvas and pointer coordinates use the same transform, so immediate-mode
 * hit tests stay aligned after scaling.
 */
export function responsiveScene(
  ctx: CanvasRenderingContext2D,
  ui: UiInput,
  viewport: ViewportMetrics,
  minWidth: number,
  minHeight: number,
  render: (width: number, height: number, ui: UiInput) => void,
): void {
  const usableW = Math.max(1, viewport.width - viewport.safe.left - viewport.safe.right);
  const usableH = Math.max(1, viewport.height - viewport.safe.top - viewport.safe.bottom);
  const scale = Math.min(1, usableW / minWidth, usableH / minHeight);
  const offsetX = viewport.safe.left;
  const offsetY = viewport.safe.top;
  const virtualW = usableW / scale;
  const virtualH = usableH / scale;
  const virtualUi = {
    get mx() { return (ui.mx - offsetX) / scale; },
    get my() { return (ui.my - offsetY) / scale; },
    get down() { return ui.down; },
    get clicked() { return ui.clicked; },
    set clicked(value: boolean) { ui.clicked = value; },
  } as UiInput;

  ctx.fillStyle = '#0d0d12';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  render(virtualW, virtualH, virtualUi);
  ctx.restore();
}

export interface FittedLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

/** Fits a fixed-size modal/chooser inside safe-area without changing its proportions. */
export function fitToViewport(viewport: ViewportMetrics, width: number, height: number, margin = 16): FittedLayout {
  const usableW = Math.max(1, viewport.width - viewport.safe.left - viewport.safe.right - margin * 2);
  const usableH = Math.max(1, viewport.height - viewport.safe.top - viewport.safe.bottom - margin * 2);
  const scale = Math.min(1, usableW / width, usableH / height);
  return {
    x: viewport.safe.left + (viewport.width - viewport.safe.left - viewport.safe.right - width * scale) / 2,
    y: viewport.safe.top + (viewport.height - viewport.safe.top - viewport.safe.bottom - height * scale) / 2,
    width,
    height,
    scale,
  };
}

export function fittedUi(ui: UiInput, layout: FittedLayout): UiInput {
  return {
    get mx() { return (ui.mx - layout.x) / layout.scale; },
    get my() { return (ui.my - layout.y) / layout.scale; },
    get down() { return ui.down; },
    get clicked() { return ui.clicked; },
    set clicked(value: boolean) { ui.clicked = value; },
  } as UiInput;
}

export function renderFitted(
  ctx: CanvasRenderingContext2D,
  ui: UiInput,
  layout: FittedLayout,
  render: (width: number, height: number, ui: UiInput) => void,
): void {
  ctx.save();
  ctx.translate(layout.x, layout.y);
  ctx.scale(layout.scale, layout.scale);
  render(layout.width, layout.height, fittedUi(ui, layout));
  ctx.restore();
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

function fittedButtonFontSize(
  ctx: CanvasRenderingContext2D,
  label: string,
  width: number,
  requestedSize: number,
  hasIcon: boolean,
): number {
  if (!label) return requestedSize;
  const minSize = Math.min(9, requestedSize);
  let size = requestedSize;
  while (size > minSize) {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    const iconSpace = hasIcon ? size + 11 : 0;
    if (ctx.measureText(label).width + iconSpace <= width - 20) break;
    size -= 0.5;
  }
  return size;
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
  const buttonIndex = renderedButtons++;
  const enabled = opts.enabled ?? true;
  const pointerHover = enabled && inRect(ui, x, y, w, h);
  if (pointerHover && (ui.down || ui.clicked)) focusedButton = buttonIndex;
  const keyboardFocus = enabled && previousButtonCount > 0 && buttonIndex === focusedButton;
  const hover = pointerHover || keyboardFocus;
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
  if (keyboardFocus) {
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 12);
    ctx.strokeStyle = '#8be9fdcc';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = opts.labelColor ?? (!enabled ? '#666672' : opts.primary ? '#241a08' : '#ffffff');
  const fs = fittedButtonFontSize(ctx, label, w, opts.fontSize ?? 16, !!opts.icon);
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
  const clicked = (pointerHover && ui.clicked) || (keyboardFocus && activateFocused);
  if (clicked) {
    // consume the click: frames without a sim step keep ui.clicked alive,
    // and a second render pass must not fire the same button again
    ui.clicked = false;
    activateFocused = false;
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

export function drawWrappedCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 18,
  maxLines = 4,
): void {
  const words = text.includes(' ') ? text.split(' ') : Array.from(text);
  const separator = text.includes(' ') ? ' ' : '';
  let line = '';
  let lineIndex = 0;
  for (const word of words) {
    const probe = line ? `${line}${separator}${word}` : word;
    if (line && ctx.measureText(probe).width > maxWidth) {
      ctx.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex++;
      if (lineIndex >= maxLines) return;
    } else {
      line = probe;
    }
  }
  if (line && lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
}

/** Full-canvas background: radial gradient + subtle vignette. */
export function sceneBackground(ctx: CanvasRenderingContext2D, w: number, h: number, inner = '#191925', outer = '#0b0b10'): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.75);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function renderRotatePrompt(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  sceneBackground(ctx, w, h, '#1b1b2a', '#09090e');
  const pw = Math.min(360, w - 32);
  const ph = 232;
  const x = (w - pw) / 2;
  const y = Math.max(20, (h - ph) / 2);
  panel(ctx, x, y, pw, ph, { radius: 20, glow: '#8be9fd33', border: '#8be9fd55' });

  const cx = w / 2;
  const iconY = y + 64;
  ctx.save();
  ctx.translate(cx, iconY);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#8be9fd';
  ctx.lineWidth = 4;
  roundRect(ctx, -25, -39, 50, 78, 9);
  ctx.stroke();
  ctx.fillStyle = '#8be9fd';
  ctx.beginPath();
  ctx.arc(0, 29, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = displayFont(17);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('rotate.title'), cx, y + 130, pw - 28);
  ctx.fillStyle = '#a8a8bc';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(t('rotate.body'), cx, y + 172, pw - 34);
}
