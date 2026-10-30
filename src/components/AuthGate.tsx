'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { UserRound } from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';

export type CoProfile = {
  uid: string;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
  isGuest: boolean;
};

const GUEST_KEY = 'co_guest_profile';
export const AUTH_EVENT = 'co-auth';
let currentProfile: CoProfile | null = null;

function storedGuest(): CoProfile | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? JSON.parse(raw) as CoProfile : null;
  } catch (_) {
    return null;
  }
}

function firebaseProfile(user: User): CoProfile {
  return {
    uid: user.uid,
    name: user.displayName?.trim() || user.email?.split('@')[0] || 'Viewer',
    email: user.email,
    photoUrl: user.photoURL,
    isGuest: false,
  };
}

export function getSession() {
  return currentProfile;
}

export async function clearSession() {
  try { localStorage.removeItem(GUEST_KEY); } catch (_) {}
  currentProfile = null;
  window.dispatchEvent(new Event(AUTH_EVENT));
  if (isFirebaseConfigured) {
    try { await firebaseSignOut(getFirebaseAuth()); } catch (_) {}
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<CoProfile | null>(null);

  useEffect(() => {
    const apply = (next: CoProfile | null) => {
      const changed = currentProfile?.uid !== next?.uid;
      currentProfile = next;
      setProfile(next);
      if (changed) window.dispatchEvent(new Event(AUTH_EVENT));
    };
    const refresh = () => apply(currentProfile || storedGuest());

    if (isFirebaseConfigured) {
      const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
        if (user) {
          localStorage.removeItem(GUEST_KEY);
          apply(firebaseProfile(user));
        } else {
          apply(storedGuest());
        }
        setChecking(false);
      });
      window.addEventListener(AUTH_EVENT, refresh);
      return () => {
        unsubscribe();
        window.removeEventListener(AUTH_EVENT, refresh);
      };
    }

    apply(storedGuest());
    setChecking(false);
    window.addEventListener(AUTH_EVENT, refresh);
    return () => window.removeEventListener(AUTH_EVENT, refresh);
  }, []);

  if (checking || profile) return <>{children}</>;
  return <WelcomeScreen />;
}

function WelcomeScreen() {
  const [showGuest, setShowGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInGoogle = async () => {
    if (!isFirebaseConfigured) {
      setError('Google sign-in is optional and is not configured. Continue as guest, or add Firebase values to .env.local.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
    } catch (caught) {
      const code = (caught as { code?: string }).code || '';
      if (code !== 'auth/popup-closed-by-user') {
        setError(code === 'auth/unauthorized-domain'
          ? 'Add this host to Firebase Authentication → Authorized domains.'
          : 'Google sign-in failed. You can continue as guest.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#05080d] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(39,231,169,0.22),transparent_34%),radial-gradient(circle_at_88%_76%,rgba(111,91,255,0.24),transparent_36%)]" />
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.7) 1px,transparent 1px)', backgroundSize: '42px 42px' }} />

      <div className="relative h-full max-w-6xl mx-auto px-6 py-10 flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-20">
        <div className="max-w-xl text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7fffd2]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7fffd2] animate-pulse" />
            Your cinema, your queue
          </div>
          <div className="flex items-center justify-center lg:justify-start gap-4 mt-7">
            <div className="relative w-20 h-20 rounded-[24px] overflow-hidden shadow-[0_24px_70px_rgba(112,136,255,.28)]"><Image src="/icon-192.png" alt="Co-Stream" fill sizes="80px" className="object-cover" priority /></div>
            <div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-[-0.05em]">Co-Stream</h1>
              <p className="text-sm font-semibold text-white/45 mt-1">Watch together. Keep every story close.</p>
            </div>
          </div>
          <p className="mt-7 text-base sm:text-lg leading-relaxed text-white/60 max-w-lg">
            Discover films and series, browse every season and episode, build lists, and watch in a modern player.
          </p>
        </div>

        <div className="w-full max-w-sm rounded-[30px] border border-white/14 bg-white/[0.07] backdrop-blur-2xl p-6 shadow-2xl">
          <h2 className="text-xl font-black">Start watching</h2>
          <p className="text-xs text-white/45 mt-1.5 mb-5">Your library is stored on this device in guest mode.</p>
          <button
            onClick={signInGoogle}
            disabled={busy}
            className="w-full h-13 rounded-2xl bg-white text-black flex items-center justify-center gap-3 text-sm font-bold active:scale-[.98] disabled:opacity-60"
          >
            {busy ? <span className="w-5 h-5 rounded-full border-2 border-black/20 border-t-black animate-spin" /> : <GoogleGlyph />}
            Continue with Google
          </button>
          <div className="flex items-center gap-3 my-4 text-[10px] uppercase tracking-widest text-white/25"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
          <button
            onClick={() => setShowGuest(true)}
            className="w-full h-13 rounded-2xl border border-white/14 bg-white/[0.06] flex items-center justify-center gap-2.5 text-sm font-bold active:scale-[.98]"
          >
            <UserRound size={18} /> Browse as guest
          </button>
          {error && <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-[11px] leading-relaxed text-amber-100">{error}</p>}
        </div>
      </div>

      {showGuest && <GuestDialog onClose={() => setShowGuest(false)} />}
    </div>
  );
}

function GuestDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const continueAsGuest = () => {
    const guest: CoProfile = {
      uid: `guest-${Date.now()}`,
      name: name.trim() || 'Guest',
      isGuest: true,
      email: null,
      photoUrl: null,
    };
    localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
    currentProfile = guest;
    window.dispatchEvent(new Event(AUTH_EVENT));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-lg flex items-center justify-center p-5" onClick={onClose}>
      <div className="w-full max-w-xs rounded-[28px] bg-[#111820] border border-white/12 p-6" onClick={(event) => event.stopPropagation()}>
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#7fffd2]/10 text-[#7fffd2] flex items-center justify-center"><UserRound size={25} /></div>
        <h3 className="text-center text-lg font-black mt-4">What should we call you?</h3>
        <p className="text-center text-xs text-white/45 mt-1">You can change accounts later.</p>
        <input
          autoFocus
          value={name}
          maxLength={24}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && continueAsGuest()}
          placeholder="Your name"
          className="w-full mt-5 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-center text-sm outline-none focus:border-[#7fffd2]/60"
        />
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={onClose} className="py-3 rounded-2xl bg-white/[0.06] text-xs font-bold text-white/60">Cancel</button>
          <button onClick={continueAsGuest} className="py-3 rounded-2xl bg-[#7fffd2] text-[#03100d] text-xs font-black">Continue</button>
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
