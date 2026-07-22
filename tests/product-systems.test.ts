import { beforeEach, describe, expect, it } from 'vitest';
import { routesAfterWave, themeIndexForWave } from '../src/data/routes';
import { generateMap } from '../src/data/maps';
import { DEFAULT_SETTINGS, importSettings, loadSettings, resetSettings, setBinding } from '../src/core/settings';
import { addShards, loadMeta, recordRun, resetMeta } from '../src/core/save';
import { cloneRunMetrics, createRunMetrics, recordDamage } from '../src/core/runMetrics';
import { createBackupText, importBackupText } from '../src/core/backup';
import { StaticPlayerProfile } from '../src/core/playerProfile';
import { Player } from '../src/entities/player';
import { RunState } from '../src/state';
import { applyBuildState, captureBuildState } from '../src/multiplayer/stateProtocol';
import { normalizeSerializedProfile, parseControlMessage } from '../src/multiplayer/protocol';
import { NETWORK_VERSION } from '../src/multiplayer/types';
import { validateGameContent } from '../src/data/validation';

beforeEach(() => {
  resetMeta();
  resetSettings();
});

describe('content integrity', () => {
  it('keeps all gameplay references and localized content valid', () => {
    expect(validateGameContent()).toEqual([]);
  });
});

describe('campaign routes', () => {
  it('offers two routes after each chapter boss and changes following themes', () => {
    expect(routesAfterWave(5).map((route) => route.id)).toEqual(['mistwood', 'frostpass']);
    expect(routesAfterWave(10)).toHaveLength(2);
    expect(routesAfterWave(15)).toHaveLength(2);
    expect(routesAfterWave(4)).toHaveLength(0);
    expect(themeIndexForWave(6, ['mistwood'])).toBe(1);
    expect(themeIndexForWave(6, ['frostpass'])).toBe(4);
    expect(generateMap(6, ['mistwood']).theme.name).not.toBe(generateMap(6, ['frostpass']).theme.name);
    expect(themeIndexForWave(21, ['mistwood', 'ashroad', 'demonrift'])).toBe(0);
  });

  it('round-trips route selections through reliable co-op build state', () => {
    const host = new RunState([new Player(0)]);
    const guest = new RunState([new Player(0)]);
    host.routeIds = ['mistwood', 'ashroad'];
    expect(applyBuildState(guest, captureBuildState(host, 4))).toBe(true);
    expect(guest.routeIds).toEqual(host.routeIds);
    expect(guest.metrics.routeIds).toEqual(host.routeIds);
  });
});

describe('settings and backup safety', () => {
  it('clamps numeric imports and rejects non-boolean toggle values', () => {
    expect(importSettings({
      masterVolume: 99,
      musicVolume: -3,
      screenShake: 'yes',
      reducedEffects: true,
      textScale: 5,
      bindings: { ability: 'KeyQ' },
    })).toBe(true);
    const settings = loadSettings();
    expect(settings.masterVolume).toBe(1);
    expect(settings.musicVolume).toBe(0);
    expect(settings.screenShake).toBe(DEFAULT_SETTINGS.screenShake);
    expect(settings.reducedEffects).toBe(true);
    expect(settings.textScale).toBe(1.25);
    expect(settings.bindings.ability).toBe('KeyQ');
  });

  it('swaps conflicting bindings instead of creating duplicate actions', () => {
    setBinding('moveUp', 'KeyS');
    expect(loadSettings().bindings.moveUp).toBe('KeyS');
    expect(loadSettings().bindings.moveDown).toBe('KeyW');
  });

  it('rolls back every section when a backup is only partially valid', () => {
    addShards(20);
    const backup = JSON.parse(createBackupText()) as Record<string, unknown>;
    backup.meta = { ...(backup.meta as object), shards: 999 };
    backup.settings = null;
    expect(importBackupText(JSON.stringify(backup))).toBe(false);
    expect(loadMeta().shards).toBe(20);
  });
});

describe('long-term progression', () => {
  it('records mastery, discoveries, challenges and cosmetic rewards together', () => {
    const metrics = createRunMetrics();
    metrics.duration = 500;
    metrics.bossesKilled = 2;
    metrics.abilityUses[0] = 30;
    metrics.enemyKills.chaser = 150;
    metrics.evolvedWeapons.push('railgun');
    recordDamage(metrics, 0, 2500, 'pistol');
    const gain = recordRun(10, 150, false, {
      wave: 10,
      level: 8,
      kills: 150,
      won: false,
      difficultyId: 'normal',
      characterIds: ['potato'],
      weaponIds: ['pistol', 'railgun'],
      playerCount: 1,
      metrics,
    });
    const meta = loadMeta();
    expect(meta.mastery.heroes.potato).toBeGreaterThan(0);
    expect(meta.mastery.weapons.pistol).toBeGreaterThan(0);
    expect(meta.codex.enemies).toContain('chaser');
    expect(meta.codex.evolutions).toContain('railgun');
    expect(gain.challengeIds).toEqual(expect.arrayContaining(['first_steps', 'boss_hunter', 'evolution', 'ability_master']));
    expect(meta.cosmetics.unlocked).toContain('arcane_aura');
  });

  it('deep-clones per-player damage maps', () => {
    const metrics = createRunMetrics();
    recordDamage(metrics, 0, 12, 'pistol');
    const copy = cloneRunMetrics(metrics);
    copy.weaponDamage[0].pistol = 99;
    expect(metrics.weaponDamage[0].pistol).toBe(12);
  });
});

describe('co-op profile and route validation', () => {
  it('shares a valid cosmetic while filtering unknown cosmetic IDs', () => {
    const serialized = { perkLevels: {}, unlockedIds: [], cosmeticId: 'victory_aura' };
    expect(new StaticPlayerProfile(serialized).cosmeticId()).toBe('victory_aura');
    expect(normalizeSerializedProfile(serialized)?.cosmeticId).toBe('victory_aura');
    expect(normalizeSerializedProfile({ ...serialized, cosmeticId: 'unknown' })).toEqual({
      perkLevels: {},
      unlockedIds: [],
    });
  });

  it('accepts known route phases and rejects injected route IDs', () => {
    const message = (id: string) => ({
      type: 'phase-state',
      version: NETWORK_VERSION,
      state: {
        version: 1,
        phase: 'progression',
        phaseRevision: 7,
        kind: 'route',
        choiceIds: [[id], []],
        submitted: [false, true],
      },
    });
    expect(parseControlMessage(message('mistwood'))?.type).toBe('phase-state');
    expect(parseControlMessage(message('developer_shortcut'))).toBeNull();
  });
});
