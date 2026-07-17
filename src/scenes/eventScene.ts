import type { Game, Scene } from '../game';
import { button, dimBackground, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon, weaponIcon } from '../render/icons';
import { rollChestLoot, type ShopOffer } from '../systems/shop';
import { ITEMS, type ItemDef } from '../data/items';
import { WEAPONS, MAX_TIER, TIER_NAMES } from '../data/weapons';
import { WeaponInstance } from '../entities/weapon';
import { STAT_LABELS, formatStatValue, type Stats } from '../entities/stats';
import { pick } from '../core/rng';
import { playSfx } from '../render/audio';
import { t as tt, tn } from '../core/i18n';
import { continueToNextWave, progressionScene } from './progressionScene';
import { GuestSession, HostSession } from '../multiplayer/session';
import type { EventPhase } from '../multiplayer/stateProtocol';
import type { PlayerSlot } from '../multiplayer/types';
import { runScene } from './run';
import { displayFont } from '../render/font';
import { menuScene } from './menu';

export type EventKind = 'chest' | 'altar';
interface PersonalEvent {
  kind: EventKind;
  loot: ShopOffer | null;
  altarItem: ItemDef | null;
}

/**
 * Between-waves random event: a free chest or a blood altar.
 * After the choice a single "В БОЙ" button moves on to the next wave.
 */
class EventScene implements Scene {
  private kind: EventKind = 'chest';
  private loot: ShopOffer | null = null;
  private altarItem: ItemDef | null = null;
  private resolved = false;
  private resultText = '';
  private action: 'take' | 'scrap' | 'sacrifice' | 'refuse' | 'go' | null = null;
  private networkRevision = 0;
  private networkEvents: [PersonalEvent | null, PersonalEvent | null] = [null, null];
  private networkSubmitted: [boolean, boolean] = [false, false];
  private guestSubmittedRevision = 0;
  private connectionExit = false;

  enter(game: Game, kind: EventKind): void {
    this.kind = kind;
    this.resolved = false;
    this.resultText = '';
    this.action = null;
    this.networkRevision = 0;
    this.networkEvents = [null, null];
    this.networkSubmitted = [false, false];
    this.guestSubmittedRevision = 0;
    if (kind === 'chest') {
      this.loot = rollChestLoot(game.state.wave, game.localPlayer);
    } else {
      const epics = ITEMS.filter((i) => i.rarity >= 3);
      this.altarItem = pick(epics);
    }
  }

  enterNetwork(game: Game, kinds?: [EventKind, EventKind]): void {
    const session = game.networkSession;
    if (!(session instanceof HostSession) || game.state.players.length !== 2) return;
    const selectedKinds = kinds ?? [
      Math.random() < 0.5 ? 'chest' : 'altar',
      Math.random() < 0.5 ? 'chest' : 'altar',
    ];
    this.networkEvents = selectedKinds.map((kind, slot) => this.rollPersonalEvent(
      game,
      slot as PlayerSlot,
      kind,
    )) as [PersonalEvent, PersonalEvent];
    this.networkSubmitted = [false, false];
    this.networkRevision = session.nextPhaseRevision();
    this.guestSubmittedRevision = 0;
    this.setPersonalEvent(this.networkEvents[0]!);
    this.publishNetworkPhase(session);
  }

  enterRemote(game: Game, phase: EventPhase): boolean {
    const event = this.parsePersonalEvent(game, game.localPlayerSlot, phase.eventIds[game.localPlayerSlot]);
    if (!event) return false;
    this.networkRevision = phase.phaseRevision;
    this.networkSubmitted = [...phase.submitted];
    this.networkEvents = [null, null];
    this.networkEvents[game.localPlayerSlot] = event;
    this.guestSubmittedRevision = 0;
    this.setPersonalEvent(event);
    if (phase.submitted[game.localPlayerSlot]) {
      this.resolved = true;
      this.resultText = tt('coop.waitDecision');
    }
    return true;
  }

  private rollPersonalEvent(game: Game, slot: PlayerSlot, kind: EventKind): PersonalEvent {
    const player = game.state.playerBySlot(slot)!;
    if (kind === 'chest') {
      return { kind, loot: rollChestLoot(game.state.wave, player), altarItem: null };
    }
    const epics = ITEMS.filter((item) => item.rarity >= 3);
    return { kind, loot: null, altarItem: pick(epics) };
  }

  private setPersonalEvent(event: PersonalEvent): void {
    this.kind = event.kind;
    this.loot = event.loot;
    this.altarItem = event.altarItem;
    this.resolved = false;
    this.resultText = '';
    this.action = null;
  }

  private personalEventId(event: PersonalEvent): string {
    if (event.kind === 'altar') return `altar:item:${event.altarItem!.id}`;
    return event.loot!.kind === 'weapon'
      ? `chest:weapon:${event.loot!.weapon.id}`
      : `chest:item:${event.loot!.item.id}`;
  }

