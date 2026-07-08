import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function isAudioActivelyPlaying() {
  const audio = document.getElementById('spot-audio-player') as HTMLAudioElement | null;
  if (audio && !audio.paused && !audio.ended && audio.currentTime > 0) return true;
  if ('mediaSession' in navigator && navigator.mediaSession.playbackState === 'playing') return true;
  return false;
}

export function useAppUpdate() {
  const [updateReady, setUpdateReady] = useState(false);
  const applyUpdate = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const pendingReload = useRef(false);

  const trySilentApply = useCallback(async () => {
    if (!pendingReload.current || !applyUpdate.current) return;
    if (isAudioActivelyPlaying()) return;
    pendingReload.current = false;
    setUpdateReady(false);
    await applyUpdate.current(true);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    const checkForUpdate = () => {
      registration.current?.update().catch(() => {});
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
        void trySilentApply();
      }
    };

    applyUpdate.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        pendingReload.current = true;
        // Se não está tocando, atualiza sozinho; senão mostra banner
        if (!isAudioActivelyPlaying()) {
          void trySilentApply();
        } else {
          setUpdateReady(true);
        }
      },
      onRegisteredSW(_swUrl, reg) {
        registration.current = reg;
        if (!reg) return;

        checkForUpdate();
        interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', () => {
          checkForUpdate();
          void trySilentApply();
        });
      },
    });

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [trySilentApply]);

  const refresh = useCallback(async () => {
    pendingReload.current = false;
    setUpdateReady(false);
    if (applyUpdate.current) {
      await applyUpdate.current(true);
    } else {
      window.location.reload();
    }
  }, []);

  const dismiss = useCallback(() => setUpdateReady(false), []);

  return { updateReady, refresh, dismiss };
}
