'use client';

import React, { useEffect, useState } from 'react';
import {
  Check,
  Cloud,
  Languages,
  Laptop,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import {
  AVAILABLE_LANGUAGES,
  AVAILABLE_REGIONS,
  useStream,
} from '@/context/StreamContext';
import { clearSession, type CoProfile } from '@/components/AuthGate';
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  profile: CoProfile | null;
}

export function SettingsModal({ open, onClose, profile }: SettingsModalProps) {
  const {
    themeMode,
    setThemeMode,
    selectedRegion,
    setSelectedRegion,
    selectedLanguages,
    setSelectedLanguages,
  } = useStream();
  const [draftRegion, setDraftRegion] = useState(selectedRegion);
  const [draftLanguages, setDraftLanguages] = useState(selectedLanguages);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraftRegion(selectedRegion);
      setDraftLanguages(selectedLanguages);
      setError(null);
    }
  }, [open, selectedRegion, selectedLanguages]);

  if (!open) return null;

  const toggleLanguage = (code: string) => {
    setDraftLanguages((languages) => {
      if (languages.includes(code)) {
        return languages.length === 1 ? languages : languages.filter((language) => language !== code);
      }
      return [...languages, code];
    });
  };

  const applyDiscovery = () => {
    setSelectedRegion(draftRegion);
    setSelectedLanguages(draftLanguages);
  };

  const signInGoogle = async () => {
    if (!isFirebaseConfigured) {
      setError('Add Firebase Web values to .env.local to enable Google sign-in.');
      return;
    }
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
      onClose();
    } catch (_) {
      setError('Could not sign in. Check Firebase Authentication settings.');
    }
  };

  const displayName = profile?.name || 'Guest';

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-5" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto no-scrollbar rounded-t-[30px] sm:rounded-[30px] border border-[var(--line)] bg-[var(--panel-elevated)] p-5 sm:p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Account & preferences</p>
            <h2 className="text-xl font-black tracking-tight">Your Co-Stream</h2>
          </div>
          <button onClick={onClose} className="icon-button"><X size={18} /></button>
        </div>

        <div className="mt-5 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-4 flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center text-xl font-black shrink-0">
            {profile?.photoUrl
              ? <img src={profile.photoUrl} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-black truncate">{displayName}</h3>
            <p className="text-xs text-[var(--text-muted)] truncate">{profile?.email || 'Local guest profile'}</p>
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-[var(--accent)]">
              {profile?.isGuest ? <UserRound size={12} /> : <Cloud size={12} />}
              {profile?.isGuest ? 'Guest mode' : 'Google account'}
            </span>
          </div>
          {profile?.isGuest && (
            <button onClick={signInGoogle} className="small-pill">Sign in</button>
          )}
        </div>

        {error && <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-[11px] text-amber-700 dark:text-amber-200">{error}</p>}

        <section className="settings-section">
          <div className="flex items-center gap-2 mb-3"><Sun size={16} className="text-[var(--accent)]" /><h3 className="text-sm font-black">Appearance</h3></div>
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[var(--panel)] p-1.5 border border-[var(--line)]">
            {[
              { id: 'SYSTEM' as const, label: 'System', icon: <Laptop size={15} /> },
              { id: 'LIGHT' as const, label: 'Light', icon: <Sun size={15} /> },
              { id: 'DARK' as const, label: 'Dark', icon: <Moon size={15} /> },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => setThemeMode(option.id)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition ${themeMode === option.id ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}`}
              >
                {option.icon}{option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="flex items-center gap-2"><Languages size={16} className="text-[var(--accent)]" /><h3 className="text-sm font-black">Discovery region</h3></div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 pb-1">
            {AVAILABLE_REGIONS.map((region) => (
              <button
                key={region.code}
                onClick={() => setDraftRegion(region.code)}
                className={`shrink-0 px-3 py-2 rounded-xl border text-xs font-bold ${draftRegion === region.code ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--line)] bg-[var(--panel)] text-[var(--text-muted)]'}`}
              >
                {region.flag} {region.name}
              </button>
            ))}
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-faint)] mt-4 mb-2">Preferred languages</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AVAILABLE_LANGUAGES.map((language) => {
              const selected = draftLanguages.includes(language.code);
              return (
                <button
                  key={language.code}
                  onClick={() => toggleLanguage(language.code)}
                  className={`p-2.5 rounded-2xl border flex items-center justify-between text-left ${selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--panel)]'}`}
                >
                  <span className="min-w-0">
                    <span className={`block text-xs font-bold ${selected ? 'text-[var(--accent)]' : ''}`}>{language.name}</span>
                    <span className="block text-[9px] text-[var(--text-faint)] truncate">{language.native}</span>
                  </span>
                  {selected && <Check size={14} className="text-[var(--accent)] shrink-0" />}
                </button>
              );
            })}
          </div>
          <button onClick={applyDiscovery} className="primary-button w-full mt-3">Apply discovery preferences</button>
        </section>

        <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3.5 flex gap-3">
          <ShieldCheck size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
            Your profile, theme, languages, watch progress, and playback preferences stay on this device unless you choose to sync them.
          </p>
        </div>

        <button
          onClick={() => { clearSession(); onClose(); }}
          className="w-full mt-4 py-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-500 text-xs font-black flex items-center justify-center gap-2"
        >
          <LogOut size={15} /> {profile?.isGuest ? 'Switch account' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
