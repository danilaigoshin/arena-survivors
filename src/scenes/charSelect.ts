import type { Game, Scene } from '../game';
import { CHARACTERS, type CharacterDef } from '../data/characters';
import { button, panel, bar, sceneBackground, inRect, roundRect, responsiveScene, type UiInput } from '../render/ui';
import { DIFFICULTIES, loadDifficulty, saveDifficulty } from '../data/difficulty';
import { drawSprite, drawShadow } from '../render/sprites';
import { drawIcon, weaponIcon } from '../render/icons';
import { weaponById } from '../data/weapons';
import { BASE_STATS, STAT_LABELS, formatStatValue, type Stats } from '../entities/stats';
import { playSfx } from '../render/audio';
import { t as tt, tn } from '../core/i18n';
import { loadMeta, isUnlocked, tryUnlock } from '../core/save';
import { runScene } from './run';
import { menuScene } from './menu';
import { displayFont } from '../render/font';

const HEADER_H = 108;
const ACTIONBAR_H = 88;
const PREVIEW_W = 400;
const PREVIEW_H = 416;
const TILE_W = 170;
const TILE_H = 180;
const TILE_GAP = 16;

interface StatRow {
  key: keyof Stats;
  frac: number;
  color: [string, string];
  delta: number | undefined;
}

class CharSelectScene implements Scene {
  private chosen: CharacterDef | null = null;
  private selected: CharacterDef = CHARACTERS[0];
  private unlockPending: CharacterDef | null = null;
  private back = false;
  private difficulty = loadDifficulty();
  private enterAt = 0;

  onEnter(): void {
    this.enterAt = performance.now();
  }

