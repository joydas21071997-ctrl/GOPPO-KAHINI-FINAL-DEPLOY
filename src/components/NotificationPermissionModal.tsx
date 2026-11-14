import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

export const NotificationPermissionModal: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    console.log('Notification permission check:', 'Notification' in window, Notification.permission);
    // Check if permission already granted or denied
    if ('Notification' in window && Notification.permission === 'default') {
      // Small delay to ensure app load is complete
      const timer = setTimeout(() => {
        console.log('Setting modal visible');
        setIsVisible(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const requestPermission = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Permission granted, you could potentially show a success toast here
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-sm rounded-3xl bg-[#1F0B0B] border border-red-500/30 p-6 shadow-2xl space-y-4 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <Bell className="h-8 w-8 text-[#EF4444]" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-editorial font-bold text-[#F5F2EB]">আপডেট পেতে থাকুন</h2>
          <p className="text-sm text-[#D1C5C5]">
            নতুন গল্প বা ভিডিও আসার সাথে সাথে নোটিফিকেশন পেতে অনুমতি দিন।
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            className="px-4 py-2.5 rounded-xl bg-white/[0.04] text-[#D1C5C5] text-sm font-semibold hover:bg-white/[0.08] cursor-pointer"
          >
            পরে
          </button>
          <button
            type="button"
            onClick={requestPermission}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white text-sm font-semibold hover:brightness-110 cursor-pointer shadow-lg"
          >
            অনুমতি দিন
          </button>
        </div>
      </div>
    </div>
  );
};
