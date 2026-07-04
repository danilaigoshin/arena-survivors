import { ARENA_W, ARENA_H } from '../config';
import { makeRng, type MapTheme } from '../data/maps';
import { bakeSprite, drawSprite, SPRITES } from './sprites';

const MARGIN = 50; // keep decals off the very edge

type Rng = () => number;

function crack(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, color: string, glow?: string): void {
  ctx.save();
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 + rng() * 1.5;
  ctx.globalAlpha = glow ? 0.8 : 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let px = x;
  let py = y;
  const dir = rng() * Math.PI * 2;
  const segs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < segs; i++) {
    px += Math.cos(dir + (rng() - 0.5) * 1.4) * (14 + rng() * 22);
    py += Math.sin(dir + (rng() - 0.5) * 1.4) * (14 + rng() * 22);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

function softEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, color);
  g.addColorStop(1, '#00000000');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDecal(ctx: CanvasRenderingContext2D, rng: Rng, kind: string, theme: MapTheme): void {
  const x = MARGIN + rng() * (ARENA_W - MARGIN * 2);
  const y = MARGIN + rng() * (ARENA_H - MARGIN * 2);

  // pixel-sprite decals
  if (SPRITES[kind]) {
    const size = 16 + rng() * 14;
    const img = bakeSprite(kind, size, { flip: rng() < 0.5 });
    ctx.globalAlpha = 0.85;
    ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
    ctx.globalAlpha = 1;
    return;
  }

  switch (kind) {
    case 'pebbles': {
      ctx.fillStyle = theme.groundTones[1] ?? '#444';
      ctx.globalAlpha = 0.9;
      const n = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(x + (rng() - 0.5) * 26, y + (rng() - 0.5) * 20, 1.5 + rng() * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'lightpatch':
      softEllipse(ctx, x, y, 60 + rng() * 70, 40 + rng() * 50, '#ffffff', 0.04);
      break;
    case 'mist':
      softEllipse(ctx, x, y, 90 + rng() * 90, 50 + rng() * 60, '#b0a8d0', 0.05);
      break;
    case 'mound': {
      softEllipse(ctx, x, y, 28 + rng() * 18, 14 + rng() * 8, '#000000', 0.3);
      softEllipse(ctx, x, y - 4, 20 + rng() * 12, 9 + rng() * 5, theme.groundTones[1], 0.5);
      break;
    }
    case 'leafpatch':
      softEllipse(ctx, x, y, 40 + rng() * 40, 26 + rng() * 26, theme.groundTones[1], 0.35);
      break;
    case 'crack':
      crack(ctx, rng, x, y, '#00000088');
      break;
    case 'icecrack':
      crack(ctx, rng, x, y, '#9adcff55');
      break;
    case 'lavacrack':
      crack(ctx, rng, x, y, '#ff7030', '#ff5010');
      break;
    case 'ripple': {
      ctx.strokeStyle = theme.groundTones[1];
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x, y + i * 8, 18 + i * 6, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'snowdrift':
      softEllipse(ctx, x, y, 40 + rng() * 40, 20 + rng() * 20, '#cfe6ff', 0.09);
      break;
    case 'glints': {
      ctx.fillStyle = '#d8f0ff';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y, 2, 2);
      ctx.fillRect(x + 3, y + 3, 1.5, 1.5);
      ctx.globalAlpha = 1;
      break;
    }
    case 'emberdots': {
      ctx.save();
      ctx.shadowColor = '#ff6020';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ff8040';
      ctx.globalAlpha = 0.5 + rng() * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + rng() * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'scorch':
      softEllipse(ctx, x, y, 34 + rng() * 40, 26 + rng() * 30, '#000000', 0.32);
      break;
    case 'moss':
      softEllipse(ctx, x, y, 26 + rng() * 30, 18 + rng() * 22, '#3f7040', 0.16);
      break;
    case 'debris': {
      ctx.fillStyle = theme.groundTones[1];
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng();
        const r = 5 + rng() * 9;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * 0.7;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'puddle': {
      const rx = 22 + rng() * 22;
      const ry = rx * (0.45 + rng() * 0.15);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = theme.groundTones[2] ?? '#10160c';
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#3a4a58';
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.15, y - ry * 0.2, rx * 0.7, ry * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      // rim highlight + reflection glints
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#8aa0b0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, Math.PI * 0.1, Math.PI * 0.7);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#c8dce8';
      ctx.fillRect(x - rx * 0.3, y - ry * 0.3, 3, 1.5);
      ctx.fillRect(x + rx * 0.2, y + ry * 0.1, 2, 1.5);
      ctx.restore();
      break;
    }
    case 'torchlight':
      softEllipse(ctx, x, y, 70 + rng() * 40, 70 + rng() * 40, '#ffb050', 0.07);
      break;
    case 'pentagram': {
      const cx = ARENA_W / 2;
      const cy = ARENA_H / 2;
      const R = 240;
      ctx.save();
      ctx.shadowColor = '#ff3040';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = '#c8303f';
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      // 5-pointed star
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const px = cx + Math.cos(a) * R * 0.82;
        const py = cy + Math.sin(a) * R * 0.82;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

function drawTiles(ctx: CanvasRenderingContext2D, rng: Rng, theme: MapTheme): void {
  const size = theme.tileSize!;
  ctx.strokeStyle = theme.groundTones[2] ?? '#000';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.55;
  for (let row = 0; row * size < ARENA_H; row++) {
    const y = row * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA_W, y);
    ctx.stroke();
    // vertical seams offset every other row, with occasional missing seams
    const offset = row % 2 === 0 ? 0 : size / 2;
    for (let x = offset; x < ARENA_W; x += size) {
      if (rng() < 0.12) continue;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 6, Math.min(y + size, ARENA_H));
      ctx.stroke();
    }
  }
  // replaced/cracked slabs: ~8% of cells get a different tone
  ctx.fillStyle = theme.groundTones[0];
  for (let row = 0; row * size < ARENA_H; row++) {
    const offset = row % 2 === 0 ? 0 : size / 2;
    for (let x = offset - size; x < ARENA_W; x += size) {
      if (rng() >= 0.08) continue;
      ctx.globalAlpha = 0.1 + rng() * 0.08;
      ctx.fillRect(x + 3, row * size + 3, size - 6, size - 6);
    }
  }
  ctx.globalAlpha = 1;

  // chipped corners
  ctx.fillStyle = theme.groundTones[2] ?? '#000';
  for (let i = 0; i < 40; i++) {
    const x = rng() * ARENA_W;
    const y = rng() * ARENA_H;
    ctx.globalAlpha = 0.25 + rng() * 0.2;
    ctx.fillRect(x, y, 4 + rng() * 8, 3 + rng() * 5);
  }
  ctx.globalAlpha = 1;
}

/** Bakes the whole arena floor for a wave into one offscreen canvas. */
export function bakeFloor(theme: MapTheme, seed: number): HTMLCanvasElement {
  const rng = makeRng(seed * 51787 + 421);
  const c = document.createElement('canvas');
  c.width = ARENA_W;
  c.height = ARENA_H;
  const ctx = c.getContext('2d')!;

  // 1. base gradient
  const g = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, 100, ARENA_W / 2, ARENA_H / 2, Math.max(ARENA_W, ARENA_H) * 0.7);
  g.addColorStop(0, theme.floorInner);
  g.addColorStop(1, theme.floorOuter);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // 2. large soft ground patches
  for (let i = 0; i < 34; i++) {
    const tone = theme.groundTones[Math.floor(rng() * theme.groundTones.length)];
    softEllipse(ctx, rng() * ARENA_W, rng() * ARENA_H, 90 + rng() * 180, 60 + rng() * 130, tone, 0.07 + rng() * 0.07);
  }

  // 2.5 winding dirt path from edge to edge
  if (theme.path) {
    const x0 = -40;
    const y0 = ARENA_H * (0.25 + rng() * 0.5);
    const x1 = ARENA_W + 40;
    const y1 = ARENA_H * (0.25 + rng() * 0.5);
    const cx1 = ARENA_W * (0.25 + rng() * 0.2);
    const cy1 = ARENA_H * (0.15 + rng() * 0.7);
    const trace = (): void => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx1, cy1, x1, y1);
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.path.color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = theme.path.width;
    trace();
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = theme.path.width * 0.55;
    trace();
    ctx.stroke();
    // crumbs along the path
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = theme.path.color;
    for (let i = 0; i < 90; i++) {
      const t = rng();
      const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx1 + t * t * x1;
      const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy1 + t * t * y1;
      ctx.fillRect(px + (rng() - 0.5) * theme.path.width * 1.5, py + (rng() - 0.5) * theme.path.width * 1.5, 2 + rng() * 2, 2 + rng() * 2);
    }
    ctx.restore();
  }

  // 3. fine speckle texture
  for (let i = 0; i < 800; i++) {
    const tone = theme.groundTones[Math.floor(rng() * theme.groundTones.length)];
    ctx.fillStyle = tone;
    ctx.globalAlpha = 0.2 + rng() * 0.25;
    const s = 2 + rng() * 2.5;
    ctx.fillRect(rng() * ARENA_W, rng() * ARENA_H, s, s);
  }
  ctx.globalAlpha = 1;

  // 4. stone-slab seams for tiled themes
  if (theme.tileSize) drawTiles(ctx, rng, theme);

  // 5. decals
  for (const entry of theme.decor) {
    for (let i = 0; i < entry.count; i++) drawDecal(ctx, rng, entry.kind, theme);
  }

  // 6. edge vignette
  const edge = 140;
  const vg = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number): void => {
    const lg = ctx.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, 'rgba(0,0,0,0.35)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(rx, ry, rw, rh);
  };
  vg(0, 0, 0, edge, 0, 0, ARENA_W, edge);
  vg(0, ARENA_H, 0, ARENA_H - edge, 0, ARENA_H - edge, ARENA_W, edge);
  vg(0, 0, edge, 0, 0, 0, edge, ARENA_H);
  vg(ARENA_W, 0, ARENA_W - edge, 0, ARENA_W - edge, 0, edge, ARENA_H);

  return c;
}

/** Live swaying decor (grass/reeds) drawn over the baked floor every frame — max 24 sprites, camera-culled. */
export function drawLiveDecor(
  ctx: CanvasRenderingContext2D,
  theme: MapTheme,
  seed: number,
  time: number,
  cam: { x: number; y: number; viewW: number; viewH: number },
): void {
  const kind = theme.decor.some((d) => d.kind === 'reed') ? 'reed' : theme.decor.some((d) => d.kind === 'grass') ? 'grass' : null;
  if (!kind) return;
  const rng = makeRng(seed * 33911 + 77);
  const x0 = cam.x - cam.viewW / 2 - 24;
  const y0 = cam.y - cam.viewH / 2 - 24;
  const x1 = cam.x + cam.viewW / 2 + 24;
  const y1 = cam.y + cam.viewH / 2 + 24;
  for (let i = 0; i < 24; i++) {
    const x = MARGIN + rng() * (ARENA_W - MARGIN * 2);
    const y = MARGIN + rng() * (ARENA_H - MARGIN * 2);
    const size = 16 + rng() * 10;
    const flip = rng() < 0.5;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const sway = Math.sin(time * 1.6 + i * 1.9) * 0.09;
    drawSprite(ctx, kind, x, y, size, { flip, rotate: sway, alpha: 0.9 });
  }
}