  update(game: Game, _dt: number): void {
    if (this.back) {
      this.back = false;
      game.setScene(menuScene);
      return;
    }
    if (this.unlockPending) {
      const c = this.unlockPending;
      this.unlockPending = null;
      if (tryUnlock(c.id, c.unlockCost!)) playSfx('buy');
      return;
    }
    if (this.chosen) {
      const c = this.chosen;
      this.chosen = null;
      playSfx('click');
      game.newRun(c);
      game.state.difficulty = this.difficulty;
      runScene.enterWave(game);
      game.setScene(runScene);
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 1190, 620, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const t = performance.now() / 1000;
    sceneBackground(ctx, w, h, '#1c1a28', '#0a0a10');
    ctx.textBaseline = 'middle';

    // drifting dust
    for (let i = 0; i < 16; i++) {
      const sx = ((i * 733) % 997) / 997;
      const sy = ((i * 271) % 883) / 883;
      const x = sx * w + Math.sin(t * 0.5 + i * 1.9) * 30;
      const y = (sy * h + t * (6 + (i % 4) * 3)) % h;
      ctx.globalAlpha = 0.12 + 0.08 * Math.sin(t + i);
      ctx.fillStyle = i % 4 === 0 ? '#8be9fd' : '#9a9ab4';
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    const meta = loadMeta();

    // ── header ──
    ctx.fillStyle = '#ffffff';
    ctx.font = displayFont(22);
    ctx.textAlign = 'center';
    ctx.fillText(tt('hero.title'), w / 2, 30);

    // segmented difficulty row with skull pips
    const dbW = 150;
    const dTotal = DIFFICULTIES.length * dbW + (DIFFICULTIES.length - 1) * 8;
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      const d = DIFFICULTIES[i];
      const dx = w / 2 - dTotal / 2 + i * (dbW + 8);
      const dy = 52;
      const selected = this.difficulty.id === d.id;
      if (button(ctx, ui, dx, dy, dbW, 32, '', { primary: selected })) {
        this.difficulty = d;
        saveDifficulty(d);
      }
      // pips + label centered together so they never overlap
      const label = tn('d', d.id, d.name);
      ctx.font = 'bold 13px system-ui, sans-serif';
      const pipsW = (i + 1) * 12;
      const total = pipsW + 8 + ctx.measureText(label).width;
      const bx0 = dx + dbW / 2 - total / 2;
      for (let k = 0; k <= i; k++) drawIcon(ctx, 'i_skull', bx0 + 5 + k * 12, dy + 16, 10);
      ctx.fillStyle = selected ? '#241a08' : '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(label, bx0 + pipsW + 8, dy + 17);
      ctx.textAlign = 'center';
      if (selected) {
        ctx.save();
        ctx.shadowColor = d.color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 2;
        roundRect(ctx, dx, dy, dbW, 32, 10);
        ctx.stroke();
        ctx.restore();
      }
    }
    // fixed-height difficulty description line (never shifts the layout)
    ctx.fillStyle = this.difficulty.color;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tn('dd', this.difficulty.id, this.difficulty.desc), w / 2, 97, 620);

    // shard balance top-right
    panel(ctx, w - 150, 20, 130, 36, { radius: 18 });
    drawIcon(ctx, 'i_shard', w - 126, 38, 17);
    ctx.fillStyle = '#b18cff';
    ctx.font = displayFont(14);
    ctx.textAlign = 'left';
    ctx.fillText(`${meta.shards}`, w - 110, 39);

    // ── content ──
    const sinceEnter = (performance.now() - this.enterAt) / 1000;
    const contentH = h - HEADER_H - ACTIONBAR_H;
    const py = HEADER_H + Math.max(4, (contentH - PREVIEW_H) / 2);
    const pk = Math.min(1, Math.max(0, sinceEnter / 0.2));
    if (pk > 0) {
      ctx.save();
      ctx.globalAlpha = pk;
      ctx.translate(0, (1 - pk) * (1 - pk) * 18);
      this.renderPreview(ctx, ui, 40, py, this.selected, meta.shards, t);
      ctx.restore();
    }

    // 2×2 select tiles centered in the right zone
    const zoneL = 40 + PREVIEW_W + 40;
    const gridW = 2 * TILE_W + TILE_GAP;
    const gridH = 2 * TILE_H + TILE_GAP;
    const gx = zoneL + Math.max(0, (w - 40 - zoneL - gridW) / 2);
    const gy = HEADER_H + Math.max(4, (contentH - gridH) / 2);
    for (let i = 0; i < CHARACTERS.length; i++) {
      const c = CHARACTERS[i];
      const x = gx + (i % 2) * (TILE_W + TILE_GAP);
      const y = gy + Math.floor(i / 2) * (TILE_H + TILE_GAP);
      const locked = !!c.unlockCost && !isUnlocked(c.id);
      const selected = this.selected.id === c.id;
      const hover = inRect(ui, x, y, TILE_W, TILE_H);
      const ek = Math.min(1, Math.max(0, (sinceEnter - 0.06 - i * 0.06) / 0.2));
      if (ek <= 0) continue;
      ctx.save();
      ctx.globalAlpha = ek;
      ctx.translate(0, (1 - ek) * (1 - ek) * 18 + (selected ? -4 : 0));
      panel(ctx, x, y, TILE_W, TILE_H, {
        radius: 14,
        fill: locked ? ['#1a1a24', '#131319'] : hover ? ['#2c2c44', '#1c1c2c'] : ['#222234', '#181824'],
        border: selected ? '#ffd23e' : locked ? '#ffffff14' : hover ? '#ffd23e88' : '#ffffff22',
        glow: selected ? '#ffd23e55' : undefined,
      });
      const cx = x + TILE_W / 2;
      drawShadow(ctx, cx, y + 78, 42);
      if (locked) ctx.globalAlpha = ek * 0.25;
      drawSprite(ctx, c.sprite, cx, y + 56, 56, {
        squash: hover && !locked ? Math.sin(t * 10) * 0.06 : Math.sin(t * 3 + i) * 0.02,
        white: locked,
      });
      ctx.globalAlpha = ek;
      if (locked) drawIcon(ctx, 'i_lock', x + TILE_W - 22, y + 20, 18);

      ctx.fillStyle = locked ? '#8a8aa6' : '#ffffff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tn('c', c.id, c.name), cx, y + 112);
      drawIcon(ctx, weaponIcon(c.weapon), cx, y + 138, 18);
      if (locked) {
        drawIcon(ctx, 'i_shard', cx - 18, y + 162, 12);
        ctx.fillStyle = '#b18cff';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${c.unlockCost}`, cx - 9, y + 163);
        ctx.textAlign = 'center';
      }
      // selecting never starts a run — the action bar confirms
      if (hover && ui.clicked && !selected) {
        ui.clicked = false;
        this.selected = c;
        playSfx('click');
      }
      ctx.restore();
    }

    // ── action bar ──
    const barG = ctx.createLinearGradient(0, h - ACTIONBAR_H, 0, h);
    barG.addColorStop(0, '#16161ee8');
    barG.addColorStop(1, '#0d0d12f2');
    ctx.fillStyle = barG;
    ctx.fillRect(0, h - ACTIONBAR_H, w, ACTIONBAR_H);
    ctx.fillStyle = '#ffffff14';
    ctx.fillRect(0, h - ACTIONBAR_H, w, 1);

    if (button(ctx, ui, 20, h - 72, 130, 56, tt('hero.back'))) this.back = true;

    const selLocked = !!this.selected.unlockCost && !isUnlocked(this.selected.id);
    if (!selLocked) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3);
      ctx.shadowColor = '#ffd23e';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      roundRect(ctx, w / 2 - 143, h - 75, 286, 62, 12);
      ctx.stroke();
      ctx.restore();
    }
    if (button(ctx, ui, w / 2 - 140, h - 72, 280, 56, tt('shop.fight'), { primary: true, fontSize: 18, enabled: !selLocked })) {
      this.chosen = this.selected;
    }
  }

  /** Big animated hero preview with comparable stat bars and the unlock action. */
  private renderPreview(ctx: CanvasRenderingContext2D, ui: UiInput, x: number, py: number, c: CharacterDef, shards: number, t: number): void {
    const locked = !!c.unlockCost && !isUnlocked(c.id);
    const pcx = x + PREVIEW_W / 2;
    panel(ctx, x, py, PREVIEW_W, PREVIEW_H, { radius: 16, glow: '#00000066' });

    // hero on a pedestal, walk cycle running
    drawShadow(ctx, pcx, py + 112, 66);
    if (locked) ctx.globalAlpha = 0.25;
    drawSprite(ctx, c.sprite, pcx, py + 70, 96, {
      squash: Math.sin(t * 3) * 0.03,
      frame: 1 + (Math.floor(t * 6) % 2),
      white: locked,
    });
    ctx.globalAlpha = 1;
    if (locked) drawIcon(ctx, 'i_lock', pcx, py + 70, 36);

    ctx.fillStyle = '#ffffff';
    ctx.font = displayFont(17);
    ctx.textAlign = 'center';
    ctx.fillText(tn('c', c.id, c.name), pcx, py + 140);

    ctx.fillStyle = '#9a9ab4';
    ctx.font = '12px system-ui, sans-serif';
    wrapText(ctx, tn('cd', c.id, c.desc), pcx, py + 160, PREVIEW_W - 40, 15);

    // weapon + ability rows
    const wd = weaponById(c.weapon);
    ctx.textAlign = 'left';
    drawIcon(ctx, weaponIcon(wd.id), x + 34, py + 200, 18);
    ctx.fillStyle = '#8be9fd';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(tn('w', wd.id, wd.name), x + 50, py + 201);

    drawIcon(ctx, c.ability.icon, x + 34, py + 224, 18);
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(tn('ab', c.ability.id, c.ability.name), x + 50, py + 225);
    const abW = ctx.measureText(tn('ab', c.ability.id, c.ability.name)).width;
    ctx.fillStyle = '#667';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(tt('hero.cd', c.ability.cooldown), x + 56 + abW, py + 225);
    ctx.fillStyle = '#8a8aa6';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(tn('abd', c.ability.id, c.ability.desc), x + 50, py + 242, PREVIEW_W - 70);

    // divider
    ctx.strokeStyle = '#ffffff14';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 20, py + 256);
    ctx.lineTo(x + PREVIEW_W - 20, py + 256);
    ctx.stroke();

    // comparable stat bars (fixed 5 rows for every hero)
    const rows = statRows(c);
    rows.forEach((r, i) => {
      const ry = py + 272 + i * 21;
      ctx.fillStyle = '#8a8aa6';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(STAT_LABELS[r.key].replace(' %', ''), x + 22, ry, 96);
      bar(ctx, x + 124, ry - 5, 180, 10, r.frac, r.color);
      ctx.textAlign = 'right';
      if (r.delta !== undefined) {
        ctx.fillStyle = r.delta > 0 ? '#9fdca0' : '#e08a8a';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(formatStatValue(r.key, r.delta), x + PREVIEW_W - 20, ry);
      } else {
        ctx.fillStyle = '#55556a';
        ctx.fillText('—', x + PREVIEW_W - 20, ry);
      }
      ctx.textAlign = 'left';
    });

    // fixed action row: unlock button for locked heroes
    if (locked) {
      const cost = c.unlockCost!;
      if (button(ctx, ui, x + 50, py + PREVIEW_H - 46, PREVIEW_W - 100, 38, tt('hero.unlock', cost), { icon: 'i_shard', enabled: shards >= cost })) {
        this.unlockPending = c;
      }
    }
  }
}

/** Comparable stat bars: BASE_STATS + hero mods, normalized against fixed maxes. */
function statRows(c: CharacterDef): StatRow[] {
  const m = c.mods as Partial<Stats>;
  return [
    { key: 'maxHp', frac: (BASE_STATS.maxHp + (m.maxHp ?? 0)) / 100, color: ['#ff9a9a', '#e05a5a'], delta: m.maxHp },
    { key: 'damagePct', frac: (100 + (m.damagePct ?? 0)) / 150, color: ['#ffe08a', '#ffd23e'], delta: m.damagePct },
    { key: 'attackSpeedPct', frac: (100 + (m.attackSpeedPct ?? 0)) / 150, color: ['#ffd88a', '#f2a83a'], delta: m.attackSpeedPct },
    { key: 'moveSpeed', frac: (BASE_STATS.moveSpeed + (m.moveSpeed ?? 0) - 140) / 160, color: ['#a8f0ff', '#8be9fd'], delta: m.moveSpeed },
    { key: 'critChance', frac: (BASE_STATS.critChance + (m.critChance ?? 0)) / 0.15, color: ['#c8a8ff', '#b18cff'], delta: m.critChance },
  ];
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number): void {
  const words = text.split(' ');
  let line = '';
  let ly = y;
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxW && line) {
      ctx.fillText(line, cx, ly);
      line = word;
      ly += lineH;
    } else {
      line = probe;
    }
  }
  if (line) ctx.fillText(line, cx, ly);
}

export const charSelectScene = new CharSelectScene();
