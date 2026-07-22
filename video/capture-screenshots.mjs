import { spawn } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { openBrowser } from '@remotion/renderer';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = 4177;
const BASE_URL = `http://127.0.0.1:${PORT}/arena-survivors/`;
const WIDTH = 1280;
const HEIGHT = 800;
const tempDir = mkdtempSync(join(tmpdir(), 'arena-survivors-capture-'));
const viteEntry = resolve(ROOT, 'node_modules/vite/bin/vite.js');

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const server = spawn(
  process.execPath,
  [viteEntry, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverOutput = '';
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

const waitForServer = async () => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before capture started:\n${serverOutput}`);
    }
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${BASE_URL}\n${serverOutput}`);
};

const waitForGame = async (page) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const ready = await page.evaluate(() => Boolean(window.game?.scene));
      if (ready) {
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        return;
      }
    } catch {
      // Vite may still be evaluating the entry point.
    }
    await sleep(100);
  }
  throw new Error('The game did not expose window.game in time');
};

const loadFreshGame = async (page, scene) => {
  await page.goto({
    url: `${BASE_URL}?capture=${scene}&v=${Date.now()}`,
    timeout: 30_000,
  });
  await waitForGame(page);
  await page.evaluate(async () => {
    const { setLang } = await import('/arena-survivors/src/core/i18n.ts');
    setLang('en');
    let seed = 0x2f6e2b1;
    Math.random = () => {
      seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
      return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
    };
  });
};

const takeScreenshot = async (page, name) => {
  const { value } = await page._client().send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
    captureBeyondViewport: false,
    fromSurface: true,
    optimizeForSpeed: false,
  });
  const path = join(tempDir, name);
  writeFileSync(path, Buffer.from(value.data, 'base64'));
  return path;
};

const captureMenu = async (page) => {
  await loadFreshGame(page, 'menu');
  await page.evaluate(async () => {
    const game = window.game;
    const { menuScene } = await import('/arena-survivors/src/scenes/menu.ts');
    game.setScene(menuScene, true);
  });
  await sleep(1_250);
  return takeScreenshot(page, 'menu.png');
};

const captureGameplay = async (page) => {
  await loadFreshGame(page, 'gameplay');
  await page.evaluate(async () => {
    const game = window.game;
    const [{ CHARACTERS }, { WeaponInstance }, { weaponById }, { runScene }, { ENEMY_INDEX }] = await Promise.all([
      import('/arena-survivors/src/data/characters.ts'),
      import('/arena-survivors/src/entities/weapon.ts'),
      import('/arena-survivors/src/data/weapons.ts'),
      import('/arena-survivors/src/scenes/run.ts'),
      import('/arena-survivors/src/data/enemies.ts'),
    ]);

    game.newRun(CHARACTERS[2]);
    game.state.wave = 14;
    runScene.enterWave(game);
    runScene.tutorialStep = null;
    runScene.hintTimer = 0;
    runScene.bannerTimer = 0;

    const player = game.localPlayer;
    player.weapons.length = 0;
    ['stormgun', 'thunderstaff', 'singularity', 'dragonbreath'].forEach((id, slot) => {
      const weapon = new WeaponInstance(weaponById(id), slot);
      weapon.tier = 4;
      player.weapons.push(weapon);
    });
    player.addUpgrade({ attackSpeedPct: 75, damagePct: 35, armor: 18, maxHp: 40 });
    player.hp = player.stats.maxHp;
    player.activateAbility();
    game.state.squad.level = 14;
    game.state.squad.materials = 86;
    game.state.kills = 137;
    game.state.waveMaterials = 24;
    game.state.spawnTimer = 999;
    game.setScene(runScene, true);

    const positions = [
      [-285, -145], [-215, -75], [-150, -165], [-85, -105], [5, -165], [105, -125],
      [205, -155], [285, -80], [-295, 30], [-225, 115], [-130, 150], [-35, 115],
      [65, 160], [155, 105], [245, 145], [300, 35], [-165, 25], [180, 5],
    ];
    const enemyIds = [
      'chaser', 'runner', 'tank', 'shooter', 'bomber', 'shieldbearer',
      'summoner', 'splitter', 'hopper', 'frost', 'sprinter', 'tank',
      'shooter', 'chaser', 'bomber', 'shieldbearer', 'runner', 'summoner',
    ];
    positions.forEach(([dx, dy], index) => {
      const enemy = game.state.enemies.alloc();
      if (!enemy) return;
      enemy.init(ENEMY_INDEX[enemyIds[index]], player.x + dx, player.y + dy, game.state.wave, index === 7);
      enemy.spawnT = 0;
      enemy.speed *= 0.18;
      enemy.contactDamage = 0;
      enemy.maxHp = 2_000_000;
      enemy.hp = enemy.maxHp;
    });

    window.__arenaCaptureTimer = setInterval(() => {
      player.hp = player.stats.maxHp;
      player.downed = false;
      for (let index = 0; index < game.state.enemies.count; index++) {
        const enemy = game.state.enemies.items[index];
        enemy.hp = Math.max(enemy.hp, 1_500_000);
      }
    }, 40);
  });
  await sleep(2_350);
  return takeScreenshot(page, 'gameplay.png');
};

