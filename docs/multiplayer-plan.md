# План: онлайн-кооп на двух игроков без выделенного сервера

> Статус: готов к реализации.
>
> Архитектура: host-authoritative P2P. Браузер хоста симулирует мир и одновременно
> управляет P1; гость управляет P2, получает авторитетное состояние и предсказывает
> только движение своего героя. Игра остаётся статическим сайтом на GitHub Pages.

## Ключевые решения

- Максимум два игрока. Host migration, reconnect, продолжение соло после разрыва и
  выделенный TURN-сервер не входят в MVP.
- Транспорт — `trystero@0.25.2`, загружаемый динамически только при входе в кооп.
  Текущий пакет `trystero` по умолчанию использует Nostr для сигналинга; данные игры
  передаются напрямую по WebRTC DataChannel.
- XP, уровень и материалы общие. Билды полностью раздельные: каждый игрок сам
  выбирает улучшения, таланты, оружие, предметы, ветки, эволюции и аугменты
  способности.
- Полевой сундук получает открывший его игрок. Случайный межволновый chest/altar
  event создаётся отдельно для каждого игрока.
- После магазина следующая волна начинается, когда оба игрока выставили ready.
- Гость получает полноценные gameplay FX/SFX и интерактивные персональные оверлеи,
  а не упрощённый read-only режим.
- Соло проходит через ту же squad-модель с одним игроком и не меняет существующие
  правила или управление.

## Этап 0 — тестовая основа

1. Добавить `vitest@4.1.6` как dev-зависимость. Минимальная версия Node.js — 20.
2. Добавить команды:
   - `npm test` → `vitest run`;
   - `npm run test:watch` → `vitest`.
3. Использовать Node environment без Canvas/DOM. Чистую игровую логику отделить от
   рендера и WebAudio так, чтобы её можно было тестировать без браузера.
4. Добавить `npm test` в GitHub Actions перед `npm run build`.
5. Зафиксировать чистый baseline: `npm run check`, `npm test`, `npm run build`.

## Этап 1 — модель отряда и персональные билды

### Состояние и профили

Ввести базовые типы:

```ts
type PlayerSlot = 0 | 1;

interface SquadState {
  xp: number;
  level: number;
  materials: number;
}

interface PlayerProfile {
  perkLevel(id: string): number;
  isUnlocked(id: string): boolean;
}

interface SerializedPlayerProfile {
  perkLevels: Record<string, number>;
  unlockedIds: string[];
}
```

- `RunState.player` заменить на `RunState.players: Player[]`.
- Добавить `RunState.squad`, `alivePlayers()` и
  `nearestAlivePlayer(x, y): Player | null`.
- Добавить `Game.localPlayerSlot`. В соло и на хосте это слот `0`, у гостя — `1`.
- `Player` получает стабильный `slot`, `downed` и `PlayerProfile`.
- Удалить из `Player` поля `xp`, `level` и `materials`.
- `xpToNext` сделать чистой функцией от squad-level.
- `Player.recomputeStats()` использует профиль игрока, а не прямой вызов
  `perkLevel()` из `core/save`.
- Shop roll также использует `profile.isUnlocked()`, чтобы магазин P2 не зависел
  от сохранения хоста.
- Сохранить `game.newRun(character)` как соло-обёртку над
  `game.newRunSquad(characters, profiles)`.

### Ввод

Разделить локальный ввод, сетевой пакет и симуляцию:

```ts
interface PlayerInputState {
  moveX: number;
  moveY: number;
  abilityPressSeq: number;
}

interface NetworkInput extends PlayerInputState {
  seq: number;
}
```

- `abilityPressSeq` увеличивается только при новом нажатии и не превращает
  способность в удерживаемую кнопку.
- Вынести применение движения в чистую функцию, общую для хостовой симуляции и
  prediction гостя.
- Локальный provider читает текущую клавиатуру/тач; remote provider хранит последний
  валидный input P2.
- Downed-игрок всегда получает нейтральный input.

### Ownership урона

Недостаточно добавить владельца только снаряду: ownership должен сохраняться по
всей цепочке атаки.

- Ввести `ownerPlayerSlot: PlayerSlot | null` у снарядов, зон, shockwave и
  остальных отложенных источников урона.
- Текущий `AreaEffect.ownerSlot`, означающий слот оружия, переименовать в
  `weaponSlot`; отдельно добавить `ownerPlayerSlot`.
- При наложении burn сохранять владельца эффекта на враге, чтобы DoT использовал
  таланты и модификаторы правильного игрока.
