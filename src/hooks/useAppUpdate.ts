import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function useAppUpdate() {
  const [updateReady, setUpdateReady] = useState(false);
  const applyUpdate = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    const checkForUpdate = () => {
      registration.current?.update().catch(() => {});
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    applyUpdate.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateReady(true);
      },
      onRegisteredSW(_swUrl, reg) {
        registration.current = reg;
        if (!reg) return;

        checkForUpdate();
        interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', checkForUpdate);
      },
    });

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkForUpdate);
    };
  }, []);

  const refresh = useCallback(async () => {
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
