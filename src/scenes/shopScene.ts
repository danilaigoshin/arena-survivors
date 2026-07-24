import type { Game, Scene } from '../game';
import { rollShop, reroll, effectivePrice, mergeTarget, type ShopState, type ShopOffer } from '../systems/shop';
import { button, dimBackground, drawWrappedCentered, panel, inRect, sceneBackground, roundRect, responsiveScene, type UiInput } from '../render/ui';
import { drawIcon, weaponIcon } from '../render/icons';
import { drawSprite } from '../render/sprites';
import { STAT_LABELS, formatStatValue, type Stats } from '../entities/stats';
import { WeaponInstance, type WeaponBranchId } from '../entities/weapon';
import type { Player } from '../entities/player';
import { weaponById, MAX_TIER, TIER_NAMES, TIER_COLORS, type WeaponDef } from '../data/weapons';
import { WEAPON_BRANCHES, type WeaponBranchDef } from '../data/weaponBranches';
import { EVOLUTIONS, type EvolutionDef } from '../data/evolutions';
import { RARITY_COLORS, rarityName } from '../data/rarity';
import { t as tt, tn } from '../core/i18n';
import { CLASS_DEFS, WEAPON_CLASS, activeSetBonuses } from '../data/sets';
import { playSfx } from '../render/audio';
import { continueToNextWave, progressionScene } from './progressionScene';
import { displayFont } from '../render/font';
import { getWaveDef } from '../data/waves';
import { themeForWave } from '../data/maps';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { GuestSession, HostSession } from '../multiplayer/session';
import {
  applyShopCommand,
  type AuthoritativeShopPhase,
  type ShopCommand,
} from '../multiplayer/shopAuthority';
import type {
  SerializedShopState,
  ShopPhase,
} from '../multiplayer/stateProtocol';
import { runScene } from './run';
import { menuScene } from './menu';
import { markTutorial } from '../core/save';
import { shopTutorialAfterWave, TUTORIAL_STEPS, type TutorialStepId } from '../core/tutorial';
import { consumeKeyPress } from '../core/input';
import { claimDisconnectedRun, disconnectedRunReward } from '../core/disconnectRecovery';
import { routesAfterWave } from '../data/routes';

const CARD_W = 205;
const CARD_H = 290;
const GAP = 20;
const PANEL_W = 280;
const HEADER_H = 116;
const AWNING_H = 40;
const ACTIONBAR_H = 88;
const shopWeaponById = new Map(WEAPONS.map((definition) => [definition.id, definition]));
const shopItemById = new Map(ITEMS.map((definition) => [definition.id, definition]));

function serializeShop(shop: ShopState): SerializedShopState {
  return {
    offers: shop.offers.map((offer) => ({
      kind: offer.kind,
      definitionId: offer.kind === 'weapon' ? offer.weapon.id : offer.item.id,
      price: offer.price,
      sold: offer.sold,
    })),
    rerollCost: shop.rerollCost,
    rerollCount: shop.rerollCount,
  };
}

function hydrateShop(shop: SerializedShopState): ShopState | null {
  if (
    shop.offers.length !== 4
    || !Number.isSafeInteger(shop.rerollCost)
    || shop.rerollCost < 0
    || !Number.isSafeInteger(shop.rerollCount)
    || shop.rerollCount < 0
  ) return null;
  const offers: ShopOffer[] = [];
  for (const offer of shop.offers) {
    if (!Number.isSafeInteger(offer.price) || offer.price < 0 || typeof offer.sold !== 'boolean') return null;
    if (offer.kind === 'weapon') {
      const weapon = shopWeaponById.get(offer.definitionId);
      if (!weapon) return null;
      offers.push({ kind: 'weapon', weapon, price: offer.price, sold: offer.sold });
    } else if (offer.kind === 'item') {
      const item = shopItemById.get(offer.definitionId);
      if (!item) return null;
      offers.push({ kind: 'item', item, price: offer.price, sold: offer.sold });
    } else {
      return null;
    }
  }
  return { offers, rerollCost: shop.rerollCost, rerollCount: shop.rerollCount };
}

class ShopScene implements Scene {
  shop!: ShopState;
  private pending: (() => void) | null = null;
  /** sell confirmation: first click arms the slot, second click within 2s sells */
  private armedSell: { index: number; t: number } | null = null;
  /** wandering-trader event: price multiplier (1 = normal shop) */
  private discount = 1;
  private enterAt = 0;
  /** purchase timestamps per offer index, for the SOLD-stamp pop */
  private soldAt: number[] = [0, 0, 0, 0];
  private prevSold: boolean[] = [false, false, false, false];
  /** Pending specialization currently highlighted in the shop. */
  private branchFocus: WeaponInstance | null = null;
  private networkPhase: AuthoritativeShopPhase | null = null;
  private networkPhaseRevision = 0;
  private connectionExit = false;
  private tutorialStep: TutorialStepId | null = null;
  private tutorialDismiss = false;

  onEnter(): void {
    this.enterAt = performance.now();
  }

  enter(game: Game, discount = 1): void {
    const hostSession = game.networkSession instanceof HostSession ? game.networkSession : null;
    if (hostSession && game.state.players.length === 2) {
      const hostShop = rollShop(game.state.wave, game.state.players[0]);
      const guestShop = rollShop(game.state.wave, game.state.players[1]);
      this.networkPhase = {
        phaseRevision: hostSession.nextPhaseRevision(),
        shops: [hostShop, guestShop],
        ready: [false, false],
        discount,
      };
      this.networkPhaseRevision = this.networkPhase.phaseRevision;
      this.shop = hostShop;
      this.publishNetworkShop(hostSession);
    } else {
      this.networkPhase = null;
      this.networkPhaseRevision = 0;
      this.shop = rollShop(game.state.wave, game.localPlayer);
    }
    this.armedSell = null;
    this.discount = discount;
    this.soldAt = [0, 0, 0, 0];
    this.prevSold = this.shop.offers.map((o) => o.sold);
    this.branchFocus = game.localPlayer.pendingWeaponBranches()[0] ?? null;
    this.tutorialStep = game.sessionRole === 'solo' ? shopTutorialAfterWave(game.state.wave) : null;
    this.tutorialDismiss = false;
  }

  enterRemote(game: Game, phase: ShopPhase): boolean {
    const shop = hydrateShop(phase.shops[game.localPlayerSlot]);
    if (!shop) return false;
    this.networkPhase = null;
    this.networkPhaseRevision = phase.phaseRevision;
    this.shop = shop;
    this.armedSell = null;
    this.discount = phase.discount;
    this.soldAt = [0, 0, 0, 0];
    this.prevSold = shop.offers.map((offer) => offer.sold);
    this.branchFocus = game.localPlayer.pendingWeaponBranches()[0] ?? null;
    return true;
  }

  private price(offer: ShopOffer, p: Player): number {
    return Math.max(1, Math.round(effectivePrice(offer, p) * this.discount));
  }

  private publishNetworkShop(session: HostSession): void {
    const phase = this.networkPhase;
    if (!phase) return;
    session.publishPhase({
      version: 1,
      phase: 'shop',
      phaseRevision: phase.phaseRevision,
      shops: [serializeShop(phase.shops[0]), serializeShop(phase.shops[1])],
      ready: [...phase.ready],
      discount: phase.discount,
    });
  }

  private startNextNetworkWave(game: Game, session: HostSession): void {
    // Publish one final authoritative build and let the following phase carry
    // its revision. The guest will not enter combat until this build arrives.
    session.publishBuild(game);
    this.networkPhase = null;
    continueToNextWave(game);
  }

