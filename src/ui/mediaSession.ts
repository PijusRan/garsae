// Media keys and OS media overlays. Background/lock-screen playback is still deferred.
import { useEffect, useRef } from 'react';

interface Options {
  playing: boolean;
  /** What is on, for the overlay subtitle. */
  subtitle: string;
  /** Shown instead when nothing is on. */
  fallback: string;
  play: () => void;
  pause: () => void;
}

export function useMediaSession({ playing, subtitle, fallback, play, pause }: Options): void {
  const fns = useRef({ play, pause });
  fns.current = { play, pause };

  useEffect(() => {
    document.title = playing ? '▶ Garsæ' : 'Garsæ';
  }, [playing]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: 'Garsæ',
      artist: subtitle || fallback,
      artwork: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  }, [subtitle, fallback]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.playbackState = playing ? 'playing' : 'paused';
  }, [playing]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => fns.current.play());
    ms.setActionHandler('pause', () => fns.current.pause());
    ms.setActionHandler('stop', () => fns.current.pause());
    return () => {
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('stop', null);
    };
  }, []);
}