- `damageEnemy` принимает источник атаки и получает от него владельца и координаты
  удара.
- `damagePlayer(state, target, damage)` принимает конкретного игрока.
- `critRoll`, talent multipliers, chain lightning, summons, melee, orbit,
  projectile explosions, ricochet, shockwave и status damage используют владельца
  атаки.
- Enemy/environment damage имеет владельца `null`.

### Стабильная идентичность объектов

Для корректной интерполяции добавить монотонные `uid`:

- `Projectile`;
- `Pickup`;
- `AreaEffect` — уже существует, сохранить;
- battlefield chest;
- bomber explosion;
- fire patch.

Pool по-прежнему остаётся плотным и использует swap-with-last, но сетевой слой
никогда не считает индекс pool стабильной идентичностью.

### Системы

- Движение, способности, таймеры, regen и оружие обновляются для каждого
  не-downed игрока.
- Враги и боссы целятся в ближайшего живого игрока. При равной дистанции побеждает
  меньший `PlayerSlot`.
- Contact damage и вражеские снаряды проверяют всех живых игроков. Один вражеский
  снаряд поражает первую валидную цель и после этого удаляется по текущим правилам.
- Бомбы, огненные лужи и остальные площадные enemy hazards могут задеть обоих.
- Пикап магнитится к ближайшему живому игроку с учётом его pickup range. Материалы
  и XP поступают в `squad`, а персональная механика magnetic pulse срабатывает у
  собравшего.
- Vacuum направляет каждый пикап к ближайшему живому игроку.
- Hold-objective засчитывает присутствие любого живого игрока; награда поступает в
  общий кошелёк.
- Сундук открывает ближайший коснувшийся живой игрок; при точном равенстве
  приоритет у меньшего слота.
- Spawn point остаётся вне камеры хоста и дополнительно проходит проверку
  минимальной дистанции до всех живых игроков. Если игроки сильно разошлись и
  полностью скрытый spawn невозможен, допускается видимый spawn-in telegraph.
- Coop-множители действуют весь забег, даже когда один игрок downed:
  `COOP_ENEMY_HP_MULT = 1.6`,
  `COOP_ENEMY_MAX_ALIVE_MULT = 1.5`.
- Итоговый maxAlive сохраняет существующий global multiplier и ограничивается
  вместимостью pool.

### Downed и поражение

- Когда HP достигает нуля, `downed` выставляется немедленно.
- Downed-игрок не двигается, не атакует, не является целью, не участвует в
  коллизиях и рендерится призраком.
- Персональные level-up/shop/event решения остаются доступны downed-игроку, чтобы
  его билд не отставал.
- На старте следующей волны все игроки получают полный HP, `downed = false` и
  обычный wave reset.
- Забег проигран, когда downed оба игрока.

## Этап 2 — развитие и межволновые сцены

### Level-up

- Squad XP и squad-level общие.
- Каждый новый уровень добавляет по одному персональному pending choice обоим
  игрокам, включая downed.
- Выборы роллятся отдельно по luck/talents соответствующего героя.
- Симуляция остаётся на паузе, пока оба не завершили текущий уровень.
- Выбранный upgrade/talent применяется только к выбравшему игроку.
- Если за один шаг получено несколько уровней, пары выборов обрабатываются
  последовательно.

### Battlefield chest

- Лут роллится по профилю и билду открывшего игрока.
- Только открывший видит интерактивный выбор; второй видит оверлей ожидания.
- Weapon/item/merge применяется только к открывшему.
- Scrap пополняет общий squad-кошелёк.
- Бой возобновляется после завершения выбора.

### Магазин

- У каждого игрока собственные offers, reroll count, ветки, эволюции и панель
  билда.
- Материалы общие.
- Buy, reroll, sell, branch и evolve — авторитетные команды хосту.
- Каждая команда содержит `phaseRevision` и идентификаторы предложения/слота.
- Хост последовательно проверяет актуальность, класс оружия, свободные слоты,
  цену и остаток общего кошелька.
- Покупка гостя не применяется оптимистично: UI ждёт подтверждённый `PhaseState`.
- Продажа персонального оружия пополняет общий кошелёк.
- Каждый игрок может выставить или снять ready. Когда ready выставили оба, хост
  немедленно начинает переход к следующей волне.

### Межволновые события и progression

- Random chest/altar event создаётся отдельно для каждого игрока; оба должны
  завершить свою версию события.
