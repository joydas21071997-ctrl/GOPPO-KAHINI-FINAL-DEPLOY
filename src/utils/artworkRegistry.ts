import bnHeroZamindar from '../assets/images/bn_hero_zamindar_1793560332131.jpg';
import bnCoverSalbon from '../assets/images/bn_cover_salbon_1793560333383.jpg';
import bnCoverMandir from '../assets/images/bn_cover_mandir_1793560335711.jpg';
import bnCoverNouka from '../assets/images/bn_cover_nouka_1793560336833.jpg';
import hiHeroGhat from '../assets/images/hi_hero_ghat_1793560338651.jpg';
import hiCoverHaveli from '../assets/images/hi_cover_haveli_1793560340202.jpg';
import hiCoverTrain from '../assets/images/hi_cover_train_1793560342556.jpg';
import hiCoverDeodar from '../assets/images/hi_cover_deodar_1793560342556.jpg';

const ARTWORK_MAP: Record<string, string> = {
  bn_hero_zamindar: bnHeroZamindar,
  bn_cover_salbon: bnCoverSalbon,
  bn_cover_mandir: bnCoverMandir,
  bn_cover_nouka: bnCoverNouka,
  hi_hero_ghat: hiHeroGhat,
  hi_cover_haveli: hiCoverHaveli,
  hi_cover_train: hiCoverTrain,
  hi_cover_deodar: hiCoverDeodar,
};

const ARTWORK_FALLBACK_MAP: Record<string, string> = {
  bn_hero_zamindar: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=800&q=80',
  bn_cover_salbon: 'https://images.unsplash.com/photo-1511497584788-876761197069?auto=format&fit=crop&w=800&q=80',
  bn_cover_mandir: 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=800&q=80',
  bn_cover_nouka: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
  hi_hero_ghat: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=800&q=80',
  hi_cover_haveli: 'https://images.unsplash.com/photo-1599809275671-b59424abc7a7?auto=format&fit=crop&w=800&q=80',
  hi_cover_train: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=800&q=80',
  hi_cover_deodar: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80',
};

export function resolveArtworkUrl(keyOrUrl: string | undefined): string {
  if (!keyOrUrl) return '';
  if (ARTWORK_MAP[keyOrUrl]) {
    return ARTWORK_MAP[keyOrUrl];
  }
  if (ARTWORK_FALLBACK_MAP[keyOrUrl]) {
    return ARTWORK_FALLBACK_MAP[keyOrUrl];
  }
  return keyOrUrl;
}