  private applyNetworkCommand(game: Game, session: HostSession, command: ShopCommand): void {
    const phase = this.networkPhase;
    if (!phase) return;
    const result = applyShopCommand(game.state, phase, command);
    if (result.accepted && command.type !== 'ready') session.publishBuild(game);
    this.shop = phase.shops[game.localPlayerSlot];
    this.publishNetworkShop(session);
    if (result.accepted && result.startNextWave) this.startNextNetworkWave(game, session);
  }

  private sendGuestCommand(game: Game, command: string, ids: string[] = [], value?: number | boolean): void {
    const session = game.networkSession;
    if (!(session instanceof GuestSession) || this.networkPhaseRevision <= 0) return;
    session.sendPhaseCommand(this.networkPhaseRevision, command, ids, value);
  }

  private submitNetworkCommand(game: Game, command: ShopCommand): boolean {
    const session = game.networkSession;
    if (session instanceof HostSession && this.networkPhase) {
      this.applyNetworkCommand(game, session, command);
      return true;
    }
    if (session instanceof GuestSession) {
      const ids: string[] = [];
      let value: number | boolean | undefined;
      if (command.type === 'buy') {
        ids.push(String(command.offerIndex));
        if (command.branchId) ids.push(command.branchId);
      } else if (command.type === 'sell' || command.type === 'branch') {
        ids.push(String(command.weaponSlot));
        if (command.type === 'branch') ids.push(command.branchId);
      } else if (command.type === 'evolve') {
        ids.push(command.evolutionId);
      } else if (command.type === 'ready') {
        value = command.ready;
      }
      this.sendGuestCommand(game, `shop-${command.type}`, ids, value);
      return true;
    }
    return false;
  }

  private parseGuestCommand(message: {
    phaseRevision: number;
    command: string;
    ids: string[];
    value?: number | boolean;
  }): ShopCommand | null {
    const base = { phaseRevision: message.phaseRevision, slot: 1 as const };
    if (message.command === 'shop-buy' && (message.ids.length === 1 || message.ids.length === 2)) {
      const offerIndex = Number(message.ids[0]);
      const branchId = message.ids[1];
      if (!Number.isInteger(offerIndex) || offerIndex < 0 || offerIndex > 3) return null;
      if (branchId !== undefined && !WEAPON_BRANCHES.some((branch) => branch.id === branchId)) return null;
      return {
        ...base,
        type: 'buy',
        offerIndex,
        branchId: branchId as WeaponBranchId | undefined,
      };
    }
    if (message.command === 'shop-reroll' && message.ids.length === 0) {
      return { ...base, type: 'reroll' };
    }
    if (message.command === 'shop-sell' && message.ids.length === 1) {
      const weaponSlot = Number(message.ids[0]);
      return Number.isInteger(weaponSlot) && weaponSlot >= 0 && weaponSlot < 6
        ? { ...base, type: 'sell', weaponSlot }
        : null;
    }
    if (message.command === 'shop-branch' && message.ids.length === 2) {
      const weaponSlot = Number(message.ids[0]);
      const branchId = message.ids[1];
      return Number.isInteger(weaponSlot)
        && weaponSlot >= 0
        && weaponSlot < 6
        && WEAPON_BRANCHES.some((branch) => branch.id === branchId)
        ? { ...base, type: 'branch', weaponSlot, branchId: branchId as WeaponBranchId }
        : null;
    }
    if (message.command === 'shop-evolve' && message.ids.length === 1) {
      return EVOLUTIONS.some((evolution) => evolution.result === message.ids[0])
        ? { ...base, type: 'evolve', evolutionId: message.ids[0] }
        : null;
    }
    if (message.command === 'shop-ready' && message.ids.length === 0 && typeof message.value === 'boolean') {
      return { ...base, type: 'ready', ready: message.value };
    }
    return null;
  }

  private syncGuestPhase(game: Game, session: GuestSession): void {
    const phase = session.phaseState;
    if (!phase) return;
    if (phase.phase === 'run' && phase.phaseRevision > this.networkPhaseRevision) {
      game.state.wave = phase.wave;
      runScene.enterWave(game);
      game.setScene(runScene, true);
      return;
    }
    if (phase.phase === 'progression' && phase.phaseRevision > this.networkPhaseRevision) {
      progressionScene.enterRemote(game, phase);
      game.setScene(progressionScene, true);
      return;
    }
    if (phase.phase !== 'shop' || phase.phaseRevision !== this.networkPhaseRevision) return;
    const shop = hydrateShop(phase.shops[game.localPlayerSlot]);
    if (!shop) return;
    this.shop = shop;
    this.discount = phase.discount;
    this.branchFocus = game.localPlayer.pendingWeaponBranches()[0] ?? null;
  }

  /** Top of the header block: centered between the awning and the action bar. */
  private top(h: number): number {
    const free = h - AWNING_H - ACTIONBAR_H - (HEADER_H + CARD_H);
    return Math.max(AWNING_H + 12, AWNING_H + free / 2);
  }

  private cardRect(w: number, h: number, i: number): [number, number, number, number] {
    const total = 4 * CARD_W + 3 * GAP;
    // shifted left to make room for the stats side panel
    const cx = (w - PANEL_W - 40) / 2;
    return [cx - total / 2 + i * (CARD_W + GAP), this.top(h) + HEADER_H, CARD_W, CARD_H];
  }

  private tryBuy(game: Game, offerIndex: number, branchId?: WeaponBranchId): void {
    // Resolve the offer at execution time, not at click time: on the guest,
    // syncGuestPhase rehydrates this.shop with fresh offer objects every tick,
    // so an offer captured during render is stale by the next frame.
    const offer = this.shop.offers[offerIndex];
    if (!offer) return;
    if (game.sessionRole !== 'solo') {
      // The host is authoritative; a local mutation here would be reverted by
      // the next build-state, so in co-op only ever submit the command.
      if (
        this.submitNetworkCommand(game, {
          type: 'buy',
          phaseRevision: this.networkPhase?.phaseRevision ?? this.networkPhaseRevision,
          slot: game.localPlayerSlot,
          offerIndex,
          branchId,
        })
      ) {
        playSfx('click');
      }
      return;
    }
    const p = game.localPlayer;
    const price = this.price(offer, p);
    if (offer.sold || p.materials < price) return;
    if (offer.kind === 'weapon') {
      if (!p.canUseWeapon(offer.weapon)) return;
      const target = mergeTarget(offer, p);
      if (target === 3 && !WEAPON_BRANCHES.some((branch) => branch.id === branchId)) return;
      if (target > 1) {
        // merge: raise the lowest-tier duplicate instead of taking a slot
        const owned = p.weapons.filter((w) => w.def.id === offer.weapon.id && w.tier < MAX_TIER);
        owned.sort((a, b) => a.tier - b.tier);
        const weapon = owned[0];
        if (!weapon || !p.upgradeWeapon(weapon)) return;
        if (target === 3 && !p.chooseWeaponBranch(weapon, branchId!)) {
          // Keep the transaction atomic if stale UI state somehow invalidated
          // the specialization between rendering and applying the purchase.
          weapon.tier = 2;
          weapon.branchPending = false;
          weapon.branchPendingOrder = 0;
          return;
        }
      } else {
        if (!p.canAddWeapon()) return;
        p.weapons.push(new WeaponInstance(offer.weapon, p.weapons.length));
        p.recomputeStats(); // set bonuses may have changed
      }
    } else {
      p.addItem(offer.item);
    }
    p.materials -= price;
    offer.sold = true;
    game.state.metrics.maxWeapons[p.slot] = Math.max(game.state.metrics.maxWeapons[p.slot], p.weapons.length);
    playSfx('buy');
  }

