import type { CategoryConfig, StoryItem } from '../src/types/content.ts';

export const DEFAULT_TICKET_PRICE_INR = 9;
export const MAX_LISTENS_PER_PURCHASE = 2;
export const NPASS_MONTHLY_PRICE_INR = 9;

export const INITIAL_CATEGORIES: Array<{ id: CategoryConfig['id']; enabledByAdmin: boolean }> = [
  { id: 'audio', enabledByAdmin: true },
  { id: 'animation', enabledByAdmin: true },
  { id: 'films', enabledByAdmin: true },
];

export const INITIAL_STORIES: StoryItem[] = [
  // =========================================================================
  // BENGALI CATALOG — AUDIO STORIES ('audio') — Newest updated first
  // =========================================================================
  {
    id: 'bn-zamindar-bari',
    language: 'bn',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: true,
    updatedAt: '2026-11-01T12:00:00.000Z',
    title: 'নিশুতিপুরের জমিদারবাড়ি',
    subtitle: 'বর্ষার রাতে শতাব্দীপ্রাচীন দেউড়ির গোপন ইতিহাস',
    synopsis:
      'বাঁকুড়ার প্রান্তিক গ্রাম নিশুতিপুরে পরিত্যক্ত রায়চৌধুরী জমিদারবাড়িতে পুরনো দলিল উদ্ধার করতে গিয়ে তরুণ প্রত্নতাত্ত্বিক অরিত্র আবিষ্কার করে এক অদ্ভুত লণ্ঠন আর বন্ধ নাচঘরের আর্তনাদ। অমাবস্যার চার প্রহরে উন্মোচিত হয় একশো বছরের চাপা পড়া রহস্য।',
    writer: 'সৌম্যদীপ চট্টোপাধ্যায়',
    narrator: 'অনির্বাণ সেনগুপ্ত ও শ্রাবণী মিত্র',
    genre: 'অতিপ্রাকৃত রহস্য',
    coverArt: 'bn_hero_zamindar',
    heroArt: 'bn_hero_zamindar',
    trailerTitle: 'অফিসিয়াল ট্রেলার — নিশুতিপুরের জমিদারবাড়ি',
    trailerDurationLabel: '০১:১৫',
    trailerDurationSeconds: 45,
    trailerAudioKey: 'bn_zamindar_trailer',
    totalDurationLabel: '৫৮ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-zb-ep1',
        number: 1,
        title: 'পর্ব ১: ভাঙ্গা দেউড়ির লণ্ঠন',
        durationLabel: '১৪:২০',
        durationSeconds: 75,
        audioKey: 'bn_zamindar_ep1',
        synopsis: 'ঝড়বৃষ্টির সন্ধ্যায় নিশুতিপুর স্টেশনে নেমে অরিত্র পৌঁছায় বটবৃক্ষে ঘেরা অন্ধকার জমিদারবাড়ির সিংহদুয়ারে।',
      },
      {
        id: 'bn-zb-ep2',
        number: 2,
        title: 'পর্ব ২: নাচঘরের পুরনো ঘড়ি',
        durationLabel: '১৫:১০',
        durationSeconds: 80,
        audioKey: 'bn_zamindar_ep2',
        synopsis: 'রাত বারোটায় অচল দেওয়ালঘড়ির ঘণ্টার সাথে দোতলার বন্ধ নাচঘর থেকে ভেসে আসে এস্রাজের সুর।',
      },
      {
        id: 'bn-zb-ep3',
        number: 3,
        title: 'পর্ব ৩: পাতালঘরের চাবি',
        durationLabel: '১৩:৫০',
        durationSeconds: 72,
        audioKey: 'bn_zamindar_ep3',
        synopsis: 'ঠাকুরদালানের মেঝের নিচে লুকানো তামার সিন্দুকে মেলে ১৮৯৭ সালের এক অসমাপ্ত ডায়েরি।',
      },
      {
        id: 'bn-zb-ep4',
        number: 4,
        title: 'পর্ব ৪: অমাবস্যার শেষ প্রহর',
        durationLabel: '১৪:৪০',
        durationSeconds: 78,
        audioKey: 'bn_zamindar_ep4',
        synopsis: 'ভোরের আলো ফোটার আগে নিশুতিপুরের অভিশাপ থেকে মুক্তির শেষ পথ খুঁজে পায় অরিত্র।',
      },
    ],
  },
  {
    id: 'bn-salboner-prohori',
    language: 'bn',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-30T18:00:00.000Z',
    title: 'শালবনের শেষ প্রহরী',
    subtitle: 'লাল মাটির জঙ্গলে কুয়াশাঘেরা রাতের প্রহরা',
    synopsis:
      'ঝাড়গ্রামের গভীর শালবনে ফরেস্ট বিট অফিসার দেবাশিস দায়িত্ব নেওয়ার পর থেকেই প্রতি পূর্ণিমায় বনের পরিত্যক্ত ওয়াচটাওয়ারে জ্বলে ওঠে এক রহস্যময় আলো। লোককথা নাকি বাস্তব ষড়যন্ত্র—উত্তর লুকিয়ে আছে শালবনের গহীনে।',
    writer: 'ঋতুপর্ণা ঘোষাল',
    narrator: 'কৌশিক চক্রবর্তী',
    genre: 'লোকজ থ্রিলার',
    coverArt: 'bn_cover_salbon',
    heroArt: 'bn_cover_salbon',
    trailerTitle: 'ট্রেলার — শালবনের শেষ প্রহরী',
    trailerDurationLabel: '০০:৫৫',
    trailerDurationSeconds: 40,
    trailerAudioKey: 'bn_salbon_trailer',
    totalDurationLabel: '৪১ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'ticket_only',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-sp-ep1',
        number: 1,
        title: 'পর্ব ১: লাল মাটির বাঁকে',
        durationLabel: '১৩:১৫',
        durationSeconds: 70,
        audioKey: 'bn_salbon_ep1',
        synopsis: 'নতুন ফরেস্ট বাংলোয় প্রথম রাতেই কাঠুরেরা দেবাশিসকে উত্তর দিকের জঙ্গলে যেতে নিষেধ করে।',
      },
      {
        id: 'bn-sp-ep2',
        number: 2,
        title: 'পর্ব ২: মাদলের দূরবর্তী ধ্বনি',
        durationLabel: '১৩:৪৫',
        durationSeconds: 74,
        audioKey: 'bn_salbon_ep2',
        synopsis: 'কুয়াশার ভেতর পুরনো প্রহরীর লণ্ঠন অনুসরণ করে দেবাশিস খুঁজে পায় চল্লিশ বছর আগের এক ফাইল।',
      },
      {
        id: 'bn-sp-ep3',
        number: 3,
        title: 'পর্ব ৩: কুয়াশার ওপারে কে?',
        durationLabel: '১৪:০০',
        durationSeconds: 76,
        audioKey: 'bn_salbon_ep3',
        synopsis: 'শালবনের প্রাচীন শপথ ও নিখোঁজ প্রহরীর আসল পরিচয় প্রকাশ্যে আসে শেষ রাতে।',
      },
    ],
  },
  {
    id: 'bn-bhanga-mandir',
    language: 'bn',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-28T15:00:00.000Z',
    title: 'ভাঙা মন্দিরের প্রদীপ',
    subtitle: 'পদ্মপুকুরের পাড়ে টেরাকোটা মন্দিরের অনির্বাণ শিখা',
    synopsis:
      'মুর্শিদাবাদের এক নির্জন গ্রামে তিনশো বছরের পুরনো টেরাকোটা মন্দিরে ঝড়ের রাতেও নিভে যায় না মাটির প্রদীপ। প্রবীণ পুরোহিতের অন্তর্ধানের পর মন্দিরের গর্ভগৃহে প্রবেশ করে ইতিহাসবিদ মৃণালিনী।',
    writer: 'দেবার্ঘ্য বন্দ্যোপাধ্যায়',
    narrator: 'ইন্দ্রাণী দত্ত',
    genre: 'প্রাচীন রহস্য',
    coverArt: 'bn_cover_mandir',
    heroArt: 'bn_cover_mandir',
    trailerTitle: 'ট্রেলার — ভাঙা মন্দিরের প্রদীপ',
    trailerDurationLabel: '০০:৫০',
    trailerDurationSeconds: 38,
    trailerAudioKey: 'bn_mandir_trailer',
    totalDurationLabel: '২৪ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-bm-ep1',
        number: 1,
        title: 'পূর্ণাঙ্গ গল্প: মন্দিরের নিভে যাওয়া শিখা',
        durationLabel: '২৪:১০',
        durationSeconds: 85,
        audioKey: 'bn_mandir_ep1',
        synopsis: 'টেরাকোটা ফলকের গায়ে খোদাই করা সংকেত মৃণালিনীকে নিয়ে যায় পদ্মপুকুরের তলদেশের গোপন সুড়ঙ্গে।',
      },
    ],
  },
  {
    id: 'bn-kuasha-nodi',
    language: 'bn',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-25T11:00:00.000Z',
    title: 'কুয়াশা নদীর ডাক',
    subtitle: 'মাঝরাতের খেয়াঘাটে নিঃসঙ্গ নৌকার যাত্রী',
    synopsis:
      'সুন্দরবনের প্রান্তবর্তী মাতলা নদীর শাখায় শীতের কুয়াশায় ভেসে আসে এক অচেনা ডিঙি নৌকা। মাঝি হরিপদ যে যাত্রীকে পারাপার করতে রাজি হয়, তার ঝুলিতে রয়েছে পুরো গ্রামের ভবিষ্যৎ বদলে দেওয়ার মতো এক সত্য।',
    writer: 'সপ্তর্ষি মণ্ডল',
    narrator: 'রজতাভ রায়',
    genre: 'মনস্তাত্ত্বিক সাসপেন্স',
    coverArt: 'bn_cover_nouka',
    heroArt: 'bn_cover_nouka',
    trailerTitle: 'ট্রেলার — কুয়াশা নদীর ডাক',
    trailerDurationLabel: '০১:০০',
    trailerDurationSeconds: 42,
    trailerAudioKey: 'bn_nouka_trailer',
    totalDurationLabel: '৩২ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-kn-ep1',
        number: 1,
        title: 'পর্ব ১: মাঝরাতের খেয়াঘাট',
        durationLabel: '১৫:৩০',
        durationSeconds: 74,
        audioKey: 'bn_nouka_ep1',
        synopsis: 'ঘন কুয়াশায় শেষ খেয়া বন্ধ হওয়ার পর ঘাটে এসে দাঁড়ায় কালো শাল গায়ে এক আগন্তুক।',
      },
      {
        id: 'bn-kn-ep2',
        number: 2,
        title: 'পর্ব ২: জলের নিচে ছায়া',
        durationLabel: '১৬:৩০',
        durationSeconds: 78,
        audioKey: 'bn_nouka_ep2',
        synopsis: 'নদীর মাঝপথে লণ্ঠনের আলোয় জলের বুকে ফুটে ওঠে দশ বছর আগের সেই ঝড়ের রাতের স্মৃতি।',
      },
    ],
  },
  {
    id: 'bn-dakbanglor-raat',
    language: 'bn',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-22T09:30:00.000Z',
    title: 'ডাকবাংলোর তেরো নম্বর ঘর',
    subtitle: 'ডুয়ার্সের চা-বাগানে বৃষ্টির রাতের নিষিদ্ধ অধ্যায়',
    synopsis:
      'উত্তরবঙ্গের শতবর্ষী কাঠের ডাকবাংলোয় আশ্রয় নেওয়া ভ্রমণলেখক অনুপম মাঝরাতে শুনতে পায় তালাবন্ধ তেরো নম্বর কক্ষ থেকে ভেসে আসা পুরনো গ্রামোফোনের সুর।',
    writer: 'অভিজ্ঞান সেন',
    narrator: 'সুব্রত মুখার্জি',
    genre: 'ভৌতিক থ্রিলার',
    coverArt: 'bn_hero_zamindar',
    heroArt: 'bn_hero_zamindar',
    trailerTitle: 'ট্রেলার — ডাকবাংলোর তেরো নম্বর ঘর',
    trailerDurationLabel: '০০:৫২',
    trailerDurationSeconds: 39,
    trailerAudioKey: 'bn_dakbanglo_trailer',
    totalDurationLabel: '২৯ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-db-ep1',
        number: 1,
        title: 'পর্ব ১: বৃষ্টির রাতে আগন্তুক',
        durationLabel: '১৪:৩০',
        durationSeconds: 75,
        audioKey: 'bn_dakbanglo_ep1',
        synopsis: 'চৌকিদার ধনঞ্জয় লণ্ঠন নিভিয়ে দেওয়ার পর বারান্দায় শোনা যায় ভেজা জুতোর শব্দ।',
      },
      {
        id: 'bn-db-ep2',
        number: 2,
        title: 'পর্ব ২: গ্রামোফোনের শেষ রেকর্ড',
        durationLabel: '১৪:৩০',
        durationSeconds: 75,
        audioKey: 'bn_dakbanglo_ep2',
        synopsis: 'আলমারির গোপন ড্রয়ারে মেলে ১৯৪২ সালের এক ব্রিটিশ প্ল্যান্টারের চিঠি।',
      },
    ],
  },
  {
    id: 'bn-kalighater-pandulipi',
    language: 'bn',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-19T14:20:00.000Z',
    title: 'কালীঘাটের হারানো পান্ডুলিপি',
    subtitle: 'পুরনো কলকাতার গলিতে পুঁথি ও গুপ্ত সংকেতের সন্ধান',
    synopsis:
      'উত্তর কলকাতার এক প্রাচীন লাইব্রেরির নিলামে কেনা তুলোট কাগজের পুঁথির ভাঁজে মেলে এক গুপ্ত নকশা, যা অনুসরণ করতে গিয়ে গোয়েন্দা প্রজ্ঞাপারমিতা মুখোমুখি হয় এক রহস্যময় চক্রের।',
    writer: 'সৌমিত্র ভট্টাচার্য',
    narrator: 'চৈতালি ঘোষ',
    genre: 'গোয়েন্দা রহস্য',
    coverArt: 'bn_cover_mandir',
    heroArt: 'bn_cover_mandir',
    trailerTitle: 'ট্রেলার — কালীঘাটের হারানো পান্ডুলিপি',
    trailerDurationLabel: '০০:৪৮',
    trailerDurationSeconds: 36,
    trailerAudioKey: 'bn_pandulipi_trailer',
    totalDurationLabel: '৩৬ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-kp-ep1',
        number: 1,
        title: 'পর্ব ১: তুলোট কাগজের সংকেত',
        durationLabel: '১৮:০০',
        durationSeconds: 76,
        audioKey: 'bn_pandulipi_ep1',
        synopsis: 'পুঁথির শেষ পাতায় সিঁদুর দিয়ে আঁকা চিহ্নটি প্রজ্ঞাকে নিয়ে যায় আদিগঙ্গার ঘাটে।',
      },
      {
        id: 'bn-kp-ep2',
        number: 2,
        title: 'পর্ব ২: চোরাবাজারের নিলাম',
        durationLabel: '১৮:০০',
        durationSeconds: 76,
        audioKey: 'bn_pandulipi_ep2',
        synopsis: 'অন্ধকার গলির প্রাচীন ঘড়ির দোকানে উন্মোচিত হয় আসল অপরাধীর মুখোশ।',
      },
    ],
  },

  // =========================================================================
  // BENGALI CATALOG — ANIMATION ('animation')
  // =========================================================================
  {
    id: 'bn-anim-bonbibi',
    language: 'bn',
    category: 'animation',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-31T10:00:00.000Z',
    title: 'বনবিবির অরণ্য গাথা (অ্যানিমেশন)',
    subtitle: 'সুন্দরবনের ম্যানগ্রোভ অরণ্যে দ্বিমাত্রিক লোকজ অ্যানিমেশন',
    synopsis:
      'সুন্দরবনের মৌয়াল বালক দুখের জীবন ও অরণ্যের প্রাচীন লোককথা অবলম্বনে নির্মিত ডার্ক-ফোক অ্যানিমেশন আখ্যান। লণ্ঠনের আলোয় জীবন্ত হয়ে ওঠে বাদাবনের জলের ছায়া।',
    writer: 'অয়ন চক্রবর্তী',
    narrator: 'দেবাঞ্জন চ্যাটার্জি',
    genre: 'লোকজ অ্যানিমেশন',
    coverArt: 'bn_cover_nouka',
    heroArt: 'bn_cover_nouka',
    trailerTitle: 'অ্যানিমেশন প্রিভিউ — বনবিবির অরণ্য গাথা',
    trailerDurationLabel: '০০:৫০',
    trailerDurationSeconds: 38,
    trailerAudioKey: 'bn_anim_bonbibi_trailer',
    totalDurationLabel: '২২ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-ab-ep1',
        number: 1,
        title: 'পর্ব ১: বাদাবনের জোয়ার',
        durationLabel: '১১:০০',
        durationSeconds: 70,
        audioKey: 'bn_anim_bonbibi_ep1',
        synopsis: 'কুয়াশাচ্ছন্ন খাঁড়িতে মধু সংগ্রহে বেরিয়ে দুখে শুনতে পায় অরণ্যের সতর্কবার্তা।',
      },
      {
        id: 'bn-ab-ep2',
        number: 2,
        title: 'পর্ব ২: অরণ্যের প্রহরী',
        durationLabel: '১১:০০',
        durationSeconds: 72,
        audioKey: 'bn_anim_bonbibi_ep2',
        synopsis: 'প্রকৃতির নিয়ম ও অরণ্যের ভারসাম্য রক্ষার শপথে সমাপ্ত হয় অভিযান।',
      },
    ],
  },
  {
    id: 'bn-anim-jochonar-chaya',
    language: 'bn',
    category: 'animation',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-27T16:00:00.000Z',
    title: 'জ্যোৎস্নার ছায়ামানুষ (অ্যানিমেশন)',
    subtitle: 'শালবনের পথে গ্রাফিক নভেল শৈলীর রহস্য অ্যানিমেশন',
    synopsis:
      'রাঢ়বাংলার লাল মাটির পথে পূর্ণিমার রাতে যে ছায়াটি পথিকদের পথ দেখায়, তার পেছনের করুণ ও রহস্যময় কাহিনী এবার সিনেম্যাটিক অ্যানিমেশনে।',
    writer: 'তন্ময় বসু',
    narrator: 'পরমা সেন',
    genre: 'সুপারন্যাচারাল অ্যানিমেশন',
    coverArt: 'bn_cover_salbon',
    heroArt: 'bn_cover_salbon',
    trailerTitle: 'অ্যানিমেশন ট্রেলার — জ্যোৎস্নার ছায়ামানুষ',
    trailerDurationLabel: '০০:৪৫',
    trailerDurationSeconds: 36,
    trailerAudioKey: 'bn_anim_chaya_trailer',
    totalDurationLabel: '১৮ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-aj-ep1',
        number: 1,
        title: 'পূর্ণাঙ্গ অ্যানিমেশন: ছায়াপথের লণ্ঠন',
        durationLabel: '১৮:২০',
        durationSeconds: 76,
        audioKey: 'bn_anim_chaya_ep1',
        synopsis: 'অ্যানিমেটেড দৃশ্যকল্প ও আবহসংগীতে শালবনের প্রাচীন প্রহরীর আখ্যান।',
      },
    ],
  },

  // =========================================================================
  // BENGALI CATALOG — FILMS ('films')
  // =========================================================================
  {
    id: 'bn-film-antaral',
    language: 'bn',
    category: 'films',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-29T20:00:00.000Z',
    title: 'অন্তরালের প্রহর (শর্ট ফিল্ম)',
    subtitle: 'পরিত্যক্ত রাজবাড়ির এক রাতের সিনেম্যাটিক থ্রিলার ফিল্ম',
    synopsis:
      'একটি পুরনো প্রামাণ্যচিত্রের ফুটেজ উদ্ধার করতে গিয়ে দুই তরুণ ফিল্মমেকার আটকে পড়ে বর্ধমানের এক পরিত্যক্ত দেউড়িতে। Goppo Kahini অরিজিনাল শর্ট ফিল্ম।',
    writer: 'সৃজিত মুখোপাধ্যায় ধাঁচ — সৌভিক রায়',
    narrator: 'শিল্পীদল — Goppo Kahini Films',
    genre: 'মিস্ট্রি ফিল্ম',
    coverArt: 'bn_hero_zamindar',
    heroArt: 'bn_hero_zamindar',
    trailerTitle: 'ফিল্ম ট্রেলার — অন্তরালের প্রহর',
    trailerDurationLabel: '০১:০৫',
    trailerDurationSeconds: 42,
    trailerAudioKey: 'bn_film_antaral_trailer',
    totalDurationLabel: '৩৮ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'ticket_only',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-fa-ep1',
        number: 1,
        title: 'পূর্ণাঙ্গ ফিল্ম: অন্তরালের প্রহর',
        durationLabel: '৩৮:০০',
        durationSeconds: 85,
        audioKey: 'bn_film_antaral_ep1',
        synopsis: 'রাতের প্রথম প্রহর থেকে ভোর পর্যন্ত ক্যামেরাবন্দি হওয়া এক রুদ্ধশ্বাস রহস্য।',
      },
    ],
  },
  {
    id: 'bn-film-ferighat',
    language: 'bn',
    category: 'films',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-24T17:00:00.000Z',
    title: 'শেষ ফেরিঘাট (ফিল্ম)',
    subtitle: 'নদীর পাড়ে কুয়াশাচ্ছন্ন রাতের সাইকোলজিক্যাল ড্রামা',
    synopsis:
      'হুগলি নদীর এক পুরনো ফেরিঘাটে শেষ লঞ্চ চলে যাওয়ার পর অপেক্ষমাণ তিন অপরিচিত যাত্রীর কথোপকথনে বেরিয়ে আসে এক অমীমাংসিত অপরাধের সত্য।',
    writer: 'অনির্বাণ দত্ত',
    narrator: 'Goppo Kahini Studio Cast',
    genre: 'থ্রিলার ফিল্ম',
    coverArt: 'bn_cover_nouka',
    heroArt: 'bn_cover_nouka',
    trailerTitle: 'ফিল্ম ট্রেলার — শেষ ফেরিঘাট',
    trailerDurationLabel: '০০:৫৫',
    trailerDurationSeconds: 40,
    trailerAudioKey: 'bn_film_feri_trailer',
    totalDurationLabel: '৩১ মি.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'bn-ff-ep1',
        number: 1,
        title: 'পূর্ণাঙ্গ ফিল্ম: শেষ ফেরিঘাট',
        durationLabel: '৩১:১০',
        durationSeconds: 80,
        audioKey: 'bn_film_feri_ep1',
        synopsis: 'কুয়াশার চাদর সরে যাওয়ার আগেই উন্মোচিত হয় তিন যাত্রীর আসল পরিচয়।',
      },
    ],
  },

  // =========================================================================
  // HINDI CATALOG — AUDIO STORIES ('audio') — Newest updated first
  // =========================================================================
  {
    id: 'hi-kashi-ghat',
    language: 'hi',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: true,
    updatedAt: '2026-11-01T12:00:00.000Z',
    title: 'काशी घाट की ख़ामोशी',
    subtitle: 'आधी रात के कोहरे में डूबी प्राचीन सीढ़ियों का रहस्य',
    synopsis:
      'बनारस के एक शांत प्राचीन घाट पर हर अमावस्या की रात एक बुझता हुआ मिट्टी का दीया और बिना मल्लाह की नाव दिखाई देती है। पत्रकार राघव जब एक गुमशुदा शास्त्रीय गायक की डायरी खोजता है, तो घाट की कोठरियों में छिपा सदियों पुराना सच सामने आता है।',
    writer: 'आलोक वर्धन शर्मा',
    narrator: 'राजेश्वरी पाठक और मानवेंद्र सिंह',
    genre: 'रहस्य और रोमांच',
    coverArt: 'hi_hero_ghat',
    heroArt: 'hi_hero_ghat',
    trailerTitle: 'ऑफ़िशियल ट्रेलर — काशी घाट की ख़ामोशी',
    trailerDurationLabel: '01:10',
    trailerDurationSeconds: 44,
    trailerAudioKey: 'hi_ghat_trailer',
    totalDurationLabel: '54 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-kg-ep1',
        number: 1,
        title: 'अध्याय 1: आधी रात की नाव',
        durationLabel: '13:20',
        durationSeconds: 72,
        audioKey: 'hi_ghat_ep1',
        synopsis: 'सर्द कोहरे में गंगा किनारे राघव को मिलती है तांबे की मुहर लगी एक भीगी हुई चिट्ठी।',
      },
      {
        id: 'hi-kg-ep2',
        number: 2,
        title: 'अध्याय 2: सीढ़ियों पर बुझता दीया',
        durationLabel: '13:40',
        durationSeconds: 76,
        audioKey: 'hi_ghat_ep2',
        synopsis: 'प्राचीन मठ के तहख़ाने में बंद तानपूरे की गूँज राघव को एक अनदेखे गवाह तक ले जाती है।',
      },
      {
        id: 'hi-kg-ep3',
        number: 3,
        title: 'अध्याय 3: बंद कोठरी की पांडुलिपि',
        durationLabel: '13:10',
        durationSeconds: 74,
        audioKey: 'hi_ghat_ep3',
        synopsis: 'सन् 1924 की राग-पुस्तिका के पन्नों में दर्ज है उस आख़िरी बैठक का पूरा सच।',
      },
      {
        id: 'hi-kg-ep4',
        number: 4,
        title: 'अध्याय 4: कोहरे का सच',
        durationLabel: '13:50',
        durationSeconds: 78,
        audioKey: 'hi_ghat_ep4',
        synopsis: 'भोर की पहली आरती के साथ घाट का सदियों पुराना सन्नाटा आख़िरकार टूटता है।',
      },
    ],
  },
  {
    id: 'hi-sooni-haveli',
    language: 'hi',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-30T18:00:00.000Z',
    title: 'सूनी हवेली का राज़',
    subtitle: 'शेखावाटी की बंद झरोखों वाली हवेली की अनकही दास्तान',
    synopsis:
      'राजस्थान के एक रेतीले कस्बे में विरासत में मिली पुरानी हवेली का नक्शा बनाने पहुँची आर्किटेक्ट मीरा को तीसरे चौक के बंद दरवाज़े के पीछे हर रात किसी के क़दमों की आहट सुनाई देती है।',
    writer: 'वंदना कुलकर्णी',
    narrator: 'आदित्य नारायण व्यास',
    genre: 'अलौकिक सस्पेंस',
    coverArt: 'hi_cover_haveli',
    heroArt: 'hi_cover_haveli',
    trailerTitle: 'ट्रेलर — सूनी हवेली का राज़',
    trailerDurationLabel: '00:55',
    trailerDurationSeconds: 40,
    trailerAudioKey: 'hi_haveli_trailer',
    totalDurationLabel: '44 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'ticket_only',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-sh-ep1',
        number: 1,
        title: 'अध्याय 1: झरोखे की परछाईं',
        durationLabel: '14:30',
        durationSeconds: 72,
        audioKey: 'hi_haveli_ep1',
        synopsis: 'हवेली के मुख्य द्वार का ताला खुलते ही आँगन के सूखे कुएँ से ठंडी हवा का झोंका उठता है।',
      },
      {
        id: 'hi-sh-ep2',
        number: 2,
        title: 'अध्याय 2: आँगन में दीपदान',
        durationLabel: '14:40',
        durationSeconds: 75,
        audioKey: 'hi_haveli_ep2',
        synopsis: 'दीवार की भित्तिचित्रों के पीछे छिपा एक गुप्त गलियारा मीरा को चौंका देता है।',
      },
      {
        id: 'hi-sh-ep3',
        number: 3,
        title: 'अध्याय 3: तहख़ाने का दरवाज़ा',
        durationLabel: '14:50',
        durationSeconds: 79,
        audioKey: 'hi_haveli_ep3',
        synopsis: 'अंतिम अध्याय में हवेली के पूर्वजों की वसीयत और उस रात का रहस्य उजागर होता है।',
      },
    ],
  },
  {
    id: 'hi-aakhiri-train',
    language: 'hi',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-28T15:00:00.000Z',
    title: 'कोहरे में आख़िरी ट्रेन',
    subtitle: 'पहाड़ी स्टेशन पर आधी रात को रुकने वाली रहस्यमयी गाड़ी',
    synopsis:
      'हिमालय की तराई में बंद पड़े एक छोटे रेलवे स्टेशन पर भारी बर्फ़बारी की रात अचानक सिग्नल हरा हो जाता है और भाप के इंजन की सीटी गूँज उठती है। स्टेशनमास्टर विक्रम के सामने खड़ी होती है एक ऐसी ट्रेन जिसका नाम किसी समय-सारणी में नहीं है।',
    writer: 'सिद्धार्थ नौटियाल',
    narrator: 'गौरव भारद्वाज',
    genre: 'सस्पेंस थ्रिलर',
    coverArt: 'hi_cover_train',
    heroArt: 'hi_cover_train',
    trailerTitle: 'ट्रेलर — कोहरे में आख़िरी ट्रेन',
    trailerDurationLabel: '00:48',
    trailerDurationSeconds: 38,
    trailerAudioKey: 'hi_train_trailer',
    totalDurationLabel: '26 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-at-ep1',
        number: 1,
        title: 'संपूर्ण कहानी: प्लेटफ़ॉर्म नंबर शून्य',
        durationLabel: '26:15',
        durationSeconds: 84,
        audioKey: 'hi_train_ep1',
        synopsis: 'कोहरे से निकलती पीली हेडलाइट के साथ विक्रम को अपनी ज़िंदगी का सबसे बड़ा फ़ैसला लेना पड़ता है।',
      },
    ],
  },
  {
    id: 'hi-deodar-van',
    language: 'hi',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-25T11:00:00.000Z',
    title: 'देवदार वन की परछाइयाँ',
    subtitle: 'पहाड़ी डाक बंगले की अटारी में जलती रहस्यमयी रोशनी',
    synopsis:
      'कुमाऊँ के घने देवदार जंगलों के बीच बने सौ साल पुराने पत्थर के डाक बंगले में ठहरे लेखक कबीर को अटारी से पुराने टाइपराइटर की आवाज़ सुनाई देती है—जो ठीक वही कहानी लिख रहा है जो कबीर के मन में है।',
    writer: 'नीलांजना जोशी',
    narrator: 'समरजीत वशिष्ठ',
    genre: 'लोक रहस्य',
    coverArt: 'hi_cover_deodar',
    heroArt: 'hi_cover_deodar',
    trailerTitle: 'ट्रेलर — देवदार वन की परछाइयाँ',
    trailerDurationLabel: '00:58',
    trailerDurationSeconds: 42,
    trailerAudioKey: 'hi_deodar_trailer',
    totalDurationLabel: '35 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-dv-ep1',
        number: 1,
        title: 'अध्याय 1: डाक बंगले की खिड़की',
        durationLabel: '17:10',
        durationSeconds: 74,
        audioKey: 'hi_deodar_ep1',
        synopsis: 'चौकीदार बंसीधर शाम ढलने से पहले कबीर को ऊपर की मंज़िल की कुंडी न खोलने की चेतावनी देता है।',
      },
      {
        id: 'hi-dv-ep2',
        number: 2,
        title: 'अध्याय 2: बर्फ़ीली पगडंडी',
        durationLabel: '17:50',
        durationSeconds: 78,
        audioKey: 'hi_deodar_ep2',
        synopsis: 'देवदार के पेड़ों के बीच मिले पुराने पत्रों से अटारी के अनदेखे लेखक की पहचान खुलती है।',
      },
    ],
  },
  {
    id: 'hi-chunar-kila',
    language: 'hi',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-22T09:30:00.000Z',
    title: 'चुनार किले का तहख़ाना',
    subtitle: 'गंगा तट की प्राचीन दीवारों में कैद तिलिस्मी इतिहास',
    synopsis:
      'चुनार के ऐतिहासिक किले में पुरातत्व सर्वेक्षण के दौरान मिली एक गुप्त सुरंग इतिहासकार रुद्र को चंद्रकांता युग के एक अनसुलझे रहस्य के सामने ला खड़ा करती है।',
    writer: 'देवकीनंदन परंपरा — अनुराग मिश्र',
    narrator: 'आशुतोष राणा शैली — विक्रांत',
    genre: 'ऐतिहासिक रहस्य',
    coverArt: 'hi_hero_ghat',
    heroArt: 'hi_hero_ghat',
    trailerTitle: 'ट्रेलर — चुनार किले का तहख़ाना',
    trailerDurationLabel: '00:50',
    trailerDurationSeconds: 38,
    trailerAudioKey: 'hi_chunar_trailer',
    totalDurationLabel: '31 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-ck-ep1',
        number: 1,
        title: 'अध्याय 1: पत्थर की मुहर',
        durationLabel: '15:30',
        durationSeconds: 75,
        audioKey: 'hi_chunar_ep1',
        synopsis: 'किले की पश्चिमी प्राचीर के नीचे मशाल की रोशनी में खुलता है सातवां दरवाज़ा।',
      },
      {
        id: 'hi-ck-ep2',
        number: 2,
        title: 'अध्याय 2: तिलिस्मी संदूक',
        durationLabel: '15:30',
        durationSeconds: 75,
        audioKey: 'hi_chunar_ep2',
        synopsis: 'सदियों पुरानी पहेली सुलझते ही सामने आता है खजाने के असली रक्षक का सच।',
      },
    ],
  },
  {
    id: 'hi-shimla-dakghar',
    language: 'hi',
    category: 'audio',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-19T14:20:00.000Z',
    title: 'शिमला का पुराना डाकघर',
    subtitle: 'बर्फ़ीली रात में पचास साल बाद पहुँचा एक गुमनाम ख़त',
    synopsis:
      'शिमला के एक बंद हो चुके डाकघर की मरम्मत के दौरान डाकिया रघुवीर को सन् 1974 की मुहर लगा एक लिफ़ाफ़ा मिलता है, जिसे पहुँचाने पर अतीत का एक गहरा राज़ खुलता है।',
    writer: 'प्रियंवदा काश्यप',
    narrator: 'नेहा बहुगुणा',
    genre: 'मिस्ट्री ड्रामा',
    coverArt: 'hi_cover_train',
    heroArt: 'hi_cover_train',
    trailerTitle: 'ट्रेलर — शिमला का पुराना डाकघर',
    trailerDurationLabel: '00:46',
    trailerDurationSeconds: 36,
    trailerAudioKey: 'hi_shimla_trailer',
    totalDurationLabel: '28 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-sd-ep1',
        number: 1,
        title: 'संपूर्ण कहानी: 1974 का लिफ़ाफ़ा',
        durationLabel: '28:00',
        durationSeconds: 78,
        audioKey: 'hi_shimla_ep1',
        synopsis: 'देवदार की घाटी में बने उस कॉटेज का दरवाज़ा खुलते ही पचास साल का इंतज़ार ख़त्म होता है।',
      },
    ],
  },

  // =========================================================================
  // HINDI CATALOG — ANIMATION ('animation')
  // =========================================================================
  {
    id: 'hi-anim-tilism',
    language: 'hi',
    category: 'animation',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-31T10:00:00.000Z',
    title: 'तिलिस्मी गढ़ की कथा (एनिमेशन)',
    subtitle: 'राजपूताना की रहस्यमयी बावड़ी पर आधारित सिनेमैटिक एनिमेशन',
    synopsis:
      'रेगिस्तान के बीच बनी एक प्राचीन बावड़ी और उसके गुप्त प्रहरी की लोककथा को जीवंत करता 2D डार्क-फैंटेसी एनिमेशन।',
    writer: 'कुणाल शेखावत',
    narrator: 'रुद्रप्रताप सिंह',
    genre: 'लोक एनिमेशन',
    coverArt: 'hi_cover_haveli',
    heroArt: 'hi_cover_haveli',
    trailerTitle: 'एनिमेशन ट्रेलर — तिलिस्मी गढ़ की कथा',
    trailerDurationLabel: '00:50',
    trailerDurationSeconds: 38,
    trailerAudioKey: 'hi_anim_tilism_trailer',
    totalDurationLabel: '21 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-at-anim-ep1',
        number: 1,
        title: 'अध्याय 1: बावड़ी की सीढ़ियाँ',
        durationLabel: '21:00',
        durationSeconds: 75,
        audioKey: 'hi_anim_tilism_ep1',
        synopsis: 'चाँदनी रात में बावड़ी के जल में उभरता है प्राचीन किले का प्रतिबिंब।',
      },
    ],
  },
  {
    id: 'hi-anim-himalaya',
    language: 'hi',
    category: 'animation',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-27T16:00:00.000Z',
    title: 'हिमालय का हिम-प्रहरी (एनिमेशन)',
    subtitle: 'बर्फ़ीली चोटियों और देवदार वनों की रहस्यमयी गाथा',
    synopsis:
      'पहाड़ी गाँव के बुज़ुर्गों द्वारा सुनाई जाने वाली हिम-प्रहरी की कहानी, जो तूफ़ानी रातों में भटके मुसाफ़िरों को मशाल दिखाता है।',
    writer: 'राघवेंद्र पंत',
    narrator: 'काव्या जोशी',
    genre: 'मिस्ट्री एनिमेशन',
    coverArt: 'hi_cover_deodar',
    heroArt: 'hi_cover_deodar',
    trailerTitle: 'एनिमेशन ट्रेलर — हिमालय का हिम-प्रहरी',
    trailerDurationLabel: '00:45',
    trailerDurationSeconds: 36,
    trailerAudioKey: 'hi_anim_him_trailer',
    totalDurationLabel: '19 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-ah-anim-ep1',
        number: 1,
        title: 'संपूर्ण एनिमेशन: तूफ़ान की मशाल',
        durationLabel: '19:15',
        durationSeconds: 74,
        audioKey: 'hi_anim_him_ep1',
        synopsis: 'बर्फ़ीली आंधी के बीच जलती मशाल का रहस्य।',
      },
    ],
  },

  // =========================================================================
  // HINDI CATALOG — FILMS ('films')
  // =========================================================================
  {
    id: 'hi-film-banaras-raat',
    language: 'hi',
    category: 'films',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-29T20:00:00.000Z',
    title: 'अस्सी घाट की आख़िरी रात (फ़िल्म)',
    subtitle: 'कोहरे और दीपों के बीच फिल्माई गई मिस्ट्री शॉर्ट फ़िल्म',
    synopsis:
      'एक गुमनाम पेंटर की अधूरी कैनवास पेंटिंग के पीछे छिपे रहस्य को तलाशती Goppo Kahini ओरिजिनल हिंदी शॉर्ट फ़िल्म।',
    writer: 'अभिषेक कश्यप',
    narrator: 'Goppo Kahini Hindi Ensemble',
    genre: 'मिस्ट्री फ़िल्म',
    coverArt: 'hi_hero_ghat',
    heroArt: 'hi_hero_ghat',
    trailerTitle: 'फ़िल्म ट्रेलर — अस्सी घाट की आख़िरी रात',
    trailerDurationLabel: '01:02',
    trailerDurationSeconds: 40,
    trailerAudioKey: 'hi_film_banaras_trailer',
    totalDurationLabel: '36 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'ticket_only',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-fb-ep1',
        number: 1,
        title: 'संपूर्ण फ़िल्म: अस्सी घाट की आख़िरी रात',
        durationLabel: '36:00',
        durationSeconds: 82,
        audioKey: 'hi_film_banaras_ep1',
        synopsis: 'आधी रात से भोर तक बनारस की गलियों में चलता एक सस्पेंस थ्रिलर।',
      },
    ],
  },
  {
    id: 'hi-film-junction',
    language: 'hi',
    category: 'films',
    collections: ['new'],
    isFeaturedHero: false,
    updatedAt: '2026-10-24T17:00:00.000Z',
    title: 'मिडनाइट जंक्शन (फ़िल्म)',
    subtitle: 'पहाड़ी रेलवे जंक्शन के वेटिंग रूम की थ्रिलर फ़िल्म',
    synopsis:
      'भारी बारिश के कारण पहाड़ में भूस्खलन होने से एक छोटे जंक्शन के वेटिंग रूम में फंसे चार अजनबियों के बीच सच और झूठ का खेल।',
    writer: 'रजत कपूर शैली — निखिल वर्मा',
    narrator: 'Goppo Kahini Studio Cast',
    genre: 'सस्पेंस फ़िल्म',
    coverArt: 'hi_cover_train',
    heroArt: 'hi_cover_train',
    trailerTitle: 'फ़िल्म ट्रेलर — मिडनाइट जंक्शन',
    trailerDurationLabel: '00:54',
    trailerDurationSeconds: 38,
    trailerAudioKey: 'hi_film_junction_trailer',
    totalDurationLabel: '33 मि.',
    ticketPriceInr: 9,
    accessPolicy: 'both',
    publicationStatus: 'published',
    releaseYear: 2026,
    episodes: [
      {
        id: 'hi-fj-ep1',
        number: 1,
        title: 'संपूर्ण फ़िल्म: मिडनाइट जंक्शन',
        durationLabel: '33:20',
        durationSeconds: 80,
        audioKey: 'hi_film_junction_ep1',
        synopsis: 'सुबह की पहली ट्रेन आने से पहले खुलता है चौथे मुसाफ़िर का राज़।',
      },
    ],
  },
];

