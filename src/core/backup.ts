import { exportCheckpoint, importCheckpoint } from './checkpoint';
import { getLang, LANGS, setLang, type Lang } from './i18n';
import { exportMeta, importMeta } from './save';
import { exportSettings, importSettings } from './settings';

interface BackupPayload {
  product: 'arena-survivors';
  v: 1;
  createdAt: string;
  meta: unknown;
  settings: unknown;
  checkpoint: unknown;
  lang: Lang;
}

export function createBackupText(): string {
  const payload: BackupPayload = {
    product: 'arena-survivors',
    v: 1,
    createdAt: new Date().toISOString(),
    meta: exportMeta(),
    settings: exportSettings(),
    checkpoint: exportCheckpoint(),
    lang: getLang(),
  };
  return JSON.stringify(payload);
}

export function importBackupText(text: string): boolean {
  const previousMeta = exportMeta();
  const previousSettings = exportSettings();
  const previousCheckpoint = exportCheckpoint();
  const previousLang = getLang();
  try {
    const value = JSON.parse(text) as Partial<BackupPayload>;
    if (
      value.product !== 'arena-survivors'
      || value.v !== 1
      || !LANGS.some((entry) => entry.code === value.lang)
      || !importMeta(value.meta)
      || !importSettings(value.settings)
      || !importCheckpoint(value.checkpoint ?? null)
    ) throw new Error('invalid-backup');
    setLang(value.lang!);
    return true;
  } catch {
    // Imports are atomic: a bad checkpoint cannot leave meta/settings half-restored.
    importMeta(previousMeta);
    importSettings(previousSettings);
    importCheckpoint(previousCheckpoint);
    setLang(previousLang);
    return false;
  }
}

export async function copyBackup(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(createBackupText());
    return true;
  } catch {
    return false;
  }
}

export async function pasteBackup(): Promise<boolean> {
  try {
    return importBackupText(await navigator.clipboard.readText());
  } catch {
    return false;
  }
}
