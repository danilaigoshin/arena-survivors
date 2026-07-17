# План: онлайн-кооп (2 игрока) без выделенного сервера

> Статус: утверждён к реализации. Транспорт: **Trystero** (WebRTC DataChannel, сигналинг через публичные p2p-сети — BitTorrent-трекеры/Nostr). Своего сервера нет; браузер хоста = сервер + клиент. Вся игра по-прежнему статично хостится на GitHub Pages.

## Модель

- **Host-authoritative P2P**: браузер хоста — одновременно «сервер» (полная симуляция) и игрок. Гость — тонкий клиент: отправляет ввод, получает снапшоты состояния (20 Гц) и рендерит «теневой» мир с интерполяцией (~100 мс буфер). Детерминированный lockstep невозможен: в симе используется `Math.random` (enemyAI, combat, objectives, run).
- **Транспорт — Trystero**: `joinRoom({ appId: 'arena-survivors' }, code)` — автоподключение по короткому коду комнаты (4–6 символов). Обмен сообщениями через `makeAction`, состояние пира — `onPeerJoin`/`onPeerLeave`. +1 зависимость (`trystero`, ~30 КБ) в `package.json`.
- **Известное ограничение**: без TURN-сервера часть NAT (симметричные) не пробивается — у ~10–15% пар соединение не установится. Фиксируем в README.
- Закрытие вкладки хоста = конец забега (реконнекта в MVP нет). Максимум 2 игрока.

Игра жёстко однопользовательская (`RunState.player` используется в ~15 файлах), поэтому сначала — рефакторинг «один игрок → отряд из 1–2». Затем — сетевой слой.

## Ключевые проектные решения

- **Отрядная экономика**: материалы/XP/уровень общие — `RunState.squad = { xp, level, materials }` (с `Player` поля уходят). Покупки в магазине, награды сундуков/ивентов и выборы level-up применяются **ко всем игрокам** (каждый получает оружие/предмет/апгрейд; merge/ветки/кулдауны — у каждого свои). UI магазина/level-up остаётся один.
- **Индивидуальное**: позиция, hp, персонаж, способность, мета-перки. Мета-перки гостя отличаются от хоста: `Player.recomputeStats` сейчас читает `perkLevel()` из `core/save` напрямую — вводим инжектируемый `perkProvider: (id) => number` (по умолчанию локальный; для P2 — из данных лобби).
- **Смерть**: `hp <= 0` → `downed` (не цель, нет коллизий, призрачный рендер), воскрешение с полным hp на старте следующей волны (в `enterWave` уже есть full-heal). Поражение — когда все downed.
- **Баланс при 2 игроках**: HP врагов ×1.6, maxAlive ×1.5 (`config.ts`, применяются в spawner/applyDifficulty).
- **Соло не меняется**: отряд из 1 игрока идёт тем же кодом; управление как сейчас (WASD/стрелки + Space).
- **Выборы level-up/магазина/ивентов делает хост** (билд общий), гость видит read-only оверлей «хост выбирает…». Пауза — только у хоста.
- **Мета-прогрессия**: каждый клиент пишет `recordRun`/`addShards` локально за пройденные волны (оба реально играли — локальная запись каждого, не дубль).

## Фаза 1 — рефакторинг «отряд» (без сети, соло регрессионно чистое)

