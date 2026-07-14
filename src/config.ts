export const ARENA_W = 2000;
export const ARENA_H = 1500;
export const SIM_DT = 1 / 60;
export const MAX_STEPS = 5;

export const MAX_WEAPON_SLOTS = 6;
export const FINAL_WAVE = 20;

export const POOL_PROJECTILES = 512;
export const POOL_ENEMIES = 400;
export const POOL_PICKUPS = 400;
export const POOL_PARTICLES = 500;
export const POOL_DMG_NUMBERS = 128;
export const POOL_AREA_EFFECTS = 96;

export const PICKUP_MERGE_CAP = 300;
export const PLAYER_IFRAMES = 0.3;
export const GRID_CELL = 64;
/** Global pacing: fewer simultaneous enemies, but each hit matters more. */
export const ENEMY_SPAWN_INTERVAL_MULT = 1.12;
export const ENEMY_MAX_ALIVE_MULT = 0.9;
export const ENEMY_DAMAGE_MULT = 1.12;
/** Average materials per base drop on a kill and on wave-end cleanup. */
export const ENEMY_MATERIAL_DROP_MULT = 0.43;
export const WAVE_END_MATERIAL_DROP_MULT = 0.2;
/** Desktop/base camera zoom; short touch landscapes reduce it dynamically. */
export const WORLD_ZOOM = 1.35;
