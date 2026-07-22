import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ArenaSurvivorsTrailer, TRAILER_FRAMES, TRAILER_FPS } from './trailer';

const VideoRoot: React.FC = () => (
  <Composition
    id="ArenaSurvivorsX"
    component={ArenaSurvivorsTrailer}
    durationInFrames={TRAILER_FRAMES}
    fps={TRAILER_FPS}
    width={1280}
    height={720}
  />
);

registerRoot(VideoRoot);
