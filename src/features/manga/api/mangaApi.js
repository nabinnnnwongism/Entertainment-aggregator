import { apiUrl } from '../../../runtimeConfig';

const api = (path) => apiUrl(`/api${path.startsWith('/') ? path : `/${path}`}`);

export const mangaApi = {
  getHomeCatalog: async () => {
    const res = await fetch(api('/manga/home'));
    if (!res.ok) throw new Error('Failed to fetch manga catalog');
    return await res.json();
  },
  getMangaInfo: async (slug) => {
    const res = await fetch(api(`/manga/info/${encodeURIComponent(slug)}`));
    if (!res.ok) throw new Error('Failed to fetch manga info');
    return await res.json();
  },
  getChapterPages: async (slug) => {
    const res = await fetch(api(`/manga/chapter/${encodeURIComponent(slug)}`));
    if (!res.ok) throw new Error('Failed to fetch chapter pages');
    return await res.json();
  },
  searchManga: async (query) => {
    const res = await fetch(api(`/manga/search?q=${encodeURIComponent(query)}`));
    if (!res.ok) return [];
    return await res.json();
  }
};

export default mangaApi;
