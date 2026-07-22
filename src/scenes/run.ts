import type { Game, Scene } from '../game';
import { getWaveDef } from '../data/waves';
import { FINAL_WAVE, ARENA_W, ARENA_H, WAVE_END_MATERIAL_DROP_MULT } from '../config';
import { isDown, consumeActionPress, consumeKeyPress, isTouchDevice, pauseButtonCircle } from '../core/input';
import { toggleMute, toggleMusic, isMuted, isMusicOn, setMusicIntensity } from '../render/audio';
import { loadMeta, markTutorial } from '../core/save';
import { button, dimBackground, drawWrappedCentered as drawTutorialText, fitToViewport, panel, renderFitted } from '../render/ui';
import { updateSpawner } from '../systems/spawner';
import { updateEnemies } from '../systems/enemyAI';
import { updateAreaEffects, updateEnemyStatuses, updateWeapons, damageEnemy } from '../systems/combat';
import { addShake } from '../render/fx';
import { updateProjectiles, separateEnemies, enemyContactDamage } from '../systems/collision';
import { updatePickups, updateRegen, rollUpgradeChoices } from '../systems/levelup';
import { UPGRADES, type UpgradeDef } from '../data/upgrades';
import { TALENTS, rollTalentChoices, type TalentDef } from '../data/talents';
import { generateMap, hitsObstacle } from '../data/maps';
import { rollChestLoot, type ShopOffer } from '../systems/shop';
import { WeaponInstance } from '../entities/weapon';
import { WEAPONS, MAX_TIER, TIER_DAMAGE, TIER_NAMES } from '../data/weapons';
import { ITEMS } from '../data/items';
import { WEAPON_CLASS } from '../data/sets';
import { ABILITY_BALANCE } from '../data/abilities';
import { spawnBurst, spawnRing } from '../render/fx';
import { RARITY_COLORS, rarityName } from '../data/rarity';
import { t, tn } from '../core/i18n';
import { displayFont } from '../render/font';
import { bakeFloor } from '../render/floor';
import { updateFx } from '../render/fx';
import { playSfx } from '../render/audio';
import { renderWorld } from '../render/renderer';
import { renderHud } from '../render/hud';
import { drawIcon, weaponIcon } from '../render/icons';
import { STAT_LABELS, formatStatValue, type Stats } from '../entities/stats';
import { shopScene } from './shopScene';
import { eventScene } from './eventScene';
import { endScene } from './endScene';
import { menuScene } from './menu';
import { loadSettings } from '../core/settings';
import { saveCheckpoint } from '../core/checkpoint';
import { settingsScene } from './settingsScene';
import { runTutorialForWave, TUTORIAL_STEPS, type TutorialStepId } from '../core/tutorial';
import { createWaveObjective, failWaveObjective, updateWaveObjective } from '../systems/objectives';
import { chance } from '../core/rng';
import { applyPlayerMovement } from '../systems/playerMovement';
import type { Player } from '../entities/player';
import type { PlayerSlot } from '../multiplayer/types';
import { GuestSession, HostSession } from '../multiplayer/session';
import { resetPlayersForWave } from '../systems/squad';
import { updateBomberExplosions, updateFirePatches } from '../systems/hazards';
import { claimDisconnectedRun, disconnectedRunReward } from '../core/disconnectRecovery';

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
const LEVEL_LAYOUT_W = 720;
const LEVEL_LAYOUT_H = 340;
const LEVEL_CARD_Y = 96;
type LevelChoice = UpgradeDef | TalentDef;
const levelChoiceById = new Map<string, LevelChoice>([
  ...UPGRADES.map((choice) => [choice.id, choice] as const),
  ...TALENTS.map((choice) => [choice.id, choice] as const),
]);
const weaponByNetworkId = new Map(WEAPONS.map((definition) => [definition.id, definition]));
const itemByNetworkId = new Map(ITEMS.map((definition) => [definition.id, definition]));

class RunScene implements Scene {
  wantsJoystick = true;
  levelUpChoices: LevelChoice[] | null = null;
  private levelUpTalentMode = false;
  private levelUpAction: number | null = null;
  private levelChoicesBySlot: [LevelChoice[] | null, LevelChoice[] | null] = [null, null];
  private levelSubmitted: [boolean, boolean] = [false, false];
  private levelPhaseRevision = 0;
  private guestSubmittedRevision = 0;
  private levelWaiting = false;
  get blocksJoystick(): boolean {
    return !!(this.levelUpChoices || this.levelWaiting || this.paused || this.remotePaused || this.chestReward || this.tutorialStep);
  }
  /** overlay pop-in: timestamp when the current overlay opened (ms) */
  private overlayOpenAt = 0;
  private overlayWas = false;
  waveEndTimer = -1;
  bannerTimer = 0;
  paused = false;
  hintTimer = 0;
  private pauseAction: 'resume' | 'surrender' | 'mute' | 'music' | 'settings' | null = null;
  chestReward: ShopOffer | null = null;
  private chestAction: 'take' | 'scrap' | null = null;
  private chestOwnerSlot: PlayerSlot = 0;
  private chestPhaseRevision = 0;
  private guestChestSubmittedRevision = 0;
  private readonly lastAbilityPressSeq = [0, 0];
  private connectionExit = false;
  private remotePaused = false;
  private ending = false;
  private tutorialStep: TutorialStepId | null = null;
  private tutorialDismiss = false;

