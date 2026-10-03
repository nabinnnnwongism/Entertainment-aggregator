import { api, checkHindiDub, hasHindiDub } from '../../../mockData';
import { getHindiAnimeList } from '../hindi/api/hindiApi';

export const animeApi = {
  getAnimeDetails: api.getAnimeDetails,
  getEpisodeSources: api.getEpisodeSources,
  getFranchise: api.getFranchise,
  getTVShows: api.getTVShows,
  getMovies: api.getMovies,
  getNewAndPopular: api.getNewAndPopular,
  searchAnime: api.searchAnime,
  getGenreList: api.getGenreList,
  getEpisodePage: api.getEpisodePage,
  checkHindiDub,
  hasHindiDub,
  getHindiAnimeList,
};

export default animeApi;
