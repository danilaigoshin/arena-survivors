export type ColorFilter = 'none' | 'deuteranopia' | 'tritanopia';

export type InputAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'ability'
  | 'pause'
  | 'mute';

export interface GameSettings {
  v: 1;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  screenFlash: boolean;
  damageNumbers: boolean;
  reducedEffects: boolean;
  highContrast: boolean;
  colorFilter: ColorFilter;
  textScale: number;
  quickTransitions: boolean;
  showFps: boolean;
  bindings: Record<InputAction, string>;
}

const KEY = 'as_settings';

export const DEFAULT_SETTINGS: GameSettings = {
  v: 1,
  masterVolume: 0.7,
  musicVolume: 0.2,
  sfxVolume: 0.8,
  screenShake: true,
  screenFlash: true,
  damageNumbers: true,
  reducedEffects: false,
  highContrast: false,
  colorFilter: 'none',
  textScale: 1,
  quickTransitions: false,
  showFps: false,
  bindings: {
    moveUp: 'KeyW',
    moveDown: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    ability: 'Space',
    pause: 'Escape',
    mute: 'KeyM',
  },
};

let cached: GameSettings | null = null;

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseSettings(value: unknown): GameSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<GameSettings>;
  const bindings = { ...DEFAULT_SETTINGS.bindings };
  if (raw.bindings && typeof raw.bindings === 'object') {
    for (const action of Object.keys(bindings) as InputAction[]) {
      const code = raw.bindings[action];
      if (typeof code === 'string' && code.length > 0 && code.length < 40) bindings[action] = code;
    }
  }
  const colorFilter: ColorFilter = raw.colorFilter === 'deuteranopia' || raw.colorFilter === 'tritanopia'
    ? raw.colorFilter
    : 'none';
  return {
    v: 1,
    masterVolume: clamp01(raw.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: clamp01(raw.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clamp01(raw.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    screenShake: booleanValue(raw.screenShake, DEFAULT_SETTINGS.screenShake),
    screenFlash: booleanValue(raw.screenFlash, DEFAULT_SETTINGS.screenFlash),
    damageNumbers: booleanValue(raw.damageNumbers, DEFAULT_SETTINGS.damageNumbers),
    reducedEffects: booleanValue(raw.reducedEffects, DEFAULT_SETTINGS.reducedEffects),
    highContrast: booleanValue(raw.highContrast, DEFAULT_SETTINGS.highContrast),
    colorFilter,
    textScale: typeof raw.textScale === 'number' && Number.isFinite(raw.textScale)
      ? Math.max(0.85, Math.min(1.25, raw.textScale))
      : DEFAULT_SETTINGS.textScale,
    quickTransitions: booleanValue(raw.quickTransitions, DEFAULT_SETTINGS.quickTransitions),
    showFps: booleanValue(raw.showFps, DEFAULT_SETTINGS.showFps),
    bindings,
  };
}

export function loadSettings(): GameSettings {
  if (cached) return cached;
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) {
      const parsed = parseSettings(JSON.parse(raw));
      if (parsed) return (cached = parsed);
    }
  } catch {
    // Invalid settings fall back to a safe, playable configuration.
  }
  cached = structuredClone(DEFAULT_SETTINGS);
  return cached;
}

export function saveSettings(): void {
  if (!cached) return;
  try {
    storage()?.setItem(KEY, JSON.stringify(cached));
  } catch {
    // The game remains playable if browser storage is unavailable.
  }
}

export function updateSetting<K extends Exclude<keyof GameSettings, 'v' | 'bindings'>>(
  key: K,
  value: GameSettings[K],
): void {
  const settings = loadSettings();
  settings[key] = value;
  const normalized = parseSettings(settings);
  if (normalized) cached = normalized;
  saveSettings();
}

export function setBinding(action: InputAction, code: string): void {
  if (!code || code.length >= 40) return;
  const settings = loadSettings();
  const previous = settings.bindings[action];
  // Swap conflicts so rebinding never silently erases another control.
  for (const key of Object.keys(settings.bindings) as InputAction[]) {
    if (key !== action && settings.bindings[key] === code) settings.bindings[key] = previous;
  }
  settings.bindings[action] = code;
  saveSettings();
}

export function resetSettings(): GameSettings {
  cached = structuredClone(DEFAULT_SETTINGS);
  saveSettings();
  return cached;
}

export function importSettings(value: unknown): boolean {
  const parsed = parseSettings(value);
  if (!parsed) return false;
  cached = parsed;
  saveSettings();
  return true;
}

export function exportSettings(): GameSettings {
  return structuredClone(loadSettings());
}

export function keyFor(action: InputAction): string {
  return loadSettings().bindings[action];
}

export function applyCanvasAccessibility(canvas: HTMLCanvasElement): void {
  const settings = loadSettings();
  const filters: string[] = [];
  if (settings.highContrast) filters.push('contrast(1.18)', 'saturate(1.12)');
  if (settings.colorFilter === 'deuteranopia') filters.push('hue-rotate(18deg)', 'saturate(0.85)');
  if (settings.colorFilter === 'tritanopia') filters.push('hue-rotate(-16deg)', 'saturate(0.9)');
  canvas.style.filter = filters.join(' ');
}

export function readableKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const labels: Record<string, string> = {
    Space: 'SPACE',
    Escape: 'ESC',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'ENTER',
  };
  return labels[code] ?? code.replace('Control', 'CTRL').replace('Shift', 'SHIFT');
}
