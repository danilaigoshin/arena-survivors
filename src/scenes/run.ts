import type { Game, Scene } from '../game';
import { getWaveDef } from '../data/waves';
import { FINAL_WAVE, ARENA_W, ARENA_H, WORLD_ZOOM } from '../config';
import { moveAxis, isDown, consumeKeyPress, isTouchDevice, pauseButtonCircle } from '../core/input';
import { toggleMute, toggleMusic, isMuted, isMusicOn, setMusicIntensity } from '../render/audio';
import { loadMeta } from '../core/save';
import { button } from '../render/ui';
import { norm, clamp } from '../utils/math';
import { updateSpawner } from '../systems/spawner';
import { updateEnemies } from '../systems/enemyAI';
import { updateWeapons, damageEnemy, damagePlayer } from '../systems/combat';
import { addShake } from '../render/fx';
import { updateProjectiles, separateEnemies, enemyContactDamage } from '../systems/collision';
import { updatePickups, updateRegen, rollUpgradeChoices } from '../systems/levelup';
import type { UpgradeDef } from '../data/upgrades';
import { generateMap, pushOutOfObstacles, hitsObstacle } from '../data/maps';
import { rollChestLoot, type ShopOffer } from '../systems/shop';
import { WeaponInstance } from '../entities/weapon';
import { MAX_TIER, TIER_NAMES } from '../data/weapons';
import { spawnBurst, spawnRing } from '../render/fx';
import { RARITY_COLORS, rarityName } from '../data/rarity';
import { t, tn } from '../core/i18n';
import { displayFont } from '../render/font';
import { bakeFloor } from '../render/floor';
import { updateFx } from '../render/fx';
import { playSfx } from '../render/audio';
import { renderWorld } from '../render/renderer';
import { renderHud } from '../render/hud';
import { panel, dimBackground } from '../render/ui';
import { drawIcon, weaponIcon } from '../render/icons';
import { STAT_LABELS, formatStatValue, type Stats } from '../entities/stats';
import { shopScene } from './shopScene';
import { eventScene } from './eventScene';
import { endScene } from './endScene';

const axis = { x: 0, y: 0 };
const dir = { x: 0, y: 0 };

function drawPauseSlash(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = '#e64553';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 13, y + h - 12);
  ctx.lineTo(x + w - 13, y + 12);
  ctx.stroke();
  ctx.restore();
}

const WAVE_END_DELAY = 1.2;

class RunScene implements Scene {
  wantsJoystick = true;
  levelUpChoices: UpgradeDef[] | null = null;
  /** overlay pop-in: timestamp when the current overlay opened (ms) */
  private overlayOpenAt = 0;
  private overlayWas = false;
  waveEndTimer = -1;
  bannerTimer = 0;
  paused = false;
  hintTimer = 0;
  private pauseAction: 'resume' | 'surrender' | 'mute' | 'music' | null = null;
  chestReward: ShopOffer | null = null;
  private chestAction: 'take' | 'scrap' | null = null;

