import { Camera } from './core/camera';
import { RunState } from './state';
import { SIM_DT, MAX_STEPS } from './config';
import { initInput, getMouse, consumeClick, clearFrameKeys, setJoystickEnabled } from './core/input';
import { WeaponInstance } from './entities/weapon';
import { weaponById } from './data/weapons';
import { clearFx } from './render/fx';
import { setMusicMode } from './render/audio';
import type { UiInput } from './render/ui';
import type { CharacterDef } from './data/characters';

export interface Scene {
  update(game: Game, dt: number): void;
  render(game: Game, ctx: CanvasRenderingContext2D): void;
  /** Called right after this scene becomes the current one (incl. instant swaps). */
  onEnter?(game: Game): void;
  /** true only for scenes where the touch joystick should claim right-half touches */
  wantsJoystick?: boolean;
}

const FADE_OUT = 0.12;
const FADE_IN = 0.13;

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera = new Camera();
  state = new RunState();
  scene!: Scene;
  ui: UiInput = { mx: 0, my: 0, clicked: false, down: false };
  fps = 0;
  private frames = 0;
  private fpsStart = 0;
  private acc = 0;
  private last = performance.now();
  private pendingScene: Scene | null = null;
  /** transition clock: 0 = idle, (0..FADE_OUT] = fading out, then fading in until FADE_OUT+FADE_IN */
  private fadeT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    initInput(canvas);
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.camera.resize(this.canvas.width, this.canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();
  }

  setScene(scene: Scene, instant = false): void {
    if (!this.scene || instant) {
      this.scene = scene;
      this.pendingScene = null;
      this.fadeT = 0;
      scene.onEnter?.(this);
      return;
    }
    if (scene === this.scene || this.pendingScene) return;
    this.pendingScene = scene;
    this.fadeT = 1e-6;
  }

  /** Fresh run: new state, chosen character with their starting weapon. */
  newRun(character: CharacterDef): void {
    this.state = new RunState();
    this.state.player.setCharacter(character);
    this.state.player.weapons.push(new WeaponInstance(weaponById(character.weapon), 0));
    this.state.player.recomputeStats();
    clearFx();
    this.camera.follow(this.state.player.x, this.state.player.y);
  }

  start(): void {
    this.fpsStart = performance.now();
    const frame = (now: number) => {
      const rdt = Math.min((now - this.last) / 1000, 0.25);
      this.acc += rdt;
      this.last = now;

      // scene transition clock (real time, independent of sim steps)
      if (this.fadeT > 0) {
        this.fadeT += rdt;
        if (this.pendingScene && this.fadeT >= FADE_OUT) {
          this.scene = this.pendingScene;
          this.pendingScene = null;
          this.scene.onEnter?.(this);
        }
        if (!this.pendingScene && this.fadeT >= FADE_OUT + FADE_IN) this.fadeT = 0;
      }

      setJoystickEnabled(this.scene.wantsJoystick === true);
      // the run scene is the only joystick scene — it is also the combat-music scene
      setMusicMode(this.scene.wantsJoystick === true ? 'combat' : 'calm');
      const m = getMouse();
      this.ui.mx = m.x;
      this.ui.my = m.y;
      this.ui.down = m.down;
      // a click stays visible to update() and render() of the same frame:
      // immediate-mode buttons are hit-tested during render
      if (consumeClick()) this.ui.clicked = true;
      if (this.fadeT > 0) this.ui.clicked = false; // buttons can't fire through a fade

      let steps = 0;
      while (this.acc >= SIM_DT && steps < MAX_STEPS) {
        this.scene.update(this, SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;

      this.scene.render(this, this.ctx);
      if (this.fadeT > 0) {
        const a = this.pendingScene ? this.fadeT / FADE_OUT : 1 - (this.fadeT - FADE_OUT) / FADE_IN;
        this.ctx.fillStyle = `rgba(8,8,14,${Math.min(1, Math.max(0, a)).toFixed(3)})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
      if (steps > 0) {
        this.ui.clicked = false;
        clearFrameKeys();
      }

      this.frames++;
      if (this.frames >= 30) {
        this.fps = Math.round((this.frames * 1000) / (now - this.fpsStart));
        this.frames = 0;
        this.fpsStart = now;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