- Награды и жертвы применяются только к соответствующему герою; scrap пополняет
  общий кошелёк.
- На волнах аугментов каждый игрок получает варианты для способности своего героя
  и выбирает сам.
- Контракт остаётся общим и выбирается хостом.
- Сложность, pause, surrender, retry и endless контролирует хост.

## Этап 3 — общий presentation event stream

Существующие системы напрямую вызывают `render/fx` и `render/audio`, поэтому гость
не сможет воспроизвести полноценную картину только по снапшотам. Ввести
сериализуемый поток:

```ts
interface GameplayEventBase {
  eventId: number;
  simTick: number;
}

type GameplayEvent =
  | DamageEvent
  | DeathEvent
  | FxEvent
  | SfxEvent
  | AbilityEvent
  | WaveEvent
  | PhaseEvent;
```

- Симуляция публикует события через event sink и не обращается напрямую к Canvas,
  screen shake или WebAudio.
- Соло и хост воспроизводят событие локально сразу после создания.
- Host session одновременно добавляет сериализуемое событие в сетевой batch.
- Гость воспроизводит тот же burst/ring/sparks/gibs/goo/damage number/SFX.
- Death event содержит данные для `stampGoo`, направления gibs и boss feedback.
- Damage feedback содержит target slot. Полноэкранный flash/shake включается только
  если повреждён локальный игрок.
- UI hover/click sounds остаются локальными и по сети не передаются.
- Event batch имеет монотонный диапазон ID; гость дедуплицирует повторы.
- Critical events — player damage, death/goo, ability, phase, wave, chest и end —
  не отбрасываются.
- При переполнении очереди разрешено объединять только повторяющиеся cosmetic
  hit/spark события одного sim tick.
- Хост хранит кольцевой буфер последних событий; при обнаружении разрыва гость
  отправляет resync request.

## Этап 4 — сетевой слой

### Trystero и комнаты

- Зафиксировать `trystero@0.25.2` в `package.json` и lockfile.
- Использовать актуальный object-based API:

```ts
const action = room.makeAction<Message>('control');
action.onMessage = (message, { peerId }) => { /* ... */ };
await action.send(message, { target: peerId });
```

- Использовать стандартный импорт `trystero`, который в этой версии использует
  Nostr-стратегию.
- Удалить из документа неподтверждённую оценку «10–15% пар». В README оставить
  только факт: без TURN соединение может не установиться за некоторыми
  NAT/firewall.
- Код комнаты — ровно шесть символов Crockford Base32, генерируемых через
  `crypto.getRandomValues`.
- `NETWORK_VERSION = 1` входит в `appId` и handshake. Любое несовместимое изменение
  binary layout или порядка definition indexes требует увеличения версии.

### Transport API

Transport не скрывает peer identity и поддерживает targeted send:

```ts
interface Transport {
  sendControl(peerId: string, message: ControlMessage): Promise<void>;
  sendEvents(peerId: string, batch: GameplayEventBatch): Promise<void>;
  sendSnapshot(peerId: string, snapshot: ArrayBuffer): Promise<void>;
  onControl(cb: (peerId: string, message: unknown) => void): () => void;
  onEvents(cb: (peerId: string, message: unknown) => void): () => void;
  onSnapshot(cb: (peerId: string, data: ArrayBuffer) => void): () => void;
  onPeerState(cb: (peerId: string, state: 'joined' | 'left') => void): () => void;
  close(): Promise<void>;
}
```

- Dynamic import и локальный `joinRoom` завершаются до ожидания удалённого пира.
- Host принимает только первого валидного гостя.
- Следующим пирам отправляется `room-full`; их сообщения игнорируются.
- Все callbacks фильтруются по accepted peer ID.
- При выходе в меню session снимает listeners, очищает timers и вызывает
  `room.leave()`.

### Action namespaces

Использовать три независимых логических action:

1. `control` — handshake, lobby, input, phase/build state, команды и resync.
2. `events` — нумерованные gameplay-event batches.
3. `snapshot` — бинарные frame snapshots.

Trystero использует надёжный ordered DataChannel, поэтому snapshot sender обязан
предотвращать накопление устаревших кадров:

- одновременно отправляется не более одного snapshot;
- пока send выполняется, сохраняется только последний pending snapshot;
- после завершения отправляется этот последний кадр, промежуточные удаляются;
- размер и длительность send выводятся в dev network metrics.

### Runtime validation

TypeScript-типы сами по себе не защищают host simulation от входящих данных.