/**
 * Generates an atmospheric cinematic audio drama soundscape (16-bit mono PCM WAV)
 * uniquely seeded by the story/episode key so trailers and episodes play genuinely
 * in HTML5 <audio> elements with full seeking, playback rate, and OS MediaSession support.
 */
export function synthesizeAtmosphericWav(audioKey: string, durationSeconds: number): Buffer {
  const sampleRate = 16000;
  const clampedSeconds = Math.max(15, Math.min(durationSeconds, 95));
  const numSamples = sampleRate * clampedSeconds;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  let hash = 2166136261;
  for (let i = 0; i < audioKey.length; i++) {
    hash ^= audioKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = Math.abs(hash);

  const roots = [130.81, 146.83, 164.81, 174.61, 196.0];
  const rootFreq = roots[seed % roots.length];
  const scaleRatios = [1, 1.122, 1.189, 1.335, 1.498, 1.587, 1.888, 2.0];

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let phaseDrone1 = 0;
  let phaseDrone2 = 0;
  let phaseMelody = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    let masterEnv = 1.0;
    if (t < 1.5) masterEnv = t / 1.5;
    else if (t > clampedSeconds - 2.0) masterEnv = Math.max(0, (clampedSeconds - t) / 2.0);

    const breath = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.18 * t);
    phaseDrone1 += (2 * Math.PI * rootFreq) / sampleRate;
    phaseDrone2 += (2 * Math.PI * (rootFreq * 1.498)) / sampleRate;

    const drone =
      0.22 * Math.sin(phaseDrone1) * breath +
      0.11 * Math.sin(phaseDrone2) * (1.0 - 0.2 * Math.cos(2 * Math.PI * 0.11 * t)) +
      0.04 * Math.sin(phaseDrone1 * 2);

    const notePeriod = 2.5;
    const noteIndex = Math.floor(t / notePeriod);
    const localT = t - noteIndex * notePeriod;
    const ratio = scaleRatios[(noteIndex * 3 + (seed % 5)) % scaleRatios.length];
    const melodyFreq = rootFreq * 2 * ratio;
    phaseMelody += (2 * Math.PI * melodyFreq) / sampleRate;

    const noteAttack = Math.min(1, localT / 0.12);
    const noteDecay = Math.exp(-localT * 1.65);
    const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * localT);
    const melody =
      0.24 *
      noteAttack *
      noteDecay *
      (Math.sin(phaseMelody * vibrato) + 0.3 * Math.sin(phaseMelody * 2));

    const pulseLocal = t % 3.75;
    const heartbeat =
      pulseLocal < 0.35
        ? 0.16 * Math.sin(2 * Math.PI * 58 * pulseLocal) * Math.exp(-pulseLocal * 10)
        : 0;

    const sample = Math.max(-0.95, Math.min(0.95, (drone + melody + heartbeat) * masterEnv));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  return buffer;
}
