# 🥔 Arena Survivors

A pixel-art arena survival roguelite in the browser. Survive 20 waves, build your loadout of weapons and items, take down four bosses — then push your luck in endless mode.

**[▶ Play](https://danilaigoshin.github.io/arena-survivors/)** · Controls: WASD / arrows · Esc — pause · M — sound · Touch supported

![Menu](docs/menu.png)

## Features

- **20-wave campaign** across 10 unique maps, split into chapters with route choices after bosses
- **Weapons fire on their own** — your job is positioning and dodging
- **Shop between waves**: weapon tiers I–IV by merging duplicates, selling, item rarities, a wandering trader with discounts
- **Weapon specializations** chosen inside the shop at tier III: trade damage for speed or speed for damage without a raw-DPS upgrade
- **Evolutions**: a tier-IV weapon + a catalyst item = a unique superweapon (Annihilator, Storm Blade…)
- **4 heroes** with class-specific active abilities and permanent ability upgrades after bosses
- **Mechanical talents** every fourth level, plus optional wave objectives and risk/reward contracts
- **Meta progression**: shards, permanent perks, mastery, challenges, Codex discoveries and unlockable cosmetic auras
- **Elite enemies, multi-phase bosses at waves 5/10/15/20, endless mode** after victory
- **3 difficulty levels** and **8 interface languages**
- **Two-player online co-op (beta)** with invite links, shared XP/materials, squad Resonance and partial reward recovery after disconnects
- First-run tutorial, full keyboard remapping and gamepad navigation, accessibility options, wave checkpoints and save backup/import
- Installable PWA with offline solo play after the first successful load
- Pixel art, animation and synthesized sound — everything drawn and generated in code, zero external assets

![Combat](docs/gameplay.png)
![Shop](docs/shop.png)
![Boss](docs/boss.png)

## Tech

- **TypeScript + HTML5 Canvas 2D**, built with Vite and tested with Vitest
- **Trystero + WebRTC** for host-authoritative peer-to-peer co-op; public Nostr relays are used only for signaling
- Fixed 60 Hz timestep, object pools, spatial grid — 300 enemies at 120 fps
- Sprites are text-based pixel grids baked into offscreen canvases
- Sound is WebAudio synthesis (no audio files), saves live in localStorage

## Online co-op

Choose **Co-op** in the main menu. One player creates a room and shares the
invite link or six-character code; opening a link fills the code automatically. Both choose a hero
and mark themselves ready, then the host starts the run.

The host's browser is the authoritative game server and must keep the tab open.
Co-op supports exactly two players. Reconnect, host migration, spectators and
join-in-progress are not supported. If the connection is lost, either player can
bank a partial reward using the latest synchronized run state.

Game data travels directly between players over an encrypted WebRTC
DataChannel. Public Nostr relays only introduce the peers. No TURN server is
bundled in the public deployment, so a connection may fail behind some NAT or
firewall configurations. The client supports optional TURN configuration; see
[`docs/release-infrastructure.md`](docs/release-infrastructure.md).

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # TypeScript validation
npm test         # Node-only unit and protocol tests
npm run build    # production build in dist/
```

Node.js 20 or newer is required.

Pushes to `main` are built and deployed automatically with GitHub Actions. A deployment can also be started manually with `npm run deploy` when the GitHub CLI is authenticated.

---

Built in tandem with [Claude Code](https://claude.com/claude-code).
