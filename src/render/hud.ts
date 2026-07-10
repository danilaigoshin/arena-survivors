import type { RunState } from '../state';
import { getWaveDef } from '../data/waves';
import { screenFlash } from './fx';
import { drawSprite } from './sprites';
import { drawIcon, weaponIcon } from './icons';
import { panel, bar, roundRect } from './ui';
import { FINAL_WAVE, MAX_WEAPON_SLOTS } from '../config';
import { isTouchDevice, getJoystick, abilityButtonCircle, pauseButtonCircle } from '../core/input';
import { TIER_NAMES, TIER_COLORS, TIER_COOLDOWN } from '../data/weapons';
import { t } from '../core/i18n';
import { displayFont } from './font';
import type { ViewportMetrics } from '../core/viewport';

export function renderHud(ctx: CanvasRenderingContext2D, state: RunState, viewport: ViewportMetrics): void {
  const p = state.player;
  const hudScale = viewport.hudScale;
  const offsetX = viewport.safe.left;
  const offsetY = viewport.safe.top;
  const usableW = viewport.width - viewport.safe.left - viewport.safe.right;
  const usableH = viewport.height - viewport.safe.top - viewport.safe.bottom;
  const viewW = usableW / hudScale;
  const viewH = usableH / hudScale;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(hudScale, hudScale);
  ctx.textBaseline = 'middle';

  // ── top-left: portrait + hp/xp ──
  const px = 14;
  const py = 14;
  panel(ctx, px, py, 264, 74, { radius: 14 });
  // portrait
  panel(ctx, px + 8, py + 8, 58, 58, { radius: 10, fill: '#12121c', border: '#ffffff26' });
  drawSprite(ctx, p.character.sprite, px + 37, py + 37, 44);
  // level badge on portrait corner
  ctx.fillStyle = '#ffd23e';
  roundRect(ctx, px + 46, py + 46, 24, 18, 6);
  ctx.fill();
  ctx.fillStyle = '#241a08';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${p.level}`, px + 58, py + 55);
  // bars
  bar(ctx, px + 74, py + 12, 180, 22, p.hp / p.stats.maxHp, ['#ff7080', '#c22b3d'], `${Math.ceil(Math.max(0, p.hp))} / ${p.stats.maxHp}`);
  bar(ctx, px + 74, py + 42, 180, 12, p.xp / p.xpToNext(), ['#8dff9a', '#3fae57']);

  // ── top-center: wave + timer, plain text with a soft shadow (no panel) ──
  const waveDef = getWaveDef(state.wave);
  const isBossWave = !!waveDef.boss;
  ctx.save();
  ctx.shadowColor = '#000000dd';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#c8c8dc';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(state.wave > FINAL_WAVE ? t('hud.waveEndless', state.wave) : t('hud.wave', state.wave, FINAL_WAVE), viewW / 2, 26);
  if (!isBossWave) {
    ctx.fillStyle = state.waveTimer < 5 ? '#ffd23e' : '#ffffff';
    ctx.font = displayFont(26);
    ctx.fillText(`${Math.ceil(state.waveTimer)}`, viewW / 2, 58);
  } else {
    ctx.fillStyle = '#ff5470';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(t('hud.boss'), viewW / 2, 50);
  }
  ctx.restore();

  // ── top-right: materials + kills ──
  const mw = 140;
  panel(ctx, viewW - mw - 14, 14, mw, 64, { radius: 14 });
  drawIcon(ctx, 'i_gem', viewW - mw + 8, 32, 18);
  ctx.fillStyle = '#8be9fd';
  ctx.font = displayFont(15);
  ctx.textAlign = 'left';
  ctx.fillText(`${p.materials}`, viewW - mw + 24, 33);
  drawIcon(ctx, 'i_skull', viewW - mw + 8, 60, 15);
  ctx.fillStyle = '#ccccdd';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${state.kills}`, viewW - mw + 24, 61);

  // ── bottom-left: weapon slots with cooldown overlay (shifted right on touch to clear the ability button) ──
  const touch = isTouchDevice();
  const slotSize = 46;
  const slotX0 = touch ? 148 : 14;
  const sy = viewH - slotSize - 14;
  const aspd = 1 + p.stats.attackSpeedPct / 100;
  for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
    const x = slotX0 + i * (slotSize + 8);
    panel(ctx, x, sy, slotSize, slotSize, { radius: 10, fill: '#14141ecc' });
    const w = p.weapons[i];
    if (w) {
      if (w.tier > 1 || w.def.evolved) {
        // glow the slot border with the tier color
        ctx.save();
        ctx.shadowColor = w.def.evolved ? '#ffd23e' : TIER_COLORS[w.tier - 1];
        ctx.shadowBlur = 8;
        roundRect(ctx, x, sy, slotSize, slotSize, 10);
        ctx.strokeStyle = w.def.evolved ? '#ffd23e88' : `${TIER_COLORS[w.tier - 1]}88`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      drawIcon(ctx, weaponIcon(w.def.id), x + slotSize / 2, sy + slotSize / 2, 26);
      // tier badge
      if (w.tier > 1 || w.def.evolved) {
        ctx.fillStyle = w.def.evolved ? '#ffd23e' : TIER_COLORS[w.tier - 1];
        roundRect(ctx, x + slotSize - 20, sy + slotSize - 16, 18, 14, 4);
        ctx.fill();
        ctx.fillStyle = '#16161e';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(w.def.evolved ? '★' : TIER_NAMES[w.tier - 1], x + slotSize - 11, sy + slotSize - 9);
      }
      if (w.def.cooldown > 0) {
        const maxCd = (w.def.cooldown * TIER_COOLDOWN[w.tier - 1]) / aspd;
        const frac = Math.max(0, Math.min(1, w.cooldownTimer / maxCd));
        if (frac > 0.02) {
          ctx.save();
          roundRect(ctx, x, sy, slotSize, slotSize, 10);
          ctx.clip();
          ctx.fillStyle = '#00000090';
          ctx.fillRect(x, sy + slotSize * (1 - frac), slotSize, slotSize * frac);
          ctx.restore();
        }
      }
    }
  }

  // ── ability: desktop slot (Space) or big touch button ──
  const ab = p.character.ability;
  if (touch) {
    const c = abilityButtonCircle(viewport);
    const cx = (c.x - offsetX) / hudScale;
    const cy = (c.y - offsetY) / hudScale;
    const cr = c.visualR / hudScale;
    const ready = p.abilityCd <= 0;
    ctx.save();
    if (ready) {
      ctx.shadowColor = '#8be9fd';
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = '#14141ecc';
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = ready ? '#8be9fdaa' : '#ffffff22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.stroke();
    drawIcon(ctx, ab.icon, cx, cy, (viewport.compactLandscape ? 28 : 40) / hudScale);
    if (!ready) {
      // cooldown sweep
      ctx.fillStyle = '#000000a0';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, cr - 2 / hudScale, -Math.PI / 2, -Math.PI / 2 + (p.abilityCd / ab.cooldown) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    // виртуальный джойстик (пока палец на правой половине)
    const j = getJoystick();
    if (j.active) {
      const jx = (j.baseX - offsetX) / hudScale;
      const jy = (j.baseY - offsetY) / hudScale;
      const jr = (viewport.compactLandscape ? 46 : 56) / hudScale;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#8be9fd';
      ctx.beginPath();
      ctx.arc(jx, jy, jr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#e8faff';
      ctx.beginPath();
      ctx.arc(jx + j.dx / hudScale, jy + j.dy / hudScale, (viewport.compactLandscape ? 20 : 24) / hudScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // кнопка паузы
    const pc = pauseButtonCircle(viewport);
    const pcx = (pc.x - offsetX) / hudScale;
    const pcy = (pc.y - offsetY) / hudScale;
    const pcr = pc.visualR / hudScale;
    ctx.fillStyle = '#14141ecc';
    ctx.beginPath();
    ctx.arc(pcx, pcy, pcr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pcx, pcy, pcr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#c8c8dc';
    const pauseK = viewport.compactLandscape ? 0.82 / hudScale : 1;
    ctx.fillRect(pcx - 7 * pauseK, pcy - 8 * pauseK, 5 * pauseK, 16 * pauseK);
    ctx.fillRect(pcx + 2 * pauseK, pcy - 8 * pauseK, 5 * pauseK, 16 * pauseK);
  } else {
    const ax = 14 + MAX_WEAPON_SLOTS * (slotSize + 8) + 10;
    panel(ctx, ax, sy - 6, 52, 52, { radius: 12, fill: '#14141ecc', border: p.abilityCd <= 0 ? '#8be9fd88' : '#ffffff22', glow: p.abilityCd <= 0 ? '#8be9fd44' : undefined });
    drawIcon(ctx, ab.icon, ax + 26, sy + 20, 28);
    if (p.abilityCd > 0) {
      const frac = p.abilityCd / ab.cooldown;
      ctx.save();
      roundRect(ctx, ax, sy - 6, 52, 52, 12);
      ctx.clip();
      ctx.fillStyle = '#000000a0';
      ctx.fillRect(ax, sy - 6 + 52 * (1 - frac), 52, 52 * frac);
      ctx.restore();
    }
    ctx.fillStyle = p.abilityCd <= 0 ? '#8be9fd' : '#667';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE', ax + 26, sy + 54);
  }

  // ── boss hp bar ──
  if (state.bossUid !== 0 && !state.bossDead) {
    for (let i = 0; i < state.enemies.count; i++) {
      const e = state.enemies.items[i];
      if (e.active && e.isBoss) {
        const w = Math.min(560, viewW - 100);
        const x = (viewW - w) / 2;
        const y = viewH - (viewport.compactLandscape ? 92 : 46);
        drawSprite(ctx, e.def.id, x - 26, y + 10, 36);
        bar(ctx, x, y, w, 20, e.hp / e.maxHp, ['#d266e8', '#8a2bab'], t('hud.bossPct', Math.ceil((100 * e.hp) / e.maxHp)));
        break;
      }
    }
  }

  // damage vignette
  if (screenFlash > 0) {
    const g = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.3, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.7);
    g.addColorStop(0, 'rgba(255,30,40,0)');
    g.addColorStop(1, `rgba(255,30,40,${screenFlash * 0.9})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  ctx.restore();
}