  private parsePersonalEvent(game: Game, slot: PlayerSlot, id: string): PersonalEvent | null {
    const [kind, rewardKind, definitionId, extra] = id.split(':');
    if (extra !== undefined || (kind !== 'chest' && kind !== 'altar')) return null;
    if (kind === 'altar') {
      const altarItem = rewardKind === 'item'
        ? ITEMS.find((item) => item.id === definitionId && item.rarity >= 3) ?? null
        : null;
      return altarItem ? { kind, loot: null, altarItem } : null;
    }
    if (rewardKind === 'weapon') {
      const weapon = WEAPONS.find((entry) => entry.id === definitionId);
      return weapon
        ? { kind, loot: { kind: 'weapon', weapon, price: weapon.price, sold: false }, altarItem: null }
        : null;
    }
    const item = rewardKind === 'item' ? ITEMS.find((entry) => entry.id === definitionId) : null;
    return item
      ? { kind, loot: { kind: 'item', item, price: item.basePrice, sold: false }, altarItem: null }
      : null;
  }

  private publishNetworkPhase(session: HostSession): void {
    if (!this.networkEvents[0] || !this.networkEvents[1]) return;
    session.publishPhase({
      version: 1,
      phase: 'event',
      phaseRevision: this.networkRevision,
      eventIds: [
        this.personalEventId(this.networkEvents[0]),
        this.personalEventId(this.networkEvents[1]),
      ],
      submitted: [...this.networkSubmitted],
    });
  }

  private resolvePersonalEvent(
    game: Game,
    slot: PlayerSlot,
    event: PersonalEvent,
    action: 'take' | 'scrap' | 'sacrifice' | 'refuse',
  ): string | null {
    const player = game.state.playerBySlot(slot);
    if (!player) return null;
    if (event.kind === 'chest' && event.loot) {
      const reward = event.loot;
      if (action === 'scrap') {
        const value = Math.max(1, Math.round(
          (reward.kind === 'weapon' ? reward.weapon.price : reward.item.basePrice) * 0.8,
        ));
        game.state.squad.materials += value;
        return tt('ev.resScrap', value);
      }
      if (action !== 'take') return null;
      if (reward.kind === 'weapon') {
        if (!player.canUseWeapon(reward.weapon)) {
          const value = Math.max(1, Math.round(reward.weapon.price * 0.8));
          game.state.squad.materials += value;
          return tt('ev.resScrap', value);
        }
        const owned = player.weapons
          .filter((weapon) => weapon.def.id === reward.weapon.id && weapon.tier < MAX_TIER)
          .sort((left, right) => left.tier - right.tier);
        if (owned[0]) {
          player.upgradeWeapon(owned[0]);
          player.recomputeStats();
          return tt('ev.resUpgraded', tn('w', reward.weapon.id, reward.weapon.name), TIER_NAMES[owned[0].tier - 1]);
        }
        if (!player.canAddWeapon()) return null;
        player.weapons.push(new WeaponInstance(reward.weapon, player.weapons.length));
        player.recomputeStats();
        return tt('ev.resAdded', tn('w', reward.weapon.id, reward.weapon.name));
      }
      player.addItem(reward.item);
      return tt('ev.resItem', tn('i', reward.item.id, reward.item.name));
    }
    if (event.kind === 'altar' && event.altarItem) {
      if (action === 'refuse') return tt('ev.resRefuse');
      if (action !== 'sacrifice') return null;
      const cost = Math.max(5, Math.round(player.stats.maxHp * 0.25));
      player.addUpgrade({ maxHp: -cost });
      player.hp = Math.min(player.hp, player.stats.maxHp);
      player.addItem(event.altarItem);
      return tt('ev.resSacrifice', cost, tn('i', event.altarItem.id, event.altarItem.name));
    }
    return null;
  }

  private submitNetworkEvent(
    game: Game,
    session: HostSession,
    slot: PlayerSlot,
    action: 'take' | 'scrap' | 'sacrifice' | 'refuse',
    revision: number,
  ): boolean {
    const event = this.networkEvents[slot];
    if (revision !== this.networkRevision || this.networkSubmitted[slot] || !event) return false;
    const result = this.resolvePersonalEvent(game, slot, event, action);
    if (!result) return false;
    this.networkSubmitted[slot] = true;
    if (slot === game.localPlayerSlot) {
      this.resolved = true;
      this.resultText = result;
    }
    session.publishBuild(game);
    this.publishNetworkPhase(session);
    playSfx(action === 'sacrifice' ? 'hurt' : action === 'refuse' ? 'click' : 'buy');
    if (this.networkSubmitted.every(Boolean)) {
      this.networkRevision = 0;
      continueToNextWave(game);
    }
    return true;
  }

