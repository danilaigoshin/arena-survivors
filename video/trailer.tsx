import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import menuShot from '../docs/menu.png';
import gameplayShot from '../docs/gameplay.png';
import shopShot from '../docs/shop.png';
import bossShot from '../docs/boss.png';
import trailerAudio from '../docs/trailer-audio.wav';
import pixelFont from '../src/assets/press-start-2p-latin.woff2';

export const TRAILER_FPS = 30;
export const TRAILER_FRAMES = 18 * TRAILER_FPS;

const COLORS = {
  bg: '#0d0d12',
  panel: '#171722',
  gold: '#ffd23e',
  amber: '#f0a03c',
  cyan: '#8be9fd',
  violet: '#b18cff',
  red: '#ff4768',
  white: '#f7f4ff',
  muted: '#a5a2b8',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const fade = (frame: number, duration: number, fadeOut = true) => {
  const intro = interpolate(frame, [0, 10], [0, 1], clamp);
  if (!fadeOut) return intro;
  const outro = interpolate(frame, [duration - 12, duration], [1, 0], clamp);
  return Math.min(intro, outro);
};

const PixelFont: React.FC = () => (
  <style>{`
    @font-face {
      font-family: "Arena Pixel";
      src: url("${pixelFont}") format("woff2");
      font-weight: 400;
      font-style: normal;
    }
  `}</style>
);

const Scanlines: React.FC<{ opacity?: number }> = ({ opacity = 0.12 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity,
      backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,.35) 3px 4px)',
      mixBlendMode: 'multiply',
    }}
  />
);

const Vignette: React.FC<{ color?: string }> = ({ color = 'rgba(0,0,0,.82)' }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(circle at 50% 48%, transparent 32%, ${color} 105%)`,
    }}
  />
);

const Flash: React.FC<{ color?: string }> = ({ color = '#ffffff' }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 2, 7], [0.78, 0.3, 0], clamp);
  return <AbsoluteFill style={{ backgroundColor: color, opacity, mixBlendMode: 'screen' }} />;
};

const PixelDust: React.FC<{ color?: string; count?: number }> = ({ color = COLORS.gold, count = 34 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {Array.from({ length: count }, (_, i) => {
        const x = ((i * 277 + 61) % 997) / 997 * width;
        const baseY = ((i * 431 + 17) % 991) / 991 * height;
        const speed = 0.34 + (i % 7) * 0.07;
        const y = (baseY - frame * speed + height + 32) % (height + 32) - 16;
        const pulse = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(frame * 0.08 + i));
        const size = 2 + (i % 3) * 2;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size,
              backgroundColor: color,
              boxShadow: `0 0 ${size * 3}px ${color}`,
              opacity: pulse,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const CornerLabel: React.FC<{ index: string; children: React.ReactNode; accent?: string }> = ({
  index,
  children,
  accent = COLORS.gold,
}) => (
  <div
    style={{
      position: 'absolute',
      top: 34,
      left: 42,
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      color: COLORS.white,
      fontFamily: 'Arial, sans-serif',
      fontWeight: 900,
      fontSize: 15,
      letterSpacing: 2.6,
      textTransform: 'uppercase',
      textShadow: '0 2px 12px #000',
    }}
  >
    <span style={{ color: accent, fontFamily: 'Arena Pixel', fontSize: 12 }}>{index}</span>
    <span style={{ width: 32, height: 3, background: accent, boxShadow: `0 0 14px ${accent}` }} />
    {children}
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = COLORS.cyan }) => (
  <div
    style={{
      padding: '10px 15px 9px',
      border: `2px solid ${color}`,
      color,
      backgroundColor: 'rgba(10,10,16,.8)',
      boxShadow: `0 0 20px ${color}33`,
      fontFamily: 'Arial, sans-serif',
      fontWeight: 900,
      fontSize: 15,
      letterSpacing: 1.7,
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);

const GameShot: React.FC<{
  src: string;
  duration: number;
  fromScale?: number;
  toScale?: number;
  fromX?: number;
  toX?: number;
  fromY?: number;
  toY?: number;
  filter?: string;
}> = ({
  src,
  duration,
  fromScale = 1.03,
  toScale = 1.12,
  fromX = 0,
  toX = 0,
  fromY = 0,
  toY = 0,
  filter = 'saturate(1.15) contrast(1.08) brightness(.86)',
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, duration], [fromScale, toScale], clamp);
  const x = interpolate(frame, [0, duration], [fromX, toX], clamp);
  const y = interpolate(frame, [0, duration], [fromY, toY], clamp);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: COLORS.bg }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
          filter,
        }}
      />
    </AbsoluteFill>
  );
};

const IntroScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame, fps, config: { damping: 15, stiffness: 135, mass: 0.8 } });
  const subIn = spring({ frame: frame - 18, fps, config: { damping: 18, stiffness: 110 } });
  const wipe = interpolate(frame, [0, 18], [82, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade(frame, duration), backgroundColor: COLORS.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,210,62,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,210,62,.055) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          transform: `translateY(${(frame * 0.35) % 48}px)`,
        }}
      />
      <PixelDust />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          transform: `scale(${0.84 + titleIn * 0.16})`,
          opacity: titleIn,
        }}
      >
        <div
          style={{
            color: COLORS.gold,
            border: `2px solid ${COLORS.gold}`,
            background: '#2a220e',
            boxShadow: `0 0 34px ${COLORS.gold}44`,
            padding: '11px 18px 9px',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 950,
            letterSpacing: 5,
            fontSize: 18,
            marginBottom: 28,
          }}
        >
          BUILT WITH AI
        </div>
        <div
          style={{
            position: 'relative',
            color: COLORS.white,
            fontFamily: 'Arena Pixel',
            fontSize: 55,
            lineHeight: 1.38,
            letterSpacing: -2,
            textAlign: 'center',
            textShadow: `6px 6px 0 #3a2c10, 0 0 38px ${COLORS.gold}55`,
            clipPath: `inset(0 ${wipe}% 0 0)`,
          }}
        >
          FABLE 5
          <span style={{ color: COLORS.gold, padding: '0 22px' }}>+</span>
          GPT-5.6 SOL
        </div>
        <div
          style={{
            opacity: subIn,
            transform: `translateY(${(1 - subIn) * 18}px)`,
            marginTop: 31,
            color: COLORS.muted,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: 4.2,
          }}
        >
          ONE COMPLETE BROWSER ROGUELITE
        </div>
      </AbsoluteFill>
      <Vignette />
      <Scanlines opacity={0.18} />
      <Flash color={COLORS.gold} />
    </AbsoluteFill>
  );
};

const MenuScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textIn = spring({ frame: frame - 10, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ opacity: fade(frame, duration), overflow: 'hidden', background: COLORS.bg }}>
      <GameShot src={menuShot} duration={duration} fromScale={1.01} toScale={1.1} fromY={5} toY={-10} />
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(9,9,15,.96) 0%, rgba(9,9,15,.48) 47%, transparent 72%)' }} />
      <CornerLabel index="01">Arena Survivors</CornerLabel>
      <div
        style={{
          position: 'absolute',
          left: 55,
          bottom: 74,
          width: 690,
          transform: `translateX(${(1 - textIn) * -65}px)`,
          opacity: textIn,
        }}
      >
        <div style={{ color: COLORS.gold, fontFamily: 'Arena Pixel', fontSize: 22, marginBottom: 22 }}>NO INSTALL.</div>
        <div
          style={{
            color: COLORS.white,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 950,
            fontSize: 63,
            lineHeight: 0.98,
            letterSpacing: -2.8,
            textShadow: '0 8px 26px #000',
          }}
        >
          JUST OPEN
          <br />
          AND PLAY.
        </div>
      </div>
      <Vignette color="rgba(0,0,0,.62)" />
      <Scanlines />
      <Flash />
    </AbsoluteFill>
  );
};

const GameplayScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textIn = spring({ frame: frame - 10, fps, config: { damping: 14, stiffness: 145, mass: 0.7 } });
  const jolt = frame < 8 ? Math.sin(frame * 3.7) * (8 - frame) * 0.55 : 0;
  return (
    <AbsoluteFill style={{ opacity: fade(frame, duration), overflow: 'hidden', background: COLORS.bg, transform: `translateX(${jolt}px)` }}>
      <GameShot src={gameplayShot} duration={duration} fromScale={1.08} toScale={1.18} fromX={25} toX={-34} fromY={3} toY={-12} />
      <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(8,10,12,.92) 0%, transparent 50%, rgba(8,10,12,.25) 100%)' }} />
      <CornerLabel index="02" accent={COLORS.cyan}>Combat</CornerLabel>
      <div
        style={{
          position: 'absolute',
          left: 48,
          bottom: 62,
          transform: `translateY(${(1 - textIn) * 54}px)`,
          opacity: textIn,
        }}
      >
        <div
          style={{
            color: COLORS.white,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 950,
            fontSize: 55,
            lineHeight: 1,
            letterSpacing: -2.3,
            textShadow: '0 8px 24px #000',
          }}
        >
          WEAPONS FIRE THEMSELVES.
          <br />
          <span style={{ color: COLORS.cyan }}>YOU DO THE DODGING.</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Pill>20 waves</Pill>
          <Pill color={COLORS.gold}>4 heroes</Pill>
        </div>
      </div>
      <Scanlines />
      <Vignette color="rgba(0,0,0,.48)" />
      <Flash color={COLORS.cyan} />
    </AbsoluteFill>
  );
};

const ShopScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [8, 25], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade(frame, duration), overflow: 'hidden', background: COLORS.bg }}>
      <GameShot src={shopShot} duration={duration} fromScale={1.04} toScale={1.13} fromX={-18} toX={26} fromY={-4} toY={7} />
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(9,9,15,.06) 30%, rgba(9,9,15,.92) 100%)' }} />
      <CornerLabel index="03" accent={COLORS.violet}>Buildcraft</CornerLabel>
      <div
        style={{
          position: 'absolute',
          right: 46,
          bottom: 74,
          width: 700,
          textAlign: 'right',
          opacity: reveal,
          transform: `translateX(${(1 - reveal) * 78}px)`,
        }}
      >
        <div
          style={{
            color: COLORS.white,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 950,
            fontSize: 66,
            lineHeight: 1,
            letterSpacing: -3,
            textShadow: '0 8px 28px #000',
          }}
        >
          BUILD. MERGE.
          <br />
          <span style={{ color: COLORS.violet }}>EVOLVE.</span>
        </div>
        <div
          style={{
            marginTop: 20,
            color: COLORS.white,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: 2.3,
          }}
        >
          TURN TIER-IV WEAPONS INTO SUPERWEAPONS
        </div>
      </div>
      <Vignette color="rgba(0,0,0,.48)" />
      <Scanlines />
      <Flash color={COLORS.violet} />
    </AbsoluteFill>
  );
};

const BossScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const punch = spring({ frame: frame - 9, fps, config: { damping: 10, stiffness: 190, mass: 0.65 } });
  const shakeStrength = interpolate(frame, [0, 10, 20], [14, 5, 0], clamp);
  const shakeX = Math.sin(frame * 4.8) * shakeStrength;
  const shakeY = Math.cos(frame * 3.4) * shakeStrength * 0.42;
  return (
    <AbsoluteFill style={{ opacity: fade(frame, duration), overflow: 'hidden', background: '#19080d' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${shakeX}px, ${shakeY}px)` }}>
        <GameShot
          src={bossShot}
          duration={duration}
          fromScale={1.08}
          toScale={1.2}
          fromX={30}
          toX={-20}
          filter="saturate(1.32) contrast(1.12) brightness(.8)"
        />
      </div>
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(25,4,10,.2) 30%, rgba(25,4,10,.9) 100%)' }} />
      <CornerLabel index="04" accent={COLORS.red}>Boss wave</CornerLabel>
      <div
        style={{
          position: 'absolute',
          right: 48,
          top: 170,
          width: 570,
          transform: `scale(${0.78 + punch * 0.22})`,
          transformOrigin: 'right center',
          opacity: punch,
          textAlign: 'right',
        }}
      >
        <div
          style={{
            color: COLORS.white,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 950,
            fontSize: 92,
            lineHeight: 0.91,
            letterSpacing: -5,
            textShadow: `0 0 35px ${COLORS.red}77, 0 10px 24px #000`,
          }}
        >
          4 BOSSES.
          <br />
          <span style={{ color: COLORS.red }}>NO MERCY.</span>
        </div>
      </div>
      <div style={{ position: 'absolute', right: 50, bottom: 72, display: 'flex', gap: 12 }}>
        <Pill color={COLORS.red}>Multi-phase fights</Pill>
      </div>
      <Vignette color="rgba(20,0,7,.58)" />
      <Scanlines opacity={0.17} />
      <Flash color={COLORS.red} />
    </AbsoluteFill>
  );
};

const FinalScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame: frame - 7, fps, config: { damping: 14, stiffness: 135 } });
  const ctaIn = spring({ frame: frame - 23, fps, config: { damping: 17, stiffness: 125 } });
  const pulse = 1 + Math.sin(frame * 0.15) * 0.025;
  const cards = [gameplayShot, shopShot, bossShot];
  return (
    <AbsoluteFill style={{ opacity: fade(frame, duration, false), backgroundColor: COLORS.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', gap: 5, opacity: 0.26, transform: 'scale(1.06)' }}>
        {cards.map((src, index) => (
          <div key={src} style={{ flex: 1, height: '100%', overflow: 'hidden', transform: `translateY(${index % 2 ? -14 : 14}px)` }}>
            <Img
              src={src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${1.2 + frame * 0.0007})`,
                filter: 'saturate(.75) brightness(.55) blur(1px)',
              }}
            />
          </div>
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(8,8,13,.96), rgba(8,8,13,.76), rgba(8,8,13,.96))' }} />
      <PixelDust color={COLORS.cyan} count={28} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div
          style={{
            opacity: titleIn,
            transform: `translateY(${(1 - titleIn) * -34}px) scale(${0.9 + titleIn * 0.1})`,
          }}
        >
          <div style={{ color: COLORS.gold, fontFamily: 'Arena Pixel', fontSize: 45, textShadow: `0 0 32px ${COLORS.gold}66` }}>
            ARENA SURVIVORS
          </div>
          <div
            style={{
              marginTop: 25,
              color: COLORS.white,
              fontFamily: 'Arial, sans-serif',
              fontWeight: 900,
              fontSize: 24,
              letterSpacing: 2.4,
            }}
          >
            20 WAVES · ONLINE CO-OP · NO DOWNLOAD
          </div>
        </div>
        <div
          style={{
            marginTop: 44,
            opacity: ctaIn,
            transform: `translateY(${(1 - ctaIn) * 36}px) scale(${pulse})`,
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: '19px 42px 17px',
              color: '#211706',
              background: `linear-gradient(180deg, ${COLORS.gold}, ${COLORS.amber})`,
              border: '3px solid #fff0a5',
              boxShadow: `0 0 36px ${COLORS.gold}66, 0 9px 0 #7b4710`,
              fontFamily: 'Arena Pixel',
              fontSize: 24,
            }}
          >
            PLAY NOW
          </div>
          <div
            style={{
              marginTop: 31,
              color: COLORS.cyan,
              fontFamily: 'Arial, sans-serif',
              fontWeight: 900,
              fontSize: 25,
              letterSpacing: 0.8,
              textShadow: `0 0 18px ${COLORS.cyan}55`,
            }}
          >
            danilaigoshin.github.io/arena-survivors
          </div>
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          bottom: 25,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: COLORS.muted,
          fontFamily: 'Arial, sans-serif',
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: 3,
        }}
      >
        BUILT WITH FABLE 5 + GPT-5.6 SOL
      </div>
      <Vignette color="rgba(0,0,0,.55)" />
      <Scanlines opacity={0.16} />
      <Flash color={COLORS.gold} />
    </AbsoluteFill>
  );
};

export const ArenaSurvivorsTrailer: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
    <PixelFont />
    <Audio src={trailerAudio} volume={0.78} />
    <Sequence from={0} durationInFrames={78}>
      <IntroScene duration={78} />
    </Sequence>
    <Sequence from={64} durationInFrames={103}>
      <MenuScene duration={103} />
    </Sequence>
    <Sequence from={151} durationInFrames={128}>
      <GameplayScene duration={128} />
    </Sequence>
    <Sequence from={263} durationInFrames={111}>
      <ShopScene duration={111} />
    </Sequence>
    <Sequence from={358} durationInFrames={111}>
      <BossScene duration={111} />
    </Sequence>
    <Sequence from={453} durationInFrames={87}>
      <FinalScene duration={87} />
    </Sequence>
  </AbsoluteFill>
);