  enterWave(game: Game): void {
    const s = game.state;
    if (s.wave === 1) {
      this.lastAbilityPressSeq[0] = 0;
      this.lastAbilityPressSeq[1] = 0;
    }
    s.waveTimer = getWaveDef(s.wave).duration;
    s.spawnTimer = 0.6;
    s.vacuum = false;
    s.bossUid = 0;
    s.bossDead = false;
    this.levelUpChoices = null;
    this.levelUpAction = null;
    this.levelChoicesBySlot = [null, null];
    this.levelSubmitted = [false, false];
    this.levelPhaseRevision = 0;
    this.guestSubmittedRevision = 0;
    this.levelWaiting = false;
    this.chestPhaseRevision = 0;
    this.guestChestSubmittedRevision = 0;
    this.remotePaused = false;
    this.ending = false;
    this.tutorialStep = game.sessionRole === 'solo' ? runTutorialForWave(s.wave) : null;
    this.tutorialDismiss = false;
    this.waveEndTimer = -1;
    this.paused = false;
    // newbie hints on the very first run
    this.hintTimer = s.wave === 1 && loadMeta().stats.runs === 0 ? 8 : 0;
    // every wave starts at full health (Brotato-style)
    resetPlayersForWave(s.players);
    s.projectiles.clear();
    s.areaEffects.clear();
    // fresh map every wave
    const map = generateMap(s.wave, s.routeIds);
    s.theme = map.theme;
    s.obstacles = map.obstacles;
    s.floorCanvas = bakeFloor(s.theme, s.wave);
    this.bannerTimer = 2.6;
    // boss waves push the soundtrack to full intensity (no break sections)
    setMusicIntensity(getWaveDef(s.wave).boss ? 1 : 0.6);
    // battlefield chests: one guaranteed, sometimes two
    s.chests = [];
    if (game.sessionRole !== 'guest') {
      const chestCount = 1 + (Math.random() < 0.25 ? 1 : 0);
      for (let i = 0; i < chestCount; i++) {
        for (let tries = 0; tries < 20; tries++) {
          const x = 140 + Math.random() * (ARENA_W - 280);
          const y = 140 + Math.random() * (ARENA_H - 280);
          const dc = (x - ARENA_W / 2) ** 2 + (y - ARENA_H / 2) ** 2;
          if (dc > 350 * 350 && !hitsObstacle(s.obstacles, x, y, 26)) {
            s.chests.push(s.createChest(x, y));
            break;
          }
        }
      }
    }
    this.chestReward = null;
    this.chestAction = null;
    s.explosions = [];
    s.firePatches = [];
    // the center stays obstacle-free by generation, put the player there
    for (const player of s.players) {
      player.x = ARENA_W / 2 + (player.slot === 0 ? -28 : 28) * (s.players.length > 1 ? 1 : 0);
      player.y = ARENA_H / 2;
    }
    s.waveMaterials = 0;
    s.objective = game.sessionRole === 'guest' ? null : createWaveObjective(s);
    game.camera.follow(game.localPlayer.x, game.localPlayer.y);
    saveCheckpoint(game);
  }

  private virtualCardRect(i: number, count: number): [number, number, number, number] {
    const cw = 210;
    const ch = 190;
    const gap = 24;
    const total = count * cw + (count - 1) * gap;
    return [LEVEL_LAYOUT_W / 2 - total / 2 + i * (cw + gap), LEVEL_CARD_Y, cw, ch];
  }