  private updateNetworkHost(game: Game, session: HostSession): void {
    for (const message of session.drainPhaseCommands()) {
      if (
        message.command !== 'event-choice'
        || message.ids.length !== 1
        || !['take', 'scrap', 'sacrifice', 'refuse'].includes(message.ids[0])
      ) {
        session.resendPhase();
        continue;
      }
      const accepted = this.submitNetworkEvent(
        game,
        session,
        1,
        message.ids[0] as 'take' | 'scrap' | 'sacrifice' | 'refuse',
        message.phaseRevision,
      );
      if (!accepted) session.resendPhase();
      if (this.networkRevision === 0) return;
    }
    const action = this.action;
    this.action = null;
    if (action && action !== 'go') {
      this.submitNetworkEvent(game, session, 0, action, this.networkRevision);
    }
  }

  private updateNetworkGuest(game: Game, session: GuestSession): void {
    const phase = session.phaseState;
    if (phase?.phase === 'progression' && phase.phaseRevision > this.networkRevision) {
      progressionScene.enterRemote(game, phase);
      game.setScene(progressionScene, true);
      return;
    }
    if (phase?.phase === 'run' && phase.phaseRevision > this.networkRevision) {
      game.state.wave = phase.wave;
      runScene.enterWave(game);
      game.setScene(runScene, true);
      return;
    }
    if (phase?.phase !== 'event' || phase.phaseRevision !== this.networkRevision) return;
    this.networkSubmitted = [...phase.submitted];
    const slot = game.localPlayerSlot;
    if (phase.submitted[slot] || this.guestSubmittedRevision === phase.phaseRevision) {
      this.resolved = true;
      this.resultText = tt('coop.waitDecision');
      this.action = null;
      return;
    }
    const action = this.action;
    this.action = null;
    if (!action || action === 'go') return;
    session.sendPhaseCommand(phase.phaseRevision, 'event-choice', [action]);
    this.guestSubmittedRevision = phase.phaseRevision;
    this.resolved = true;
    this.resultText = tt('coop.waitDecision');
    playSfx('click');
  }

  update(game: Game, _dt: number): void {
    const session = game.networkSession;
    if (session?.status === 'connection-lost') {
      if (this.connectionExit) {
        this.connectionExit = false;
        game.networkSession = null;
        game.sessionRole = 'solo';
        void session.close();
        game.setScene(menuScene, true);
      }
      return;
    }
    if (session instanceof HostSession && this.networkRevision > 0) {
      this.updateNetworkHost(game, session);
      return;
    }
    if (session instanceof GuestSession && this.networkRevision > 0) {
      this.updateNetworkGuest(game, session);
      return;
    }
    const a = this.action;
    this.action = null;
    if (!a) return;
    const p = game.localPlayer;
    if (a === 'go') {
      continueToNextWave(game);
      return;
    }
    if (this.resolved) return;
    if (a === 'take' && this.loot) {
      const r = this.loot;
      if (r.kind === 'weapon') {
        if (!p.canUseWeapon(r.weapon)) {
          const value = Math.max(1, Math.round(r.weapon.price * 0.8));
          game.state.squad.materials += value;
          this.resultText = tt('ev.resScrap', value);
          playSfx('buy');
          this.resolved = true;
          return;
        }
        const owned = p.weapons.filter((w) => w.def.id === r.weapon.id && w.tier < MAX_TIER);
        if (owned.length > 0) {
          owned.sort((x, y) => x.tier - y.tier);
          p.upgradeWeapon(owned[0]);
          this.resultText = tt('ev.resUpgraded', tn('w', r.weapon.id, r.weapon.name), TIER_NAMES[owned[0].tier - 1]);
        } else if (p.canAddWeapon()) {
          p.weapons.push(new WeaponInstance(r.weapon, p.weapons.length));
          this.resultText = tt('ev.resAdded', tn('w', r.weapon.id, r.weapon.name));
        }
        p.recomputeStats();
      } else {
        p.addItem(r.item);
        this.resultText = tt('ev.resItem', tn('i', r.item.id, r.item.name));
      }
      playSfx('buy');
      this.resolved = true;
    } else if (a === 'scrap' && this.loot) {
      const r = this.loot;
      const v = Math.max(1, Math.round((r.kind === 'weapon' ? r.weapon.price : r.item.basePrice) * 0.8));
      game.state.squad.materials += v;
      this.resultText = tt('ev.resScrap', v);
      playSfx('buy');
      this.resolved = true;
    } else if (a === 'sacrifice' && this.altarItem) {
      const cost = Math.max(5, Math.round(p.stats.maxHp * 0.25));
      p.addUpgrade({ maxHp: -cost });
      p.hp = Math.min(p.hp, p.stats.maxHp);
      p.addItem(this.altarItem);
      this.resultText = tt('ev.resSacrifice', cost, tn('i', this.altarItem.id, this.altarItem.name));
      playSfx('hurt');
      this.resolved = true;
    } else if (a === 'refuse') {
      this.resultText = tt('ev.resRefuse');
      playSfx('click');
      this.resolved = true;
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 520, 460, (w, h, ui) => this.renderContent(game, ctx, w, h, ui));
    if (game.networkSession?.status === 'connection-lost') {
      const w = game.width;
      const h = game.height;
      dimBackground(ctx, w, h);
      panel(ctx, w / 2 - 220, h / 2 - 100, 440, 200, { radius: 18, border: '#ff547066' });
      ctx.fillStyle = '#ff7080';
      ctx.font = displayFont(20);
      ctx.textAlign = 'center';
      ctx.fillText(tt('coop.connectionLost'), w / 2, h / 2 - 42);
      if (button(ctx, game.ui, w / 2 - 120, h / 2 + 20, 240, 50, tt('coop.leave'))) {
        this.connectionExit = true;
      }
    }
  }