  private sellWeapon(game: Game, index: number): void {
    const p = game.localPlayer;
    const w = p.weapons[index];
    if (!w || p.weapons.length <= 1) return; // never sell the last weapon
    if (
      game.sessionRole !== 'solo'
      && this.submitNetworkCommand(game, {
        type: 'sell',
        phaseRevision: this.networkPhase?.phaseRevision ?? this.networkPhaseRevision,
        slot: game.localPlayerSlot,
        weaponSlot: w.slotIndex,
      })
    ) {
      playSfx('click');
      return;
    }
    p.weapons.splice(index, 1);
    p.weapons.forEach((wi, i) => (wi.slotIndex = i));
    p.recomputeStats(); // set bonuses may have changed
    p.materials += Math.max(1, Math.round(w.def.price * w.tier * 0.6));
    playSfx('buy');
  }

  private tryEvolve(game: Game, evo: EvolutionDef): void {
    if (
      game.sessionRole !== 'solo'
      && this.submitNetworkCommand(game, {
        type: 'evolve',
        phaseRevision: this.networkPhase?.phaseRevision ?? this.networkPhaseRevision,
        slot: game.localPlayerSlot,
        evolutionId: evo.result,
      })
    ) {
      playSfx('click');
      return;
    }
    const p = game.localPlayer;
    const weapon = p.weapons.find((w) => w.def.id === evo.base && (w.def.evolved || w.tier >= MAX_TIER));
    const itemIdx = p.items.findIndex((i) => i.id === evo.catalyst);
    if (!weapon || itemIdx < 0) return;
    weapon.def = weaponById(evo.result);
    weapon.tier = 1; // evolved power is baked into the def
    weapon.hitCooldowns.clear();
    weapon.cooldownTimer = 0;
    p.items.splice(itemIdx, 1); // the catalyst is consumed
    p.recomputeStats();
    if (!game.state.metrics.evolvedWeapons.includes(weapon.def.id)) game.state.metrics.evolvedWeapons.push(weapon.def.id);
    playSfx('levelup');
  }

  private chooseBranch(game: Game, weapon: WeaponInstance, branchId: WeaponBranchId): void {
    if (
      game.sessionRole !== 'solo'
      && this.submitNetworkCommand(game, {
        type: 'branch',
        phaseRevision: this.networkPhase?.phaseRevision ?? this.networkPhaseRevision,
        slot: game.localPlayerSlot,
        weaponSlot: weapon.slotIndex,
        branchId,
      })
    ) {
      playSfx('click');
      return;
    }
    if (!game.localPlayer.chooseWeaponBranch(weapon, branchId)) return;
    this.branchFocus = game.localPlayer.pendingWeaponBranches()[0] ?? null;
    this.armedSell = null;
    playSfx('levelup');
  }

  /** Evolutions currently available to the player. */
  private availableEvolutions(game: Game): EvolutionDef[] {
    const p = game.localPlayer;
    return EVOLUTIONS.filter(
      (e) =>
        (!e.minWave || game.state.wave >= e.minWave) &&
        p.weapons.some((w) => w.def.id === e.base && (w.def.evolved || w.tier >= MAX_TIER)) &&
        p.items.some((i) => i.id === e.catalyst),
    );
  }

  private focusedPendingBranch(game: Game): WeaponInstance | null {
    const p = game.localPlayer;
    if (
      this.branchFocus &&
      p.weapons.includes(this.branchFocus) &&
      this.branchFocus.branchPending &&
      !this.branchFocus.branch
    ) {
      return this.branchFocus;
    }
    this.branchFocus = p.pendingWeaponBranches()[0] ?? null;
    return this.branchFocus;
  }

  private branchOption(
    ctx: CanvasRenderingContext2D,
    ui: UiInput,
    x: number,
    y: number,
    w: number,
    h: number,
    branch: WeaponBranchDef,
  ): boolean {
    const hover = inRect(ui, x, y, w, h);
    const accent = branch.id === 'force' ? '#ffd23e' : '#8be9fd';
    panel(ctx, x, y, w, h, {
      radius: 10,
      fill: hover ? ['#34344a', '#252538'] : ['#29293d', '#1f1f30'],
      border: hover ? accent : `${accent}66`,
      glow: hover ? `${accent}44` : undefined,
    });
    drawIcon(ctx, branch.icon, x + 24, y + h / 2, 24);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(tn('br', branch.id, branch.name), x + 45, y + 18, w - 55);
    ctx.fillStyle = accent;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(tn('brs', branch.id, branch.shortDesc), x + 45, y + 38, w - 55);
    if (!hover || !ui.clicked) return false;
    ui.clicked = false;
    playSfx('click');
    return true;
  }

  update(game: Game, dt: number): void {
    const session = game.networkSession;
    if (this.tutorialStep) {
      if (this.tutorialDismiss || consumeKeyPress('Enter')) {
        markTutorial(this.tutorialStep);
        this.tutorialStep = null;
        this.tutorialDismiss = false;
        playSfx('click');
      }
      return;
    }
    if (session?.status === 'connection-lost') {
      if (this.connectionExit) {
        this.connectionExit = false;
        claimDisconnectedRun(game);
        game.networkSession = null;
        game.sessionRole = 'solo';
        void session.close();
        game.setScene(menuScene, true);
      }
      return;
    }
    if (session instanceof HostSession && this.networkPhase) {
      for (const message of session.drainPhaseCommands()) {
        const command = this.parseGuestCommand(message);
        if (command) this.applyNetworkCommand(game, session, command);
        else this.publishNetworkShop(session);
        if (!this.networkPhase) return;
      }
    } else if (session instanceof GuestSession) {
      this.syncGuestPhase(game, session);
      if (game.scene !== this) return;
    }
    if (!this.focusedPendingBranch(game) && !this.pending) {
      for (let i = 0; i < this.shop.offers.length; i++) {
        if (!consumeKeyPress(`Digit${i + 1}`) && !consumeKeyPress(`Numpad${i + 1}`)) continue;
        const offer = this.shop.offers[i];
        if (offer.kind === 'weapon' && mergeTarget(offer, game.localPlayer) === 3) continue;
        this.pending = () => this.tryBuy(game, i);
      }
      if (consumeKeyPress('KeyR')) {
        this.pending = () => {
          if (
            game.sessionRole !== 'solo'
            && this.submitNetworkCommand(game, {
              type: 'reroll',
              phaseRevision: this.networkPhase?.phaseRevision ?? this.networkPhaseRevision,
              slot: game.localPlayerSlot,
            })
          ) {
            playSfx('click');
            return;
          }
          if (reroll(this.shop, game.state.wave, game.localPlayer)) playSfx('reroll');
        };
      }
    }
    if (this.armedSell) {
      this.armedSell.t -= dt;
      if (this.armedSell.t <= 0) this.armedSell = null;
    }
    if (this.pending) {
      const act = this.pending;
      this.pending = null;
      act();
    }
  }

