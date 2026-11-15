import React, { useState } from 'react';
import { Crown, Menu, Search, Sparkles, User, X, BookOpen, Headphones, Film, Home, Library } from 'lucide-react';
import type { CategoryConfig, ContentCategory, Language, UserProfile } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import { GoppoKahiniLogo } from './GoppoKahiniLogo';
import { PWAInstallButton } from './PWAInstallButton';

export type StoryCollectionFilter = ContentCategory | 'all' | 'free' | 'premium';

export type ActiveRoute =
  | { view: 'home'; category?: ContentCategory }
  | { view: 'all_stories'; category?: StoryCollectionFilter }
  | { view: 'story'; storyId: string }
  | { view: 'npass' }
  | { view: 'library'; initialTab?: string }
  | { view: 'admin' };

interface HeaderProps {
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  t: UIStrings;
  categories: CategoryConfig[];
  activeRoute: ActiveRoute;
  onNavigate: (route: ActiveRoute) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  user: UserProfile | null;
}

export const Header: React.FC<HeaderProps> = ({
  language,
  onChangeLanguage,
  t,
  activeRoute,
  onNavigate,
  searchQuery,
  onSearchChange,
  user,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleNavClick = (route: ActiveRoute) => {
    onNavigate(route);
    setMobileMenuOpen(false);
  };

  const navItems: Array<{
    id: string;
    label: string;
    route: ActiveRoute;
    isActive: boolean;
    icon: React.ReactNode;
  }> = [
    {
      id: 'home',
      label: t.nav.home,
      route: { view: 'home', category: 'audio' },
      isActive: activeRoute.view === 'home',
      icon: <Home className="h-4 w-4 text-[#EF4444]" />,
    },
    {
      id: 'stories',
      label: t.nav.stories,
      route: { view: 'all_stories', category: 'all' },
      isActive: activeRoute.view === 'all_stories' && (!activeRoute.category || activeRoute.category === 'all'),
      icon: <BookOpen className="h-4 w-4 text-[#EF4444]" />,
    },
    {
      id: 'audio',
      label: t.nav.audio,
      route: { view: 'all_stories', category: 'audio' },
      isActive: activeRoute.view === 'all_stories' && activeRoute.category === 'audio',
      icon: <Headphones className="h-4 w-4 text-[#EF4444]" />,
    },
    {
      id: 'animation',
      label: t.nav.animation,
      route: { view: 'all_stories', category: 'animation' },
      isActive:
        activeRoute.view === 'all_stories' &&
        (activeRoute.category === 'animation' || activeRoute.category === 'films'),
      icon: <Film className="h-4 w-4 text-[#EF4444]" />,
    },
    {
      id: 'premium',
      label: t.nav.premium,
      route: { view: 'all_stories', category: 'premium' },
      isActive:
        (activeRoute.view === 'all_stories' && activeRoute.category === 'premium') ||
        activeRoute.view === 'npass',
      icon: <Crown className="h-4 w-4 text-[#EF4444]" />,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#260D0D]/95 backdrop-blur-xl border-b border-white/[0.06] transition-colors">
      <div className="mx-auto max-w-7xl px-2.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Mobile Hamburger + Brand Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#A69E95] hover:text-[#F5F2EB] hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-[#EF4444] cursor-pointer"
            aria-label="Toggle Menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <GoppoKahiniLogo
            compact
            onClick={() => {
              onSearchChange('');
              handleNavClick({ view: 'home', category: 'audio' });
            }}
          />
        </div>

        {/* Zone 2: Clean Primary Top Navigation */}
        <nav className="hidden lg:flex items-center gap-1 text-sm font-medium overflow-x-auto no-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSearchChange('');
                handleNavClick(item.route);
              }}
              className={`relative px-3 py-1.5 rounded-xl text-xs xl:text-sm transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                item.isActive
                  ? 'bg-gradient-to-r from-red-500/15 via-red-500/10 to-transparent border border-red-500/30 text-red-300 font-semibold shadow-sm'
                  : 'text-[#C8BFB5] hover:text-[#F5F2EB] hover:bg-white/[0.04]'
              }`}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              handleNavClick({
                view: 'library',
                initialTab: user ? 'my_stories' : 'purchased',
              });
            }}
            className={`relative px-3 py-1.5 rounded-xl text-xs xl:text-sm transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeRoute.view === 'library' && activeRoute.initialTab !== 'account'
                ? 'bg-gradient-to-r from-red-500/15 via-red-500/10 to-transparent border border-red-500/30 text-red-300 font-semibold shadow-sm'
                : 'text-[#C8BFB5] hover:text-[#F5F2EB] hover:bg-white/[0.04]'
            }`}
          >
            {t.nav.library}
          </button>

          {(user?.role === 'admin' || user?.role === 'editor') && (
            <button
              type="button"
              onClick={() => handleNavClick({ view: 'admin' })}
              className={`px-3 py-1.5 rounded-xl text-xs xl:text-sm font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeRoute.view === 'admin'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                  : 'text-red-400 hover:bg-red-500/10'
              }`}
            >
              {t.nav.admin}
            </button>
          )}
        </nav>

        {/* Zone 3: Search + Language Switcher (বাংলা | हिंदी) + Profile / Login-Register */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Desktop inline search or toggle */}
          <div className="hidden md:flex items-center">
            {searchOpen || searchQuery ? (
              <div className="relative flex items-center">
                <Search className="h-4 w-4 text-[#9E968F] absolute left-3 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    onSearchChange(e.target.value);
                    if (activeRoute.view !== 'home') {
                      onNavigate({ view: 'home', category: 'audio' });
                    }
                  }}
                  placeholder={t.nav.searchPlaceholder}
                  aria-label={t.nav.searchPlaceholder}
                  className="w-48 lg:w-56 xl:w-64 h-9 pl-9 pr-8 rounded-xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.1] text-xs sm:text-sm text-[#F5F2EB] placeholder:text-[#9E968F] focus:outline-none focus:border-red-500/40 transition-all shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    setSearchOpen(false);
                  }}
                  className="absolute right-2.5 text-[#9E968F] hover:text-[#F5F2EB] cursor-pointer"
                  aria-label={t.nav.clearSearch}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#C8BFB5] hover:text-[#F5F2EB] hover:bg-white/[0.05] transition-colors cursor-pointer"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Mobile Search Trigger */}
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#C8BFB5] hover:text-[#F5F2EB] hover:bg-white/[0.05] cursor-pointer"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Compact Language Dropdown Selector */}
          <div className="relative">
            <select
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value as Language)}
              aria-label={t.switchLanguagePrompt}
              className="h-9 px-2 sm:px-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs font-semibold text-[#F5F2EB] focus:outline-none focus:border-red-500/50 cursor-pointer"
            >
              <option value="bn" className="bg-[#1F0B0B] text-[#F5F2EB]">বাংলা (BN)</option>
              <option value="hi" className="bg-[#1F0B0B] text-[#F5F2EB]">हिंदी (HI)</option>
            </select>
          </div>

          <PWAInstallButton compact />

          {/* Profile / Free Login & Registration Button */}
          <button
            type="button"
            onClick={() =>
              handleNavClick({
                view: 'library',
                initialTab: 'account',
              })
            }
            className="inline-flex h-9 px-2.5 sm:px-3 items-center gap-1.5 rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/[0.1] text-xs font-medium text-[#F5F2EB] hover:border-red-500/40 hover:bg-white/[0.08] transition-all whitespace-nowrap shrink-0 cursor-pointer"
            aria-label={user ? user.name : t.nav.loginRegister}
          >
            <User className="h-3.5 w-3.5 text-[#EF4444]" />
            <span className="hidden sm:inline max-w-[125px] truncate">
              {user ? user.name : t.nav.loginRegister}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Expandable Search Input */}
      {searchOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#1A0808]/95 px-4 py-2.5">
          <div className="relative flex items-center">
            <Search className="h-4 w-4 text-[#9E968F] absolute left-3 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (activeRoute.view !== 'home') {
                  onNavigate({ view: 'home', category: 'audio' });
                }
              }}
              placeholder={t.nav.searchPlaceholder}
              className="w-full h-10 pl-9 pr-9 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-[#F5F2EB] placeholder:text-[#9E968F] focus:outline-none focus:border-red-500/40"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-3 text-[#9E968F] hover:text-[#F5F2EB]"
                aria-label={t.nav.clearSearch}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile Hamburger Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/[0.06] bg-[#1A0808]/98 px-4 py-4 space-y-1.5 shadow-2xl backdrop-blur-xl">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSearchChange('');
                handleNavClick(item.route);
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left text-sm font-medium transition-all cursor-pointer ${
                item.isActive
                  ? 'bg-red-500/15 text-red-300 border border-red-500/25'
                  : 'text-[#F5F2EB] hover:bg-white/[0.04]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              handleNavClick({ view: 'all_stories', category: 'free' });
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left text-sm font-medium transition-all cursor-pointer ${
              activeRoute.view === 'all_stories' && activeRoute.category === 'free'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                : 'text-[#F5F2EB] hover:bg-white/[0.04]'
            }`}
          >
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span>{t.nav.free}</span>
          </button>

          <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1">
            <button
              type="button"
              onClick={() => handleNavClick({ view: 'library', initialTab: 'my_stories' })}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left text-sm font-medium text-[#F5F2EB] hover:bg-white/[0.04] cursor-pointer"
            >
              <Library className="h-4 w-4 text-[#EF4444]" />
              <span>{t.nav.library}</span>
            </button>

            <button
              type="button"
              onClick={() => handleNavClick({ view: 'library', initialTab: 'account' })}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left text-sm font-medium text-[#C8BFB5] hover:text-[#F5F2EB] hover:bg-white/[0.04] cursor-pointer"
            >
              <User className="h-4 w-4 text-[#EF4444]" />
              <span>{user ? `${t.nav.profile} (${user.name})` : t.nav.loginRegister}</span>
            </button>

            {(user?.role === 'admin' || user?.role === 'editor') && (
              <button
                type="button"
                onClick={() => handleNavClick({ view: 'admin' })}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-sm font-medium text-red-400 hover:bg-white/[0.04] cursor-pointer"
              >
                <span>{t.nav.admin}</span>
              </button>
            )}

            <div className="pt-2 flex justify-start">
              <PWAInstallButton />
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
