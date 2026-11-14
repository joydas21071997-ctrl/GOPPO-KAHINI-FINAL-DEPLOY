import React, { useEffect, useState } from 'react';
import { GoppoKahiniLogo } from './GoppoKahiniLogo';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Show splash for 2.2 seconds then fade out
    const timer = setTimeout(() => {
      setFading(true);
      const fadeTimer = setTimeout(() => {
        onFinish();
      }, 500);
      return () => clearTimeout(fadeTimer);
    }, 2200);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#580E0E] via-[#2F0808] to-[#140303] text-white transition-opacity duration-500 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center space-y-6 animate-in fade-in zoom-in duration-700">
        <div className="p-5 rounded-3xl bg-black/40 border border-red-500/30 shadow-2xl backdrop-blur-xl">
          <GoppoKahiniLogo />
        </div>
        <div className="space-y-1 text-center">
          <h1 className="font-editorial text-2xl sm:text-3xl font-bold tracking-wide text-[#F6F1E7]">
            Goppo Kahini
          </h1>
          <p className="text-xs sm:text-sm text-red-300 font-medium tracking-wider uppercase">
            Cinematic Audio &amp; Video Stories
          </p>
        </div>
        <div className="w-12 h-1 rounded-full bg-red-500/50 overflow-hidden mt-4">
          <div className="h-full bg-red-400 animate-pulse w-full" />
        </div>
      </div>
    </div>
  );
};