  private statsPanelHeight(game: Game): number {
    const p = game.localPlayer;
    const itemRows = Math.max(1, Math.ceil(Math.min(24, p.items.length || 1) / 6));
    const sets = activeSetBonuses(p.weapons.map((wi) => wi.def.id));
    return 100 + 5 * 26 + 16 + 76 + (sets.length > 0 ? 24 + sets.length * 34 : 0) + 30 + itemRows * 41 + 16;
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    const branchChoiceSpace = game.localPlayer.pendingWeaponBranches().length > 0 ? 700 : 620;
    const minHeight = Math.max(branchChoiceSpace, AWNING_H + 8 + this.statsPanelHeight(game) + ACTIONBAR_H);
    responsiveScene(ctx, game.ui, game.viewport, 1190, minHeight, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
    if (game.networkSession?.status === 'connection-lost') {
      const w = game.width;
      const h = game.height;
      dimBackground(ctx, w, h);
      panel(ctx, w / 2 - 220, h / 2 - 100, 440, 200, { radius: 18, border: '#ff547066' });
      ctx.fillStyle = '#ff7080';
      ctx.font = displayFont(20);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tt('coop.connectionLost'), w / 2, h / 2 - 42);
      const recoveryReward = disconnectedRunReward(game);
      if (button(ctx, game.ui, w / 2 - 150, h / 2 + 20, 300, 50, recoveryReward > 0 ? tt('coop.claimLeave', recoveryReward) : tt('coop.leave'))) {
        this.connectionExit = true;
      }
    }
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const p = game.localPlayer;
    const t = performance.now() / 1000;
    const top = this.top(h);
    const ccx = (w - PANEL_W - 40) / 2; // content center x
    const rowLeft = ccx - (4 * CARD_W + 3 * GAP) / 2;
    const rowRight = ccx + (4 * CARD_W + 3 * GAP) / 2;
    sceneBackground(ctx, w, h, '#1a1a2a', '#0a0a10');
    ctx.textBaseline = 'middle';

    // drifting dust so the empty space feels alive
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

    // shelf silhouette fills the far-left space on wide screens
    if (rowLeft > 150) drawShelf(ctx, 26, top + 40, h - top - ACTIONBAR_H - 60);

    // striped market awning across the top
    drawAwning(ctx, w, t);

    // merchant on a counter, greeting bubble to the right
    const mx = rowLeft + 46;
    const my = top + 62;
    panel(ctx, mx - 44, my + 26, 88, 18, { radius: 6, fill: '#2a2036', border: '#ffffff22' });
    drawSprite(ctx, 'merchant', mx, my, 66, {
      squash: Math.sin(t * 2.4) * 0.03,
      frame: Math.floor(t / 0.9) % 3,
    });
    // speech bubble
    const greet = this.discount < 1 ? tt('shop.greetSale') : tt(`shop.greet${1 + (game.state.wave % 3)}`);
    ctx.font = '12px system-ui, sans-serif';
    const gw = ctx.measureText(greet).width + 22;
    const bx = mx + 52;
    const byy = my - 34;
    panel(ctx, bx, byy, gw, 30, { radius: 10, fill: '#ecebe2', border: '#00000000' });
    ctx.fillStyle = '#ecebe2';
    ctx.beginPath();
    ctx.moveTo(bx + 4, byy + 22);
    ctx.lineTo(bx - 8, byy + 34);
    ctx.lineTo(bx + 18, byy + 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#26262f';
    ctx.textAlign = 'left';
    ctx.fillText(greet, bx + 11, byy + 16);

    // header title block, pinned between merchant and wallet
    ctx.save();
    ctx.shadowColor = '#8be9fd44';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = displayFont(24);
    ctx.textAlign = 'center';
    ctx.fillText(this.discount < 1 ? tt('shop.trader') : tt('shop.title'), ccx, top + 34);
    ctx.restore();
    ctx.fillStyle = '#8a8aa6';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.discount < 1 ? tt('shop.traderPrep', Math.round((1 - this.discount) * 100), game.state.wave + 1) : tt('shop.prep', game.state.wave + 1), ccx, top + 66);

    // wallet chip aligned with the card row's right edge
    panel(ctx, rowRight - 132, top + 52, 132, 40, { radius: 20, glow: '#8be9fd33', border: '#8be9fd44' });
    drawIcon(ctx, 'i_gem', rowRight - 106, top + 72, 20);
    ctx.fillStyle = '#8be9fd';
    ctx.font = displayFont(15);
    ctx.textAlign = 'left';
    ctx.fillText(`${game.localPlayer.materials}`, rowRight - 90, top + 73);

    // offer cards
    const sinceEnter = (performance.now() - this.enterAt) / 1000;
    let hoveredWeapon: WeaponDef | null = null;
    for (let i = 0; i < this.shop.offers.length; i++) {
      const offer = this.shop.offers[i];
      const [x, y] = this.cardRect(w, h, i);
      const rarity = offer.kind === 'item' ? offer.item.rarity : 2;
      const rc = RARITY_COLORS[rarity - 1];
      const hover = !offer.sold && inRect(ui, x, y, CARD_W, CARD_H);
      if (hover && offer.kind === 'weapon') hoveredWeapon = offer.weapon;
      // sold-stamp pop timing
      if (offer.sold && !this.prevSold[i]) this.soldAt[i] = performance.now();
      this.prevSold[i] = offer.sold;
      // staggered entrance + hover lift (draw-only: hit rects never move)
      const ek = Math.min(1, Math.max(0, (sinceEnter - i * 0.07) / 0.22));
      if (ek <= 0) continue;
      ctx.save();
      ctx.globalAlpha = ek;
      ctx.translate(0, (1 - ek) * (1 - ek) * 20 + (hover ? -5 : 0));
      panel(ctx, x, y, CARD_W, CARD_H, {
        radius: 14,
        fill: offer.sold ? '#15151d' : hover ? ['#2a2a40', '#1c1c2c'] : ['#232336', '#191926'],
        border: offer.sold ? '#ffffff14' : hover ? rc : `${rc}88`,
        glow: hover ? `${rc}66` : offer.sold ? undefined : `${rc}22`,
      });
      panel(ctx, x + 9, y + 10, 26, 22, { radius: 7, fill: '#101018dd', border: '#8be9fd55' });
      ctx.fillStyle = '#8be9fd';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, x + 22, y + 21);
      if (!offer.sold) {
        ctx.save();
        roundRect(ctx, x, y, CARD_W, CARD_H, 14);
        ctx.clip();
        // rarity stripe + a soft wash fading down from the top
        ctx.fillStyle = rc;
        ctx.fillRect(x, y, CARD_W, 5);
        const wash = ctx.createLinearGradient(x, y, x, y + 64);
        wash.addColorStop(0, `${rc}20`);
        wash.addColorStop(1, `${rc}00`);
        ctx.fillStyle = wash;
        ctx.fillRect(x, y + 5, CARD_W, 60);
        ctx.restore();
      }

      ctx.globalAlpha = ek * (offer.sold ? 0.35 : 1);
      const iconKey = offer.kind === 'weapon' ? weaponIcon(offer.weapon.id) : offer.item.emoji;
      const name = offer.kind === 'weapon' ? tn('w', offer.weapon.id, offer.weapon.name) : tn('i', offer.item.id, offer.item.name);
      const cx = x + CARD_W / 2;
      // icon plate
      ctx.save();
      if (!offer.sold) {
        ctx.shadowColor = `${rc}55`;
        ctx.shadowBlur = 14;
      }
      roundRect(ctx, cx - 40, y + 16, 80, 80, 14);
      ctx.fillStyle = '#12121c';
      ctx.fill();
      ctx.restore();
      roundRect(ctx, cx - 40, y + 16, 80, 80, 14);
      ctx.strokeStyle = `${rc}44`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawIcon(ctx, iconKey, cx, y + 56, 48);
      // legendary sparkles around the icon plate
      if (rarity === 4 && !offer.sold) {
        ctx.fillStyle = '#ffe9a0';
        for (let sp = 0; sp < 3; sp++) {
          const a = Math.max(0, Math.sin(t * 2.6 + sp * 2.1 + i));
          ctx.globalAlpha = ek * a * 0.9;
          const sxp = cx + Math.cos(sp * 2.4 + i) * 52;
          const syp = y + 56 + Math.sin(sp * 3.1 + i) * 44;
          ctx.fillRect(sxp, syp, 2, 2);
          ctx.fillRect(sxp - 1, syp - 3, 1, 2);
        }
        ctx.globalAlpha = ek * (offer.sold ? 0.35 : 1);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, cx, y + 118, CARD_W - 24);
      // type/rarity tag + divider
      if (offer.kind === 'weapon') {
        const cls = CLASS_DEFS[WEAPON_CLASS[offer.weapon.id]];
        ctx.fillStyle = cls?.color ?? '#8be9fd';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(cls ? `${tt('shop.weaponTag')} · ${tn('s', cls.id, cls.name).toUpperCase()}` : tt('shop.weaponTag'), cx, y + 142);
      } else {
        ctx.fillStyle = rc;
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(rarityName(rarity).toUpperCase(), cx, y + 142);
      }
      ctx.strokeStyle = '#ffffff12';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 26, y + 156);
      ctx.lineTo(x + CARD_W - 26, y + 156);
      ctx.stroke();