- Проверять discriminator и protocol version каждого control message.
- Проверять `Number.isFinite`, диапазоны осей, sequence/revision и размеры массивов.
- Нормализовать movement vector после clamp к `[-1, 1]`.
- Фильтровать character, weapon, perk, unlock и choice IDs по локальным таблицам.
- Clamp perk levels к `0..maxLevel`.
- Ограничить `unlockedIds` количеством известных unlockable definitions.
- Любая gameplay-команда должна соответствовать текущему phase и phase revision.
- Невалидное сообщение игнорируется; stale-команда получает reject и актуальный
  phase resync.

## Этап 5 — протокол состояния и shadow world

### BuildState

Надёжно отправляется при старте и после каждой мутации билда:

- `buildRevision`;
- character ID каждого игрока;
- derived stats;
- items и upgrade modifiers;
- talents;
- ability augments;
- оружие: ID, tier, branch, pending branch и slot.

Гость реконструирует `Player`/`WeaponInstance` для существующего HUD и renderer, но
не запускает их combat update.

### PhaseState

Версионированный discriminated union:

```ts
type PhaseState =
  | RunPhase
  | PausedPhase
  | LevelUpPhase
  | ChestPhase
  | ShopPhase
  | EventPhase
  | ProgressionPhase
  | EndPhase;
```

Каждый phase содержит `phaseRevision`. Payload передаёт только ID, варианты,
submitted/ready-флаги, получателя награды и подтверждённые результаты.
Локализованные строки по сети не передаются.

Существующие scene-классы разделить на model/controller и renderer:

- host controller мутирует авторитетное состояние;
- guest controller отправляет команды;
- оба клиента используют один renderer соответствующего phase;
- интерактивны только решения локального игрока и общие решения хоста.

### FrameSnapshot

Отправляется 20 раз в секунду через документированный little-endian binary codec.
Нельзя сериализовать `RunState` через spread/JSON: в нём есть классы, pools, maps и
DOM-ссылки.

Header:

- magic и protocol version;
- `snapshotSeq`;
- `simTick`;
- `ackInputSeq`;
- `buildRevision`;
- `phaseRevision`;
- последний включённый `eventId`.

Run scalars:

- wave, waveTimer, kills;
- squad XP/level/materials;
- boss UID/dead state;
- objective state;
- active contract ID;
- pause/run flags.

Player frame:

- slot, x/y, hp/maxHp, radius;
- downed, moving, aimAngle, iframes, slow timer;
- ability cooldown/active/recovery/pulse fields, position и power;
- transient weapon state: cooldown, recoil, fire/swipe/orbit angles, chain FX и
  summon positions/flash.

Enemy frame:

- uid и definition index;
- x/y, hp/maxHp;
- boss/elite flags;
- phase и phase timer;
- hitFlash, spawn timer, burn/slow/freeze timers.

Dynamic pools:

- projectiles: uid, x/y, vx/vy, radius, style index и visual flags;
- pickups: uid, x/y и value;
- area effects: uid, kind/style, x/y, radii, delay/ttl;
- chests, explosions и fire patches с uid и render-полями.

Числа с плавающей точкой кодируются как `Float32`, UID — `Uint32`, definition
indexes — `Uint16`, flags/enums — `Uint8`. Decoder проверяет count, ожидаемую длину
и лимиты pool до выделения или записи данных.

### ShadowState и интерполяция

- Хранить минимум три последних валидных snapshot.
- Игнорировать duplicate и out-of-order `snapshotSeq`.
- Рендерить мир примерно на 100 мс позади последнего host tick.
- Матчить все движущиеся сущности по uid.
- Позиции интерполировать; дискретные flags брать из более нового кадра.
- Новые сущности появляются со своим spawn-state, отсутствующие в новом кадре
  удаляются.
- Экстраполяция разрешена максимум на 100 мс, затем объект замораживается.
- Map theme, obstacles и floor bake воспроизводятся локально из wave: генерация уже
  детерминирована.
- Goo применяется только по нумерованным death events.
- `renderWorld` и `renderHud` принимают `localPlayerSlot` и работают одинаково с
  host state и shadow state.

## Этап 6 — prediction гостя

- Гость предсказывает только движение своего игрока, без combat, pickups, damage и
  способности.
- Input отправляется 30 Гц и немедленно при изменении осей или
  `abilityPressSeq`.
- Host хранит последний packet sequence, обрабатывает ability edge один раз и
  возвращает `ackInputSeq` в snapshot.
