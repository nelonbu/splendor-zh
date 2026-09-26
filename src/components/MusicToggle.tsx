import { useEffect, useRef, useState } from 'react';
import bgmUrl from '../../assets/bgm.MP3?url';
import { copy } from '../i18n/zhCN';

export default function MusicToggle() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        if (!audio.paused) audio.pause();
        audio.currentTime = 0;
      }
    };
  }, []);

  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    setPlayFailed(false);
    audio.volume = 0.35;
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setPlayFailed(true);
    }
  }

  const label = playFailed ? copy.musicUnavailable : isPlaying ? copy.musicOn : copy.musicOff;

  return (
    <>
      <audio ref={audioRef} src={bgmUrl} loop preload="none" onError={() => setPlayFailed(true)} />
      <button
        type="button"
        className="btn-music"
        aria-label={label}
        aria-pressed={isPlaying}
        title={label}
        onClick={toggleMusic}
      >
        {label}
      </button>
    </>
  );
}
