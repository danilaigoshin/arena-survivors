import type { RunState } from '../state';
import { getWaveDef } from '../data/waves';
import { screenFlash } from './fx';
import { drawSprite } from './sprites';
import { drawIcon, weaponIcon } from './icons';
import { panel, bar, roundRect } from './ui';
import { FINAL_WAVE, MAX_WEAPON_SLOTS } from '../config';
import { isTouchDevice, getJoystick, abilityButtonCircle, pauseButtonCircle } from '../core/input';
import { TIER_NAMES, TIER_COLORS, TIER_COOLDOWN } from '../data/weapons';
import { t, tn } from '../core/i18n';
import { displayFont } from './font';
import type { ViewportMetrics } from '../core/viewport';
import { branchAttackSpeedMultiplier } from '../data/weaponBranches';
import { WAVE_OBJECTIVES } from '../data/objectives';
import type { PlayerSlot } from '../multiplayer/types';
import { xpToNext } from '../systems/squad';

export function renderHud(ctx: CanvasRenderingContext2D, state: RunState, viewport: ViewportMetrics, localPlayerSlot: PlayerSlot): void {
  const p = state.playerBySlot(localPlayerSlot) ?? state.players[0];
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
  ctx.fillText(`${state.squad.level}`, px + 58, py + 55);
  // bars
  bar(ctx, px + 74, py + 12, 180, 22, p.hp / p.stats.maxHp, ['#ff7080', '#c22b3d'], `${Math.ceil(Math.max(0, p.hp))} / ${p.stats.maxHp}`);
  bar(ctx, px + 74, py + 42, 180, 12, state.squad.xp / xpToNext(state.squad.level), ['#8dff9a', '#3fae57']);

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

  // Coordinated abilities and nearby kills charge a shared co-op burst.
  if (state.players.length === 2) {
    const rw = 224;
    const rx = viewW / 2 - rw / 2;
    const ry = 76;
    panel(ctx, rx, ry, rw, 36, {
      radius: 10,
      fill: '#151525dd',
      border: state.resonanceActiveT > 0 ? '#b18cffaa' : '#8be9fd55',
      glow: state.resonanceActiveT > 0 ? '#b18cff55' : undefined,
    });
    const active = state.resonanceActiveT > 0;
    const fraction = active ? 1 : state.resonance / 100;
    bar(ctx, rx + 10, ry + 18, rw - 20, 9, fraction, active ? ['#f0c8ff', '#8f55d8'] : ['#8be9fd', '#526ddf']);
    ctx.textAlign = 'center';
    ctx.fillStyle = active ? '#efd8ff' : '#c8c8dc';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(active ? t('hud.resonanceActive', state.resonanceActiveT.toFixed(1)) : t('hud.resonance'), viewW / 2, ry + 9);
  }

  // ── top-right: materials + kills ──
  const mw = 140;
  panel(ctx, viewW - mw - 14, 14, mw, 64, { radius: 14 });
  drawIcon(ctx, 'i_gem', viewW - mw + 8, 32, 18);
  ctx.fillStyle = '#8be9fd';
  ctx.font = displayFont(15);
  ctx.textAlign = 'left';
  ctx.fillText(`${state.squad.materials}`, viewW - mw + 24, 33);
  drawIcon(ctx, 'i_skull', viewW - mw + 8, 60, 15);
  ctx.fillStyle = '#ccccdd';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${state.kills}`, viewW - mw + 24, 61);

  // ── co-op teammate: compact portrait, HP and ability state ──
  const teammate = state.players.find((player) => player.slot !== localPlayerSlot);
  if (teammate) {
    const tw = 190;
    const tx = viewW - tw - 14;
    const ty = 86;
    panel(ctx, tx, ty, tw, 50, {
      radius: 11,
      fill: '#14141edb',
      border: teammate.downed ? '#ff547055' : teammate.slot === 0 ? '#8be9fd55' : '#ffd23e55',
    });
    drawSprite(ctx, teammate.character.sprite, tx + 25, ty + 25, 34);
    ctx.fillStyle = teammate.downed ? '#ff7080' : teammate.slot === 0 ? '#8be9fd' : '#ffd23e';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`P${teammate.slot + 1}`, tx + 25, ty + 43);
    bar(
      ctx,
      tx + 48,
      ty + 8,
      132,
      16,
      teammate.hp / teammate.stats.maxHp,
      ['#ff7080', '#c22b3d'],
      teammate.downed ? t('coop.downed') : `${Math.ceil(Math.max(0, teammate.hp))}`,
    );
    const abilityReady = teammate.abilityCd <= 0;
    ctx.textAlign = 'left';
    ctx.fillStyle = abilityReady ? '#8dff9a' : '#9a9ab4';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(
      abilityReady ? t('coop.ready') : `${Math.ceil(teammate.abilityCd)}s`,
      tx + 50,
      ty + 37,
      126,
    );
  }

  // ── current optional objective and contract ──
  const objective = state.objective;
  if (objective) {
    const def = WAVE_OBJECTIVES[objective.kind];
    const oy = 96;
    panel(ctx, 14, oy, 264, 54, {
      radius: 11,
      fill: '#14141edb',
      border: objective.completed ? '#8dff9a66' : objective.failed ? '#ff547055' : '#ffffff22',
    });
    drawIcon(ctx, def.icon, 34, oy + 18, 18);
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = objective.completed ? '#8dff9a' : objective.failed ? '#ff7a88' : '#ffffff';
    ctx.fillText(tn('obj', def.id, def.name), 50, oy + 17, 128);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(`+${objective.reward}`, 264, oy + 17);
    const progress = Math.min(objective.target, objective.progress);
    const progressText = objective.completed
      ? t('objective.done')
      : objective.failed
        ? t('objective.failed')
        : objective.kind === 'hold'
          ? t('objective.hold', progress.toFixed(1), objective.target)
          : t(`objective.${objective.kind}`, Math.floor(progress), objective.target);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9a9ab4';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(progressText, 24, oy + 38, 180);
    ctx.textAlign = 'right';
    ctx.fillStyle = objective.timeLeft <= 5 && !objective.completed ? '#ff7a88' : '#c8c8dc';
    ctx.fillText(t('objective.time', Math.ceil(objective.timeLeft)), 264, oy + 38);
  }

  if (state.activeContract) {
    const contract = state.activeContract;
    const cw = 210;
    const cy = teammate ? 144 : 86;
    panel(ctx, viewW - cw - 14, cy, cw, 42, { radius: 11, fill: '#1b1812dd', border: '#ffd23e55' });
    drawIcon(ctx, contract.icon, viewW - cw + 6, cy + 21, 18);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(tn('con', contract.id, contract.name), viewW - cw + 20, cy + 14, cw - 40);
    ctx.fillStyle = '#9fdca0';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(tn('conr', contract.id, contract.reward), viewW - cw + 20, cy + 29, cw - 40);
  }

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
      if (w.branch || w.branchPending) {
        ctx.fillStyle = w.branch === 'force' ? '#ffd23e' : w.branch === 'tempo' ? '#8be9fd' : '#b18cff';
        ctx.beginPath();
        ctx.arc(x + 7, sy + 7, w.branchPending ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
        if (w.branchPending) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('!', x + 7, sy + 7.5);
        }
      }
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
        const maxCd = (w.def.cooldown * TIER_COOLDOWN[w.tier - 1]) / (aspd * branchAttackSpeedMultiplier(w.branch));
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
  const abilityActive = p.abilityActiveT > 0;
  const activeFrac = abilityActive ? p.abilityActiveT / p.abilityDuration() : 0;
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
    ctx.strokeStyle = abilityActive ? '#ffd23e' : p.abilityRecoveryT > 0 ? '#ff7040' : ready ? '#8be9fdaa' : '#ffffff22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.stroke();
    if (abilityActive) {
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, cr + 4 / hudScale, -Math.PI / 2, -Math.PI / 2 + activeFrac * Math.PI * 2);
      ctx.stroke();
    }
    drawIcon(ctx, ab.icon, cx, cy, (viewport.compactLandscape ? 28 : 40) / hudScale);
    if (!ready && !abilityActive) {
      // cooldown sweep
      ctx.fillStyle = '#000000a0';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const cooldownFrac = Math.min(1, p.abilityCd / p.abilityCooldown());
      ctx.arc(cx, cy, cr - 2 / hudScale, -Math.PI / 2, -Math.PI / 2 + cooldownFrac * Math.PI * 2);
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
    panel(ctx, ax, sy - 6, 52, 52, {
      radius: 12,
      fill: '#14141ecc',
      border: abilityActive ? '#ffd23e' : p.abilityRecoveryT > 0 ? '#ff704088' : p.abilityCd <= 0 ? '#8be9fd88' : '#ffffff22',
      glow: abilityActive ? '#ffd23e44' : p.abilityCd <= 0 ? '#8be9fd44' : undefined,
    });
    drawIcon(ctx, ab.icon, ax + 26, sy + 20, 28);
    if (p.abilityCd > 0 && !abilityActive) {
      const frac = Math.min(1, p.abilityCd / p.abilityCooldown());
      ctx.save();
      roundRect(ctx, ax, sy - 6, 52, 52, 12);
      ctx.clip();
      ctx.fillStyle = '#000000a0';
      ctx.fillRect(ax, sy - 6 + 52 * (1 - frac), 52, 52 * frac);
      ctx.restore();
    }
    if (abilityActive) {
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(ax + 4, sy + 41, 44 * activeFrac, 3);
    } else if (p.abilityRecoveryT > 0) {
      ctx.fillStyle = '#ff7040';
      ctx.fillRect(ax + 4, sy + 41, 44 * (p.abilityRecoveryT / p.overheatRecoveryDuration()), 3);
    }
    ctx.fillStyle = abilityActive ? '#ffd23e' : p.abilityRecoveryT > 0 ? '#ff7040' : p.abilityCd <= 0 ? '#8be9fd' : '#667';
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
