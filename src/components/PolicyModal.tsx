import React, { useState } from 'react';
import {
  FileText,
  HelpCircle,
  Info,
  Mail,
  RotateCcw,
  Scale,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Language } from '../types/content';
import { POLICIES, type PolicyTabKey } from '../data/policyData';

interface PolicyModalProps {
  isOpen: boolean;
  initialTab?: PolicyTabKey;
  language: Language;
  onClose: () => void;
}

const TAB_ICONS: Record<PolicyTabKey, React.ComponentType<{ className?: string }>> = {
  about: Info,
  terms: Scale,
  privacy: ShieldCheck,
  refund: RotateCcw,
  copyright: FileText,
  contact: Mail,
};

export const PolicyModal: React.FC<PolicyModalProps> = ({
  isOpen,
  initialTab = 'terms',
  language,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<PolicyTabKey>(initialTab);

  // Sync initial tab when reopened
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const currentDocs = POLICIES[language] || POLICIES.bn;
  const activeDoc = currentDocs[activeTab] || currentDocs.terms;
  const tabKeys: PolicyTabKey[] = ['about', 'terms', 'privacy', 'refund', 'copyright', 'contact'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D13] to-[#0A090C] border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden text-[#F5F2EB]">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-white/[0.06] bg-[#120F16]/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500/20 to-transparent border border-red-500/30 text-[#EF4444]">
              <HelpCircle className="h-4 w-4" />
            </span>
            <div>
              <h2
                id="policy-dialog-title"
                className="font-editorial text-lg sm:text-xl font-bold text-[#F5F2EB] tracking-wide"
              >
                Goppo Kahini · {language === 'bn' ? 'আইনি ও সেবা নীতিসমূহ' : 'विधिक एवं सेवा नीतियां'}
              </h2>
              <p className="text-[11px] text-[#A69E95] font-mono-num">
                {language === 'bn' ? 'সর্বশেষ হালনাগাদ:' : 'अंतिम अद्यतन:'} {activeDoc.lastUpdated}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#A69E95] hover:text-[#F5F2EB] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation Strip */}
        <div className="px-4 sm:px-7 pt-3 pb-2 border-b border-white/[0.05] bg-[#0E0C12]/90 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {tabKeys.map((key) => {
            const doc = currentDocs[key];
            const Icon = TAB_ICONS[key];
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent border border-red-500/30 text-red-400 shadow-sm'
                    : 'bg-white/[0.03] hover:bg-white/[0.06] text-[#A69E95] hover:text-[#F5F2EB] border border-white/[0.04]'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#EF4444]' : 'text-[#8C847C]'}`} />
                <span>{doc.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 space-y-6 text-[#D5CEC5] text-sm leading-relaxed">
          {/* Document Header */}
          <div className="space-y-2 pb-4 border-b border-white/[0.06]">
            <h3 className="font-editorial text-xl sm:text-2xl font-bold text-[#F5F2EB]">
              {activeDoc.title}
            </h3>
            <p className="text-xs sm:text-sm text-[#A69E95] leading-relaxed">
              {activeDoc.intro}
            </p>
          </div>

          {/* Policy Sections */}
          <div className="space-y-6">
            {activeDoc.sections.map((section, idx) => (
              <section
                key={idx}
                className="space-y-2.5 p-4 sm:p-5 rounded-xl bg-gradient-to-b from-white/[0.025] to-transparent border border-white/[0.04]"
              >
                <h4 className="font-editorial text-base sm:text-lg font-semibold text-red-400">
                  {section.title}
                </h4>
                {section.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="text-xs sm:text-sm text-[#C8BFB5] leading-relaxed">
                    {p}
                  </p>
                ))}
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="space-y-1.5 pt-1 pl-1">
                    {section.bullets.map((b, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2 text-xs sm:text-sm text-[#B4ACA2]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444] mt-2 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-7 py-3.5 border-t border-white/[0.06] bg-[#0E0C12] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8C847C]">
          <p>
            {language === 'bn'
              ? '© ২০২৬ Goppo Kahini · সর্বস্বত্ব সংরক্ষিত ও আইনগতভাবে সুরক্ষিত।'
              : '© 2026 Goppo Kahini. सर्वाधिकार सुरक्षित।'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[#F5F2EB] font-medium transition-colors cursor-pointer"
          >
            {language === 'bn' ? 'বন্ধ করুন' : 'बंद करें'}
          </button>
        </div>
      </div>
    </div>
  );
};