1. **`src/state.ts`**: `player: Player` → `players: Player[]`; `squad { xp, level, materials }`; хелперы `alivePlayers()`, `nearestAlivePlayer(x, y)`. В `spawnProjectile` — параметр `owner: Player | null` (возврат бумеранга, криты, талантные множители).
2. **`src/entities/player.ts`**: убрать `xp/level/materials` (→ squad; `xpToNext()` перенести как функцию уровня отряда в levelup.ts); добавить `downed = false` и инжектируемый `perkProvider`.
3. **`src/core/playerInput.ts`** (новый): `interface PlayerInput { x: number; y: number; ability: boolean }`; провайдер `localInput()` (текущая схема клавиатуры/тача из `core/input.ts`). Сетевой провайдер — в фазе 2.
4. **Системы** — заменить `state.player` на перебор/таргетинг:
   - `systems/combat.ts`: `damagePlayer(state, player, dmg)`; `updateWeapons(state, player, dt)` для каждого игрока; `critRoll(player)`; `damageEnemy` — множители талантов от `owner` (снаряды/саммоны/цепная молния/shockwave берут origin и крит от владеющего игрока).
   - `systems/enemyAI.ts`: враги и боссы целятся в `nearestAlivePlayer(e.x, e.y)` (все `norm(p.x - e.x, …)` в `updateEnemies`/`bossUpdate`).
   - `systems/collision.ts`: `enemyContactDamage` и вражеские снаряды проверяют всех живых игроков; бумеранг возвращается к `owner`.
   - `systems/levelup.ts`: пикапы летят к ближайшему живому игроку (магнит от его stats), сбор кредитует `squad`; `gainXp` → squad; `updateRegen` — каждому игроку.
   - `systems/spawner.ts`: точка спавна — вне вьюпорта камеры (как сейчас) **и** мин. дистанция от всех живых игроков; кооп-мультипликаторы HP/maxAlive.
   - `systems/objectives.ts`: 'hold'-зону держит любой живой игрок; награда → `squad.materials`.
5. **`src/scenes/run.ts`**: движение/способность каждого игрока из его `PlayerInput`; `enterWave` — спавн игроков рядом с центром (±48px), full-heal + воскрешение downed; vacuum → к ближайшему; взрывы бомберов/огненные лужи бьют всех; сундук открывает любой (награда отряду); `endScene` — только когда все downed; level-up оверлей применяет выбор ко всем живым игрокам.
6. **Рендер**:
   - `render/renderer.ts`: цикл по `players` (спрайт, оружие в руках/за спиной, вихрь/круг/саммоны — `drawCharacterAbility`, `drawSummons`, `drawHolsteredWeapons`, `drawHeldWeapon`); разворот врагов (`flip`) — по ближайшему игроку; виньетка темноты — вокруг локального игрока.
   - `render/hud.ts`: HP-бар и кулдаун способности каждого игрока (P1 слева, P2 справа), общие материалы/уровень/панель оружия — одни на отряд.
7. **Сцены**: `shopScene`/`eventScene`/`progressionScene` — мутации (`tryBuy`, `sellWeapon`, `tryEvolve`, branch, augment, sacrifice) применяются к каждому игроку; `endScene` — снапшот отряда. `game.newRun(c)` → `game.newRunSquad(characters: CharacterDef[], perkProviders?)`; `charSelect` пока остаётся соло (вызывает `newRunSquad([c])`).
8. **`src/config.ts`**: `COOP_ENEMY_HP_MULT = 1.6`, `COOP_ENEMY_MAX_ALIVE_MULT = 1.5`.
9. **Проверка фазы 1**: `npm run check` чисто; ручной соло-прогон волн 1–3 (бой, level-up, сундук, магазин) без изменений поведения.

## Фаза 2 — сеть (Trystero, браузер-хост)

1. **`npm i trystero`**.
2. **`src/net/transport.ts`** — обёртка над trystero, единый интерфейс:
   ```ts
   interface Transport {
     createRoom(): Promise<string>;  // → код комнаты
     joinRoom(code: string): Promise<void>;
     send(msg: unknown): void;
     onMessage(cb: (msg: unknown) => void): void;
     onPeerState(cb: (state: 'connected' | 'left') => void): void;
     close(): void;
   }
   ```
   Реализация: `joinRoom({ appId: 'arena-survivors' }, code)`, одно `makeAction('msg')` для всех сообщений, `onPeerJoin`/`onPeerLeave` → `onPeerState`.
