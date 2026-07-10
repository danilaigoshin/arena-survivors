export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportMetrics {
  /** Logical CSS pixels used by every scene and input hit-test. */
  width: number;
  height: number;
  /** Native backing-store multiplier. Intentionally uncapped. */
  pixelRatio: number;
  safe: SafeAreaInsets;
  touch: boolean;
  landscape: boolean;
  compactLandscape: boolean;
  portraitBlocked: boolean;
  /** Visual HUD scale only; touch hit areas keep their own minimum size. */
  hudScale: number;
}

let safeAreaProbe: HTMLDivElement | null = null;

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function readSafeArea(): SafeAreaInsets {
  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.setAttribute('aria-hidden', 'true');
    safeAreaProbe.style.cssText = [
      'position:fixed',
      'inset:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top, 0px)',
      'padding-right:env(safe-area-inset-right, 0px)',
      'padding-bottom:env(safe-area-inset-bottom, 0px)',
      'padding-left:env(safe-area-inset-left, 0px)',
    ].join(';');
    document.body.appendChild(safeAreaProbe);
  }
  const style = getComputedStyle(safeAreaProbe);
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}

export function measureViewport(): ViewportMetrics {
  const vv = window.visualViewport;
  const width = Math.max(1, vv?.width ?? window.innerWidth);
  const height = Math.max(1, vv?.height ?? window.innerHeight);
  const touch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  const landscape = width >= height;
  const compactLandscape = touch && landscape && height < 500;

  return {
    width,
    height,
    pixelRatio: Math.max(1, window.devicePixelRatio || 1),
    safe: readSafeArea(),
    touch,
    landscape,
    compactLandscape,
    portraitBlocked: touch && !landscape,
    hudScale: compactLandscape ? Math.max(0.68, Math.min(1, height / 420)) : 1,
  };
}

export function usableViewport(viewport: ViewportMetrics): { width: number; height: number } {
  return {
    width: Math.max(1, viewport.width - viewport.safe.left - viewport.safe.right),
    height: Math.max(1, viewport.height - viewport.safe.top - viewport.safe.bottom),
  };
}