  update(game: Game, dt: number): void {
    const s = game.state;
    const p = game.localPlayer;
    const localSlot = game.localPlayerSlot;

    if (game.networkSession?.status === 'connection-lost') {
      if (this.connectionExit) {
        this.connectionExit = false;
        const session = game.networkSession;
        claimDisconnectedRun(game);
        game.networkSession = null;
        game.sessionRole = 'solo';
        void session.close();
        game.setScene(menuScene, true);
      }
      return;
    }
    const activeHostSession = game.networkSession instanceof HostSession ? game.networkSession : null;
    if (this.tutorialStep) {
      if (this.tutorialDismiss || consumeKeyPress('Enter')) {
        markTutorial(this.tutorialStep);
        this.tutorialStep = null;
        this.tutorialDismiss = false;
        playSfx('click');
      }
      return;
    }
    if (this.levelUpChoices) {
      for (let i = 0; i < this.levelUpChoices.length; i++) {
        if (consumeKeyPress(`Digit${i + 1}`) || consumeKeyPress(`Numpad${i + 1}`)) this.levelUpAction = i;
      }
    }
    if (activeHostSession?.pausedByVisibility) this.paused = true;
    if (game.sessionRole === 'guest') {
      const session = game.networkSession;
      if (session instanceof GuestSession) this.updateGuestPhase(game, session);
      game.camera.follow(p.x, p.y);
      updateFx(dt);
      return;
    }

    // chest reward overlay pauses the sim until a choice is made
    if (this.chestReward) {
      const session = game.networkSession;
      if (session instanceof HostSession && game.state.players.length === 2) {
        this.updateHostChestPhase(game, session);
        return;
      }
      const a = this.chestAction;
      this.chestAction = null;
      if (a) {
        this.applyChestChoice(game, a);
        this.chestReward = null;
      }
      return;
    }

    // pause toggle (not while the level-up chooser is open)
    if (consumeActionPress('pause') && !this.levelUpChoices) {
      this.paused = !this.paused;
      if (activeHostSession) {
        if (this.paused) {
          activeHostSession.publishPhase({
            version: 1,
            phase: 'paused',
            phaseRevision: activeHostSession.nextPhaseRevision(),
            reason: 'host',
          });
        } else {
          activeHostSession.publishRunPhase(s.wave);
        }
      }
      playSfx('click');
    }
    // touch: tap on the on-screen pause button
    if (isTouchDevice() && !this.paused && !this.levelUpChoices && game.ui.clicked) {
      const pc = pauseButtonCircle(game.viewport);
      if ((game.ui.mx - pc.x) ** 2 + (game.ui.my - pc.y) ** 2 <= pc.hitR * pc.hitR) {
        game.ui.clicked = false;
        this.paused = true;
        if (activeHostSession) {
          activeHostSession.publishPhase({
            version: 1,
            phase: 'paused',
            phaseRevision: activeHostSession.nextPhaseRevision(),
            reason: 'host',
          });
        }
        playSfx('click');
      }
    }
    if (this.paused) {
      const a = this.pauseAction;
      this.pauseAction = null;
      if (a === 'resume') {
        this.paused = false;
        if (activeHostSession) activeHostSession.publishRunPhase(s.wave);
      }
      else if (a === 'mute') toggleMute();
      else if (a === 'music') toggleMusic();
      else if (a === 'settings') {
        settingsScene.open(this);
        game.setScene(settingsScene);
      }
      else if (a === 'surrender') {
        this.paused = false;
        this.beginEnd(game, false);
      }
      return;
    }

    // In co-op the host rolls both personal choices and waits for both
    // revision-checked submissions. Solo keeps the original immediate flow.
    const hostSession = activeHostSession;
    if (hostSession && s.players.length === 2) {
      if (this.updateHostLevelPhase(game, hostSession)) return;
    } else if (this.updateSoloLevelPhase(game, localSlot)) {
      return;
    }

    // dev cheats
    if (import.meta.env.DEV) {
      if (isDown('F9')) s.squad.materials += 5;
      if (isDown('F10')) s.waveTimer = Math.min(s.waveTimer, 0.1);
    }

    // hit-stop: brief full freeze for crits / boss kill
    if (s.hitStop > 0) {
      s.hitStop -= dt;
      return;
    }

    // Host-authoritative movement uses the same pure movement function for
    // local input, remote input and guest prediction.
    const nowMs = performance.now();
    for (const player of s.players) {
      const input = player.downed
        ? { moveX: 0, moveY: 0, abilityPressSeq: this.lastAbilityPressSeq[player.slot] }
        : game.inputForSlot(player.slot, nowMs);
      applyPlayerMovement(player, s.obstacles, input, dt);
      player.updateTalentTimers(dt);
      player.abilityCd = Math.max(0, player.abilityCd - dt);
      if (
        !player.downed
        && input.abilityPressSeq > this.lastAbilityPressSeq[player.slot]
        && player.abilityCd <= 0
      ) {
        this.useAbility(game, player);
      }
      this.lastAbilityPressSeq[player.slot] = Math.max(this.lastAbilityPressSeq[player.slot], input.abilityPressSeq);
      player.updateAbilityTimers(dt);
      player.slowT = Math.max(0, player.slowT - dt);
      player.iframes = Math.max(0, player.iframes - dt);
    }
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.hintTimer = Math.max(0, this.hintTimer - dt);
    s.metrics.duration += dt;
    s.resonanceActiveT = Math.max(0, s.resonanceActiveT - dt);

    const inWaveEnd = this.waveEndTimer >= 0;

    if (!inWaveEnd) updateSpawner(s, game.camera, dt);
    updateEnemies(s, dt);

    s.grid.rebuild(
      s.enemies.count,
      (i) => s.enemies.items[i].x,
      (i) => s.enemies.items[i].y,
    );

    this.updateAbilityEffects(game, dt);
    updateWeapons(s, dt);
    updateProjectiles(s, dt);
    updateAreaEffects(s, dt);
    updateEnemyStatuses(s, dt);
    separateEnemies(s);
    enemyContactDamage(s);
    s.enemies.sweep();

    updatePickups(s, dt);
    updateRegen(s, dt);
    if (!inWaveEnd) updateWaveObjective(s, dt);
    updateFx(dt);

    updateBomberExplosions(s, dt);
    updateFirePatches(s, dt);

    // chest pickup: nearest touching alive player wins; ties go to lower slot.
    for (let i = 0; i < s.chests.length; i++) {
      const c = s.chests[i];
      let opener: Player | null = null;
      let openerDistance = Infinity;
      for (const player of s.alivePlayers()) {
        const rr = player.radius + 24;
        const distance = (c.x - player.x) ** 2 + (c.y - player.y) ** 2;
        if (
          distance <= rr * rr
          && (distance < openerDistance || (distance === openerDistance && opener !== null && player.slot < opener.slot))
        ) {
          opener = player;
          openerDistance = distance;
        }
      }
      if (opener) {
        s.chests.splice(i, 1);
        this.chestOwnerSlot = opener.slot;
        this.chestReward = rollChestLoot(s.wave, opener);
        this.chestAction = null;
        const session = game.networkSession;
        if (session instanceof HostSession && s.players.length === 2) {
          this.chestPhaseRevision = session.nextPhaseRevision();
          this.publishChestPhase(session);
        }
        spawnBurst(c.x, c.y, '#ffd23e', 14);
        spawnRing(c.x, c.y, '#ffd23e');
        playSfx('levelup');
        break;
      }
    }

    game.camera.follow(game.localPlayer.x, game.localPlayer.y);

    // defeat only after the whole squad is downed.
    if (s.allPlayersDowned()) {
      this.beginEnd(game, false);
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
          this.beginEnd(game, true);
        } else if (Math.random() < 0.22) {
          // random between-waves event instead of a plain shop
          const roll = Math.random();
          if (roll < 0.34) {
            shopScene.enter(game, 0.7); // wandering trader, -30%
            game.setScene(shopScene);
          } else if (game.networkSession instanceof HostSession) {
            eventScene.enterNetwork(game);
            game.setScene(eventScene);
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

  private beginEnd(game: Game, won: boolean): void {
    if (this.ending) return;
    this.ending = true;
    endScene.enter(game, won);
    game.setScene(endScene);
  }

  private updateSoloLevelPhase(game: Game, localSlot: PlayerSlot): boolean {
    const state = game.state;
    const player = game.localPlayer;
    if (state.pendingLevelUps[localSlot] > 0 && !this.levelUpChoices) {
      const wantsTalent = state.pendingTalentLevelUps[localSlot] > 0;
      const talentChoices = wantsTalent ? rollTalentChoices(player.talents) : [];
      this.levelUpTalentMode = talentChoices.length > 0;
      if (wantsTalent && !this.levelUpTalentMode) state.pendingTalentLevelUps[localSlot]--;
      this.levelUpChoices = this.levelUpTalentMode ? talentChoices : rollUpgradeChoices(player.stats.luck);
      this.levelUpAction = null;
    }
    if (!this.levelUpChoices) return false;
    this.levelWaiting = false;
    const choice = this.levelUpAction;
    this.levelUpAction = null;
    if (choice !== null && choice >= 0 && choice < this.levelUpChoices.length) {
      this.applyLevelChoice(game, localSlot, this.levelUpChoices[choice]);
      this.levelUpChoices = null;
      playSfx('click');
    }
    return true;
  }

  private chestLootId(offer: ShopOffer): string {
    return offer.kind === 'weapon' ? `weapon:${offer.weapon.id}` : `item:${offer.item.id}`;
  }

  private resolveChestLoot(id: string): ShopOffer | null {
    const separator = id.indexOf(':');
    if (separator < 1) return null;
    const kind = id.slice(0, separator);
    const definitionId = id.slice(separator + 1);
    if (kind === 'weapon') {
      const weapon = weaponByNetworkId.get(definitionId);
      return weapon ? { kind: 'weapon', weapon, price: weapon.price, sold: false } : null;
    }
    if (kind === 'item') {
      const item = itemByNetworkId.get(definitionId);
      return item ? { kind: 'item', item, price: item.basePrice, sold: false } : null;
    }
    return null;
  }

  private publishChestPhase(session: HostSession): void {
    if (!this.chestReward) return;
    session.publishPhase({
      version: 1,
      phase: 'chest',
      phaseRevision: this.chestPhaseRevision,
      ownerSlot: this.chestOwnerSlot,
      choices: [this.chestLootId(this.chestReward)],
      submitted: false,
    });
  }

  private finishNetworkChest(game: Game, session: HostSession, action: 'take' | 'scrap'): void {
    if (!this.chestReward) return;
    this.applyChestChoice(game, action);
    this.chestReward = null;
    this.chestAction = null;
    this.chestPhaseRevision = 0;
    session.publishBuild(game);
    session.publishPhase({
      version: 1,
      phase: 'run',
      phaseRevision: session.nextPhaseRevision(),
      wave: game.state.wave,
    });
  }

  private updateHostChestPhase(game: Game, session: HostSession): void {
    for (const message of session.drainPhaseCommands()) {
      if (
        message.command !== 'chest-choice'
        || message.phaseRevision !== this.chestPhaseRevision
        || this.chestOwnerSlot !== 1
        || message.ids.length !== 1
        || (message.ids[0] !== 'take' && message.ids[0] !== 'scrap')
      ) {
        session.resendPhase();
        continue;
      }
      this.finishNetworkChest(game, session, message.ids[0]);
      return;
    }
    const localAction = this.chestAction;
    this.chestAction = null;
    if (
      this.chestOwnerSlot === game.localPlayerSlot
      && (localAction === 'take' || localAction === 'scrap')
    ) {
      this.finishNetworkChest(game, session, localAction);
    }
  }

  private rollLevelChoices(game: Game, slot: PlayerSlot): LevelChoice[] {
    const state = game.state;
    const player = state.playerBySlot(slot);
    if (!player || state.pendingLevelUps[slot] <= 0) return [];
    const wantsTalent = state.pendingTalentLevelUps[slot] > 0;
    const talents = wantsTalent ? rollTalentChoices(player.talents) : [];
    if (talents.length > 0) return talents;
    if (wantsTalent) state.pendingTalentLevelUps[slot]--;
    return rollUpgradeChoices(player.stats.luck);
  }

  private applyLevelChoice(game: Game, slot: PlayerSlot, selected: LevelChoice): boolean {
    const state = game.state;
    const player = state.playerBySlot(slot);
    if (!player || state.pendingLevelUps[slot] <= 0) return false;
    if (isTalentChoice(selected)) {
      if (state.pendingTalentLevelUps[slot] <= 0 || player.talents.has(selected.id)) return false;
      player.addTalent(selected.id);
      state.pendingTalentLevelUps[slot]--;
    } else {
      player.addUpgrade(selected.modifiers);
    }
    state.pendingLevelUps[slot]--;
    return true;
  }

  private publishLevelPhase(session: HostSession): void {
    session.publishPhase({
      version: 1,
      phase: 'level-up',
      phaseRevision: this.levelPhaseRevision,
      choices: [
        (this.levelChoicesBySlot[0] ?? []).map((choice) => choice.id),
        (this.levelChoicesBySlot[1] ?? []).map((choice) => choice.id),
      ],
      submitted: [...this.levelSubmitted],
    });
  }

  private startLevelPair(game: Game, session: HostSession): void {
    this.levelPhaseRevision = session.nextPhaseRevision();
    this.levelChoicesBySlot = [
      this.rollLevelChoices(game, 0),
      this.rollLevelChoices(game, 1),
    ];
    this.levelSubmitted = [
      this.levelChoicesBySlot[0]!.length === 0,
      this.levelChoicesBySlot[1]!.length === 0,
    ];
    this.levelUpChoices = this.levelChoicesBySlot[0];
    this.levelUpTalentMode = !!this.levelUpChoices?.some(isTalentChoice);
    this.levelWaiting = this.levelSubmitted[0] && !this.levelSubmitted.every(Boolean);
    this.levelUpAction = null;
    this.publishLevelPhase(session);
  }

  private submitHostLevelChoice(
    game: Game,
    session: HostSession,
    slot: PlayerSlot,
    choiceId: string,
    phaseRevision: number,
  ): boolean {
    if (
      phaseRevision !== this.levelPhaseRevision
      || this.levelSubmitted[slot]
      || !this.levelChoicesBySlot[slot]
    ) return false;
    const selected = this.levelChoicesBySlot[slot]!.find((choice) => choice.id === choiceId);
    if (!selected || !this.applyLevelChoice(game, slot, selected)) return false;
    this.levelSubmitted[slot] = true;
    this.levelChoicesBySlot[slot] = null;
    if (slot === game.localPlayerSlot) this.levelUpChoices = null;
    session.publishBuild(game);
    this.publishLevelPhase(session);
    return true;
  }

  private updateHostLevelPhase(game: Game, session: HostSession): boolean {
    const state = game.state;
    for (const message of session.drainPhaseCommands()) {
      if (
        message.command !== 'level-choice'
        || message.ids.length !== 1
        || !this.submitHostLevelChoice(game, session, 1, message.ids[0], message.phaseRevision)
      ) session.resendPhase();
    }

    const hasPending = state.pendingLevelUps.some((count) => count > 0);
    const active = this.levelPhaseRevision > 0 && !this.levelSubmitted.every(Boolean);
    if (!active && hasPending && this.levelChoicesBySlot.every((choices) => choices === null)) {
      this.startLevelPair(game, session);
    }

    if (this.levelPhaseRevision === 0) return false;
    if (!this.levelSubmitted[0]) {
      this.levelUpChoices = this.levelChoicesBySlot[0];
      this.levelUpTalentMode = !!this.levelUpChoices?.some(isTalentChoice);
      const choiceIndex = this.levelUpAction;
      this.levelUpAction = null;
      if (choiceIndex !== null && this.levelUpChoices?.[choiceIndex]) {
        this.submitHostLevelChoice(
          game,
          session,
          0,
          this.levelUpChoices[choiceIndex].id,
          this.levelPhaseRevision,
        );
        playSfx('click');
      }
      this.levelWaiting = this.levelSubmitted[0] && !this.levelSubmitted.every(Boolean);
    } else {
      this.levelUpChoices = null;
      this.levelUpAction = null;
      this.levelWaiting = !this.levelSubmitted.every(Boolean);
    }

    if (!this.levelSubmitted.every(Boolean)) return true;
    this.levelChoicesBySlot = [null, null];
    this.levelPhaseRevision = 0;
    this.levelWaiting = false;
    if (state.pendingLevelUps.some((count) => count > 0)) {
      this.startLevelPair(game, session);
      return true;
    }
    session.publishPhase({
      version: 1,
      phase: 'run',
      phaseRevision: session.nextPhaseRevision(),
      wave: state.wave,
    });
    return false;
  }

  private updateGuestPhase(game: Game, session: GuestSession): void {
    const phase = session.phaseState;
    if (phase?.phase === 'paused') {
      this.remotePaused = true;
      this.levelUpChoices = null;
      this.chestReward = null;
      this.levelUpAction = null;
      this.levelWaiting = false;
      this.chestAction = null;
      return;
    }
    this.remotePaused = false;
    if (phase?.phase === 'shop') {
      this.levelUpChoices = null;
      this.levelWaiting = false;
      this.chestReward = null;
      if (shopScene.enterRemote(game, phase)) game.setScene(shopScene, true);
      return;
    }
    if (phase?.phase === 'event') {
      this.levelUpChoices = null;
      this.levelWaiting = false;
      this.chestReward = null;
      if (eventScene.enterRemote(game, phase)) game.setScene(eventScene, true);
      return;
    }
    if (phase?.phase === 'end') {
      this.levelUpChoices = null;
      this.levelWaiting = false;
      this.chestReward = null;
      endScene.enterRemote(game, phase.won);
      game.setScene(endScene, true);
      return;
    }
    if (phase?.phase === 'chest') {
      this.levelUpChoices = null;
      this.levelUpAction = null;
      this.levelWaiting = false;
      this.chestOwnerSlot = phase.ownerSlot;
      this.chestPhaseRevision = phase.phaseRevision;
      const loot = phase.choices.length === 1 ? this.resolveChestLoot(phase.choices[0]) : null;
      if (loot) this.chestReward = loot;
      const localCanSubmit = phase.ownerSlot === game.localPlayerSlot
        && !phase.submitted
        && this.guestChestSubmittedRevision !== phase.phaseRevision;
      const action = this.chestAction;
      this.chestAction = null;
      if (localCanSubmit && (action === 'take' || action === 'scrap')) {
        session.sendPhaseCommand(phase.phaseRevision, 'chest-choice', [action]);
        this.guestChestSubmittedRevision = phase.phaseRevision;
        playSfx('click');
      }
      return;
    }
    if (this.chestPhaseRevision > 0) {
      this.chestReward = null;
      this.chestAction = null;
      this.chestPhaseRevision = 0;
      this.guestChestSubmittedRevision = 0;
    }
    if (!phase || phase.phase !== 'level-up') {
      this.levelUpChoices = null;
      this.levelUpAction = null;
      this.guestSubmittedRevision = 0;
      this.levelWaiting = false;
      return;
    }
    const slot = game.localPlayerSlot;
    const ids = phase.choices[slot];
    const submitted = phase.submitted[slot] || this.guestSubmittedRevision === phase.phaseRevision;
    this.levelUpChoices = submitted
      ? null
      : ids.map((id) => levelChoiceById.get(id)).filter((choice): choice is LevelChoice => !!choice);
    this.levelWaiting = submitted;
    this.levelUpTalentMode = !!this.levelUpChoices?.some(isTalentChoice);
    const choiceIndex = this.levelUpAction;
    this.levelUpAction = null;
    if (choiceIndex === null || !this.levelUpChoices?.[choiceIndex]) return;
    session.sendPhaseCommand(
      phase.phaseRevision,
      'level-choice',
      [this.levelUpChoices[choiceIndex].id],
    );
    this.guestSubmittedRevision = phase.phaseRevision;
    this.levelUpChoices = null;
    this.levelWaiting = true;
    playSfx('click');
  }

  /** Activates the character's bound active ability. */
  private useAbility(game: Game, p: Player): void {
    const ab = p.character.ability;
    game.state.metrics.abilityUses[p.slot]++;
    p.abilityCd = p.abilityCooldown();
    p.activateAbility();
    if (game.state.players.length === 2) {
      const teammate = game.state.players.find((player) => player.slot !== p.slot);
      if (teammate && !teammate.downed) {
        const distance = Math.hypot(teammate.x - p.x, teammate.y - p.y);
        if (distance <= 460) {
          game.state.resonance += teammate.abilityActiveT > 0 ? 55 : 18;
          if (game.state.resonance >= 100) {
            game.state.resonance = 0;
            game.state.resonanceActiveT = 6;
            for (const player of game.state.alivePlayers()) {
              player.abilityCd *= 0.75;
              spawnRing(player.x, player.y, '#8be9fd');
              spawnBurst(player.x, player.y, '#b18cff', 18);
            }
            playSfx('levelup');
          }
        }
      }
    }
    if (p.hasTalent('synchronization')) {
      for (const weapon of p.weapons) {
        weapon.cooldownTimer *= 0.7;
        for (const [uid, cooldown] of weapon.hitCooldowns) weapon.hitCooldowns.set(uid, cooldown * 0.7);
        for (let i = 0; i < weapon.summonCount; i++) weapon.summonHitCd[i] *= 0.7;
      }
    }
    if (ab.id === 'adaptation') {
      spawnBurst(p.x, p.y, '#8dff9a', 12);
      spawnRing(p.x, p.y, '#8dff9a');
      playSfx('levelup');
    } else if (ab.id === 'whirlwind') {
      spawnBurst(p.x, p.y, '#ffd23e', 10);
      playSfx('heavy');
    } else if (ab.id === 'overheat') {
      spawnBurst(p.x, p.y, '#ff9a45', 12);
      spawnRing(p.x, p.y, '#ff9a45');
      playSfx('fire');
    } else if (ab.id === 'arcane_circle') {
      spawnBurst(p.x, p.y, '#b18cff', 14);
      spawnRing(p.x, p.y, '#b18cff');
      playSfx('magic');
    }
  }

  private updateAbilityEffects(game: Game, dt: number): void {
    const s = game.state;
    for (const p of s.alivePlayers()) {
    if (p.character.ability.id === 'whirlwind' && p.abilityActiveT > 0 && p.abilityPulseCount < p.whirlwindHits()) {
      p.abilityPulseT -= dt;
      while (p.abilityPulseT <= 0 && p.abilityPulseCount < p.whirlwindHits()) {
        let strongestBladeDamage = 0;
        for (const w of p.weapons) {
          if (WEAPON_CLASS[w.def.id] !== 'blade') continue;
          strongestBladeDamage = Math.max(strongestBladeDamage, w.def.damage * TIER_DAMAGE[w.tier - 1]);
        }
        const rawDamage = Math.max(1, strongestBladeDamage * p.whirlwindDamageScale() * (1 + p.stats.damagePct / 100));
        const radius = p.whirlwindRadius();
        s.grid.queryCircle(p.x, p.y, radius + 40, (i) => {
          const e = s.enemies.items[i];
          if (!e.active || e.hp <= 0) return;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const rr = radius + e.radius;
          if (dx * dx + dy * dy > rr * rr) return;
          const len = Math.max(1, Math.hypot(dx, dy));
          damageEnemy(
            s,
            e,
            rawDamage,
            false,
            (dx / len) * 220,
            (dy / len) * 220,
            '#ffd23e',
            p.x,
            p.y,
            0,
            { ownerPlayerSlot: p.slot, x: p.x, y: p.y, weaponId: `ability:${p.character.ability.id}` },
          );
          // Keep the original hit direction for shield-facing checks, then turn
          // the resulting +220 impulse into a net −180 pull.
          if (p.hasAbilityAugment('whirlwind_pull') && e.active) {
            e.knockX -= (dx / len) * 400;
            e.knockY -= (dy / len) * 400;
          }
        });
        p.abilityPulseCount++;
        p.abilityPulseT += p.whirlwindHitInterval();
        spawnRing(p.x, p.y, '#ffd23e');
        addShake(3);
        playSfx('shoot');
      }
    }

    if (p.character.ability.id === 'arcane_circle' && p.abilityActiveT > 0) {
      const radius = p.arcaneCircleRadius();
      s.grid.queryCircle(p.abilityX, p.abilityY, radius + 40, (i) => {
        const e = s.enemies.items[i];
        if (!e.active || e.hp <= 0) return;
        const dx = e.x - p.abilityX;
        const dy = e.y - p.abilityY;
        const rr = radius + e.radius;
        if (dx * dx + dy * dy > rr * rr) return;
        e.slowPct = Math.max(e.slowPct, ABILITY_BALANCE.arcaneCircle.slowPct);
        e.slowT = Math.max(e.slowT, 0.1);
      });
    }
    }
  }

  /** Take or dismantle the chest reward. */
  private applyChestChoice(game: Game, action: 'take' | 'scrap'): void {
    const p = game.state.playerBySlot(this.chestOwnerSlot) ?? game.state.players[0];
    const r = this.chestReward!;
    if (action === 'scrap') {
      const value = Math.max(1, Math.round((r.kind === 'weapon' ? r.weapon.price : r.item.basePrice) * 0.8));
      game.state.squad.materials += value;
      playSfx('buy');
      return;
    }
    if (r.kind === 'weapon') {
      if (!p.canUseWeapon(r.weapon)) {
        game.state.squad.materials += Math.max(1, Math.round(r.weapon.price * 0.8));
        playSfx('buy');
        return;
      }
      const mergeable = p.weapons.find((w) => w.def.id === r.weapon.id && w.tier < MAX_TIER);
      if (mergeable) {
        const owned = p.weapons.filter((w) => w.def.id === r.weapon.id && w.tier < MAX_TIER);
        owned.sort((a, b) => a.tier - b.tier);
        p.upgradeWeapon(owned[0]);
      } else if (p.canAddWeapon()) {
        p.weapons.push(new WeaponInstance(r.weapon, p.weapons.length));
      } else {
        // shouldn't happen (button disabled), fall back to scrap
        game.state.squad.materials += Math.max(1, Math.round(r.weapon.price * 0.8));
      }
      p.recomputeStats();
      game.state.metrics.maxWeapons[p.slot] = Math.max(game.state.metrics.maxWeapons[p.slot], p.weapons.length);
    } else {
      p.addItem(r.item);
    }
    playSfx('buy');
  }

  private beginWaveEnd(s: Game['state']): void {
    this.waveEndTimer = WAVE_END_DELAY;
    s.vacuum = true;
    failWaveObjective(s);
    for (const player of s.players) player.clearAbilityEffects();
    // Undefeated enemies only yield partial salvage. Fractional values are
    // rolled instead of guaranteeing one gem per survivor at wave end.
    for (let i = 0; i < s.enemies.count; i++) {
      const e = s.enemies.items[i];
      if (e.active && !e.isBoss) {
        const expected = e.def.materialDrop * WAVE_END_MATERIAL_DROP_MULT * (s.activeContract?.materialMult ?? 1);
        const amount = Math.floor(expected) + (chance(expected - Math.floor(expected)) ? 1 : 0);
        if (amount > 0) s.dropMaterials(e.x, e.y, amount);
        e.active = false;
      }
    }
    s.enemies.sweep();
    s.projectiles.clear();
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    const w = game.width;
    const h = game.height;
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, w, h);

    renderWorld(ctx, game.state, game.camera, performance.now() / 1000, w, h);

    // darkness vignette with a light pocket around the player
    const dk = game.state.theme.darkness;
    if (dk > 0) {
      const p = game.localPlayer;
      const px = w / 2 + (p.x - game.camera.x) * game.camera.zoom;
      const py = h / 2 + (p.y - game.camera.y) * game.camera.zoom;
      const g = ctx.createRadialGradient(px, py, 150, px, py, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${dk})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    renderHud(ctx, game.state, game.viewport, game.localPlayerSlot);

    if (this.tutorialStep) {
      const step = TUTORIAL_STEPS[this.tutorialStep];
      dimBackground(ctx, w, h);
      const pw = Math.min(520, w - 40);
      const ph = 250;
      const x = (w - pw) / 2;
      const y = (h - ph) / 2;
      panel(ctx, x, y, pw, ph, { radius: 18, border: '#8be9fd66', glow: '#8be9fd33' });
      drawIcon(ctx, step.icon, w / 2, y + 48, 42);
      ctx.fillStyle = '#ffffff';
      ctx.font = displayFont(18);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t(step.titleKey), w / 2, y + 88, pw - 36);
      ctx.fillStyle = '#c8c8dc';
      ctx.font = '14px system-ui, sans-serif';
      drawTutorialText(ctx, t(step.bodyKey), w / 2, y + 122, pw - 44, 20, 3);
      if (button(ctx, game.ui, w / 2 - 130, y + 178, 260, 48, t('tutorial.continue'), { primary: true })) {
        this.tutorialDismiss = true;
      }
      return;
    }

    if (import.meta.env.DEV || loadSettings().showFps) {
      ctx.fillStyle = '#888';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(t('hud.fps', game.fps, game.state.enemies.count), w - 10, h - 18);
      const metrics = game.networkSession?.metrics;
      if (import.meta.env.DEV && metrics) {
        ctx.fillText(
          `rtt ${metrics.rtt.toFixed(0)}ms · snap ${metrics.snapshotBytes}b/${metrics.snapshotSendMs.toFixed(1)}ms`
          + ` · pending ${metrics.snapshotPending ? 1 : 0} · interp ${metrics.interpolationAge.toFixed(0)}ms`,
          w - 10,
          h - 34,
        );
        ctx.fillText(
          `corr ${metrics.predictionCorrection.toFixed(1)} · input ${metrics.lastInputSeq}`
          + ` · event ${metrics.lastEventId} · build ${metrics.buildRevision} · phase ${metrics.phaseRevision}`,
          w - 10,
          h - 50,
        );
      }
    }

    if (game.networkSession?.status === 'connection-lost') {
      dimBackground(ctx, w, h);
      panel(ctx, w / 2 - 220, h / 2 - 100, 440, 200, { radius: 18, border: '#ff547066' });
      ctx.fillStyle = '#ff7080';
      ctx.font = displayFont(20);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('coop.connectionLost'), w / 2, h / 2 - 42);
      const recoveryReward = disconnectedRunReward(game);
      if (button(ctx, game.ui, w / 2 - 150, h / 2 + 20, 300, 50, recoveryReward > 0 ? t('coop.claimLeave', recoveryReward) : t('coop.leave'))) {
        this.connectionExit = true;
      }
      return;
    }
    if (this.remotePaused) {
      dimBackground(ctx, w, h);
      panel(ctx, w / 2 - 210, h / 2 - 78, 420, 156, { radius: 18, border: '#8be9fd55' });
      ctx.fillStyle = '#8be9fd';
      ctx.font = displayFont(20);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('pause.title'), w / 2, h / 2 - 24);
      ctx.fillStyle = '#a8a8ba';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(t('coop.waitDecision'), w / 2, h / 2 + 26);
      return;
    }

    // newbie hints on the first-ever run
    if (this.hintTimer > 0 && !this.levelUpChoices && !this.paused) {
      const p = game.localPlayer;
      const px = w / 2 + (p.x - game.camera.x) * game.camera.zoom;
      const py = h / 2 + (p.y - game.camera.y) * game.camera.zoom;
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
    const overlayActive = !!(this.chestReward || this.paused || this.levelUpChoices || this.levelWaiting);
    const nowMs = performance.now();
    if (overlayActive && !this.overlayWas) this.overlayOpenAt = nowMs;
    this.overlayWas = overlayActive;
    const ot = overlayActive ? Math.min(1, (nowMs - this.overlayOpenAt) / 150) : 1;
    const ok = 1 - (1 - ot) * (1 - ot); // ease-out
    if (overlayActive && ot < 0.85) game.ui.clicked = false;

    // chest reward overlay
    if (this.chestReward) {
      const r = this.chestReward;
      const p = game.state.playerBySlot(this.chestOwnerSlot) ?? game.localPlayer;
      ctx.save();
      ctx.globalAlpha = ok;
      dimBackground(ctx, w, h);
      ctx.translate(0, (1 - ok) * 16);
      const layout = fitToViewport(game.viewport, 400, 360);
      renderFitted(ctx, game.ui, layout, (ow, _oh, ui) => {
        const cx = ow / 2;
        const pw = 380;
        panel(ctx, 10, 15, pw, 330, { radius: 18, glow: '#ffd23e44', border: '#ffd23e66' });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.shadowColor = '#ffd23e88';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ffd23e';
        ctx.font = displayFont(17);
        ctx.fillText(t('chest.title'), cx, 49);
        ctx.restore();

        const iconKey = r.kind === 'weapon' ? weaponIcon(r.weapon.id) : r.item.emoji;
        const name = r.kind === 'weapon' ? tn('w', r.weapon.id, r.weapon.name) : tn('i', r.item.id, r.item.name);
        drawIcon(ctx, iconKey, cx, 122, 52);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillText(name, cx, 172, pw - 36);
        ctx.font = '13px system-ui, sans-serif';
        if (r.kind === 'weapon') {
          const mergeable = p.weapons.find((wi) => wi.def.id === r.weapon.id && wi.tier < MAX_TIER);
          ctx.fillStyle = '#ccccdd';
          ctx.fillText(mergeable ? t('chest.merge', TIER_NAMES[mergeable.tier]) : p.canAddWeapon() ? t('chest.newSlot') : t('chest.full'), cx, 198, pw - 36);
        } else {
          const mods = Object.entries(r.item.modifiers)
            .map(([k, v]) => `${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, v as number)}`)
            .join(', ');
          ctx.fillStyle = '#9fdca0';
          ctx.fillText(mods, cx, 198, pw - 36);
        }

        const scrapValue = Math.max(1, Math.round((r.kind === 'weapon' ? r.weapon.price : r.item.basePrice) * 0.8));
        const canTake = r.kind !== 'weapon' || (p.canUseWeapon(r.weapon) && (p.canAddWeapon() || p.weapons.some((wi) => wi.def.id === r.weapon.id && wi.tier < MAX_TIER)));
        const localOwnsChoice = this.chestOwnerSlot === game.localPlayerSlot;
        const alreadySubmitted = game.sessionRole === 'guest'
          && this.guestChestSubmittedRevision === this.chestPhaseRevision;
        if (localOwnsChoice && !alreadySubmitted) {
          if (button(ctx, ui, 34, 226, pw - 48, 48, t('chest.take'), { primary: true, enabled: canTake })) this.chestAction = 'take';
          if (button(ctx, ui, 34, 284, pw - 48, 40, t('chest.scrap', scrapValue), { icon: 'i_gem' })) this.chestAction = 'scrap';
        } else {
          ctx.fillStyle = '#a8a8ba';
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.fillText(t('coop.waitDecision'), cx, 264, pw - 48);
        }
      });
      ctx.restore();
    }

    if (this.levelWaiting && !this.levelUpChoices) {
      ctx.save();
      ctx.globalAlpha = ok;
      dimBackground(ctx, w, h);
      ctx.translate(0, (1 - ok) * 16);
      panel(ctx, w / 2 - 210, h / 2 - 78, 420, 156, { radius: 18, border: '#8be9fd55' });
      ctx.fillStyle = '#8be9fd';
      ctx.font = displayFont(18);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('coop.waitDecision'), w / 2, h / 2);
      ctx.restore();
    }

    // pause overlay
    if (this.paused) {
      ctx.save();
      ctx.globalAlpha = ok;
      dimBackground(ctx, w, h);
      ctx.translate(0, (1 - ok) * 16);
      const layout = fitToViewport(game.viewport, 400, 340);
      renderFitted(ctx, game.ui, layout, (ow, _oh, ui) => {
        const cx = ow / 2;
        panel(ctx, 20, 20, 360, 300, { radius: 18, glow: '#00000088' });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = displayFont(20);
        ctx.fillText(t('pause.title'), cx, 62);
        if (button(ctx, ui, 140, 100, 54, 44, '', { icon: 'i_sound' })) this.pauseAction = 'mute';
        if (isMuted()) drawPauseSlash(ctx, 140, 100, 54, 44);
        if (button(ctx, ui, 206, 100, 54, 44, '', { icon: 'i_music' })) this.pauseAction = 'music';
        if (!isMusicOn()) drawPauseSlash(ctx, 206, 100, 54, 44);
        if (button(ctx, ui, 272, 100, 54, 44, '⚙', { fontSize: 17 })) this.pauseAction = 'settings';
        if (button(ctx, ui, 70, 172, 260, 52, t('pause.resume'), { primary: true })) this.pauseAction = 'resume';
        if (button(ctx, ui, 70, 236, 260, 44, t('pause.surrender'))) this.pauseAction = 'surrender';
        ctx.fillStyle = '#667';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(isTouchDevice() ? t('pause.hintTouch') : t('pause.hint'), cx, 300);
      });
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
      const layout = fitToViewport(game.viewport, LEVEL_LAYOUT_W, LEVEL_LAYOUT_H);
      renderFitted(ctx, game.ui, layout, (ow, _oh, ui) => {
        ctx.save();
        ctx.shadowColor = '#8dff9a66';
        ctx.shadowBlur = 24;
        ctx.fillStyle = '#8dff9a';
        ctx.font = displayFont(20);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.levelUpTalentMode ? t('talent.title') : t('lvl.title'), ow / 2, 28);
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#aab';
        ctx.font = '15px system-ui, sans-serif';
        ctx.fillText(this.levelUpTalentMode ? t('talent.sub') : t('lvl.sub'), ow / 2, 64);
        for (let i = 0; i < this.levelUpChoices!.length; i++) {
          const u = this.levelUpChoices![i];
          const [x, y, cw, ch] = this.virtualCardRect(i, this.levelUpChoices!.length);
          const hover = ui.mx >= x && ui.mx <= x + cw && ui.my >= y && ui.my <= y + ch;
          if (hover && ui.clicked) {
            ui.clicked = false;
            this.levelUpAction = i;
          }
          const rc = RARITY_COLORS[u.rarity - 1];
          const talent = isTalentChoice(u);
          panel(ctx, x, y, cw, ch, {
            radius: 14,
            fill: hover ? ['#2c3c30', '#1c241e'] : ['#222234', '#181824'],
            border: hover ? '#8dff9a' : rc,
            glow: hover ? '#8dff9a55' : u.rarity > 1 ? `${rc}55` : undefined,
          });
          panel(ctx, x + 10, y + 10, 28, 24, { radius: 7, fill: '#101018dd', border: '#8be9fd55' });
          ctx.fillStyle = '#8be9fd';
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.fillText(`${i + 1}`, x + 24, y + 22);
          drawIcon(ctx, talent ? u.icon : u.emoji, x + cw / 2, y + 44, 40);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 19px system-ui, sans-serif';
          ctx.fillText(tn(talent ? 'tal' : 'u', u.id, u.name), x + cw / 2, y + 88, cw - 16);
          ctx.fillStyle = rc;
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.fillText(talent ? t('talent.tag') : rarityName(u.rarity).toUpperCase(), x + cw / 2, y + 108);
          ctx.font = '13px system-ui, sans-serif';
          if (talent) {
            ctx.fillStyle = '#c5c5d6';
            ctx.font = '12px system-ui, sans-serif';
            drawWrappedCentered(ctx, tn('tald', u.id, u.desc), x + cw / 2, y + 130, cw - 24, 16, 4);
          } else {
            Object.entries(u.modifiers).forEach(([k, v], li) => {
              const val = v as number;
              ctx.fillStyle = val > 0 ? '#9fdca0' : '#e08a8a';
              ctx.fillText(`${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, val)}`, x + cw / 2, y + 128 + li * 17, cw - 16);
            });
          }
        }
      });
      ctx.restore();
    }
  }
}

function isTalentChoice(choice: LevelChoice): choice is TalentDef {
  return 'kind' in choice && choice.kind === 'talent';
}

function drawWrappedCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
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

export const runScene = new RunScene();
