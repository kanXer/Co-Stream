'use client';

import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function PwaRegister() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined), { once: true });
      } else {
        navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister())).catch(() => undefined);
      }
    }
    setDismissed(sessionStorage.getItem('co_install_dismissed') === '1');
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!prompt || dismissed) return null;
  return (
    <div className="fixed right-3 bottom-24 z-50 flex items-center gap-2 rounded-full border border-[var(--accent)]/35 bg-[var(--panel-elevated)]/95 backdrop-blur-xl shadow-xl pl-4 pr-2 py-2">
      <button onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }} className="flex items-center gap-2 text-xs font-black"><Download size={15} className="text-[var(--accent)]" />Install Co Stream</button>
      <button onClick={() => { setDismissed(true); sessionStorage.setItem('co_install_dismissed', '1'); }} className="icon-button !w-7 !h-7"><X size={13} /></button>
    </div>
  );
}
