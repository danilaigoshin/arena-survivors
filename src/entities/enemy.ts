import { ENEMIES, type EnemyDef } from '../data/enemies';
import { getEndlessWaveScaling } from '../data/endless';
import type { PlayerSlot } from '../multiplayer/types';

let nextUid = 1;

export class Enemy {
  active = false;
  uid = 0; // identity that survives pool swaps (orbit hit cooldowns key on this)
  defIdx = 0;
  x = 0;
  y = 0;
  hp = 0;
  maxHp = 0;
  radius = 0;
  speed = 0;
  contactDamage = 0;
  hitFlash = 0;
  knockX = 0;
  knockY = 0;
  shootCd = 0;
  burnT = 0;
  burnDps = 0;
  burnTick = 0;
  burnOwnerPlayerSlot: PlayerSlot | null = null;
  slowT = 0;
  slowPct = 0;
  freezeT = 0;
  lastShockwaveUid = 0;
  /** scale-in on spawn; no contact damage while > 0 */
  spawnT = 0;
  elite = false;
  isBoss = false;
  // boss phase state
  phaseTimer = 0;
  phase = 0; // 0 chase, 1 telegraph, 2 dash
  dashVx = 0;
  dashVy = 0;
  /** final-boss minion summon cooldown */
  summonCd = 0;
  // multi-shot boss attack in progress ('' = none)
  burstType = '';
  burstN = 0;
  burstT = 0;
  burstAngle = 0;

  get def(): EnemyDef {
    return ENEMIES[this.defIdx];
  }

  init(defIdx: number, x: number, y: number, wave: number, elite = false): void {
    const def = ENEMIES[defIdx];
    this.uid = nextUid++;
    this.defIdx = defIdx;
    this.x = x;
    this.y = y;
    // Waves 11-20 use the authored campaign ramp. Endless mode then applies a
    // multiplicative step per wave so adjacent waves never flatten out.
    const isBossDef = def.ai === 'boss';
    const endless = getEndlessWaveScaling(wave);
    const campaignWave = wave - endless.steps;
    const late = !isBossDef && campaignWave > 10 ? 0.15 * Math.pow(campaignWave - 10, 1.25) : 0;
    const lateDmg = !isBossDef && campaignWave > 10 ? 0.04 * (campaignWave - 10) : 0;
    // Reaper is an earlier, lower-HP boss; normalize its endless appearances to
    // the Overlord's baseline before applying the shared per-wave multiplier.
    const endlessBossHpMult = isBossDef && endless.steps > 0 && def.id === 'reaper' ? 4 : 1;
    this.elite = elite;
    const hpMult = (1 + def.hpScale * (campaignWave - 1) + late) * endless.hpMult * endlessBossHpMult * (elite ? 4 : 1);
    const dmgMult = (1 + def.dmgScale * (campaignWave - 1) + lateDmg) * endless.damageMult * (elite ? 1.5 : 1);
    this.maxHp = Math.round(def.hp * hpMult);
    this.hp = this.maxHp;
    this.radius = def.radius * (elite ? 1.35 : 1);
    this.speed = def.speed * endless.speedMult * (elite ? 0.9 : 1);
    this.contactDamage = Math.round(def.contactDamage * dmgMult);
    this.hitFlash = 0;
    this.knockX = 0;
    this.knockY = 0;
    this.shootCd = def.shoot ? (def.shoot.cooldown * (0.5 + Math.random() * 0.5)) / endless.attackRateMult : 0;
    this.burnT = 0;
    this.burnDps = 0;
    this.burnTick = 0;
    this.burnOwnerPlayerSlot = null;
    this.slowT = 0;
    this.slowPct = 0;
    this.freezeT = 0;
    this.lastShockwaveUid = 0;
    this.spawnT = 0.3;
    this.isBoss = def.ai === 'boss';
    this.phaseTimer = 0;
    this.phase = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.summonCd = 6 / endless.attackRateMult;
    this.burstType = '';
    this.burstN = 0;
    this.burstT = 0;
    this.burstAngle = 0;
  }
}
