import { ENEMIES, type EnemyDef } from '../data/enemies';

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
    // waves 11-20 keep ramping past the per-def linear scale; endless (21+) ramps harder.
    // Bosses have authored HP for their intro wave — only the endless ramp touches them.
    const isBossDef = def.ai === 'boss';
    const late = !isBossDef && wave > 10 ? 0.15 * Math.pow(wave - 10, 1.25) : 0;
    const endless = wave > 20 ? (isBossDef ? 0.2 : 0.3) * Math.pow(wave - 20, 1.5) : 0;
    const lateDmg = (!isBossDef && wave > 10 ? 0.04 * (wave - 10) : 0) + (wave > 20 ? 0.08 * (wave - 20) : 0);
    this.elite = elite;
    const hpMult = (1 + def.hpScale * (wave - 1) + late + endless) * (elite ? 4 : 1);
    const dmgMult = (1 + def.dmgScale * (wave - 1) + lateDmg) * (elite ? 1.5 : 1);
    this.maxHp = Math.round(def.hp * hpMult);
    this.hp = this.maxHp;
    this.radius = def.radius * (elite ? 1.35 : 1);
    this.speed = def.speed * (elite ? 0.9 : 1);
    this.contactDamage = Math.round(def.contactDamage * dmgMult);
    this.hitFlash = 0;
    this.knockX = 0;
    this.knockY = 0;
    this.shootCd = def.shoot ? def.shoot.cooldown * (0.5 + Math.random() * 0.5) : 0;
    this.burnT = 0;
    this.burnDps = 0;
    this.burnTick = 0;
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
    this.summonCd = 6;
    this.burstType = '';
    this.burstN = 0;
    this.burstT = 0;
    this.burstAngle = 0;
  }
}
