import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Suppress button when already running as an installed PWA
  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#EF4444] hover:brightness-110 text-white font-semibold shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0 ${
          compact ? 'h-9 px-2.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
        }`}
        title="অ্যাপ হিসেবে ফোনে/পিসিতে ইনস্টল করুন"
      >
        <Download className="h-3.5 w-3.5" />
        <span className={compact ? 'hidden xl:inline' : ''}>অ্যাপ ইনস্টল</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-[#F5F2EB] font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            compact ? 'h-9 px-2.5 text-xs' : 'px-3 py-1.5 text-xs'
          }`}
        >
          <Smartphone className="h-3.5 w-3.5 text-[#EF4444]" />
          <span className={compact ? 'hidden xl:inline' : ''}>iOS অ্যাপ</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#141118] border border-white/10 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-editorial text-lg font-bold text-[#F5F2EB]">
                  iPhone / iPad-এ ইনস্টল করুন
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-[#A69E95] hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-[#C8BFB5] leading-relaxed">
                ১. Safari ব্রাউজারের নিচের <strong>Share</strong> বাটনে ট্যাপ করুন।
                <br />
                ২. নিচে স্ক্রল করে <strong>Add to Home Screen</strong> নির্বাচন করুন।
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-gradient-to-r from-[#DC2626] to-[#EF4444] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                বুঝেছি
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600/95 px-3 py-1.5 text-xs font-medium text-white shadow-lg border border-amber-400/40 backdrop-blur-md">
      <WifiOff className="h-3.5 w-3.5 animate-pulse" />
      <span>অফলাইন মোড — সংরক্ষিত তথ্য ব্যবহৃত হচ্ছে</span>
    </div>
  );
};