- Если input не приходил 250 мс, remote provider обнуляет движение.
- Гость хранит историю input samples и длительность их применения.
- При snapshot:
  1. взять авторитетную позицию P2;
  2. удалить подтверждённые samples;
  3. переиграть более новые samples общей функцией движения и obstacle collision;
  4. обновить predicted pose.
- Ошибки до 120 px сглаживаются за 100 мс; ошибки больше 120 px исправляются
  мгновенно.
- Локальный P2 рендерится в predicted pose без 100 мс interpolation buffer.
- Камера гостя следует за predicted pose.
- Остальные игроки и мир остаются интерполированными.
- Способность и её HUD начинают авторитетную анимацию только после подтверждения
  хоста.
- При pause, downed, phase transition или connection loss prediction history
  очищается.

## Этап 7 — lobby и жизненный цикл сессии

### Lobby

- Пункт «Кооп» в меню открывает lobby.
- Host action:
  - создаёт шестизначный код;
  - открывает комнату;
  - показывает code/copy и waiting state.
- Guest action:
  - нормализует введённый код;
  - открывает комнату;
  - ждёт peer не более 30 секунд;
  - позволяет cancel/retry.
- Handshake содержит network version, role, character ID и сериализованный профиль.
- Каждый выбирает героя только из своего локального списка unlocked.
- Host выбирает сложность.
- Оба выставляют lobby ready; старт доступен только после двух ready и валидного
  handshake.
- Host получает слот `0`, guest — слот `1`.
- `start` создаёт новый session/run ID и полный initial BuildState/PhaseState.

Обработать отдельные UI-состояния:

- WebRTC unsupported;
- loading dynamic import;
- waiting;
- connecting;
- connected;
- wrong code/timeout;
- room full;
- version mismatch;
- connection lost.

### Пауза и visibility

- Pause доступна только хосту.
- Гость видит отдельный paused phase и не продолжает prediction.
- При `document.hidden` хост автоматически ставит игру на паузу и публикует
  PausedPhase.
- При `document.hidden` гость немедленно отправляет нейтральный input.

### Разрыв

- `onPeerState('left')` для accepted peer немедленно останавливает simulation и
  session timers.
- Оба клиента показывают terminal connection-lost overlay с выходом в меню.
- Забег не вызывает `recordRun` и не начисляет shards.
- Уход неизвестного/отклонённого третьего пира игнорируется.

### Завершение и meta-прогрессия

Host отправляет авторитетный `EndResult`:

```ts
interface EndResult {
  sessionId: string;
  resultId: string;
  wave: number;
  kills: number;
  won: boolean;
  difficultyId: string;
  shardsEarned: number;
}
```

- Каждый клиент вызывает `recordRun`/`addShards` в своём localStorage.
- `resultId` записывается в session-local set и не может быть применён повторно.
- Гость подтверждает receipt.
- Если peer потерян до получения результата, его клиент ничего не записывает.
- Retry/endless/menu остаются решениями хоста; гость может самостоятельно выйти.

## Рендер и HUD

- Рендерить обоих игроков, их оружие, способности, summons и downed ghost.
- Разворот врага определяется ближайшим живым игроком.
- Для P1/P2 использовать различимые outline/label.
- Камера и darkness vignette всегда привязаны к локальному игроку.
- Общие элементы HUD: wave, timer, XP, level, materials, kills, objective,
  contract и boss bar.
- Подробные weapon slots, cooldowns и ability button принадлежат локальному игроку.
- Компактные portrait/HP/ability панели обоих игроков располагаются по разным
  сторонам экрана.
- Screen damage vignette и сильный shake относятся только к урону локального
  игрока.

## i18n и документация

- Добавить coop/lobby/network/ready/waiting/phase keys в `ru` и `en`.
- Остальные шесть словарей получают существующий English fallback через `fromEn`;
  ни в одном locale не должно быть отсутствующих ключей.
- README обновить:
  - как создать игру и присоединиться;
  - хост является сервером и должен держать вкладку открытой;
  - максимум два игрока;
  - reconnect/host migration отсутствуют;
  - используются публичные Nostr relays только для сигналинга;
  - без TURN соединение может не установиться за некоторыми NAT/firewall;
  - runtime dependency теперь включает Trystero.
- Не фиксировать размер Trystero как «~30 КБ» до production build. Благодаря
  dynamic import начальный solo bundle не должен включать coop chunk.

## Автоматические тесты

### Squad и бой

