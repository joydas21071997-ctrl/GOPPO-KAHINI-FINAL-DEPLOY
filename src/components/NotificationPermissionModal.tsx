import React, { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import {
  auth,
  getExistingFcmTokenIfGranted,
  requestAndGenerateFcmToken,
  subscribeForegroundPushMessages,
} from '../firebase';
import { saveFcmTokenToFirestore } from '../services/firestoreService';
import type { Language, UserProfile } from '../types/content';

const PENDING_FCM_TOKEN_KEY = 'goppo_pending_fcm_token';
const DISMISSED_PROMPT_KEY = 'goppo_notif_prompt_dismissed_at';

interface NotificationPermissionModalProps {
  language?: Language;
  user?: UserProfile | null;
  authToken?: string | null;
  onNavigateUrl?: (path: string) => void;
}

interface ForegroundPushToast {
  title: string;
  body: string;
  url?: string;
}

export const NotificationPermissionModal: React.FC<NotificationPermissionModalProps> = ({
  language = 'bn',
  user = null,
  authToken = null,
  onNavigateUrl,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [foregroundToast, setForegroundToast] = useState<ForegroundPushToast | null>(null);

  const syncTokenWithAccount = useCallback(
    async (fcmToken: string) => {
      const cleanToken = (fcmToken || '').trim();
      if (!cleanToken) return;

      try {
        localStorage.setItem(PENDING_FCM_TOKEN_KEY, cleanToken);
      } catch {
        // Ignore storage unavailability
      }

      const firebaseUid = auth?.currentUser?.uid;
      if (firebaseUid && auth?.currentUser?.emailVerified) {
        try {
          await saveFcmTokenToFirestore(firebaseUid, cleanToken, language);
          try {
            localStorage.removeItem(PENDING_FCM_TOKEN_KEY);
          } catch {
            // Ignore
          }
        } catch {
          // Handled inside saveFcmTokenToFirestore; backend sync still runs below
        }
      }

      if (authToken) {
        try {
          await fetch('/api/notifications/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              token: cleanToken,
              platform: 'web',
              language,
            }),
          });
        } catch {
          // Static hosting fallback when Express API is absent
        }
      }
    },
    [authToken, language],
  );

  // Prompt if browser permission is still 'default'
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try {
        const dismissedAt = Number(sessionStorage.getItem(DISMISSED_PROMPT_KEY) || '0');
        if (dismissedAt && Date.now() - dismissedAt < 6 * 60 * 60 * 1000) {
          return;
        }
      } catch {
        // Ignore
      }
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Auto-link FCM token when authenticated user signs in (either from pending token or already granted permission)
  useEffect(() => {
    if (!user && !auth?.currentUser?.uid) return;
    let cancelled = false;

    void (async () => {
      let tokenToSync: string | null = null;
      try {
        tokenToSync = localStorage.getItem(PENDING_FCM_TOKEN_KEY);
      } catch {
        // Ignore
      }
      if (!tokenToSync && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        tokenToSync = await getExistingFcmTokenIfGranted();
      }
      if (tokenToSync && !cancelled) {
        await syncTokenWithAccount(tokenToSync);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authToken, syncTokenWithAccount]);

  // Listen for foreground FCM messages while user is browsing
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    void subscribeForegroundPushMessages((payload) => {
      if (cancelled) return;
      const title =
        payload.notification?.title || payload.data?.title || 'গল্পকাহিনি (Goppo Kahini)';
      const body = payload.notification?.body || payload.data?.body || '';
      const url = payload.fcmOptions?.link || payload.data?.url;
      setForegroundToast({ title, body, url });
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unsub = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    if (!foregroundToast) return;
    const timer = setTimeout(() => setForegroundToast(null), 8000);
    return () => clearTimeout(timer);
  }, [foregroundToast]);

  const handleLater = () => {
    try {
      sessionStorage.setItem(DISMISSED_PROMPT_KEY, String(Date.now()));
    } catch {
      // Ignore
    }
    setIsVisible(false);
  };

  const requestPermission = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await requestAndGenerateFcmToken();
      if (result.token) {
        await syncTokenWithAccount(result.token);
        setFeedback(
          language === 'hi'
            ? 'सूचनाएं सफलतापूर्वक सक्रिय हो गईं!'
            : 'নোটিফিকেশন সফলভাবে চালু হয়েছে!',
        );
        setTimeout(() => setIsVisible(false), 900);
      } else if (result.permission === 'denied') {
        setIsVisible(false);
      } else {
        setFeedback(
          language === 'hi'
            ? 'इस ब्राउज़र में पुश नोटिफिकेशन उपलब्ध नहीं है।'
            : 'এই ব্রাউজারে পুশ নোটিফিকেশন সক্রিয় করা যায়নি।',
        );
        setTimeout(() => setIsVisible(false), 1400);
      }
    } catch {
      setIsVisible(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {foregroundToast && (
        <div className="fixed bottom-20 right-4 z-[60] max-w-sm rounded-2xl bg-[#1F0B0B] border border-red-500/40 p-4 shadow-2xl text-[#F5F2EB] flex items-start gap-3 animate-in fade-in duration-200">
          <div className="h-9 w-9 shrink-0 rounded-full bg-red-500/20 flex items-center justify-center">
            <Bell className="h-4 w-4 text-[#EF4444]" />
          </div>
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => {
              if (foregroundToast.url && onNavigateUrl && foregroundToast.url.startsWith('/')) {
                onNavigateUrl(foregroundToast.url);
              }
              setForegroundToast(null);
            }}
          >
            <p className="text-sm font-bold truncate">{foregroundToast.title}</p>
            {foregroundToast.body && (
              <p className="text-xs text-[#D1C5C5] mt-0.5 line-clamp-2">{foregroundToast.body}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setForegroundToast(null)}
            className="p-1 text-[#A69E95] hover:text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm rounded-3xl bg-[#1F0B0B] border border-red-500/30 p-6 shadow-2xl space-y-4 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <Bell className="h-8 w-8 text-[#EF4444]" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-editorial font-bold text-[#F5F2EB]">
                {language === 'hi' ? 'नए अपडेट प्राप्त करें' : 'আপডেট পেতে থাকুন'}
              </h2>
              <p className="text-sm text-[#D1C5C5]">
                {language === 'hi'
                  ? 'नई कहानियां या वीडियो आने पर तुरंत नोटिफिकेशन पाने के लिए अनुमति दें।'
                  : 'নতুন গল্প বা ভিডিও আসার সাথে সাথে নোটিফিকেশন পেতে অনুমতি দিন।'}
              </p>
              {feedback && (
                <p className="text-xs font-semibold text-emerald-300 pt-1">{feedback}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleLater}
                className="px-4 py-2.5 rounded-xl bg-white/[0.04] text-[#D1C5C5] text-sm font-semibold hover:bg-white/[0.08] cursor-pointer disabled:opacity-50"
              >
                {language === 'hi' ? 'बाद में' : 'পরে'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={requestPermission}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white text-sm font-semibold hover:brightness-110 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {busy
                  ? language === 'hi'
                    ? 'सक्रिय हो रहा है...'
                    : 'চালু হচ্ছে...'
                  : language === 'hi'
                    ? 'अनुमति दें'
                    : 'অনুমতি দিন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
