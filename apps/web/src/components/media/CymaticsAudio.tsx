import { useRef, useState } from 'react';
import { analyserForElement, resumeAudio } from './audioGraph';
import { Cymatics } from './Cymatics';

/**
 * An audio file with native controls and live cymatics above it (used for
 * learner recordings and teacher replies). Cross-origin (Drive) files can't be
 * analysed without CORS, so they get the plain player only.
 */
export function CymaticsAudio({ src, external = false, size = 180 }: { src: string; external?: boolean; size?: number }) {
  const el = useRef<HTMLAudioElement>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [playing, setPlaying] = useState(false);

  const onPlay = async () => {
    setPlaying(true);
    if (external || analyser || !el.current) return;
    // Playback starts from a tap on the controls, so the context may run.
    if (await resumeAudio()) setAnalyser(analyserForElement(el.current));
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {!external && <Cymatics analyser={analyser} active={playing} size={size} />}
      <audio
        ref={el}
        src={src}
        controls
        preload="metadata"
        onPlay={() => void onPlay()}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="w-full"
      />
    </div>
  );
}