      ctx.font = '13px system-ui, sans-serif';
      const target = offer.kind === 'weapon' ? mergeTarget(offer, p) : 0;
      if (offer.kind === 'weapon') {
        ctx.fillStyle = '#ccccdd';
        const d = offer.weapon;
        const desc = d.behavior === 'orbit'
          ? tt('shop.dmgTick', d.damage)
          : d.behavior === 'zone' && d.zone
            ? tt('shop.dmgTick', Math.round(d.damage * d.zone.tickDamageScale))
            : d.behavior === 'summon' && d.summon
              ? tt('shop.dmgCd', d.damage, d.summon.hitCooldown)
              : tt('shop.dmgCd', d.damage, d.cooldown);
        ctx.fillText(desc, cx, y + 176);
        if (target === 3) {
          ctx.fillStyle = '#b18cff';
          ctx.font = 'bold 9px system-ui, sans-serif';
          ctx.fillText(tt('shop.chooseModule'), cx, y + 194);
          WEAPON_BRANCHES.forEach((branch, branchIndex) => {
            const branchX = x + 55 + branchIndex * 95;
            const gain = branch.id === 'force' ? tt('shop.damageShort') : tt('shop.speedShort');
            const cost = branch.id === 'force' ? tt('shop.speedShort') : tt('shop.damageShort');
            ctx.fillStyle = branch.id === 'force' ? '#ffd23e' : '#8be9fd';
            ctx.font = 'bold 9px system-ui, sans-serif';
            ctx.fillText(`+18% ${gain}`, branchX, y + 208);
            ctx.fillStyle = '#e08a8a';
            ctx.font = '9px system-ui, sans-serif';
            ctx.fillText(`−15% ${cost}`, branchX, y + 220);
          });
        } else if (target <= 1 && !p.canAddWeapon()) {
          ctx.fillStyle = '#ff8888';
          ctx.fillText(tt('shop.slotsFull'), cx, y + 196);
        }
      } else {
        Object.entries(offer.item.modifiers).forEach(([k, v], li) => {
          const val = v as number;
          ctx.fillStyle = val > 0 ? '#9fdca0' : '#e08a8a';
          ctx.fillText(`${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, val)}`, cx, y + 176 + li * 17);
        });
      }
      // merge ribbon across the top-right corner
      if (target > 1 && !offer.sold) {
        ctx.save();
        roundRect(ctx, x, y, CARD_W, CARD_H, 14);
        ctx.clip();
        ctx.translate(x + CARD_W - 30, y + 30);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = TIER_COLORS[target - 1];
        ctx.fillRect(-52, -10, 104, 20);
        ctx.fillStyle = '#16161e';
        ctx.font = displayFont(10);
        ctx.textAlign = 'center';
        ctx.fillText(TIER_NAMES[target - 1], 0, 1);
        ctx.restore();
        ctx.textAlign = 'center';
      }
      ctx.globalAlpha = ek;