  private renderContent(game: Game, ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    const isChest = this.kind === 'chest';
    sceneBackground(ctx, w, h, isChest ? '#221c14' : '#22141c', '#0a0a10');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const accent = isChest ? '#ffd23e' : '#ff5470';
    const pw = 440;
    const ph = 400;
    panel(ctx, w / 2 - pw / 2, h / 2 - ph / 2, pw, ph, { radius: 20, glow: `${accent}44`, border: `${accent}66` });

    ctx.save();
    ctx.shadowColor = `${accent}88`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = accent;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(isChest ? tt('ev.chest') : tt('ev.altar'), w / 2, h / 2 - ph / 2 + 38);
    ctx.restore();

    if (isChest && this.loot) {
      const r = this.loot;
      const iconKey = r.kind === 'weapon' ? weaponIcon(r.weapon.id) : r.item.emoji;
      drawIcon(ctx, isChest ? 'chest' : iconKey, w / 2, h / 2 - 92, 44);
      drawIcon(ctx, iconKey, w / 2, h / 2 - 30, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(r.kind === 'weapon' ? tn('w', r.weapon.id, r.weapon.name) : tn('i', r.item.id, r.item.name), w / 2, h / 2 + 12);
      if (!this.resolved) {
        const p = game.localPlayer;
        const canTake = r.kind !== 'weapon' || (p.canUseWeapon(r.weapon) && (p.canAddWeapon() || p.weapons.some((wi) => wi.def.id === r.weapon.id && wi.tier < MAX_TIER)));
        const scrapV = Math.max(1, Math.round((r.kind === 'weapon' ? r.weapon.price : r.item.basePrice) * 0.8));
        if (button(ctx, ui, w / 2 - 190, h / 2 + 44, 180, 46, tt('chest.take'), { primary: true, enabled: canTake })) this.action = 'take';
        if (button(ctx, ui, w / 2 + 10, h / 2 + 44, 180, 46, `+${scrapV}`, { icon: 'i_gem' })) this.action = 'scrap';
      }
    } else if (!isChest && this.altarItem) {
      drawIcon(ctx, this.altarItem.emoji, w / 2, h / 2 - 70, 46);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(tn('i', this.altarItem.id, this.altarItem.name), w / 2, h / 2 - 24);
      ctx.fillStyle = '#9fdca0';
      ctx.font = '13px system-ui, sans-serif';
      const mods = Object.entries(this.altarItem.modifiers)
        .map(([k, v]) => `${STAT_LABELS[k as keyof Stats]} ${formatStatValue(k as keyof Stats, v as number)}`)
        .join(', ');
      ctx.fillText(mods, w / 2, h / 2);
      if (!this.resolved) {
        const cost = Math.max(5, Math.round(game.localPlayer.stats.maxHp * 0.25));
        ctx.fillStyle = '#e08a8a';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(tt('ev.price', cost), w / 2, h / 2 + 24);
        if (button(ctx, ui, w / 2 - 190, h / 2 + 48, 180, 46, tt('ev.sacrifice'), { primary: true })) this.action = 'sacrifice';
        if (button(ctx, ui, w / 2 + 10, h / 2 + 48, 180, 46, tt('ev.refuse'))) this.action = 'refuse';
      }
    }

    if (this.resolved) {
      ctx.fillStyle = '#9fdca0';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(this.resultText, w / 2, h / 2 + 70);
      if (this.networkRevision <= 0) {
        if (button(ctx, ui, w / 2 - 130, h / 2 + 106, 260, 52, tt('shop.fight'), { primary: true })) this.action = 'go';
      }
    }
  }
}

export const eventScene = new EventScene();
