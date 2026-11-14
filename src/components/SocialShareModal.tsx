import React, { useState } from 'react';
import { Check, Copy, Share2, Facebook, Twitter, Linkedin, MessageCircle, X } from 'lucide-react';
import type { UIStrings } from '../i18n/translations';

interface SocialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  url?: string;
  t: UIStrings;
}

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  isOpen,
  onClose,
  title,
  url = window.location.href,
  t,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(`${title} — Goppo Kahini`);

  const shareLinks = [
    {
      name: 'Facebook',
      icon: <Facebook className="h-5 w-5 text-blue-400" />,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      bg: 'hover:bg-blue-500/10 border-blue-500/30',
    },
    {
      name: 'WhatsApp',
      icon: <MessageCircle className="h-5 w-5 text-emerald-400" />,
      href: `https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`,
      bg: 'hover:bg-emerald-500/10 border-emerald-500/30',
    },
    {
      name: 'Twitter / X',
      icon: <Twitter className="h-5 w-5 text-sky-400" />,
      href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      bg: 'hover:bg-sky-500/10 border-sky-500/30',
    },
    {
      name: 'LinkedIn',
      icon: <Linkedin className="h-5 w-5 text-blue-600" />,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      bg: 'hover:bg-blue-600/10 border-blue-600/30',
    },
  ];

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-3xl bg-[#1A0C0C] border border-red-500/30 p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#F5F2EB]">
            <Share2 className="h-5 w-5 text-[#EF4444]" />
            <h2 className="font-editorial text-xl font-bold">সোশ্যাল মিডিয়ায় শেয়ার করুন</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-[#D1C5C5] truncate font-medium">{title}</p>
          <div className="grid grid-cols-2 gap-3">
            {shareLinks.map((item) => (
              <a
                key={item.name}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] ${item.bg} text-xs font-semibold text-[#F5F2EB] transition-all`}
              >
                {item.icon}
                <span>{item.name}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-white/[0.06]">
          <label className="block text-xs font-medium text-[#D1C5C5]">লিংক কপি করুন</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={url}
              className="flex-1 h-10 px-3 rounded-xl bg-[#0F0707] border border-white/[0.08] text-xs text-[#D1C5C5] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white text-xs font-semibold hover:brightness-110 flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>{copied ? 'কপি হয়েছে!' : 'কপি'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
