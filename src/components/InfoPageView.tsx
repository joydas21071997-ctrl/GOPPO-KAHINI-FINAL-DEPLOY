import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Info,
  Mail,
  RotateCcw,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import type { Language } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import { POLICIES } from '../data/policyData';
import { INFO_PAGE_PATHS, getRoutePath, type ActiveRoute, type InfoPageKey } from '../utils/routes';

interface InfoPageViewProps {
  page: InfoPageKey;
  language: Language;
  t: UIStrings;
  onNavigate: (route: ActiveRoute) => void;
}

const PAGE_ICONS: Record<InfoPageKey, React.ComponentType<{ className?: string }>> = {
  about: Info,
  terms: Scale,
  privacy: ShieldCheck,
  refund: RotateCcw,
  copyright: FileText,
  contact: Mail,
};

const PAGE_ORDER: InfoPageKey[] = [
  'about',
  'contact',
  'privacy',
  'terms',
  'copyright',
  'refund',
];

export const InfoPageView: React.FC<InfoPageViewProps> = ({
  page,
  language,
  t,
  onNavigate,
}) => {
  const currentDocs = POLICIES[language] || POLICIES.bn;
  const activeDoc = currentDocs[page] || currentDocs.about;
  const ActiveIcon = PAGE_ICONS[page] || Info;

  return (
    <div className="space-y-8 pb-12 max-w-4xl mx-auto">
      {/* Breadcrumb Back Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate({ view: 'home', category: 'audio' });
          }}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#B6ABA1] hover:text-[#F6F1E7] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t.cards.backToHome}</span>
        </a>

        <span className="text-xs text-[#A69E95] font-mono-num">
          {language === 'bn' ? 'সর্বশেষ হালনাগাদ:' : 'अंतिम अद्यतन:'} {activeDoc.lastUpdated}
        </span>
      </div>

      {/* Sub-navigation Links between About, Contact & Policy Pages */}
      <nav
        aria-label={language === 'bn' ? 'তথ্য ও নীতিমালা পাতা' : 'जानकारी एवं नीतियाँ'}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
      >
        {PAGE_ORDER.map((key) => {
          const doc = currentDocs[key];
          const Icon = PAGE_ICONS[key];
          const isCurrent = key === page;
          return (
            <a
              key={key}
              href={INFO_PAGE_PATHS[key]}
              onClick={(e) => {
                e.preventDefault();
                onNavigate({ view: 'page', page: key });
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                isCurrent
                  ? 'bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white shadow-sm'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#C8BFB5] border border-white/[0.06]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{doc.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Main Dedicated Document Card */}
      <article className="rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D13] to-[#0A090C] border border-white/[0.08] shadow-2xl shadow-black/60 p-6 sm:p-8 space-y-7 text-[#D5CEC5]">
        <header className="space-y-3 pb-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-transparent border border-red-500/30 text-[#EF4444] shrink-0">
              <ActiveIcon className="h-5 w-5" />
            </span>
            <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#F5F2EB] leading-snug">
              {activeDoc.title}
            </h1>
          </div>
          <p className="text-sm sm:text-base text-[#B6ABA1] leading-relaxed">
            {activeDoc.intro}
          </p>
        </header>

        <div className="space-y-5">
          {activeDoc.sections.map((section, idx) => (
            <section
              key={idx}
              className="space-y-3 p-4 sm:p-6 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.05]"
            >
              <h2 className="font-editorial text-lg sm:text-xl font-semibold text-red-400">
                {section.title}
              </h2>
              {section.paragraphs.map((p, pIdx) => (
                <p key={pIdx} className="text-sm text-[#C8BFB5] leading-relaxed">
                  {p}
                </p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="space-y-2 pt-1 pl-1">
                  {section.bullets.map((b, bIdx) => (
                    <li key={bIdx} className="flex items-start gap-2.5 text-sm text-[#B4ACA2]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444] mt-2 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* Helpful Internal Links Strip */}
        <footer className="pt-5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={getRoutePath({ view: 'all_stories', category: 'all' })}
              onClick={(e) => {
                e.preventDefault();
                onNavigate({ view: 'all_stories', category: 'all' });
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white text-xs sm:text-sm font-semibold hover:brightness-110 transition-all cursor-pointer"
            >
              <BookOpen className="h-4 w-4" />
              <span>{t.nav.stories}</span>
            </a>
            <a
              href={getRoutePath({ view: 'all_stories', category: 'free' })}
              onClick={(e) => {
                e.preventDefault();
                onNavigate({ view: 'all_stories', category: 'free' });
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs sm:text-sm font-medium text-[#F5F2EB] transition-colors cursor-pointer"
            >
              <span>{t.nav.free}</span>
            </a>
          </div>

          <a
            href="/contact"
            onClick={(e) => {
              e.preventDefault();
              onNavigate({ view: 'page', page: 'contact' });
            }}
            className="text-xs sm:text-sm text-[#EF4444] hover:text-red-300 font-mono-num"
          >
            hello@goppokahini.in
          </a>
        </footer>
      </article>
    </div>
  );
};
