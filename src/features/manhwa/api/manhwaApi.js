import { apiUrl } from '../../../runtimeConfig';

const api = (path) => apiUrl(`/api${path.startsWith('/') ? path : `/${path}`}`);

export const manhwaApi = {
  getHomeCatalog: async () => {
    const res = await fetch(api('/manhwa/home'));
    if (!res.ok) throw new Error('Failed to fetch manhwa catalog');
    return await res.json();
  },
  getSeriesInfo: async (slug) => {
    const res = await fetch(api(`/manhwa/info/${encodeURIComponent(slug)}`));
    if (!res.ok) throw new Error('Failed to fetch manhwa series info');
    return await res.json();
  },
  getChapterImages: async (slug) => {
    const res = await fetch(api(`/manhwa/chapter/${encodeURIComponent(slug)}`));
    if (!res.ok) throw new Error('Failed to fetch chapter images');
    return await res.json();
  },
  searchManhwa: async (query) => {
    const res = await fetch(api(`/manhwa/search?q=${encodeURIComponent(query)}`));
    if (!res.ok) return [];
    return await res.json();
  }
};

export default manhwaApi;