const captureShop = async (page) => {
  await loadFreshGame(page, 'shop');
  await page.evaluate(async () => {
    const game = window.game;
    const [{ CHARACTERS }, { WeaponInstance }, { weaponById }, { ITEMS }, { shopScene }] = await Promise.all([
      import('/arena-survivors/src/data/characters.ts'),
      import('/arena-survivors/src/entities/weapon.ts'),
      import('/arena-survivors/src/data/weapons.ts'),
      import('/arena-survivors/src/data/items.ts'),
      import('/arena-survivors/src/scenes/shopScene.ts'),
    ]);

    game.newRun(CHARACTERS[0]);
    game.state.wave = 8;
    game.state.squad.level = 11;
    game.state.squad.materials = 248;
    const player = game.localPlayer;
    player.weapons.length = 0;
    ['pistol', 'smg', 'orbs'].forEach((id, slot) => {
      const weapon = new WeaponInstance(weaponById(id), slot);
      weapon.tier = slot === 0 ? 4 : slot === 1 ? 3 : 2;
      weapon.branch = slot === 1 ? 'tempo' : null;
      player.weapons.push(weapon);
    });
    player.items.push(...['scope', 'battery', 'coffee'].map((id) => ITEMS.find((item) => item.id === id)).filter(Boolean));
    player.recomputeStats();

    shopScene.enter(game);
    shopScene.tutorialStep = null;
    shopScene.shop = {
      offers: [
        { kind: 'weapon', weapon: weaponById('shotgun'), price: 34, sold: false },
        { kind: 'weapon', weapon: weaponById('fire_wand'), price: 42, sold: false },
        { kind: 'item', item: ITEMS.find((item) => item.id === 'whetstone'), price: 28, sold: false },
        { kind: 'item', item: ITEMS.find((item) => item.id === 'crown'), price: 36, sold: false },
      ],
      rerollCost: 7,
      rerollCount: 2,
    };
    game.setScene(shopScene, true);
  });
  await sleep(950);
  return takeScreenshot(page, 'shop.png');
};

const captureBoss = async (page) => {
  await loadFreshGame(page, 'boss');
  await page.evaluate(async () => {
    const game = window.game;
    const [{ CHARACTERS }, { WeaponInstance }, { weaponById }, { runScene }, { ENEMY_INDEX }] = await Promise.all([
      import('/arena-survivors/src/data/characters.ts'),
      import('/arena-survivors/src/entities/weapon.ts'),
      import('/arena-survivors/src/data/weapons.ts'),
      import('/arena-survivors/src/scenes/run.ts'),
      import('/arena-survivors/src/data/enemies.ts'),
    ]);

    game.newRun(CHARACTERS[3]);
    game.state.wave = 10;
    runScene.enterWave(game);
    runScene.tutorialStep = null;
    runScene.hintTimer = 0;
    runScene.bannerTimer = 0;
    const player = game.localPlayer;
    player.weapons.length = 0;
    ['thunderstaff', 'singularity', 'stormblade'].forEach((id, slot) => {
      const weapon = new WeaponInstance(weaponById(id), slot);
      weapon.tier = 4;
      player.weapons.push(weapon);
    });
    player.addUpgrade({ attackSpeedPct: 55, armor: 25, maxHp: 55 });
    player.hp = player.stats.maxHp;
    player.activateAbility();
    game.state.squad.level = 18;
    game.state.squad.materials = 121;
    game.state.kills = 312;
    game.state.spawnTimer = 999;
    game.setScene(runScene, true);

    const boss = game.state.enemies.alloc();
    boss.init(ENEMY_INDEX.boss, player.x - 245, player.y + 45, 10);
    boss.spawnT = 0;
    boss.speed = 24;
    boss.contactDamage = 0;
    boss.maxHp = 5_000_000;
    boss.hp = boss.maxHp;
    game.state.bossUid = boss.uid;

    [
      ['tank', 120, -125], ['shieldbearer', 205, -70], ['shooter', 255, 55],
      ['summoner', 175, 135], ['bomber', 55, 155], ['runner', -70, -155],
    ].forEach(([id, dx, dy], index) => {
      const enemy = game.state.enemies.alloc();
      if (!enemy) return;
      enemy.init(ENEMY_INDEX[id], player.x + dx, player.y + dy, 10, index === 1);
      enemy.spawnT = 0;
      enemy.speed *= 0.12;
      enemy.contactDamage = 0;
      enemy.maxHp = 1_500_000;
      enemy.hp = enemy.maxHp;
    });

    window.__arenaCaptureTimer = setInterval(() => {
      player.hp = player.stats.maxHp;
      player.downed = false;
      for (let index = 0; index < game.state.enemies.count; index++) {
        const enemy = game.state.enemies.items[index];
        enemy.hp = Math.max(enemy.hp, enemy.isBoss ? 4_500_000 : 1_000_000);
      }
    }, 40);
  });
  await sleep(2_000);
  return takeScreenshot(page, 'boss.png');
};

let browser;
try {
  await waitForServer();
  browser = await openBrowser('chrome', {
    logLevel: 'error',
    forceDeviceScaleFactor: 1,
    chromiumOptions: { gl: 'angle' },
  });
  const page = await browser.newPage({
    context: () => null,
    logLevel: 'error',
    indent: false,
    pageIndex: 0,
    onBrowserLog: null,
    onLog: () => undefined,
  });
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const captures = [
    await captureMenu(page),
    await captureGameplay(page),
    await captureShop(page),
    await captureBoss(page),
  ];

  for (const source of captures) {
    const destination = resolve(ROOT, 'docs', basename(source));
    copyFileSync(source, destination);
    console.log(`Updated ${destination}`);
  }
} finally {
  if (browser) await browser.close({ silent: true });
  if (server.exitCode === null) server.kill('SIGTERM');
  rmSync(tempDir, { recursive: true, force: true });
}