3. **`src/net/protocol.ts`** — типы сообщений:
   - лобби: `hello { characterId, perkLevels }`, `lobbyState { characters, difficulty, ready }`, `start {}`;
   - ввод гостя: `input { x, y, ability }` 30 Гц (и по изменению);
   - снапшот хоста 20 Гц: игроки (позиция, hp/maxHp, aimAngle, moving, iframes, ability-поля, characterId, оружие: id/tier/branch/cooldown), враги (`uid, defIdx, x, y, hp, isBoss, elite, phase, hitFlash, spawnT, burnT, slowT, freezeT`), снаряды (x, y, style, variant, friendly, returning), пикапы, areaEffects, сундуки, взрывы/огненные лужи, `wave, waveTimer, kills, squad {xp, level, materials}, bossHp`, + **события кадра** (смерть врага→gibs/goo, level-up, сундук, старт волны→баннер+музыка, урон по своему игроку→flash/shake);
   - `status` (при смене + heartbeat 1 Гц): `{ phase: 'run' | 'shop' | 'levelup' | 'event' | 'progression' | 'end', payload }` — гость показывает соответствующий read-only оверлей.
4. **`src/net/hostSession.ts`**: оборачивает игровой цикл хоста: применяет сетевой ввод как `PlayerInput` P2, после sim-шагов накапливает события, раз в 50 мс шлёт снапшот (сериализация из `RunState` напрямую, без DOM).
5. **`src/net/guestSession.ts` + `src/net/shadowState.ts`**: «теневой» `RunState`, заполняемый снапшотами (пулы переиспользуются, враги матчатся по `uid`, отсутствующие uid деактивируются); интерполяция позиций (2 последних снапшота); рендер — существующие `renderWorld`/`renderHud` без изменений; fx/sfx — из событий снапшота; `bakeFloor(theme, wave)` локально (уже детерминирован); goo-стампы — по событиям смерти. Камера следует за своим игроком (`players[1]`).
6. **`src/scenes/lobbyScene.ts`**: «Создать игру» (показ кода комнаты) / «Присоединиться» (ввод кода); выбор персонажа каждым из своих разблокированных (`isUnlocked` локально); гость шлёт `hello` с `characterId` и своими `perkLevels`; сложность выбирает хост; ready-флаги; старт → на хосте `newRunSquad([cHost, cGuest], [localPerks, guestPerks])` → `enterWave`, на госте — переход в shadow-run сцену. Пункт «Кооп» в `scenes/menu.ts` → лобби.
7. **Интеграция run-цикла**: на хосте — обычный сим фазы 1 + `hostSession`; на госте — `guestRunScene` (нет сима, только shadow state + рендер + отправка ввода). Камера на обоих — за своим игроком. HUD одинаковый (отряд общий).
8. **Разрыв соединения**: `onPeerState('left')` → оверлей «соединение потеряно» → выход в меню (без записи рекорда).
9. **i18n**: ключи лобби/коопа (`coop.title`, `coop.create`, `coop.join`, `coop.code`, `coop.waiting`, `coop.hostChoosing`, `coop.lost`, `hud.p2`…) — обязательно в `ru` и `en` словари `data/locales.ts`.
10. **README**: раздел «Кооп» (как создать/присоединиться, хост = сервер, ограничение NAT).

## Проверка в конце

- `npm run check` (tsc) и `npm run build` — чисто.
- Ручной прогон двух браузеров (вкладка + инкогнито на `vite dev`): лобби по коду → волны 1–5 → level-up (выбирает хост, гость видит оверлей) → сундук → магазин → босс волны 5 → смерть/воскрешение P2 → разрыв вкладки гостя/хоста.
- Регрессия соло: меню → выбор героя → волны 1–3, магазин, level-up — без изменений.
- Латентность: при 20 Гц снапшотах + 100 мс интерполяции враги не должны «телепортироваться» заметно (проверить глазами на госте).
