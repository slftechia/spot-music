import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function detectAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(detectStandalone);
  const [isIOS] = useState(detectIOS);
  const [isAndroid] = useState(detectAndroid);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const onStandalone = () => setIsStandalone(detectStandalone());
    window.matchMedia('(display-mode: standalone)').addEventListener('change', onStandalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowModal(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', onStandalone);
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setIsStandalone(true);
        setShowModal(false);
      }
      return;
    }
    setShowModal(true);
  }, [deferredPrompt]);

  const canInstall = !isStandalone;

  return {
    canInstall,
    hasNativePrompt: !!deferredPrompt,
    isIOS,
    isAndroid,
    isStandalone,
    showModal,
    setShowModal,
    install,
  };
}
