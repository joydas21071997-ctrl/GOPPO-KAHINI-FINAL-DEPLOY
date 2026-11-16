import type { CollectionKey, ContentCategory, Language } from '../types/content';

export interface UIStrings {
  brandTagline: string;
  languageName: string;
  switchLanguagePrompt: string;
  nav: {
    home: string;
    stories: string;
    audio: string;
    animation: string;
    films: string;
    premium: string;
    free: string;
    npass: string;
    library: string;
    profile: string;
    admin: string;
    account: string;
    login: string;
    register: string;
    loginRegister: string;
    logout: string;
    searchPlaceholder: string;
    clearSearch: string;
  };
  categories: Record<ContentCategory, string>;
  collections: Record<CollectionKey, string>;
  badges: {
    free: string;
    freeAdSupported: string;
    premium: string;
    premiumAdFree: string;
    purchasedAdFree: string;
    trailerPreview: string;
    freePreview: string;
  };
  racks: {
    continueListening: string;
    latestStories: string;
    popularStories: string;
    popularPremiumStories: string;
    popularPremiumSubtitle: string;
    freeStories: string;
    freeStoriesSubtitle: string;
    freeTrailersSubtitle: string;
    premiumStories: string;
    premiumStoriesSubtitle: string;
    audioSeries: string;
    audioSeriesSubtitle: string;
    animationVisual: string;
    animationRackTitle: string;
    filmsRackTitle: string;
    emptyVisualSlotsNote: string;
    recentlyAdded: string;
    newAudioStories: string;
    allStoriesTitle: string;
    allStoriesSubtitle: string;
    rackCountUnit: string;
    emptyFreeStoriesNote: string;
  };
  progress: {
    played: string;
    completed: string;
  };
  hero: {
    featuredKicker: string;
    nowShowingBadge: string;
    playTrailer: string;
    previewLabel: string;
    buyTicket: string;
    listenNow: string;
    listenFree: string;
    episodesUnit: string;
    singleStory: string;
    includedInNPass: string;
    ticketRequiredOnly: string;
    nPassOnly: string;
    freeAccessSummary: string;
    premiumAdFreeSummary: string;
    selectHeroStoryBtn: string;
    selectHeroModalTitle: string;
    selectHeroModalSubtitle: string;
    setAsHeroBtn: string;
    activeInHeroLabel: string;
  };
  cards: {
    viewAll: string;
    backToHome: string;
    details: string;
    buyFor: string;
    repurchaseTicket: string;
    listensLeftUnit: string;
    preview: string;
    unlocked: string;
    purchasedAdFree: string;
    viaNPass: string;
    purchasedBadge: string;
    emptyCollectionTitle: string;
    emptyCollectionBody: string;
    emptySearchTitle: string;
    emptySearchBody: string;
  };
  storyDetails: {
    back: string;
    synopsisHeading: string;
    creditsWriter: string;
    creditsNarrator: string;
    languageLabel: string;
    trailerSectionTitle: string;
    trailerFreeNote: string;
    playPromotionalTrailer: string;
    episodesHeading: string;
    accessCardHeading: string;
    freeAccessHeading: string;
    freeAccessNote: string;
    seriesUnlockNote: string;
    singleUnlockNote: string;
    unlockedViaTicket: string;
    unlockedViaNPass: string;
    lockedEpisodeHint: string;
    playEpisode: string;
    buyStoryTicket: string;
    repurchaseStoryTicket: string;
    exhaustedListensNotice: string;
    remainingListensPrefix: string;
    orJoinNPass: string;
    notInNPassNote: string;
    premiumAdFreeBenefits: string;
    freeBackendPendingNote: string;
  };
  npass: {
    title: string;
    subtitle: string;
    priceDisplay: string;
    perMonth: string;
    benefits: string[];
    ctaSubscribe: string;
    ctaActive: string;
    policyNote: string;
  };
  checkout: {
    modalTitleTicket: string;
    modalTitleNPass: string;
    stateReady: string;
    statePending: string;
    stateSuccess: string;
    stateFailed: string;
    itemLabel: string;
    languageLabel: string;
    accessTermsLabel: string;
    accessTermsAdFree: string;
    totalPayable: string;
    selectPaymentMethod: string;
    methodUpi: string;
    methodCard: string;
    methodNetbanking: string;
    proceedToPay: string;
    retryPayment: string;
    closeAndListen: string;
    loginRequiredNote: string;
    goToLogin: string;
    gatewayPendingMessage: string;
    gatewayNotAuthorizedTitle: string;
    gatewayNotAuthorizedBody: string;
    sandboxVerifyButton: string;
    sandboxDisclaimer: string;
    orderConfirmedLabel: string;
  };
  player: {
    nowPlaying: string;
    promotionalTrailer: string;
    fullEpisode: string;
    adFreeLabel: string;
    freePreviewLabel: string;
    expandPlayer: string;
    minimizePlayer: string;
    closePlayer: string;
    skipBack10: string;
    skipForward10: string;
    speed: string;
    prevEpisode: string;
    nextEpisode: string;
    backgroundAudioNote: string;
    episodeListHeading: string;
  };
  library: {
    pageTitle: string;
    pageSubtitle: string;
    tabMyStories: string;
    tabContinue: string;
    tabPurchased: string;
    tabNPassContent: string;
    tabRequiresTicket: string;
    tabTransactions: string;
    tabAccount: string;
    emptyContinue: string;
    emptyPurchased: string;
    emptyNPassInactive: string;
    emptyTransactions: string;
    membershipStatusLabel: string;
    membershipActive: string;
    membershipInactive: string;
    freeAccountBadge: string;
    freeAccountSummary: string;
    accountSettingsHeading: string;
    signInHeading: string;
    signInSubtitle: string;
    freeRegistrationBadge: string;
    registerHeading: string;
    registerSubtitle: string;
    nameLabel: string;
    emailLabel: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    forgotPassword: string;
    passwordResetSent: string;
    enterEmailForReset: string;
    verificationEmailSent: string;
    emailNotVerifiedBanner: string;
    resendVerificationEmail: string;
    refreshVerificationStatus: string;
    passcodeLabel: string;
    adminLoginToggle: string;
    marketingConsentText: string;
    marketingConsentHelper: string;
    marketingConsentPendingNote: string;
    signInButton: string;
    createAccountButton: string;
    switchToRegister: string;
    switchToLogin: string;
    adminHint: string;
    statusVerified: string;
    statusFailed: string;
    statusPending: string;
    sandboxTag: string;
  };
  footer: {
    aboutText: string;
    protectionHeading: string;
    protectionNotice: string;
    copyright: string;
  };
}