  enterWave(game: Game): void {
    const s = game.state;
    s.waveTimer = getWaveDef(s.wave).duration;
    s.spawnTimer = 0.6;
    s.vacuum = false;
    s.bossUid = 0;
    s.bossDead = false;
    this.levelUpChoices = null;
    this.waveEndTimer = -1;
    this.paused = false;
    // newbie hints on the very first run
    this.hintTimer = s.wave === 1 && loadMeta().stats.runs === 0 ? 8 : 0;
    // every wave starts at full health (Brotato-style)
    s.player.hp = s.player.stats.maxHp;
    s.projectiles.clear();
    // fresh map every wave
    const map = generateMap(s.wave);
    s.theme = map.theme;
    s.obstacles = map.obstacles;
    s.floorCanvas = bakeFloor(s.theme, s.wave);
    this.bannerTimer = 2.6;
    // boss waves push the soundtrack to full intensity (no break sections)
    setMusicIntensity(getWaveDef(s.wave).boss ? 1 : 0.6);
    // battlefield chests: one guaranteed, sometimes two
    s.chests = [];
    const chestCount = 1 + (Math.random() < 0.25 ? 1 : 0);
    for (let i = 0; i < chestCount; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = 140 + Math.random() * (ARENA_W - 280);
        const y = 140 + Math.random() * (ARENA_H - 280);
        const dc = (x - ARENA_W / 2) ** 2 + (y - ARENA_H / 2) ** 2;
        if (dc > 350 * 350 && !hitsObstacle(s.obstacles, x, y, 26)) {
          s.chests.push({ x, y });
          break;
        }
      }
    }
    this.chestReward = null;
    this.chestAction = null;
    s.explosions = [];
    s.firePatches = [];
    // the center stays obstacle-free by generation, put the player there
    s.player.x = ARENA_W / 2;
    s.player.y = ARENA_H / 2;
    game.camera.follow(s.player.x, s.player.y);
  }

  private cardRect(game: Game, i: number, count: number): [number, number, number, number] {
    const w = game.canvas.width;
    const h = game.canvas.height;
    const cw = 210;
    const ch = 190;
    const gap = 24;
    const total = count * cw + (count - 1) * gap;
    return [w / 2 - total / 2 + i * (cw + gap), h / 2 - ch / 2, cw, ch];
  }

  update(game: Game, dt: number): void {
    const s = game.state;
    const p = s.player;

    // chest reward overlay pauses the sim until a choice is made
    if (this.chestReward) {
      const a = this.chestAction;
      this.chestAction = null;
      if (a) {
        this.applyChestChoice(game, a);
        this.chestReward = null;
      }
      return;
    }

    // pause toggle (not while the level-up chooser is open)
    if (consumeKeyPress('Escape') && !this.levelUpChoices) {
      this.paused = !this.paused;
      playSfx('click');
    }
    // touch: tap on the on-screen pause button
    if (isTouchDevice() && !this.paused && !this.levelUpChoices && game.ui.clicked) {
      const pc = pauseButtonCircle(game.canvas.width);
      if ((game.ui.mx - pc.x) ** 2 + (game.ui.my - pc.y) ** 2 <= pc.r * pc.r) {
        game.ui.clicked = false;
        this.paused = true;
        playSfx('click');
      }
    }
    if (this.paused) {
      const a = this.pauseAction;
      this.pauseAction = null;
      if (a === 'resume') this.paused = false;
      else if (a === 'mute') toggleMute();
      else if (a === 'music') toggleMusic();
      else if (a === 'surrender') {
        this.paused = false;
        endScene.enter(game, false);
        game.setScene(endScene);
      }
      return;
    }

    // level-up overlay pauses the sim
    if (s.pendingLevelUps > 0 && !this.levelUpChoices) {
      this.levelUpChoices = rollUpgradeChoices(p.stats.luck);
    }
    if (this.levelUpChoices) {
      if (game.ui.clicked) {
        for (let i = 0; i < this.levelUpChoices.length; i++) {
          const [x, y, w, h] = this.cardRect(game, i, this.levelUpChoices.length);
          if (game.ui.mx >= x && game.ui.mx <= x + w && game.ui.my >= y && game.ui.my <= y + h) {
            p.addUpgrade(this.levelUpChoices[i].modifiers);
            s.pendingLevelUps--;
            this.levelUpChoices = null;
            playSfx('click');
            break;
          }
        }
      }
      return;
    }

    // dev cheats
    if (import.meta.env.DEV) {
      if (isDown('F9')) p.materials += 5;
      if (isDown('F10')) s.waveTimer = Math.min(s.waveTimer, 0.1);
    }

    // hit-stop: brief full freeze for crits / boss kill
    if (s.hitStop > 0) {
      s.hitStop -= dt;
      return;
    }

    // player movement
    moveAxis(axis);
    norm(axis.x, axis.y, dir);
    p.moving = axis.x !== 0 || axis.y !== 0;
    if (p.moving) {
      p.lastDirX = dir.x;
      p.lastDirY = dir.y;
    }

    // active ability (Space)
    p.abilityCd = Math.max(0, p.abilityCd - dt);
    if (consumeKeyPress('Space') && p.abilityCd <= 0) {
      this.useAbility(game);
    }
    p.slowT = Math.max(0, p.slowT - dt);
    const moveMult = p.slowT > 0 ? 0.6 : 1;
    p.x = clamp(p.x + dir.x * p.stats.moveSpeed * moveMult * dt, p.radius, ARENA_W - p.radius);
    p.y = clamp(p.y + dir.y * p.stats.moveSpeed * moveMult * dt, p.radius, ARENA_H - p.radius);
    pushOutOfObstacles(s.obstacles, p);
    p.iframes = Math.max(0, p.iframes - dt);
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.hintTimer = Math.max(0, this.hintTimer - dt);

    const inWaveEnd = this.waveEndTimer >= 0;

    if (!inWaveEnd) updateSpawner(s, game.camera, dt);
    updateEnemies(s, dt);

    s.grid.rebuild(
      s.enemies.count,
      (i) => s.enemies.items[i].x,
      (i) => s.enemies.items[i].y,
    );

    updateWeapons(s, dt);
    updateProjectiles(s, dt);
    separateEnemies(s);
    enemyContactDamage(s);
    s.enemies.sweep();

    updatePickups(s, dt);
    updateRegen(s, dt);
    updateFx(dt);

    // bomber explosions: telegraph counts down, then boom
    for (let i = s.explosions.length - 1; i >= 0; i--) {
      const ex = s.explosions[i];
      ex.t -= dt;
      if (ex.t <= 0) {
        const rr = ex.radius + p.radius;
        if ((ex.x - p.x) ** 2 + (ex.y - p.y) ** 2 <= rr * rr) damagePlayer(s, ex.damage);
        // friendly fire: the blast hurts enemies too
        s.grid.queryCircle(ex.x, ex.y, ex.radius + 40, (ei) => {
          const en = s.enemies.items[ei];
          if (!en.active || en.hp <= 0) return;
          const r2 = (ex.radius + en.radius) ** 2;
          if ((ex.x - en.x) ** 2 + (ex.y - en.y) ** 2 <= r2) damageEnemy(s, en, 25, false, 0, 0);
        });
        spawnBurst(ex.x, ex.y, '#ff7030', 18);
        addShake(5);
        playSfx('death');
        s.explosions.splice(i, 1);
      }
    }

    // burning ground
    for (let i = s.firePatches.length - 1; i >= 0; i--) {
      const f = s.firePatches[i];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        s.firePatches.splice(i, 1);
        continue;
      }
      const rr = 26 + p.radius;
      if ((f.x - p.x) ** 2 + (f.y - p.y) ** 2 <= rr * rr) damagePlayer(s, 6);
    }

    // chest pickup: walk over it to open
    for (let i = 0; i < s.chests.length; i++) {
      const c = s.chests[i];
      const rr = p.radius + 24;
      if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 <= rr * rr) {
        s.chests.splice(i, 1);
        this.chestReward = rollChestLoot(s.wave, p);
        this.chestAction = null;
        spawnBurst(c.x, c.y, '#ffd23e', 14);
        spawnRing(c.x, c.y, '#ffd23e');
        playSfx('levelup');
        break;
      }
    }

    game.camera.follow(p.x, p.y);

    // death
    if (p.hp <= 0) {
      endScene.enter(game, false);
      game.setScene(endScene);
      return;
    }

    // wave lifecycle
    const waveDef = getWaveDef(s.wave);
    if (!inWaveEnd) {
      if (waveDef.boss) {
        s.waveTimer -= dt; // drives spawn pacing and the boss spawn delay
        if (s.bossDead) this.beginWaveEnd(s);
      } else {
        s.waveTimer -= dt;
        if (s.waveTimer <= 0) {
          s.waveTimer = 0;
          this.beginWaveEnd(s);
        }
      }
    } else {
      this.waveEndTimer -= dt;
      if (this.waveEndTimer <= 0 && s.pickups.count === 0) {
        if (s.wave === FINAL_WAVE) {
          endScene.enter(game, true);
          game.setScene(endScene);
        } else if (Math.random() < 0.22) {
          // random between-waves event instead of a plain shop
          const roll = Math.random();
          if (roll < 0.34) {
            shopScene.enter(game, 0.7); // wandering trader, -30%
            game.setScene(shopScene);
          } else {
            eventScene.enter(game, roll < 0.67 ? 'chest' : 'altar');
            game.setScene(eventScene);
          }
        } else {
          shopScene.enter(game);
          game.setScene(shopScene);
        }
      }
    }
  }

  /** Character active ability on Space. */
  private useAbility(game: Game): void {
    const s = game.state;
    const p = s.player;
    const ab = p.character.ability;
    p.abilityCd = ab.cooldown;
    if (ab.id === 'magnet') {
      for (let i = 0; i < s.pickups.count; i++) s.pickups.items[i].magnet = true;
      spawnRing(p.x, p.y, '#8be9fd');
      playSfx('pickup');
    } else if (ab.id === 'slam') {
      const dmg = Math.round(30 * (1 + p.stats.damagePct / 100));
      s.grid.queryCircle(p.x, p.y, 220, (i) => {
        const e = s.enemies.items[i];
        if (!e.active || e.hp <= 0) return;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy > 200 * 200) return;
        const len = Math.max(1, Math.hypot(dx, dy));
        damageEnemy(s, e, dmg, false, (dx / len) * 700, (dy / len) * 700);
      });
      spawnRing(p.x, p.y, '#ffd23e');
      addShake(8);
      playSfx('hurt');
    } else if (ab.id === 'dash') {
      p.x = clamp(p.x + p.lastDirX * 220, p.radius, ARENA_W - p.radius);
      p.y = clamp(p.y + p.lastDirY * 220, p.radius, ARENA_H - p.radius);
      pushOutOfObstacles(s.obstacles, p);
      p.iframes = Math.max(p.iframes, 0.5);
      spawnBurst(p.x, p.y, '#8be9fd', 8);
      playSfx('shoot');
    } else if (ab.id === 'blink') {
      spawnBurst(p.x, p.y, '#b18cff', 10);
      p.x = clamp(p.x + p.lastDirX * 320, p.radius, ARENA_W - p.radius);
      p.y = clamp(p.y + p.lastDirY * 320, p.radius, ARENA_H - p.radius);
      pushOutOfObstacles(s.obstacles, p);
      p.iframes = Math.max(p.iframes, 0.25);
      spawnBurst(p.x, p.y, '#b18cff', 12);
      spawnRing(p.x, p.y, '#b18cff');
      playSfx('levelup');
    }
  }

  /** Take or dismantle the chest reward. */
  private applyChestChoice(game: Game, action: 'take' | 'scrap'): void {
    const p = game.state.player;
    const r = this.chestReward!;
    if (action === 'scrap') {
      const value = Math.max(1, Math.round((r.kind === 'weapon' ? r.weapon.price : r.item.basePrice) * 0.8));
      p.materials += value;
      playSfx('buy');
      return;
    }
    if (r.kind === 'weapon') {
      const mergeable = p.weapons.find((w) => w.def.id === r.weapon.id && w.tier < MAX_TIER);
      if (mergeable) {
        const owned = p.weapons.filter((w) => w.def.id === r.weapon.id && w.tier < MAX_TIER);
        owned.sort((a, b) => a.tier - b.tier);
        owned[0].tier = (owned[0].tier + 1) as WeaponInstance['tier'];
      } else if (p.canAddWeapon()) {
        p.weapons.push(new WeaponInstance(r.weapon, p.weapons.length));
      } else {
        // shouldn't happen (button disabled), fall back to scrap
        p.materials += Math.max(1, Math.round(r.weapon.price * 0.8));
      }
      p.recomputeStats();
    } else {
      p.addItem(r.item);
    }
    playSfx('buy');
  }

  private beginWaveEnd(s: Game['state']): void {
    this.waveEndTimer = WAVE_END_DELAY;
    s.vacuum = true;
    // remaining enemies die and drop their materials
    for (let i = 0; i < s.enemies.count; i++) {
      const e = s.enemies.items[i];
      if (e.active && !e.isBoss) {
        s.dropMaterials(e.x, e.y, Math.max(1, Math.round(e.def.materialDrop * 0.5)));
        e.active = false;
      }
    }
    s.enemies.sweep();
    s.projectiles.clear();
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    const w = game.canvas.width;
    const h = game.canvas.height;
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, w, h);

    renderWorld(ctx, game.state, game.camera, performance.now() / 1000);

    // darkness vignette with a light pocket around the player
    const dk = game.state.theme.darkness;
    if (dk > 0) {
      const p = game.state.player;
      const px = w / 2 + (p.x - game.camera.x) * WORLD_ZOOM;
      const py = h / 2 + (p.y - game.camera.y) * WORLD_ZOOM;
      const g = ctx.createRadialGradient(px, py, 150, px, py, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${dk})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    renderHud(ctx, game.state, w, h);

    if (import.meta.env.DEV) {
      ctx.fillStyle = '#888';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`${game.fps} fps  враги: ${game.state.enemies.count}`, w - 10, h - 18);
    }

    // newbie hints on the first-ever run
    if (this.hintTimer > 0 && !this.levelUpChoices && !this.paused) {
      const p = game.state.player;
      const px = w / 2 + (p.x - game.camera.x) * WORLD_ZOOM;
      const py = h / 2 + (p.y - game.camera.y) * WORLD_ZOOM;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.hintTimer / 1.5) * 0.85;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000000cc';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(isTouchDevice() ? t('run.hint1Touch') : t('run.hint1'), px, py - 66);
      ctx.fillStyle = '#ffd23e';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(t('run.hint2'), px, py + 58);
      ctx.fillStyle = '#8be9fd';
      ctx.fillText(t('run.hint3'), px, py + 80);
      ctx.restore();
    }

    // overlay pop-in: 0.15s fade+slide, clicks suppressed until nearly settled
    const overlayActive = !!(this.chestReward || this.paused || this.levelUpChoices);
    const nowMs = performance.now();
    if (overlayActive && !this.overlayWas) this.overlayOpenAt = nowMs;
    this.overlayWas = overlayActive;
    const ot = overlayActive ? Math.min(1, (nowMs - this.overlayOpenAt) / 150) : 1;
    const ok = 1 - (1 - ot) * (1 - ot); // ease-out
    if (overlayActive && ot < 0.85) game.ui.clicked = false;

    // chest reward overlay
    if (this.chestReward) {
      const r = this.chestReward;
      const p = game.state.player;
      ctx.save();
      ctx.globalAlpha = ok;
      dimBackground(ctx, w, h);
      ctx.translate(0, (1 - ok) * 16);
      const pw = 380;
      const ph = 330;
      panel(ctx, w / 2 - pw / 2, h / 2 - ph / 2, pw, ph, { radius: 18, glow: '#ffd23e44', border: '#ffd23e66' });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.shadowColor = '#ffd23e88';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#ffd23e';
      ctx.font = displayFont(17);
      ctx.fillText(t('chest.title'), w / 2, h / 2 - ph / 2 + 34);
      ctx.restore();

      const iconKey = r.kind === 'weapon' ? weaponIcon(r.weapon.id) : r.item.emoji;
      const name = r.kind === 'weapon' ? tn('w', r.weapon.id, r.weapon.name) : tn('i', r.item.id, r.item.name);
      drawIcon(ctx, iconKey, w / 2, h / 2 - 58, 52);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(name, w / 2, h / 2 - 8);
      ctx.font = '13px system-ui, sans-serif';
      if (r.kind === 'weapon') {
        const mergeable = p.weapons.find((wi) => wi.def.id === r.weapon.id && wi.tier < MAX_TIER);
        ctx.fillStyle = '#ccccdd';
        ctx.fillText(mergeable ? t('chest.merge', TIER_NAMES[mergeable.tier]) : p.canAddWeapon() ? t('chest.newSlot') : t('chest.full'), w / 2, h / 2 + 18);
      } else {
        const mods = Object.entries(r.item.modifiers)
          .map(([k, v]) => `${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, v as number)}`)
          .join(', ');
        ctx.fillStyle = '#9fdca0';
        ctx.fillText(mods, w / 2, h / 2 + 18);
      }

      const scrapValue = Math.max(1, Math.round((r.kind === 'weapon' ? r.weapon.price : r.item.basePrice) * 0.8));
      const canTake = r.kind !== 'weapon' || p.canAddWeapon() || p.weapons.some((wi) => wi.def.id === r.weapon.id && wi.tier < MAX_TIER);
      if (button(ctx, game.ui, w / 2 - pw / 2 + 24, h / 2 + 46, pw - 48, 48, t('chest.take'), { primary: true, enabled: canTake })) {
        this.chestAction = 'take';
      }
      if (button(ctx, game.ui, w / 2 - pw / 2 + 24, h / 2 + 104, pw - 48, 40, t('chest.scrap', scrapValue), { icon: 'i_gem' })) {
        this.chestAction = 'scrap';
      }
      ctx.restore();
    }

    // pause overlay
    if (this.paused) {
      ctx.save();
      ctx.globalAlpha = ok;
      dimBackground(ctx, w, h);
      ctx.translate(0, (1 - ok) * 16);
      panel(ctx, w / 2 - 180, h / 2 - 150, 360, 300, { radius: 18, glow: '#00000088' });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = displayFont(20);
      ctx.fillText(t('pause.title'), w / 2, h / 2 - 108);
      // sound toggles
      if (button(ctx, game.ui, w / 2 - 60, h / 2 - 70, 54, 44, '', { icon: 'i_sound' })) this.pauseAction = 'mute';
      if (isMuted()) drawPauseSlash(ctx, w / 2 - 60, h / 2 - 70, 54, 44);
      if (button(ctx, game.ui, w / 2 + 6, h / 2 - 70, 54, 44, '', { icon: 'i_music' })) this.pauseAction = 'music';
      if (!isMusicOn()) drawPauseSlash(ctx, w / 2 + 6, h / 2 - 70, 54, 44);
      if (button(ctx, game.ui, w / 2 - 130, h / 2 + 2, 260, 52, t('pause.resume'), { primary: true })) this.pauseAction = 'resume';
      if (button(ctx, game.ui, w / 2 - 130, h / 2 + 66, 260, 44, t('pause.surrender'))) this.pauseAction = 'surrender';
      ctx.fillStyle = '#667';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(isTouchDevice() ? t('pause.hintTouch') : t('pause.hint'), w / 2, h / 2 + 130);
      ctx.restore();
    }

    // wave-start banner with the location name
    if (this.bannerTimer > 0 && !this.levelUpChoices && !this.paused && !this.chestReward) {
      const bt = this.bannerTimer;
      const alpha = bt > 2.2 ? (2.6 - bt) / 0.4 : bt < 0.6 ? bt / 0.6 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000000cc';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffffff';
      ctx.font = displayFont(26);
      ctx.fillText(tn('t', game.state.theme.name, game.state.theme.name).toUpperCase(), w / 2, h * 0.3);
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillText(t('run.waveBanner', game.state.wave), w / 2, h * 0.3 + 42);
      ctx.restore();
    }

    if (this.levelUpChoices) {
      ctx.save();
      ctx.globalAlpha = ok;
      dimBackground(ctx, w, h);
      ctx.translate(0, (1 - ok) * 16);
      ctx.save();
      ctx.shadowColor = '#8dff9a66';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#8dff9a';
      ctx.font = displayFont(20);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('lvl.title'), w / 2, h / 2 - 160);
      ctx.restore();
      // restore() may bring back a leaked alignment (e.g. the fps counter's) — reset explicitly
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#aab';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText(t('lvl.sub'), w / 2, h / 2 - 124);
      for (let i = 0; i < this.levelUpChoices.length; i++) {
        const u = this.levelUpChoices[i];
        const [x, y, cw, ch] = this.cardRect(game, i, this.levelUpChoices.length);
        const hover = game.ui.mx >= x && game.ui.mx <= x + cw && game.ui.my >= y && game.ui.my <= y + ch;
        const rc = RARITY_COLORS[u.rarity - 1];
        panel(ctx, x, y, cw, ch, {
          radius: 14,
          fill: hover ? ['#2c3c30', '#1c241e'] : ['#222234', '#181824'],
          border: hover ? '#8dff9a' : rc,
          glow: hover ? '#8dff9a55' : u.rarity > 1 ? `${rc}55` : undefined,
        });
        drawIcon(ctx, u.emoji, x + cw / 2, y + 44, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 19px system-ui, sans-serif';
        ctx.fillText(tn('u', u.id, u.name), x + cw / 2, y + 88);
        ctx.fillStyle = rc;
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(rarityName(u.rarity).toUpperCase(), x + cw / 2, y + 108);
        ctx.font = '13px system-ui, sans-serif';
        const entries = Object.entries(u.modifiers);
        entries.forEach(([k, v], li) => {
          const val = v as number;
          ctx.fillStyle = val > 0 ? '#9fdca0' : '#e08a8a';
          ctx.fillText(`${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, val)}`, x + cw / 2, y + 128 + li * 17);
        });
      }
      ctx.restore();
    }
  }
}

export const runScene = new RunScene();