- Соло через `players[0]` сохраняет текущее поведение.
- Nearest-target игнорирует downed и корректно разрешает равную дистанцию.
- Contact, projectile, explosion и fire patch могут повредить правильного игрока.
- Все downed завершают забег; один downed не завершает.
- Enter wave воскрешает и полностью лечит обоих.
- Projectile/area/burn/summon используют талант, крит и attacker position владельца.
- Pickup выбирает правильного игрока, но начисляет общие XP/materials.

### Развитие

- Каждый squad-level создаёт pending choice обоим, включая downed.
- Выбор одного игрока не изменяет билд второго.
- Магазин учитывает персональный weapon class и unlock profile.
- Две одновременные покупки не могут потратить общий кошелёк ниже нуля.
- Продажа пополняет общий кошелёк.
- Полевой сундук выдаёт награду только открывшему.
- Personal events и ability augments завершаются отдельно.
- Переход из магазина требует ready обоих.

### Протокол

- Runtime validator отклоняет неверные типы, NaN/Infinity, неизвестные ID,
  oversized arrays и несовместимую версию.
- Третий peer получает `room-full` и не может отправлять gameplay-команды.
- Stale phase revision не мутирует состояние.
- Input sequence и ability edge не применяются повторно.
- После 250 мс input timeout движение становится нейтральным.

### Snapshot и guest

- Binary encode/decode round-trip сохраняет все render-поля.
- Decoder отклоняет truncated/oversized payload.
- Pool swap не ломает uid matching.
- Duplicate/out-of-order snapshot игнорируется.
- Interpolation корректно обрабатывает spawn/despawn.
- Prediction replay удаляет подтверждённые inputs и сходится к host position.
- Event batch дедуплицируется; critical events восстанавливаются через resync.
- EndResult применяется в local meta ровно один раз.

## Ручная проверка

1. Соло:
   - меню → выбор героя → волны 1–3;
   - level-up, талант, сундук, магазин, event;
   - touch и desktop controls;
   - поведение не отличается от текущей версии.
2. Два браузерных контекста:
   - create/join по коду;
   - разные герои, perk levels и unlock sets;
   - оба персональных level-up;
   - сундук открывает P1 и P2;
   - конкурентные покупки из общего кошелька;
   - branch/evolution/sell/reroll;
   - оба personal events;
   - ready gate;
   - boss волны 5;
   - downed и revive каждого игрока;
   - defeat при смерти обоих;
   - retry и endless.
3. Сеть:
   - wrong code и timeout;
   - третья вкладка и room-full;
   - version mismatch;
   - закрытие host/guest в lobby, run, level-up, chest, shop и end;
   - переход host/guest вкладки в background;
   - минимум два физических устройства в разных сетях, включая mobile hotspot;
   - Chromium и Safari/Firefox, desktop и touch.
4. Full presentation parity:
   - weapon fire/hit/death/ability/pickup/chest/boss FX и SFX присутствуют у гостя;
   - damage flash относится к локальному игроку;
   - goo и death events не дублируются;
   - phase overlays совпадают с состоянием хоста.

## Производительность и критерии приёмки

- Host simulation остаётся 60 Гц.
- Snapshot rate — 20 Гц; guest interpolation delay — около 100 мс.
- При 390 врагах и 512 снарядах p95 encoded snapshot не превышает 64 KiB.
- Одновременно существует не более одного отправляемого и одного заменяемого
  pending snapshot; очередь не растёт со временем.
- При RTT около 100 мс движение P2 реагирует локально без сетевой задержки и не
  демонстрирует заметных телепортов.
- Dev network HUD показывает:
  - RTT;
  - snapshot bytes;
  - encode/send duration;
  - pending snapshot state;
  - interpolation age;
  - prediction correction distance;
  - last input/event/build/phase revisions.
- `npm run check`, `npm test` и `npm run build` завершаются без ошибок.
- Production build на GitHub Pages проверяется между двумя реальными сетями.

## Явные ограничения MVP

- Хосту полностью доверяют симуляцию и итог забега; anti-cheat отсутствует.
- Профиль гостя валидируется по форме и допустимым значениям, но не доказывается
  внешним сервером.
- Код комнаты является casual-секретом, а не полноценной аутентификацией.
- Публичные signaling relays не дают гарантии доступности.
- Без TURN некоторые пары не смогут установить WebRTC-соединение.
- Нет reconnect, host migration, spectator mode, join-in-progress и voice chat.
- При разрыве соединения забег завершается без локальной meta-награды.