export const TRANSLATIONS: Record<Language, UIStrings> = {
  bn: {
    brandTagline: 'বাংলা ও হিন্দি অডিও কাহিনী, অ্যানিমেশন ও ফিল্মের ফ্রি এবং প্রিমিয়াম আসর',
    languageName: 'বাংলা',
    switchLanguagePrompt: 'ভাষা নির্বাচন করুন',
    nav: {
      home: 'হোম',
      stories: 'সব গল্প',
      audio: 'অডিও সিরিজ',
      animation: 'অ্যানিমেশন ও ভিডিও',
      films: 'ফিল্ম',
      premium: 'প্রিমিয়াম',
      free: 'ফ্রি গল্প',
      npass: 'প্রিমিয়াম গল্প',
      library: 'আমার লাইব্রেরি',
      profile: 'প্রোফাইল',
      admin: 'অ্যাডমিন স্টুডিও',
      account: 'অ্যাকাউন্ট',
      login: 'লগইন',
      register: 'ফ্রি রেজিস্ট্রেশন',
      loginRegister: 'লগইন / রেজিস্ট্রেশন',
      logout: 'লগআউট',
      searchPlaceholder: 'বাংলা অডিও গল্প, অ্যানিমেশন বা ফিল্ম খুঁজুন...',
      clearSearch: 'মুছুন',
    },
    categories: {
      audio: 'অডিও সিরিজ',
      animation: 'অ্যানিমেশন',
      films: 'ফিল্ম',
    },
    collections: {
      new: 'নতুন গল্প',
    },
    badges: {
      free: 'ফ্রি',
      freeAdSupported: 'ফ্রি · বিজ্ঞাপন-সহ',
      premium: 'প্রিমিয়াম',
      premiumAdFree: 'প্রিমিয়াম · বিজ্ঞাপন-মুক্ত',
      purchasedAdFree: 'কেনা হয়েছে · বিজ্ঞাপন-মুক্ত',
      trailerPreview: 'ট্রেলার / প্রিভিউ',
      freePreview: 'ফ্রি প্রিভিউ',
    },
    racks: {
      continueListening: 'শোনা চালিয়ে যান',
      latestStories: 'সর্বশেষ গল্প',
      popularStories: 'জনপ্রিয় গল্প',
      popularPremiumStories: 'জনপ্রিয় ও প্রিমিয়াম অডিও সিরিজ',
      popularPremiumSubtitle: 'একক টিকিটে সম্পূর্ণ বিজ্ঞাপন-মুক্ত জনপ্রিয় ও সাম্প্রতিক অডিও কাহিনী',
      freeStories: 'ফ্রি গল্প ও প্রিভিউ',
      freeStoriesSubtitle: 'কোনো পেমেন্ট ছাড়াই ফ্রি ট্রেলার, প্রিভিউ ও ফ্রি গল্প উপভোগ করুন',
      freeTrailersSubtitle: 'সকল প্রিমিয়াম গল্পের ফ্রি ট্রেলার ও অডিও প্রিভিউ শুনুন সম্পূর্ণ বিনামূল্যে',
      premiumStories: 'প্রিমিয়াম বিজ্ঞাপন-মুক্ত গল্প',
      premiumStoriesSubtitle: 'একক টিকিট কিনে সম্পূর্ণ বিজ্ঞাপন-মুক্ত প্রিমিয়াম অভিজ্ঞতা উপভোগ করুন',
      audioSeries: 'অডিও সিরিজ',
      audioSeriesSubtitle: 'ধারাবাহিক অডিও গল্প ও রহস্য উপাখ্যানের সম্পূর্ণ সম্ভার',
      animationVisual: 'অ্যানিমেশন ও শর্ট ফিল্ম',
      animationRackTitle: 'অ্যানিমেশন সিরিজ',
      filmsRackTitle: 'শর্ট ফিল্ম',
      emptyVisualSlotsNote: 'অ্যানিমেশন এবং শর্ট ফিল্মের স্লট প্রস্তুত — অ্যাডমিন প্যানেল থেকে আপলোড করার সাথে সাথেই এখানে প্রকাশিত হবে।',
      recentlyAdded: 'সম্প্রতি যুক্ত কনটেন্ট',
      newAudioStories: 'অডিও গল্প — নতুন আপডেট',
      allStoriesTitle: 'সব বাংলা গল্প ও কনটেন্ট',
      allStoriesSubtitle: 'ফ্রি প্রিভিউ ও একক টিকিটভিত্তিক প্রিমিয়াম কনটেন্টের সম্পূর্ণ বাংলা সংগ্রহ',
      rackCountUnit: 'টি কনটেন্ট',
      emptyFreeStoriesNote: 'বর্তমানে ব্যাকএন্ড ক্যাটালগে সব পূর্ণাঙ্গ গল্প একক প্রিমিয়াম টিকিটযুক্ত; তবে নিচের ফ্রি ট্রেলার ও প্রিভিউ সম্পূর্ণ বিনামূল্যে শুনতে পারবেন।',
    },
    progress: {
      played: 'শোনা হয়েছে',
      completed: 'সম্পন্ন',
    },
    hero: {
      featuredKicker: 'চলছে · বিশেষ প্রদর্শনী',
      nowShowingBadge: 'চলছে — শুনুন',
      playTrailer: 'ফ্রি প্রিভিউ / ট্রেলার',
      previewLabel: 'ফ্রি প্রিভিউ',
      buyTicket: 'টিকিট কিনুন',
      listenNow: 'এখনই শুনুন',
      listenFree: 'ফ্রি শুনুন',
      episodesUnit: 'পর্ব',
      singleStory: 'পূর্ণাঙ্গ কাহিনী',
      includedInNPass: 'একক প্রিমিয়াম টিকিট · বিজ্ঞাপন-মুক্ত',
      ticketRequiredOnly: 'একক প্রিমিয়াম টিকিট · বিজ্ঞাপন-মুক্ত',
      nPassOnly: 'প্রিমিয়াম কনটেন্ট',
      freeAccessSummary: 'সম্পূর্ণ ফ্রি অ্যাক্সেস',
      premiumAdFreeSummary: 'প্রিমিয়াম বিজ্ঞাপন-মুক্ত অভিজ্ঞতা',
      selectHeroStoryBtn: 'বড় বক্সে গল্প নির্বাচন করুন',
      selectHeroModalTitle: 'উপরের বড় বক্সে (Hero Box) গল্প সেট করুন',
      selectHeroModalSubtitle: 'নতুন বা পুরনো যেকোনো গল্প সিলেক্ট করে ফ্রন্টএন্ডের প্রধান বড় বক্সে প্রদর্শন করুন',
      setAsHeroBtn: 'বড় বক্সে চালান',
      activeInHeroLabel: 'বর্তমানে বড় বক্সে চলছে',
    },
    cards: {
      viewAll: 'সব দেখুন',
      backToHome: 'হোমে ফিরে যান',
      details: 'বিস্তারিত',
      buyFor: 'টিকিট কিনুন',
      repurchaseTicket: 'পুনরায় কিনুন',
      listensLeftUnit: 'বার বাকি',
      preview: 'প্রিভিউ',
      unlocked: 'উন্মুক্ত',
      purchasedAdFree: 'কেনা হয়েছে · বিজ্ঞাপন-মুক্ত',
      viaNPass: 'উন্মুক্ত',
      purchasedBadge: 'কেনা হয়েছে',
      emptyCollectionTitle: 'এই বিভাগে এখনো কোনো বাংলা কনটেন্ট প্রকাশিত হয়নি',
      emptyCollectionBody: 'নতুন বাংলা অডিও গল্প, অ্যানিমেশন ও ফিল্ম শীঘ্রই যুক্ত হবে।',
      emptySearchTitle: 'আপনার অনুসন্ধানের সাথে কোনো বাংলা গল্প মেলেনি',
      emptySearchBody: 'বানান পরিবর্তন করে আবার খুঁজুন অথবা সম্পূর্ণ বাংলা তালিকা ঘুরে দেখুন।',
    },
    storyDetails: {
      back: 'ফিরে যান',
      synopsisHeading: 'কাহিনী সংক্ষেপ',
      creditsWriter: 'রচনা ও নির্দেশনা',
      creditsNarrator: 'কণ্ঠ ও আবহ',
      languageLabel: 'ভাষা: বাংলা',
      trailerSectionTitle: 'ফ্রি প্রোমোশনাল ট্রেলার ও প্রিভিউ',
      trailerFreeNote: 'সম্পূর্ণ বিনামূল্যে ট্রেলার ও প্রিভিউ শুনুন — কোনো অ্যাকাউন্ট পেমেন্ট ছাড়াই।',
      playPromotionalTrailer: 'ফ্রি প্রিভিউ শুনুন',
      episodesHeading: 'পর্বসমূহ',
      accessCardHeading: 'প্রিমিয়াম বিজ্ঞাপন-মুক্ত টিকিট (সর্বোচ্চ ২ বার পূর্ণ শোনা)',
      freeAccessHeading: 'ফ্রি কনটেন্ট (বিজ্ঞাপন-সমর্থিত)',
      freeAccessNote: 'এই গল্পটি সম্পূর্ণ ফ্রি — কোনো টিকিট বা সাবস্ক্রিপশন ছাড়াই উপভোগ করুন।',
      seriesUnlockNote: '₹৯ একক টিকিটে এই ধারাবাহিকের সব পর্ব বিজ্ঞাপন-মুক্তভাবে সর্বোচ্চ ২ বার সম্পূর্ণ শোনা যাবে।',
      singleUnlockNote: '₹৯ একক টিকিটে সম্পূর্ণ কনটেন্টটি বিজ্ঞাপন-মুক্তভাবে সর্বোচ্চ ২ বার শোনা যাবে।',
      unlockedViaTicket: 'আপনার ₹৯ টিকিটের মাধ্যমে সব পর্ব বিজ্ঞাপন-মুক্তভাবে উন্মুক্ত (সর্বোচ্চ ২ বার পূর্ণ শোনা)।',
      unlockedViaNPass: 'আপনার অ্যাকাউন্টের মাধ্যমে এই গল্পটি বিজ্ঞাপন-মুক্তভাবে উন্মুক্ত।',
      lockedEpisodeHint: 'পূর্ণ পর্বটি শুনতে ₹৯ টিকিট কিনুন (সর্বোচ্চ ২ বার পূর্ণ শোনা)',
      playEpisode: 'শুনুন',
      buyStoryTicket: 'টিকিট কিনুন',
      repurchaseStoryTicket: 'পুনরায় টিকিট কিনুন',
      exhaustedListensNotice: 'এই গল্পে আপনার আগের ₹৯ টিকিটের সর্বোচ্চ ২ বার পূর্ণ শোনা সম্পন্ন হয়েছে। ৩য় বার শুনতে অনুগ্রহ করে পুনরায় ₹৯ পেমেন্ট করে আনলক করুন।',
      remainingListensPrefix: 'পূর্ণ শোনা বাকি:',
      orJoinNPass: 'বিস্তারিত দেখুন',
      notInNPassNote: 'কোনো মাসিক সাবস্ক্রিপশন নেই — প্রতিটি ₹৯ টিকিটে গল্পটি সর্বোচ্চ ২ বার সম্পূর্ণ শুনতে পারবেন।',
      premiumAdFreeBenefits: '₹৯ একক টিকিটে সর্বোচ্চ ২ বার সম্পূর্ণ বিজ্ঞাপন-মুক্ত শোনা যাবে — ৩য় বার শুনতে পুনরায় পেমেন্ট প্রযোজ্য।',
      freeBackendPendingNote: 'ব্যাকএন্ড স্ট্রিমিং অনুমোদন প্রক্রিয়াধীন থাকলে প্রিভিউ ট্রেলার ফ্রি শোনা যাবে।',
    },
    npass: {
      title: 'প্রিমিয়াম বিজ্ঞাপন-মুক্ত সংগ্রহ',
      subtitle: 'কোনো মাসিক সাবস্ক্রিপশন নয় — প্রতিটি প্রিমিয়াম গল্প মাত্র ₹৯-এ ২ বার সম্পূর্ণ শুনুন',
      priceDisplay: '₹0',
      perMonth: 'ফ্রি প্ল্যাটফর্ম',
      benefits: [
        'ফ্রি অ্যাকাউন্ট খুলুন ও ব্রাউজ করুন',
        'সকল ফ্রি ট্রেলার ও গল্প শুনুন',
        'প্রতি কন্টেন্ট ₹৯-এ সর্বোচ্চ ২ বার পূর্ণ শোনা',
        '৩য় বার শুনতে পুনরায় ₹৯ টিকিট',
      ],
      ctaSubscribe: 'প্রিমিয়াম গল্প দেখুন',
      ctaActive: 'অ্যাকাউন্ট সক্রিয়',
      policyNote: 'Goppo Kahini-তে অ্যাকাউন্ট খোলা সম্পূর্ণ ফ্রি। প্রতিটি প্রিমিয়াম কন্টেন্ট ₹৯ টিকিটে সর্বোচ্চ ২ বার সম্পূর্ণ শোনা যাবে।',
    },
    checkout: {
      modalTitleTicket: 'প্রিমিয়াম টিকিট চেকআউট',
      modalTitleNPass: 'প্রিমিয়াম চেকআউট',
      stateReady: 'পেমেন্টের জন্য প্রস্তুত',
      statePending: 'পেমেন্ট যাচাই করা হচ্ছে...',
      stateSuccess: 'পেমেন্ট সফল হয়েছে · ২ বার পূর্ণ শোনার জন্য আনলক হয়েছে',
      stateFailed: 'পেমেন্ট সম্পন্ন হয়নি',
      itemLabel: 'নির্বাচিত প্রিমিয়াম কনটেন্ট',
      languageLabel: 'কনটেন্ট ভাষা',
      accessTermsLabel: 'অ্যাক্সেস সুবিধা',
      accessTermsAdFree: '₹৯ টিকিট · বিজ্ঞাপন-মুক্ত · সর্বোচ্চ ২ বার পূর্ণ শোনা (৩য় বারে পুনরায় পেমেন্ট)',
      totalPayable: 'টিকিট মূল্য',
      selectPaymentMethod: 'পেমেন্ট পদ্ধতি নির্বাচন করুন',
      methodUpi: 'UPI (GPay / PhonePe / Paytm)',
      methodCard: 'ডেবিট বা ক্রেডিট কার্ড',
      methodNetbanking: 'নেটব্যাংকিং',
      proceedToPay: 'টিকিট কিনুন ও আনলক করুন',
      retryPayment: 'আবার চেষ্টা করুন',
      closeAndListen: 'এখনই শুনতে শুরু করুন',
      loginRequiredNote: 'আপনার কেনা প্রিমিয়াম টিকিট অ্যাকাউন্টে সংরক্ষিত রাখতে প্রথমে ফ্রি লগইন বা রেজিস্ট্রেশন করুন।',
      goToLogin: 'ফ্রি লগইন / রেজিস্ট্রেশন করুন',
      gatewayPendingMessage: 'সার্ভারে অর্ডার তৈরি ও পেমেন্ট গেটওয়ে নিশ্চিতকরণের অপেক্ষা করা হচ্ছে...',
      gatewayNotAuthorizedTitle: 'লাইভ পেমেন্ট গেটওয়ে এখনো সংযুক্ত করা হয়নি',
      gatewayNotAuthorizedBody: 'নিরাপত্তা নীতির কারণে মালিকের অনুমোদন ছাড়া লাইভ পেমেন্ট গেটওয়ে সক্রিয় করা হয়নি, এবং কোনো কৃত্রিম পেমেন্টকে আসল লেনদেন হিসেবে দেখানো হয় না। আপনার অর্ডারটি লেনদেন তালিকায় নথিভুক্ত হয়েছে।',
      sandboxVerifyButton: 'স্যান্ডবক্স টেস্ট ভেরিফিকেশন চালান (QA পরীক্ষণ)',
      sandboxDisclaimer: 'শুধুমাত্র ডেভেলপার/QA পরীক্ষার জন্য ব্যাকএন্ড স্যান্ডবক্স অ্যাক্সেস যাচাই করে।',
      orderConfirmedLabel: 'অর্ডার আইডি',
    },
    player: {
      nowPlaying: 'এখন চলছে',
      promotionalTrailer: 'ফ্রি ট্রেলার / প্রিভিউ',
      fullEpisode: 'মূল পর্ব',
      adFreeLabel: 'বিজ্ঞাপন-মুক্ত (Ad-Free)',
      freePreviewLabel: 'ফ্রি প্রিভিউ',
      expandPlayer: 'পূর্ণ প্লেয়ার খুলুন',
      minimizePlayer: 'ছোট করুন',
      closePlayer: 'বন্ধ করুন',
      skipBack10: '১০ সেকেন্ড পিছনে',
      skipForward10: '১০ সেকেন্ড সামনে',
      speed: 'গতি',
      prevEpisode: 'পূর্ববর্তী পর্ব',
      nextEpisode: 'পরবর্তী পর্ব',
      backgroundAudioNote: 'সমর্থিত ব্রাউজার ও ডিভাইসে স্ক্রিন লক থাকলেও মিডিয়া কন্ট্রোলের মাধ্যমে অডিও শোনা যাবে।',
      episodeListHeading: 'এই ধারাবাহিকের পর্বসমূহ',
    },
    library: {
      pageTitle: 'আমার লাইব্রেরি, ক্রয় ও প্রোফাইল',
      pageSubtitle: 'আপনার ফ্রি প্রোফাইল, কেনা প্রিমিয়াম টিকিট এবং শোনার অগ্রগতি এক জায়গায়',
      tabMyStories: 'আমার লাইব্রেরি',
      tabContinue: 'শোনা চালিয়ে যান',
      tabPurchased: 'আমার কেনা গল্প',
      tabNPassContent: 'প্রিমিয়াম ক্যাটালগ',
      tabRequiresTicket: 'আরও প্রিমিয়াম গল্প',
      tabTransactions: 'লেনদেনের ইতিহাস',
      tabAccount: 'প্রোফাইল ও অ্যাকাউন্ট',
      emptyContinue: 'আপনি এখনো কোনো পর্ব বা ট্রেলার শোনা শুরু করেননি।',
      emptyPurchased: 'আপনি এখনো কোনো প্রিমিয়াম টিকিট কেনেননি। ফ্রি প্রিভিউ ও গল্প উপভোগ করুন অথবা পছন্দের প্রিমিয়াম গল্প আনলক করুন।',
      emptyNPassInactive: 'কোনো মাসিক সাবস্ক্রিপশন প্রয়োজন নেই — পছন্দের প্রিমিয়াম গল্পের একক টিকিট কিনুন।',
      emptyTransactions: 'কোনো লেনদেনের রেকর্ড পাওয়া যায়নি।',
      membershipStatusLabel: 'অ্যাকাউন্ট ধরন',
      membershipActive: 'সক্রিয় ফ্রি অ্যাকাউন্ট',
      membershipInactive: 'ফ্রি অ্যাকাউন্ট (কোনো মাসিক ফি নেই)',
      freeAccountBadge: '১০০% ফ্রি অ্যাকাউন্ট · কোনো সাবস্ক্রিপশন ফি নেই',
      freeAccountSummary: 'আপনি বিনামূল্যে ফ্রি গল্প ও ট্রেলার শুনতে পারেন এবং যেকোনো প্রিমিয়াম গল্পের একক টিকিট কিনে বিজ্ঞাপন-মুক্ত উপভোগ করতে পারেন।',
      accountSettingsHeading: 'আমার প্রোফাইল তথ্য',
      signInHeading: 'Goppo Kahini-তে ফ্রি লগইন করুন',
      signInSubtitle: 'আপনার লাইব্রেরি, শোনার অগ্রগতি ও কেনা টিকিট সংরক্ষণ করতে বিনামূল্যে সাইন ইন করুন',
      freeRegistrationBadge: 'বিনামূল্যে অ্যাকাউন্ট খুলুন · কোনো পেমেন্ট বা কার্ড লাগবে না',
      registerHeading: 'ফ্রি অ্যাকাউন্ট তৈরি করুন (Registration)',
      registerSubtitle: 'কোনো মাসিক ফি বা পেমেন্ট ছাড়াই কয়েক সেকেন্ডে আপনার ফ্রি অ্যাকাউন্ট তৈরি করুন',
      nameLabel: 'আপনার নাম',
      emailLabel: 'ইমেইল ঠিকানা',
      passwordLabel: 'পাসওয়ার্ড',
      passwordPlaceholder: 'কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড',
      forgotPassword: 'পাসওয়ার্ড ভুলে গেছেন?',
      passwordResetSent: 'পাসওয়ার্ড রিসেট করার লিংক আপনার ইমেইলে পাঠানো হয়েছে। ইনবক্স বা স্প্যাম ফোল্ডার দেখুন।',
      enterEmailForReset: 'পাসওয়ার্ড রিসেট করতে উপরে আপনার ইমেইল ঠিকানা লিখুন।',
      verificationEmailSent: 'একটি ভেরিফিকেশন ইমেইল পাঠানো হয়েছে। অনুগ্রহ করে ইনবক্স থেকে লিংকটি কনফার্ম করুন।',
      emailNotVerifiedBanner: 'আপনার ইমেইল ঠিকানাটি এখনো যাচাইকৃত (Verified) নয়। পূর্ণ প্রোফাইল ও অগ্রগতি সিঙ্কের জন্য ইমেইলটি ভেরিফাই করুন।',
      resendVerificationEmail: 'ভেরিফিকেশন ইমেইল পাঠান',
      refreshVerificationStatus: 'ভেরিফাই হয়েছে? রিফ্রেশ করুন',
      passcodeLabel: 'অ্যাডমিন অ্যাক্সেস কোড',
      adminLoginToggle: 'অ্যাডমিন অ্যাক্সেস কোড আছে? (ঐচ্ছিক)',
      marketingConsentText: 'I agree to receive Goppo Kahini updates, new story announcements, special offers, and newsletters by email.',
      marketingConsentHelper: 'ঐচ্ছিক: এটি সম্পূর্ণ ঐচ্ছিক এবং ফ্রি অ্যাকাউন্ট খোলার জন্য বাধ্যতামূলক নয়।',
      marketingConsentPendingNote: 'ইমেইল সম্মতি আপাতত ফ্রন্টএন্ডে গৃহীত হয়েছে (ব্যাকএন্ড সংরক্ষণ প্রক্রিয়াধীন)।',
      signInButton: 'ফ্রি লগইন করুন',
      createAccountButton: 'ফ্রি অ্যাকাউন্ট তৈরি করুন',
      switchToRegister: 'নতুন ব্যবহারকারী? বিনামূল্যে রেজিস্ট্রেশন করুন',
      switchToLogin: 'আগে থেকেই অ্যাকাউন্ট আছে? লগইন করুন',
      adminHint: 'প্রশাসনিক স্টুডিও ব্যবহার করতে অনুমোদিত অ্যাডমিন ইমেইল দিয়ে লগইন করুন।',
      statusVerified: 'যাচাইকৃত',
      statusFailed: 'অসম্পূর্ণ',
      statusPending: 'অপেক্ষমাণ',
      sandboxTag: 'স্যান্ডবক্স QA',
    },
    footer: {
      aboutText: 'Goppo Kahini একটি সম্পূর্ণ ফ্রি-অ্যাক্সেস বাংলা ও হিন্দি অডিও গল্প, অ্যানিমেশন ও ফিল্ম প্ল্যাটফর্ম। ফ্রি গল্প ও ট্রেলার বিনামূল্যে উপভোগ করুন অথবা একক টিকিটে প্রিমিয়াম বিজ্ঞাপন-মুক্ত গল্প আনলক করুন।',
      protectionHeading: 'কনটেন্ট সুরক্ষা বিজ্ঞপ্তি',
      protectionNotice: 'সকল অডিও রেকর্ডিং, আবহসংগীত, প্রচ্ছদ শিল্পকর্ম ও পান্ডুলিপি Goppo Kahini-এর মেধাস্বত্ব দ্বারা সুরক্ষিত। অননুমোদিত ডাউনলোড, পুনঃপ্রচার বা বাণিজ্যিক ব্যবহার আইনত দণ্ডনীয়।',
      copyright: '© ২০২৬ Goppo Kahini। সর্বস্বত্ব সংরক্ষিত।',
    },
  },
  hi: {
    brandTagline: 'बंगाली और हिंदी ऑडियो कहानियों, एनिमेशन और फ़िल्मों का निःशुल्क एवं प्रीमियम मंच',
    languageName: 'हिंदी',
    switchLanguagePrompt: 'भाषा चुनें',
    nav: {
      home: 'होम',
      stories: 'सभी कहानियाँ',
      audio: 'ऑडियो सीरीज़',
      animation: 'एनिमेशन और वीडियो',
      films: 'फ़िल्में',
      premium: 'प्रीमियम',
      free: 'मुफ़्त कहानियाँ',
      npass: 'प्रीमियम कहानियाँ',
      library: 'मेरी लाइब्रेरी',
      profile: 'प्रोफ़ाइल',
      admin: 'एडमिन स्टूडियो',
      account: 'अकाउंट',
      login: 'लॉगिन',
      register: 'मुफ़्त रजिस्ट्रेशन',
      loginRegister: 'लॉगिन / रजिस्ट्रेशन',
      logout: 'लॉगआउट',
      searchPlaceholder: 'हिंदी ऑडियो कहानियाँ, एनिमेशन या फ़िल्में खोजें...',
      clearSearch: 'साफ़ करें',
    },
    categories: {
      audio: 'ऑडियो सीरीज़',
      animation: 'एनिमेशन',
      films: 'फ़िल्में',
    },
    collections: {
      new: 'नई कहानियाँ',
    },
    badges: {
      free: 'मुफ़्त',
      freeAdSupported: 'मुफ़्त · विज्ञापन सहित',
      premium: 'प्रीमियम',
      premiumAdFree: 'प्रीमियम · विज्ञापन-मुक्त',
      purchasedAdFree: 'ख़रीदा गया · विज्ञापन-मुक्त',
      trailerPreview: 'ट्रेलर / प्रीव्यू',
      freePreview: 'मुफ़्त प्रीव्यू',
    },
    racks: {
      continueListening: 'सुनना जारी रखें',
      latestStories: 'नवीनतम कहानियाँ',
      popularStories: 'लोकप्रिय कहानियाँ',
      popularPremiumStories: 'लोकप्रिय एवं प्रीमियम ऑडियो सीरीज़',
      popularPremiumSubtitle: 'एकल टिकट के साथ विज्ञापन-मुक्त लोकप्रिय और नवीनतम ऑडियो कहानियाँ',
      freeStories: 'मुफ़्त कहानियाँ और प्रीव्यू',
      freeStoriesSubtitle: 'बिना किसी भुगतान के मुफ़्त ट्रेलर, प्रीव्यू और निःशुल्क कहानियों का आनंद लें',
      freeTrailersSubtitle: 'सभी प्रीमियम कहानियों के मुफ़्त ट्रेलर और ऑडियो प्रीव्यू बिल्कुल निःशुल्क सुनें',
      premiumStories: 'प्रीमियम विज्ञापन-मुक्त कहानियाँ',
      premiumStoriesSubtitle: 'एकल टिकट ख़रीदें और बिना किसी विज्ञापन के प्रीमियम कहानियाँ सुनें',
      audioSeries: 'ऑडियो सीरीज़',
      audioSeriesSubtitle: 'धारावाहिक ऑडियो कहानियों और रहस्य गाथाओं का संग्रह',
      animationVisual: 'एनिमेशन और शॉर्ट फ़िल्में',
      animationRackTitle: 'एनिमेशन सीरीज़',
      filmsRackTitle: 'शॉर्ट फ़िल्में',
      emptyVisualSlotsNote: 'एनिमेशन और शॉर्ट फ़िल्म के स्लॉट तैयार हैं — एडमिन पैनल से अपलोड होते ही यहाँ प्रदर्शित होंगे।',
      recentlyAdded: 'हाल ही में जोड़ी गई सामग्री',
      newAudioStories: 'ऑडियो कहानियाँ — नए अपडेट',
      allStoriesTitle: 'सभी हिंदी कहानियाँ और सामग्री',
      allStoriesSubtitle: 'निःशुल्क प्रीव्यू और एकल टिकट वाली प्रीमियम विज्ञापन-मुक्त कहानियों का संग्रह',
      rackCountUnit: 'सामग्री',
      emptyFreeStoriesNote: 'वर्तमान बैकएंड कैटलॉग की पूर्ण कहानियाँ एकल प्रीमियम टिकट के अंतर्गत हैं; हालांकि नीचे आप मुफ़्त ट्रेलर और प्रीव्यू तुरंत सुन सकते हैं।',
    },
    progress: {
      played: 'सुना गया',
      completed: 'पूर्ण',
    },
    hero: {
      featuredKicker: 'अभी चल रहा है · विशेष प्रस्तुति',
      nowShowingBadge: 'चल रहा है — सुनें',
      playTrailer: 'मुफ़्त प्रीव्यू / ट्रेलर',
      previewLabel: 'मुफ़्त प्रीव्यू',
      buyTicket: 'टिकट ख़रीदें',
      listenNow: 'अभी सुनें',
      listenFree: 'मुफ़्त सुनें',
      episodesUnit: 'एपिसोड',
      singleStory: 'संपूर्ण कहानी',
      includedInNPass: 'एकल प्रीमियम टिकट · विज्ञापन-मुक्त',
      ticketRequiredOnly: 'एकल प्रीमियम टिकट · विज्ञापन-मुक्त',
      nPassOnly: 'प्रीमियम सामग्री',
      freeAccessSummary: 'पूरी तरह मुफ़्त',
      premiumAdFreeSummary: 'प्रीमियम विज्ञापन-मुक्त अनुभव',
      selectHeroStoryBtn: 'बड़े बॉक्स के लिए कहानी चुनें',
      selectHeroModalTitle: 'मुख्य हीरो बॉक्स में कहानी सेट करें',
      selectHeroModalSubtitle: 'नई या पुरानी किसी भी कहानी को चुनकर फ्रंटएंड के मुख्य बड़े बॉक्स में दिखाएँ',
      setAsHeroBtn: 'हीरो बॉक्स में दिखाएँ',
      activeInHeroLabel: 'अभी हीरो बॉक्स में सक्रिय',
    },
    cards: {
      viewAll: 'सभी देखें',
      backToHome: 'होम पर लौटें',
      details: 'विवरण',
      buyFor: 'टिकट ख़रीदें',
      repurchaseTicket: 'पुनः ख़रीदें',
      listensLeftUnit: 'बार शेष',
      preview: 'प्रीव्यू',
      unlocked: 'अनलॉक्ड',
      purchasedAdFree: 'ख़रीदा गया · विज्ञापन-मुक्त',
      viaNPass: 'उपलब्ध',
      purchasedBadge: 'ख़रीदा गया',
      emptyCollectionTitle: 'इस श्रेणी में अभी कोई हिंदी कंटेंट प्रकाशित नहीं है',
      emptyCollectionBody: 'नई मौलिक हिंदी ऑडियो कहानियाँ, एनिमेशन और फ़िल्में जल्द जोड़ी जाएँगी।',
      emptySearchTitle: 'आपकी खोज से मेल खाती कोई हिंदी कहानी नहीं मिली',
      emptySearchBody: 'कृपया अन्य शब्दों से खोजें या संपूर्ण हिंदी संग्रह देखें।',
    },
    storyDetails: {
      back: 'वापस जाएँ',
      synopsisHeading: 'कहानी का सारांश',
      creditsWriter: 'लेखन व निर्देशन',
      creditsNarrator: 'स्वर एवं ध्वनि डिज़ाइन',
      languageLabel: 'भाषा: हिंदी',
      trailerSectionTitle: 'मुफ़्त प्रोमोशनल ट्रेलर और प्रीव्यू',
      trailerFreeNote: 'बिना किसी भुगतान के मुफ़्त ट्रेलर और प्रीव्यू सुनें।',
      playPromotionalTrailer: 'मुफ़्त प्रीव्यू चलाएँ',
      episodesHeading: 'एपिसोड सूची',
      accessCardHeading: 'प्रीमियम विज्ञापन-मुक्त टिकट (अधिकतम 2 बार पूर्ण सुनने हेतु)',
      freeAccessHeading: 'मुफ़्त सामग्री (विज्ञापन समर्थित)',
      freeAccessNote: 'यह कहानी पूरी तरह मुफ़्त है — बिना किसी टिकट या सदस्यता के सुनें।',
      seriesUnlockNote: '₹9 के टिकट पर आप इस धारावाहिक के सभी एपिसोड विज्ञापन-मुक्त अधिकतम 2 बार पूरा सुन सकते हैं।',
      singleUnlockNote: '₹9 के टिकट पर यह संपूर्ण सामग्री विज्ञापन-मुक्त अधिकतम 2 बार सुनी जा सकती है।',
      unlockedViaTicket: 'आपके ₹9 टिकट से सभी एपिसोड विज्ञापन-मुक्त अनलॉक हैं (अधिकतम 2 बार पूर्ण सुनें)।',
      unlockedViaNPass: 'आपके अकाउंट से यह कहानी विज्ञापन-मुक्त उपलब्ध है।',
      lockedEpisodeHint: 'पूर्ण एपिसोड सुनने के लिए ₹9 टिकट ख़रीदें (अधिकतम 2 बार)',
      playEpisode: 'सुनें',
      buyStoryTicket: 'टिकट ख़रीदें',
      repurchaseStoryTicket: 'पुनः टिकट ख़रीदें',
      exhaustedListensNotice: 'इस कहानी के लिए आपके पिछले ₹9 टिकट पर अधिकतम 2 बार पूर्ण सुनने की सीमा पूरी हो चुकी है। तीसरी बार सुनने के लिए कृपया पुनः ₹9 भुगतान करें।',
      remainingListensPrefix: 'पूर्ण सुनने के अवसर शेष:',
      orJoinNPass: 'विवरण देखें',
      notInNPassNote: 'कोई मासिक शुल्क नहीं — ₹9 के टिकट पर आप इस कहानी को अधिकतम 2 बार पूरा सुन सकते हैं।',
      premiumAdFreeBenefits: '₹9 के एकल टिकट पर अधिकतम 2 बार विज्ञापन-मुक्त सुनें — तीसरी बार सुनने के लिए पुनः भुगतान लागू होगा।',
      freeBackendPendingNote: 'जब तक बैकएंड मुफ़्त एपिसोड स्ट्रीमिंग सक्षम नहीं होती, आप मुफ़्त प्रीव्यू सुन सकते हैं।',
    },
    npass: {
      title: 'प्रीमियम विज्ञापन-मुक्त संग्रह',
      subtitle: 'कोई मासिक सदस्यता नहीं — हर प्रीमियम कहानी केवल ₹9 में अधिकतम 2 बार पूरा सुनें',
      priceDisplay: '₹0',
      perMonth: 'निःशुल्क मंच',
      benefits: [
        'बिना शुल्क के अकाउंट बनाएँ',
        'मुफ़्त ट्रेलर और कहानियाँ सुनें',
        'हर कंटेंट ₹9 में अधिकतम 2 बार पूरा सुनें',
        'तीसरी बार सुनने के लिए पुनः ₹9 टिकट',
      ],
      ctaSubscribe: 'प्रीमियम कहानियाँ देखें',
      ctaActive: 'निःशुल्क अकाउंट सक्रिय',
      policyNote: 'Goppo Kahini पर अकाउंट बनाना बिल्कुल मुफ़्त है। प्रत्येक प्रीमियम कंटेंट ₹9 टिकट पर अधिकतम 2 बार पूरा सुना जा सकता है।',
    },
    checkout: {
      modalTitleTicket: 'प्रीमियम टिकट चेकआउट',
      modalTitleNPass: 'प्रीमियम चेकआउट',
      stateReady: 'भुगतान के लिए तैयार',
      statePending: 'भुगतान लंबित — सत्यापन जारी...',
      stateSuccess: 'भुगतान सफल · 2 बार पूर्ण सुनने के लिए अनलॉक हुआ',
      stateFailed: 'भुगतान विफल',
      itemLabel: 'चयनित प्रीमियम सामग्री',
      languageLabel: 'कंटेंट भाषा',
      accessTermsLabel: 'एक्सेस सुविधा',
      accessTermsAdFree: '₹9 टिकट · विज्ञापन-मुक्त · अधिकतम 2 बार पूरा सुनें (तीसरी बार पुनः भुगतान)',
      totalPayable: 'टिकट मूल्य',
      selectPaymentMethod: 'भुगतान माध्यम चुनें',
      methodUpi: 'UPI (GPay / PhonePe / Paytm)',
      methodCard: 'डेबिट या क्रेडिट कार्ड',
      methodNetbanking: 'नेटबैंकिंग',
      proceedToPay: 'टिकट ख़रीदें और अनलॉक करें',
      retryPayment: 'पुनः प्रयास करें',
      closeAndListen: 'अभी सुनना शुरू करें',
      loginRequiredNote: 'अपना प्रीमियम टिकट अकाउंट में सुरक्षित रखने के लिए कृपया पहले मुफ़्त लॉगिन या रजिस्ट्रेशन करें।',
      goToLogin: 'मुफ़्त लॉगिन / रजिस्ट्रेशन करें',
      gatewayPendingMessage: 'सर्वर ऑर्डर बनाया जा रहा है और भुगतान गेटवे पुष्टि की प्रतीक्षा है...',
      gatewayNotAuthorizedTitle: 'लाइव पेमेंट गेटवे अभी अधिकृत नहीं है',
      gatewayNotAuthorizedBody: 'सुरक्षा नियमों के अनुसार बिना अनुमति लाइव पेमेंट गेटवे नहीं जोड़ा गया है और किसी नकली भुगतान को वास्तविक लेनदेन के रूप में स्वीकार नहीं किया जाता। यह प्रयास आपके इतिहास में दर्ज किया गया है।',
      sandboxVerifyButton: 'सैंडबॉक्स टेस्ट सत्यापन करें (QA परीक्षण)',
      sandboxDisclaimer: 'केवल QA परीक्षण हेतु बैकएंड सैंडबॉक्स एक्सेस को सत्यापित करता है।',
      orderConfirmedLabel: 'ऑर्डर आईडी',
    },
    player: {
      nowPlaying: 'अभी बज रहा है',
      promotionalTrailer: 'मुफ़्त ट्रेलर / प्रीव्यू',
      fullEpisode: 'पूर्ण एपिसोड',
      adFreeLabel: 'विज्ञापन-मुक्त (Ad-Free)',
      freePreviewLabel: 'मुफ़्त प्रीव्यू',
      expandPlayer: 'पूर्ण प्लेयर खोलें',
      minimizePlayer: 'छोटा करें',
      closePlayer: 'बंद करें',
      skipBack10: '10 सेकंड पीछे',
      skipForward10: '10 सेकंड आगे',
      speed: 'गति',
      prevEpisode: 'पिछला एपिसोड',
      nextEpisode: 'अगला एपिसोड',
      backgroundAudioNote: 'समर्थित ब्राउज़र और मोबाइल डिवाइस पर स्क्रीन लॉक होने पर भी मीडिया कंट्रोल से सुनना जारी रख सकते हैं।',
      episodeListHeading: 'इस शृंखला के एपिसोड',
    },
    library: {
      pageTitle: 'मेरी लाइब्रेरी, ख़रीद और प्रोफ़ाइल',
      pageSubtitle: 'आपकी निःशुल्क प्रोफ़ाइल, ख़रीदे गए प्रीमियम टिकट और सुनने की प्रगति एक स्थान पर',
      tabMyStories: 'मेरी लाइब्रेरी',
      tabContinue: 'सुनना जारी रखें',
      tabPurchased: 'ख़रीदी गई सामग्री',
      tabNPassContent: 'प्रीमियम संग्रह',
      tabRequiresTicket: 'और प्रीमियम कहानियाँ',
      tabTransactions: 'लेनदेन इतिहास',
      tabAccount: 'प्रोफ़ाइल और अकाउंट',
      emptyContinue: 'आपने अभी तक कोई ट्रेलर या एपिसोड सुनना शुरू नहीं किया है।',
      emptyPurchased: 'आपके अकाउंट में अभी तक कोई प्रीमियम टिकट नहीं ख़रीदा गया है। मुफ़्त प्रीव्यू का आनंद लें या पसंदीदा प्रीमियम कहानी अनलॉक करें।',
      emptyNPassInactive: 'किसी मासिक सदस्यता की आवश्यकता नहीं है — केवल पसंदीदा प्रीमियम कहानियों का टिकट लें।',
      emptyTransactions: 'अभी तक कोई लेनदेन रिकॉर्ड उपलब्ध नहीं है।',
      membershipStatusLabel: 'अकाउंट प्रकार',
      membershipActive: 'सक्रिय मुफ़्त अकाउंट',
      membershipInactive: 'निःशुल्क अकाउंट (कोई मासिक शुल्क नहीं)',
      freeAccountBadge: '100% मुफ़्त अकाउंट · कोई सदस्यता शुल्क नहीं',
      freeAccountSummary: 'आप मुफ़्त कहानियाँ व ट्रेलर सुन सकते हैं और व्यक्तिगत टिकट ख़रीदकर प्रीमियम विज्ञापन-मुक्त सामग्री अनलॉक कर सकते हैं।',
      accountSettingsHeading: 'मेरी प्रोफ़ाइल जानकारी',
      signInHeading: 'Goppo Kahini में मुफ़्त लॉगिन करें',
      signInSubtitle: 'अपनी लाइब्रेरी, प्रगति और ख़रीदे गए टिकट सहेजने के लिए निःशुल्क साइन इन करें',
      freeRegistrationBadge: 'बिल्कुल मुफ़्त रजिस्ट्रेशन · कोई भुगतान या कार्ड आवश्यक नहीं',
      registerHeading: 'मुफ़्त अकाउंट बनाएँ (Registration)',
      registerSubtitle: 'बिना किसी शुल्क या भुगतान के कुछ सेकंड में अपना निःशुल्क अकाउंट बनाएँ',
      nameLabel: 'आपका नाम',
      emailLabel: 'ईमेल पता',
      passwordLabel: 'पासवर्ड',
      passwordPlaceholder: 'कम से कम 6 अक्षरों का पासवर्ड',
      forgotPassword: 'पासवर्ड भूल गए?',
      passwordResetSent: 'पासवर्ड रीसेट लिंक आपके ईमेल पर भेज दिया गया है। कृपया इनबॉक्स या स्पैम जांचें।',
      enterEmailForReset: 'पासवर्ड रीसेट करने के लिए ऊपर अपना ईमेल पता दर्ज करें।',
      verificationEmailSent: 'सत्यापन ईमेल भेज दिया गया है। कृपया अपने इनबॉक्स में दिए गए लिंक से पुष्टि करें।',
      emailNotVerifiedBanner: 'आपका ईमेल अभी सत्यापित (Verified) नहीं है। प्रोफ़ाइल व प्रगति सिंक करने के लिए ईमेल सत्यापित करें।',
      resendVerificationEmail: 'सत्यापन ईमेल भेजें',
      refreshVerificationStatus: 'सत्यापित हो गया? रिफ़्रेश करें',
      passcodeLabel: 'एडमिन एक्सेस कोड',
      adminLoginToggle: 'एडमिन एक्सेस कोड है? (वैकल्पिक)',
      marketingConsentText: 'I agree to receive Goppo Kahini updates, new story announcements, special offers, and newsletters by email.',
      marketingConsentHelper: 'वैकल्पिक: यह पूरी तरह स्वैच्छिक है और अकाउंट बनाने के लिए अनिवार्य नहीं है।',
      marketingConsentPendingNote: 'ईमेल सहमति अभी केवल फ्रंटएंड में दर्ज की गई है (बैकएंड एकीकरण लंबित है)।',
      signInButton: 'मुफ़्त लॉगिन करें',
      createAccountButton: 'मुफ़्त अकाउंट बनाएँ',
      switchToRegister: 'नए श्रोता हैं? मुफ़्त रजिस्ट्रेशन करें',
      switchToLogin: 'पहले से अकाउंट है? लॉगिन करें',
      adminHint: 'एडमिन स्टूडियो खोलने के लिए अधिकृत एडमिन ईमेल से लॉगिन करें।',
      statusVerified: 'सत्यापित',
      statusFailed: 'असफल',
      statusPending: 'लंबित',
      sandboxTag: 'सैंडबॉक्स QA',
    },
    footer: {
      aboutText: 'Goppo Kahini बंगाली और हिंदी की मौलिक ऑडियो कहानियों, एनिमेशन और फ़िल्मों का पूर्णतः निःशुल्क-पहुँच वाला मंच है। मुफ़्त कहानियों और प्रीव्यू का आनंद लें या एकल टिकट से प्रीमियम विज्ञापन-मुक्त कहानियाँ अनलॉक करें।',
      protectionHeading: 'सामग्री संरक्षण सूचना',
      protectionNotice: 'सभी ऑडियो रिकॉर्डिंग, ध्वनि डिज़ाइन, कवर आर्ट और आलेख Goppo Kahini के कॉपीराइट के अंतर्गत सुरक्षित हैं। अनधिकृत डाउनलोड या पुनः वितरण वर्जित है।',
      copyright: '© 2026 Goppo Kahini. सर्वाधिकार सुरक्षित।',
    },
  },
};
