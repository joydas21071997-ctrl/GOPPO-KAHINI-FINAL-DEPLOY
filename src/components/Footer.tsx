import React from 'react';
import { FileText, HelpCircle, Key, Mail, RotateCcw, Scale, ShieldCheck } from 'lucide-react';
import type { Language } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import { GoppoKahiniLogo } from './GoppoKahiniLogo';
import type { ActiveRoute } from './Header';
import type { PolicyTabKey } from '../data/policyData';

interface FooterProps {
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  t: UIStrings;
  onNavigate: (route: ActiveRoute) => void;
  onOpenPolicy: (tab: PolicyTabKey) => void;
}

export const Footer: React.FC<FooterProps> = ({
  language,
  onChangeLanguage,
  t,
  onNavigate,
  onOpenPolicy,
}) => {
  return (
    <footer className="mt-20 border-t border-white/[0.06] bg-gradient-to-b from-[#0C0A0E] via-[#09080B] to-[#050406]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 space-y-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Brand & About Column (5 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <GoppoKahiniLogo onClick={() => onNavigate({ view: 'home', category: 'audio' })} />
            <p className="text-xs sm:text-sm text-[#9E968F] leading-relaxed max-w-sm">
              {t.footer.aboutText}
            </p>
            <div className="pt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] text-[#A69E95] font-mono-num">
                <ShieldCheck className="h-3.5 w-3.5 text-[#EF4444]" />
                <span>{language === 'bn' ? 'ডিজিটাল কপিরাইট সুরক্ষিত' : 'डिजिटल कॉपीराइट सुरक्षित'}</span>
              </span>
            </div>
          </div>

          {/* Core Categories & Navigation (2 cols) */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-[#EF4444] tracking-wider uppercase">
              {language === 'bn' ? 'বিভাগ ও নেভিগেশন' : 'श्रेणियाँ एवं नेविगेशन'}
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[#9E968F]">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ view: 'all_stories', category: 'all' })}
                  className="hover:text-[#F5F2EB] transition-colors cursor-pointer"
                >
                  {t.nav.stories}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ view: 'all_stories', category: 'audio' })}
                  className="hover:text-[#F5F2EB] transition-colors cursor-pointer"
                >
                  {t.nav.audio}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ view: 'all_stories', category: 'animation' })}
                  className="hover:text-[#F5F2EB] transition-colors cursor-pointer"
                >
                  {t.nav.animation}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ view: 'all_stories', category: 'free' })}
                  className="hover:text-emerald-300 transition-colors cursor-pointer text-emerald-400"
                >
                  {t.nav.free}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ view: 'all_stories', category: 'premium' })}
                  className="hover:text-[#F5F2EB] transition-colors cursor-pointer text-[#EF4444]"
                >
                  {t.nav.premium}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ view: 'library', initialTab: 'my_stories' })}
                  className="hover:text-[#F5F2EB] transition-colors cursor-pointer"
                >
                  {t.nav.library}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ view: 'library', initialTab: 'account' })}
                  className="hover:text-[#F5F2EB] transition-colors cursor-pointer"
                >
                  {t.nav.loginRegister}
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Policy Pages (3 cols) - Direct links requested by user */}
          <div className="lg:col-span-3 space-y-3">
            <h3 className="text-xs font-semibold text-[#EF4444] tracking-wider uppercase flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5" />
              <span>{language === 'bn' ? 'আইনি ও নীতিমালা' : 'विधिक एवं नीतियां'}</span>
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[#9E968F]">
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('terms')}
                  className="hover:text-red-400 transition-colors text-left flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5 text-[#A69E95] shrink-0" />
                  <span>{language === 'bn' ? 'ব্যবহারের শর্তাবলী (Terms)' : 'उपयोग की शर्तें'}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('privacy')}
                  className="hover:text-red-400 transition-colors text-left flex items-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-[#A69E95] shrink-0" />
                  <span>{language === 'bn' ? 'গোপনীয়তা নীতি (Privacy)' : 'गोपनीयता नीति'}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('refund')}
                  className="hover:text-red-400 transition-colors text-left flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#A69E95] shrink-0" />
                  <span>{language === 'bn' ? 'রিফান্ড ও বাতিলকরণ নীতি' : 'रिफंड एवं रद्दीकरण'}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('copyright')}
                  className="hover:text-red-400 transition-colors text-left flex items-center gap-2 cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-[#A69E95] shrink-0" />
                  <span>{language === 'bn' ? 'মেধাস্বত্ব ও কপিরাইট নীতি' : 'कॉपीराइट नीति'}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('contact')}
                  className="hover:text-red-400 transition-colors text-left flex items-center gap-2 cursor-pointer"
                >
                  <Mail className="h-3.5 w-3.5 text-[#A69E95] shrink-0" />
                  <span>{language === 'bn' ? 'সহায়তা ও যোগাযোগ' : 'सहायता और संपर्क'}</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Content Protection & Compliance Notice (3 cols) */}
          <div className="lg:col-span-3 space-y-3">
            <h3 className="text-xs font-semibold text-[#EF4444] tracking-wider uppercase">
              {t.footer.protectionHeading}
            </h3>
            <p className="text-xs text-[#9E968F] leading-relaxed">
              {t.footer.protectionNotice}
            </p>
            <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.05] text-[11px] text-[#A69E95] space-y-1">
              <p className="font-semibold text-[#F5F2EB]">
                {language === 'bn' ? 'গ্রাহক সহায়তা ডেস্ক' : 'ग्राहक सहायता डेस्क'}
              </p>
              <p className="font-mono-num text-[#EF4444]">hello@goppokahini.in</p>
              <p>{language === 'bn' ? 'সকাল ১০টা - রাত ৮টা (সোম-রবি)' : 'सुबह 10:00 - रात 8:00 (सोम-रवि)'}</p>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright, Language Selector & Discreet Admin Key */}
        <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8C847C]">
          <p>{t.footer.copyright}</p>
          <div className="flex items-center gap-3">
            <span className="text-[#6D6660]">{t.switchLanguagePrompt}:</span>
            <button
              type="button"
              onClick={() => onChangeLanguage('bn')}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                language === 'bn'
                  ? 'bg-red-500/20 text-red-300 font-semibold border border-red-500/30'
                  : 'hover:text-[#F5F2EB]'
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              onClick={() => onChangeLanguage('hi')}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                language === 'hi'
                  ? 'bg-red-500/20 text-red-300 font-semibold border border-red-500/30'
                  : 'hover:text-[#F5F2EB]'
              }`}
            >
              हिंदी
            </button>

            {/* Small discreet key icon for instant Admin Panel entrance requested by user */}
            <span className="text-white/10" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'admin' })}
              title={language === 'bn' ? 'এডমিন স্টুডিও (Admin Studio)' : 'एडमिन स्टूडियो'}
              className="inline-flex items-center justify-center h-6 w-6 rounded text-[#6D6660] hover:text-[#EF4444] hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Admin Studio Key"
            >
              <Key className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