      const price = this.price(offer, p);
      const affordable = !offer.sold && p.materials >= price && (offer.kind !== 'weapon' || target > 1 || p.canAddWeapon());
      if (offer.sold) {
        // rotated SOLD stamp, popping in on purchase
        const age = (performance.now() - this.soldAt[i]) / 1000;
        const pop = 1 + 0.6 * Math.max(0, 1 - age / 0.25);
        ctx.save();
        ctx.translate(cx, y + 56);
        ctx.rotate(-0.21);
        ctx.scale(pop, pop);
        ctx.globalAlpha = ek * 0.92;
        ctx.strokeStyle = '#e64553';
        ctx.lineWidth = 3;
        roundRect(ctx, -58, -19, 116, 38, 6);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        roundRect(ctx, -53, -14, 106, 28, 4);
        ctx.stroke();
        ctx.fillStyle = '#e64553';
        ctx.font = displayFont(13);
        ctx.textAlign = 'center';
        ctx.fillText(tt('shop.sold'), 0, 1);
        ctx.restore();
      } else if (offer.kind === 'weapon' && target === 3) {
        const branchButtonW = 84;
        WEAPON_BRANCHES.forEach((branch, branchIndex) => {
          const bx = x + 14 + branchIndex * 93;
          if (
            button(ctx, ui, bx, y + CARD_H - 58, branchButtonW, 46, `${price}`, {
              enabled: affordable,
              icon: branch.icon,
              fontSize: 13,
              labelColor: affordable ? (branch.id === 'force' ? '#ffd23e' : '#8be9fd') : '#e05a5a',
            })
          ) {
            this.pending = () => this.tryBuy(game, i, branch.id);
          }
        });
      } else if (
        button(ctx, ui, x + 18, y + CARD_H - 50, CARD_W - 36, 38, `${price}`, {
          enabled: affordable,
          icon: 'i_gem',
          labelColor: affordable ? '#ffd23e' : '#e05a5a',
        })
      ) {
        this.pending = () => this.tryBuy(game, i);
      }
      ctx.restore();
    }

    // A specialization obtained outside this shop remains optional: it can be
    // chosen here or safely left pending for a later visit.
    const pendingBranch = this.focusedPendingBranch(game);
    const evos = this.availableEvolutions(game);
    if (pendingBranch) {
      const bw = 760;
      const bh = 64;
      const bx = ccx - bw / 2;
      const bannerY = h - ACTIONBAR_H - 76;
      panel(ctx, bx, bannerY, bw, bh, {
        radius: 13,
        fill: ['#222238', '#171724'],
        border: '#b18cff88',
        glow: '#b18cff33',
      });
      drawIcon(ctx, weaponIcon(pendingBranch.def.id), bx + 28, bannerY + bh / 2, 30);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#b18cff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(tt('shop.specialization'), bx + 52, bannerY + 20, 184);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(tn('w', pendingBranch.def.id, pendingBranch.def.name), bx + 52, bannerY + 43, 184);
      WEAPON_BRANCHES.forEach((branch, branchIndex) => {
        if (this.branchOption(ctx, ui, bx + 250 + branchIndex * 255, bannerY + 6, 245, 52, branch)) {
          const weapon = pendingBranch;
          this.pending = () => this.chooseBranch(game, weapon, branch.id);
        }
      });
    } else if (evos.length > 0) {
      const evo = evos[0];
      const base = weaponById(evo.base);
      const cat = p.items.find((i) => i.id === evo.catalyst)!;
      const result = weaponById(evo.result);
      const bw = 640;
      if (
        button(ctx, ui, ccx - bw / 2, h - ACTIONBAR_H - 62, bw, 48, tt('shop.evo', base.evolved ? tn('w', base.id, base.name) : tn('w', base.id, base.name) + ' IV', tn('i', cat.id, cat.name), tn('w', result.id, result.name)), {
          primary: true,
          fontSize: 14,
          icon: weaponIcon(evo.result),
        })
      ) {
        this.pending = () => this.tryEvolve(game, evo);
      }
    }

    // ── bottom action bar, pinned to the screen edge ──
    const barG = ctx.createLinearGradient(0, h - ACTIONBAR_H, 0, h);
    barG.addColorStop(0, '#16161ee8');
    barG.addColorStop(1, '#0d0d12f2');
    ctx.fillStyle = barG;
    ctx.fillRect(0, h - ACTIONBAR_H, w, ACTIONBAR_H);
    ctx.fillStyle = '#ffffff14';
    ctx.fillRect(0, h - ACTIONBAR_H, w, 1);

    // next-wave preview chip
    this.drawNextWaveChip(game, ctx, 20, h - ACTIONBAR_H + 12, t);

    const by = h - 72;
    const btnLeft = Math.max(ccx - 220, 20 + 240 + 24); // clear of the next-wave chip
    if (
      button(ctx, ui, btnLeft, by, 200, 56, tt('shop.reroll', this.shop.rerollCost), {
        enabled: game.localPlayer.materials >= this.shop.rerollCost,
        icon: 'i_gem',
      })
    ) {
      this.pending = () => {
        if (
          game.sessionRole !== 'solo'
          && this.submitNetworkCommand(game, {
            type: 'reroll',
            phaseRevision: this.networkPhase?.phaseRevision ?? this.networkPhaseRevision,
            slot: game.localPlayerSlot,
          })
        ) {
          playSfx('click');
          return;
        }
        if (reroll(this.shop, game.state.wave, game.localPlayer)) playSfx('reroll');
      };
    }
    // pulsing golden halo behind FIGHT
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3);
    ctx.shadowColor = '#ffd23e';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 2;
    roundRect(ctx, btnLeft + 217, by - 3, 266, 62, 12);
    ctx.stroke();
    ctx.restore();
    const guestPhase = game.networkSession instanceof GuestSession
      && game.networkSession.phaseState?.phase === 'shop'
      ? game.networkSession.phaseState
      : null;
    const ready = this.networkPhase?.ready ?? guestPhase?.ready ?? [false, false];
    const localReady = ready[game.localPlayerSlot];
    const networkShop = game.sessionRole !== 'solo';
    const actionLabel = networkShop
      ? localReady ? tt('coop.notReadyNextWave') : tt('coop.readyNextWave')
      : tt('shop.fight');
    if (button(ctx, ui, btnLeft + 220, by, 260, 56, actionLabel, { primary: true, fontSize: networkShop ? 12 : 18 })) {
      this.pending = () => {
        if (networkShop) {
          this.submitNetworkCommand(game, {
            type: 'ready',
            phaseRevision: this.networkPhase?.phaseRevision ?? this.networkPhaseRevision,
            slot: game.localPlayerSlot,
            ready: !localReady,
          });
          playSfx('click');
        } else {
          continueToNextWave(game);
        }
      };
    }
    if (networkShop) {
      ctx.fillStyle = ready[game.localPlayerSlot === 0 ? 1 : 0] ? '#8dff9a' : '#8a8aa6';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        ready[game.localPlayerSlot === 0 ? 1 : 0] ? tt('coop.ready') : tt('coop.waitDecision'),
        btnLeft + 350,
        by - 10,
        260,
      );
    }

    this.renderStatsPanel(game, ctx, w - PANEL_W - 20, h, ui);

    // weapon tooltip on hover (drawn last, follows the cursor)
    if (hoveredWeapon) this.renderWeaponTooltip(game, ctx, hoveredWeapon, w, h, ui);

    if (this.tutorialStep) {
      const step = TUTORIAL_STEPS[this.tutorialStep];
      dimBackground(ctx, w, h);
      const pw = 540;
      const ph = 250;
      const x = w / 2 - pw / 2;
      const y = h / 2 - ph / 2;
      panel(ctx, x, y, pw, ph, { radius: 18, border: '#ffd23e66', glow: '#ffd23e33' });
      drawIcon(ctx, step.icon, w / 2, y + 48, 42);
      ctx.fillStyle = '#ffffff';
      ctx.font = displayFont(18);
      ctx.textAlign = 'center';
      ctx.fillText(tt(step.titleKey), w / 2, y + 88, pw - 40);
      ctx.fillStyle = '#c8c8dc';
      ctx.font = '14px system-ui, sans-serif';
      drawWrappedCentered(ctx, tt(step.bodyKey), w / 2, y + 122, pw - 46, 20, 3);
      if (button(ctx, ui, w / 2 - 130, y + 178, 260, 48, tt('tutorial.continue'), { primary: true })) {
        this.tutorialDismiss = true;
      }
    }
  }

  /** Preview of the coming wave: theme-colored chip with mini enemy sprites or the boss. */
  private drawNextWaveChip(game: Game, ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const nextWave = game.state.wave + 1;
    const def = getWaveDef(nextWave);
    const theme = themeForWave(nextWave, game.state.routeIds);
    const routePending = routesAfterWave(game.state.wave).length > 0;
    const cw = 240;
    const ch = 64;
    const bossPulse = def.boss ? 0.5 + 0.5 * Math.sin(t * 4) : 0;
    panel(ctx, x, y, cw, ch, {
      radius: 12,
      fill: routePending ? ['#20243a', '#141522'] : [theme.floorInner, theme.floorOuter],
      border: routePending ? '#8be9fdaa' : def.boss ? `rgba(230,69,83,${(0.4 + bossPulse * 0.6).toFixed(2)})` : `${theme.borderColor}aa`,
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = displayFont(11);
    ctx.fillText(tt('shop.nextWave', nextWave), x + 14, y + 20);
    ctx.fillStyle = '#c8c8dc';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(routePending ? tt('shop.routePending') : tn('t', theme.name, theme.name), x + 14, y + 44, cw - 62);
    if (routePending) {
      drawIcon(ctx, 'i_speed', x + cw - 32, y + ch / 2, 30);
      return;
    }
    if (def.boss) {
      drawSprite(ctx, def.boss, x + cw - 34, y + ch / 2 + 4, 36, { squash: Math.sin(t * 3) * 0.04 });
      ctx.fillStyle = '#ff5470';
      ctx.font = displayFont(9);
      ctx.textAlign = 'right';
      ctx.fillText(tt('shop.bossWave'), x + cw - 60, y + ch / 2 + 1);
      ctx.textAlign = 'left';
    } else {
      const top3 = [...def.table].sort((a, b) => b.weight - a.weight).slice(0, 3);
      top3.forEach((entry, i) => {
        const bob = Math.sin(t * 3 + i * 1.4) * 2;
        drawSprite(ctx, entry.defId, x + cw - 26 - i * 30, y + ch / 2 + bob, 24, { flip: true });
      });
    }
  }

  private renderWeaponTooltip(game: Game, ctx: CanvasRenderingContext2D, d: WeaponDef, w: number, h: number, ui: UiInput): void {
    const p = game.localPlayer;
    const dmgMult = 1 + p.stats.damagePct / 100;
    const aspd = 1 + p.stats.attackSpeedPct / 100;
    const dmg = Math.round(d.damage * dmgMult);

    const lines: [string, string][] = [];
    if (d.behavior === 'projectile' && d.projectile) {
      const cd = d.cooldown / aspd;
      const dps = (dmg * d.projectile.count) / cd;
      lines.push([tt('tt.dmg'), `${dmg}${d.projectile.count > 1 ? ` ×${d.projectile.count}` : ''}`]);
      lines.push([tt('tt.cd'), `${cd.toFixed(2)}s`]);
      lines.push([tt('tt.dps'), `≈${Math.round(dps)}`]);
      lines.push([tt('tt.range'), `${d.range}`]);
      lines.push([tt('tt.pierce'), d.projectile.pierce >= 99 ? tt('tt.through') : `${d.projectile.pierce}`]);
      if (d.projectile.spreadRad > 0.05) lines.push([tt('tt.spread'), `±${Math.round((d.projectile.spreadRad * 180) / Math.PI)}°`]);
      if (d.projectile.homingTurn) lines.push([tt('tt.homing'), tt('tt.yes')]);
      if (d.projectile.explosion) {
        lines.push([tt('tt.explosion'), `${d.projectile.explosion.radius}`]);
        if (d.projectile.explosion.clusterCount) lines.push([tt('tt.clusters'), `${d.projectile.explosion.clusterCount}`]);
      }
      if (d.projectile.ricochet) lines.push([tt('tt.bounces'), `${d.projectile.ricochet.bounces}`]);
      if (d.projectile.boomerang) lines.push([tt('tt.return'), `${d.projectile.boomerang.outboundRange}`]);
      if (d.projectile.status?.burnDps) lines.push([tt('tt.burn'), `${d.projectile.status.burnDps}/s · ${d.projectile.status.burnDuration}s`]);
    } else if (d.behavior === 'melee' && d.melee) {
      const cd = d.cooldown / aspd;
      const strikes = d.melee.strikes ?? 1;
      lines.push([tt('tt.swing'), `${dmg}`]);
      lines.push([tt('tt.cd'), `${cd.toFixed(2)}s`]);
      lines.push([tt('tt.dps'), `≈${Math.round((dmg * strikes) / cd)}`]);
      lines.push([tt('tt.arc'), `${Math.round((d.melee.arcRad * 180) / Math.PI)}°`]);
      lines.push([tt('tt.range'), `${d.range}`]);
      lines.push([tt('tt.kb'), d.melee.knockback >= 400 ? tt('tt.kbStrong') : tt('tt.kbMed')]);
      if (strikes > 1) lines.push([tt('tt.strikes'), `${strikes}`]);
      if (d.melee.shape === 'thrust') lines.push([tt('tt.width'), `${d.melee.width}`]);
      if (d.melee.shockwave) lines.push([tt('tt.shockwave'), `${d.melee.shockwave.maxRadius}`]);
    } else if (d.behavior === 'orbit' && d.orbit) {
      lines.push([tt('tt.touchDmg'), `${dmg}`]);
      lines.push([tt('tt.hitCd'), `${d.orbit.hitCooldown}s`]);
      lines.push([tt('tt.orbs'), tt('tt.orbsMore', d.orbit.orbCount)]);
      lines.push([tt('tt.orbitR'), `${d.orbit.radius}`]);
    } else if (d.behavior === 'chain' && d.chain) {
      const cd = d.cooldown / aspd;
      lines.push([tt('tt.dmg'), `${dmg}`]);
      lines.push([tt('tt.cd'), `${cd.toFixed(2)}s`]);
      lines.push([tt('tt.dps'), `≈${Math.round(dmg / cd)}`]);
      lines.push([tt('tt.range'), `${d.range}`]);
      lines.push([tt('tt.targets'), d.evolved ? `${d.chain.targets}` : tt('tt.chainTargetsMore', d.chain.targets)]);
      lines.push([tt('tt.jumpRange'), `${d.chain.jumpRange}`]);
      lines.push([tt('tt.falloff'), tt('tt.perJump', Math.round((1 - d.chain.falloff) * 100))]);
    } else if (d.behavior === 'pulse' && d.pulse) {
      const cd = d.cooldown / aspd;
      lines.push([tt('tt.dmg'), `${dmg}`]);
      lines.push([tt('tt.cd'), `${cd.toFixed(2)}s`]);
      lines.push([tt('tt.dps'), `≈${Math.round(dmg / cd)}`]);
      lines.push([tt('tt.radius'), `${d.pulse.radius}`]);
      if (d.pulse.status?.freezeDuration) lines.push([tt('tt.freeze'), `${d.pulse.status.freezeDuration}s`]);
      else if (d.pulse.status?.slowPct) lines.push([tt('tt.slow'), `${d.pulse.status.slowPct}% · ${d.pulse.status.slowDuration}s`]);
    } else if (d.behavior === 'zone' && d.zone) {
      const cd = d.cooldown / aspd;
      const count = d.zone.count ?? 1;
      const ticks = Math.ceil(d.zone.duration / d.zone.tickRate);
      const tickDamage = Math.round(dmg * d.zone.tickDamageScale);
      const impactDamage = Math.round(dmg * d.zone.impactDamageScale);
      if (impactDamage > 0) lines.push([tt('tt.impact'), `${impactDamage}${count > 1 ? ` ×${count}` : ''}`]);
      lines.push([tt('tt.tickDmg'), `${tickDamage} ×${ticks}${count > 1 ? ` ×${count}` : ''}`]);
      lines.push([tt('tt.cd'), `${cd.toFixed(2)}s`]);
      lines.push([tt('tt.dps'), `≈${Math.round(((impactDamage + tickDamage * ticks) * count) / cd)}`]);
      lines.push([tt('tt.radius'), `${d.zone.radius}`]);
      lines.push([tt('tt.duration'), `${d.zone.duration}s`]);
      if (d.zone.pull) lines.push([tt('tt.pull'), `${d.zone.pull}`]);
    } else if (d.behavior === 'summon' && d.summon) {
      lines.push([tt('tt.touchDmg'), `${dmg}`]);
      lines.push([tt('tt.summons'), `${d.summon.count}`]);
      lines.push([tt('tt.hitCd'), `${(d.summon.hitCooldown / aspd).toFixed(2)}s`]);
      lines.push([tt('tt.dps'), `≈${Math.round((dmg * d.summon.count * aspd) / d.summon.hitCooldown)}`]);
      lines.push([tt('tt.range'), `${d.summon.leashRange}`]);
    }
    const cls = CLASS_DEFS[WEAPON_CLASS[d.id]];
    if (cls) lines.push([tt('tt.class'), tn('s', cls.id, cls.name)]);
    lines.push([tt('tt.tiers'), tt('tt.tiersHint')]);

    const tw = 280;
    const th = 44 + lines.length * 20;
    let tx = ui.mx + 18;
    let ty = ui.my + 14;
    if (tx + tw > w - 8) tx = ui.mx - tw - 18;
    if (ty + th > h - 8) ty = h - th - 8;

    panel(ctx, tx, ty, tw, th, { radius: 12, fill: '#14141ef2', border: '#8be9fd66', glow: '#00000088' });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8be9fd';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(tn('w', d.id, d.name), tx + 14, ty + 20);
    ctx.font = '13px system-ui, sans-serif';
    lines.forEach(([k, v], i) => {
      const y = ty + 44 + i * 20;
      ctx.fillStyle = '#9a9ab4';
      ctx.fillText(k, tx + 14, y);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(v, tx + tw - 14, y);
      ctx.textAlign = 'left';
    });
  }

  private renderStatsPanel(game: Game, ctx: CanvasRenderingContext2D, x: number, h: number, ui: UiInput): void {
    const p = game.localPlayer;
    const pw = PANEL_W;
    const sets = activeSetBonuses(p.weapons.map((wi) => wi.def.id));
    const ph = this.statsPanelHeight(game);
    const availTop = AWNING_H + 8;
    const availH = h - ACTIONBAR_H - availTop;
    const y = Math.max(availTop, availTop + (availH - ph) / 2);
    panel(ctx, x, y, pw, ph, { radius: 16, glow: '#00000066' });

    const divider = (dy: number): void => {
      ctx.strokeStyle = '#ffffff14';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 16, dy);
      ctx.lineTo(x + pw - 16, dy);
      ctx.stroke();
    };

    // header: portrait plate + name
    panel(ctx, x + 16, y + 14, 52, 52, { radius: 10, fill: '#12121c', border: '#ffffff22' });
    drawSprite(ctx, p.character.sprite, x + 42, y + 40, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tn('c', p.character.id, p.character.name), x + 80, y + 30);
    ctx.fillStyle = '#9a9ab4';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(tt('shop.level', game.state.squad.level), x + 80, y + 52);
    divider(y + 78);

    // stats: 2-column grid with accent-colored values
    const stats = p.stats;
    const cells: [string, string, string][] = [
      ['❤️', `${stats.maxHp}`, '#ff9a9a'],
      ['💚', `${Number(stats.hpRegen.toFixed(1))}/5s`, '#8dff9a'],
      ['⚔️', `+${Math.round(stats.damagePct)}%`, '#ffd23e'],
      ['⚡', `+${Math.round(stats.attackSpeedPct)}%`, '#ffd23e'],
      ['💨', `${Math.round(stats.moveSpeed)}`, '#c8c8dc'],
      ['🛡️', `${stats.armor}`, '#c2ccdc'],
      ['🎯', `${Math.round(stats.critChance * 100)}%`, '#8be9fd'],
      ['🧲', `${Math.round(stats.pickupRange)}`, '#c8c8dc'],
      ['🍀', `${stats.luck}`, '#9fdca0'],
    ];
    const labels = [
      STAT_LABELS.maxHp, STAT_LABELS.hpRegen, STAT_LABELS.damagePct, STAT_LABELS.attackSpeedPct,
      STAT_LABELS.moveSpeed, STAT_LABELS.armor, STAT_LABELS.critChance, STAT_LABELS.pickupRange, STAT_LABELS.luck,
    ];
    let ry = y + 96;
    for (let i = 0; i < cells.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = x + 18 + col * 124;
      const cy = ry + row * 26;
      drawIcon(ctx, cells[i][0], cx + 8, cy, 14);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#8a8aa6';
      const label = labels[i].replace(' %', '');
      ctx.fillText(label, cx + 20, cy - 5, 96);
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = cells[i][2];
      ctx.fillText(cells[i][1], cx + 20, cy + 8);
    }
    ry += 5 * 26 + 4;
    divider(ry - 2);
    ry += 14;

    // weapons (double-click to sell), 38px slots
    ctx.fillStyle = '#8be9fd';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(tt('shop.weapons', p.weapons.length), x + 18, ry);
    const pendingSpecializations = p.pendingWeaponBranches().length;
    ctx.fillStyle = pendingSpecializations > 0 ? '#b18cff' : this.armedSell ? '#e64553' : '#667';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(
      pendingSpecializations > 0 ? tt('shop.branchHint') : this.armedSell ? tt('shop.sellArm') : tt('shop.sellHint'),
      x + 116,
      ry,
    );
    ry += 14;
    for (let i = 0; i < 6; i++) {
      const sx = x + 18 + i * 41;
      const wi = p.weapons[i];
      const hover = !!wi && (wi.branchPending || p.weapons.length > 1) && inRect(ui, sx, ry, 38, 38);
      const armed = this.armedSell?.index === i;
      const branchFocused = !!wi?.branchPending && wi === this.branchFocus;
      panel(ctx, sx, ry, 38, 38, {
        radius: 9,
        fill: armed ? '#2a1418' : branchFocused ? '#21182e' : '#12121c',
        border: armed ? '#e64553' : wi?.branchPending ? '#b18cff88' : hover ? '#e6455388' : undefined,
        glow: armed ? '#e6455366' : branchFocused ? '#b18cff55' : undefined,
      });
      if (wi) {
        drawIcon(ctx, weaponIcon(wi.def.id), sx + 19, ry + 19, 24);
        if (wi.branch || wi.branchPending) {
          ctx.fillStyle = wi.branch === 'force' ? '#ffd23e' : wi.branch === 'tempo' ? '#8be9fd' : '#b18cff';
          ctx.beginPath();
          ctx.arc(sx + 6, ry + 6, wi.branchPending ? 5 : 4, 0, Math.PI * 2);
          ctx.fill();
          if (wi.branchPending) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 8px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('!', sx + 6, ry + 6.5);
            ctx.textAlign = 'left';
          }
        }
        if (wi.tier > 1 || wi.def.evolved) {
          ctx.fillStyle = wi.def.evolved ? '#ffd23e' : TIER_COLORS[wi.tier - 1];
          roundRect(ctx, sx + 22, ry + 24, 15, 13, 3);
          ctx.fill();
          ctx.fillStyle = '#16161e';
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(wi.def.evolved ? '★' : TIER_NAMES[wi.tier - 1], sx + 29, ry + 31);
          ctx.textAlign = 'left';
        }
        if (hover && ui.clicked) {
          ui.clicked = false;
          if (wi.branchPending) {
            this.branchFocus = wi;
            this.armedSell = null;
            playSfx('click');
          } else if (armed) {
            const idx = i;
            this.armedSell = null;
            this.pending = () => this.sellWeapon(game, idx);
          } else {
            this.armedSell = { index: i, t: 2 };
            playSfx('click');
          }
        }
      }
    }
    ry += 54;

    // active weapon sets
    if (sets.length > 0) {
      divider(ry - 6);
      ry += 8;
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(tt('shop.sets'), x + 18, ry);
      ry += 18;
      for (const st of sets) {
        drawIcon(ctx, st.cls.icon, x + 28, ry + 6, 16);
        ctx.fillStyle = st.cls.color;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillText(`${tn('s', st.cls.id, st.cls.name)} ×${st.count}`, x + 44, ry);
        ctx.fillStyle = '#9fdca0';
        ctx.font = '11px system-ui, sans-serif';
        const mods = Object.entries(st.mod)
          .map(([k, v]) => `${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, v as number)}`)
          .join(', ');
        ctx.fillText(mods, x + 44, ry + 14);
        ry += 34;
      }
      ry -= 2;
    }

    // items
    divider(ry - 6);
    ry += 8;
    ctx.fillStyle = '#b18cff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(tt('shop.items', p.items.length), x + 18, ry);
    ry += 14;
    p.items.slice(0, 24).forEach((item, i) => {
      const sx = x + 18 + (i % 6) * 41;
      const syy = ry + Math.floor(i / 6) * 41;
      panel(ctx, sx, syy, 38, 38, { radius: 9, fill: '#12121c' });
      drawIcon(ctx, item.emoji, sx + 19, syy + 19, 22);
    });
  }
}

