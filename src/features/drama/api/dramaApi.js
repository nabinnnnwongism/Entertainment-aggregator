import { apiUrl } from '../../../runtimeConfig';

const backendApi = (path) => apiUrl(`/api${path.startsWith('/') ? path : `/${path}`}`);

export const dramaApi = {
  getHomeCatalog: async () => {
    const res = await fetch(backendApi('/drama/home'));
    if (!res.ok) throw new Error('Failed to fetch drama home catalog');
    return await res.json();
  },

  getDramaInfo: async (id) => {
    const res = await fetch(backendApi(`/drama/info/${encodeURIComponent(id)}`));
    if (!res.ok) throw new Error('Failed to fetch drama info');
    return await res.json();
  },

  getEpisodeStream: async (episodeId) => {
    const res = await fetch(backendApi(`/drama/stream/${encodeURIComponent(episodeId)}`));
    if (!res.ok) throw new Error('Failed to fetch drama episode stream');
    return await res.json();
  },

  searchDrama: async (query) => {
    const res = await fetch(backendApi(`/drama/search?q=${encodeURIComponent(query)}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
};

export default dramaApi;
