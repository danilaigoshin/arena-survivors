import type { Game, Scene } from '../game';
import { button, panel, responsiveScene, sceneBackground, type UiInput } from '../render/ui';
import { drawIcon } from '../render/icons';
import { drawSprite, drawShadow } from '../render/sprites';
import { displayFont } from '../render/font';
import { t as tt, tn } from '../core/i18n';
import { loadMeta, masteryLevel, selectCosmetic } from '../core/save';
import { CHALLENGES, COSMETICS } from '../data/challenges';
import { CHARACTERS } from '../data/characters';
import { WEAPONS } from '../data/weapons';
import { ENEMIES } from '../data/enemies';
import { EVOLUTIONS } from '../data/evolutions';
import { menuScene } from './menu';

type CollectionTab = 'challenges' | 'mastery' | 'codex' | 'cosmetics';

interface CollectionCard {
  id: string;
  title: string;
  subtitle: string;
  icon?: string;
  sprite?: string;
  color?: string;
  locked?: boolean;
  progress?: number;
}

const PAGE_SIZE = 8;

function percentLabel(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function masteryCard(id: string, title: string, points: number, icon?: string, sprite?: string): CollectionCard {
  const level = masteryLevel(points);
  const floor = level * level * 25;
  const ceiling = (level + 1) * (level + 1) * 25;
  const progress = ceiling > floor ? (points - floor) / (ceiling - floor) : 1;
  return {
    id,
    title,
    subtitle: tt('collection.masteryLevel', level, Math.floor(points), ceiling),
    icon,
    sprite,
    progress,
    locked: points <= 0,
  };
}

function challengeProgress(id: string): number {
  const meta = loadMeta();
  if (meta.challenges.includes(id)) return 1;
  if (id === 'first_steps') return Math.min(1, meta.stats.runs);
  if (id === 'slayer') return Math.min(1, meta.stats.totalKills / 1000);
  if (id === 'evolution') return Math.min(1, meta.codex.evolutions.length);
  if (id === 'victory') return Math.min(1, meta.stats.wins);
  return 0;
}

class CollectionScene implements Scene {
  private tab: CollectionTab = 'challenges';
  private page = 0;
  private back = false;

  onEnter(): void {
    this.back = false;
  }

  update(game: Game): void {
    if (!this.back) return;
    this.back = false;
    game.setScene(menuScene);
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    responsiveScene(ctx, game.ui, game.viewport, 1080, 680, (w, h, ui) => this.renderContent(ctx, w, h, ui));
  }

  private setTab(tab: CollectionTab): void {
    if (this.tab === tab) return;
    this.tab = tab;
    this.page = 0;
  }

  private cards(): CollectionCard[] {
    const meta = loadMeta();
    if (this.tab === 'challenges') {
      return CHALLENGES.map((challenge) => {
        const done = meta.challenges.includes(challenge.id);
        return {
          id: challenge.id,
          title: tn('challenge', challenge.id, challenge.name),
          subtitle: tn('challenged', challenge.id, challenge.desc),
          icon: challenge.icon,
          color: done ? '#8dff9a' : '#ffd23e',
          locked: !done,
          progress: challengeProgress(challenge.id),
        };
      });
    }
    if (this.tab === 'mastery') {
      const heroes = CHARACTERS.map((character) => masteryCard(
        `hero:${character.id}`,
        tn('c', character.id, character.name),
        meta.mastery.heroes[character.id] ?? 0,
        undefined,
        character.sprite,
      ));
      const weapons = WEAPONS.map((weapon) => masteryCard(
        `weapon:${weapon.id}`,
        tn('w', weapon.id, weapon.name),
        meta.mastery.weapons[weapon.id] ?? 0,
        weapon.emoji,
      ));
      return [...heroes, ...weapons].sort((a, b) => Number(a.locked) - Number(b.locked) || a.title.localeCompare(b.title));
    }
    if (this.tab === 'codex') {
      const enemyCards = ENEMIES.map((enemy) => {
        const found = meta.codex.enemies.includes(enemy.id);
        return {
          id: `enemy:${enemy.id}`,
          title: found ? tn('enemy', enemy.id, enemy.id.replaceAll('_', ' ')) : tt('collection.unknown'),
          subtitle: found ? tt('collection.enemyEntry') : tt('collection.notEncountered'),
          icon: found ? enemy.emoji : 'i_lock',
          locked: !found,
        };
      });
      const weaponCards = WEAPONS.map((weapon) => {
        const found = meta.codex.weapons.includes(weapon.id);
        return {
          id: `weapon:${weapon.id}`,
          title: found ? tn('w', weapon.id, weapon.name) : tt('collection.unknownWeapon'),
          subtitle: found ? tt('collection.weaponEntry') : tt('collection.notUsed'),
          icon: found ? weapon.emoji : 'i_lock',
          color: '#8be9fd',
          locked: !found,
        };
      });
      const evolutionIds = [...new Set(EVOLUTIONS.map((evolution) => evolution.result))];
      const evolutionCards = evolutionIds.map((id) => {
        const weapon = WEAPONS.find((entry) => entry.id === id);
        const found = meta.codex.evolutions.includes(id);
        return {
          id: `evolution:${id}`,
          title: found && weapon ? tn('w', weapon.id, weapon.name) : tt('collection.unknownEvolution'),
          subtitle: found ? tt('collection.evolutionEntry') : tt('collection.notDiscovered'),
          icon: found ? weapon?.emoji : 'i_lock',
          color: '#b18cff',
          locked: !found,
        };
      });
      return [...enemyCards, ...weaponCards, ...evolutionCards];
    }
    return COSMETICS.map((cosmetic) => {
      const unlocked = meta.cosmetics.unlocked.includes(cosmetic.id);
      return {
        id: cosmetic.id,
        title: unlocked ? tn('cos', cosmetic.id, cosmetic.name) : tt('collection.unknownCosmetic'),
        subtitle: unlocked
          ? (meta.cosmetics.selected === cosmetic.id ? tt('collection.equipped') : tt('collection.selectAura'))
          : tt('collection.challengeReward'),
        icon: unlocked ? 'i_star' : 'i_lock',
        color: cosmetic.color,
        locked: !unlocked,
      };
    });
  }

  private renderCard(
    ctx: CanvasRenderingContext2D,
    ui: UiInput,
    card: CollectionCard,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const meta = loadMeta();
    const selected = this.tab === 'cosmetics' && meta.cosmetics.selected === card.id;
    panel(ctx, x, y, width, height, {
      fill: card.locked ? ['#181824', '#12121a'] : ['#252539', '#181824'],
      border: selected ? '#ffd23e' : card.color && card.color.length === 7 ? `${card.color}88` : '#ffffff22',
      glow: selected ? '#ffd23e44' : undefined,
      radius: 14,
    });

    const iconX = x + 48;
    const iconY = y + 46;
    if (card.sprite) {
      drawShadow(ctx, iconX, iconY + 17, 34);
      drawSprite(ctx, card.sprite, iconX, iconY, 44);
    } else if (card.icon) {
      drawIcon(ctx, card.icon, iconX, iconY, 30);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = card.locked ? '#77778c' : '#f0f0ff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(card.title, x + 84, y + 28, width - 102);
    ctx.fillStyle = card.locked ? '#666678' : '#aaaac1';
    ctx.font = '13px system-ui, sans-serif';
    const words = card.subtitle.split(' ');
    let line = '';
    let lineY = y + 54;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width - 105 && line) {
        ctx.fillText(line, x + 84, lineY, width - 102);
        lineY += 17;
        line = word;
      } else line = next;
      if (lineY > y + height - 22) break;
    }
    if (line && lineY <= y + height - 20) ctx.fillText(line, x + 84, lineY, width - 102);

    if (this.tab === 'challenges') {
      const challenge = CHALLENGES.find((entry) => entry.id === card.id)!;
      ctx.textAlign = 'right';
      ctx.fillStyle = card.locked ? '#8a8aa0' : '#8dff9a';
      ctx.font = 'bold 13px system-ui, sans-serif';
      const status = card.locked
        ? card.progress && card.progress > 0
          ? percentLabel(card.progress)
          : tt('collection.inProgress')
        : tt('collection.completed');
      ctx.fillText(status, x + width - 16, y + height - 18);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd23e';
      ctx.fillText(`+${challenge.reward}`, x + 16, y + height - 18);
      drawIcon(ctx, 'i_shard', x + 55, y + height - 18, 15);
    } else if (card.progress !== undefined) {
      const bx = x + 84;
      const by = y + height - 22;
      const bw = width - 104;
      ctx.fillStyle = '#0e0e16';
      ctx.fillRect(bx, by, bw, 7);
      ctx.fillStyle = card.locked ? '#55556a' : '#8be9fd';
      ctx.fillRect(bx, by, bw * card.progress, 7);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8a8aa0';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(percentLabel(card.progress), x + width - 14, by - 5);
    } else if (this.tab === 'cosmetics' && !card.locked) {
      if (button(ctx, ui, x + width - 118, y + height - 42, 102, 30, selected ? tt('collection.active') : tt('collection.equip'), {
        primary: selected,
        enabled: !selected,
        fontSize: 12,
      })) selectCosmetic(card.id);
    }
  }

  private renderContent(ctx: CanvasRenderingContext2D, w: number, h: number, ui: UiInput): void {
    sceneBackground(ctx, w, h, '#19192a', '#090910');
    const meta = loadMeta();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23e';
    ctx.font = displayFont(27);
    ctx.fillText(tt('collection.title'), w / 2, 42);
    ctx.fillStyle = '#8a8aa6';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(tt('collection.subtitle', meta.codex.enemies.length, ENEMIES.length, meta.challenges.length, CHALLENGES.length), w / 2, 72);

    if (button(ctx, ui, 22, 20, 118, 42, tt('hero.back'))) this.back = true;

    const tabs: { id: CollectionTab; label: string }[] = [
      { id: 'challenges', label: tt('collection.challenges') },
      { id: 'mastery', label: tt('collection.mastery') },
      { id: 'codex', label: tt('collection.codex') },
      { id: 'cosmetics', label: tt('collection.cosmetics') },
    ];
    const tabWidth = 190;
    const tabGap = 10;
    const tabsX = w / 2 - (tabs.length * tabWidth + (tabs.length - 1) * tabGap) / 2;
    tabs.forEach((tab, index) => {
      if (button(ctx, ui, tabsX + index * (tabWidth + tabGap), 94, tabWidth, 42, tab.label, {
        primary: this.tab === tab.id,
        fontSize: 14,
      })) this.setTab(tab.id);
    });

    const allCards = this.cards();
    const maxPage = Math.max(0, Math.ceil(allCards.length / PAGE_SIZE) - 1);
    this.page = Math.min(this.page, maxPage);
    const cards = allCards.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    const gap = 14;
    const cardW = Math.min(490, (w - 100 - gap) / 2);
    const cardH = 108;
    const gridW = cardW * 2 + gap;
    const startX = (w - gridW) / 2;
    const startY = 154;
    cards.forEach((card, index) => {
      const x = startX + (index % 2) * (cardW + gap);
      const y = startY + Math.floor(index / 2) * (cardH + gap);
      this.renderCard(ctx, ui, card, x, y, cardW, cardH);
    });

    const footerY = Math.min(h - 52, startY + 4 * (cardH + gap) + 4);
    if (maxPage > 0) {
      if (button(ctx, ui, w / 2 - 160, footerY, 90, 38, '←', { enabled: this.page > 0 })) this.page--;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#aaaac1';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(tt('collection.page', this.page + 1, maxPage + 1), w / 2, footerY + 19);
      if (button(ctx, ui, w / 2 + 70, footerY, 90, 38, '→', { enabled: this.page < maxPage })) this.page++;
    }
  }
}

export const collectionScene = new CollectionScene();