/** Striped market awning with a scalloped bottom edge. */
function drawAwning(ctx: CanvasRenderingContext2D, w: number, _t: number): void {
  for (let x = 0, i = 0; x < w; x += 56, i++) {
    ctx.fillStyle = i % 2 === 0 ? '#5a2a34' : '#2c2c3e';
    ctx.fillRect(x, 0, 56, AWNING_H - 14);
    ctx.beginPath();
    ctx.arc(x + 28, AWNING_H - 14, 28, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = '#00000066';
  ctx.fillRect(0, AWNING_H - 14, w, 2);
}

/** Faint shelf silhouette that fills empty far-left space on wide screens. */
function drawShelf(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  ctx.save();
  ctx.globalAlpha = 0.14;
  const shelves = Math.max(2, Math.floor(h / 110));
  for (let i = 0; i < shelves; i++) {
    const sy = y + i * 110;
    ctx.fillStyle = '#3a3a4e';
    ctx.fillRect(x, sy + 58, 96, 8);
    // bottles / boxes on the shelf, deterministic per row
    for (let b = 0; b < 4; b++) {
      const bx = x + 8 + b * 22;
      const kind = (i * 7 + b * 3) % 3;
      ctx.fillStyle = kind === 0 ? '#6a4a7c' : kind === 1 ? '#4a6a5c' : '#7c5a3a';
      if (kind === 0) {
        ctx.fillRect(bx + 4, sy + 26, 10, 32);
        ctx.fillRect(bx + 7, sy + 18, 4, 8);
      } else if (kind === 1) {
        ctx.fillRect(bx, sy + 34, 18, 24);
      } else {
        ctx.beginPath();
        ctx.arc(bx + 9, sy + 46, 11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export const shopScene = new ShopScene();
