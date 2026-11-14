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

export function resolveArtworkUrl(keyOrUrl: string | undefined): string {
  if (!keyOrUrl) return '';
  if (ARTWORK_MAP[keyOrUrl]) {
    return ARTWORK_MAP[keyOrUrl];
  }
  return keyOrUrl;
}
