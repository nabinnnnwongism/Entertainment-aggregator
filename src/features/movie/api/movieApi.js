import { apiUrl } from '../../../runtimeConfig';

const api = (path) => apiUrl(`/api${path.startsWith('/') ? path : `/${path}`}`);

export const movieApi = {
  getHomeCatalog: async () => {
    const res = await fetch(api('/movieplex/home'));
    if (!res.ok) throw new Error('Failed to fetch movie catalog');
    return await res.json();
  },
  getCatalogPage: async ({ category, page = 1, limit = 36, is18 = false } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (category) params.set('category', category);
    if (is18) params.set('is18', 'true');
    const res = await fetch(api(`/movieplex/catalog?${params}`));
    if (!res.ok) throw new Error('Failed to fetch catalog page');
    return await res.json();
  },
  getMovieInfo: async (slug) => {
    const res = await fetch(api(`/movieplex/post-info?slug=${encodeURIComponent(slug)}`));
    if (!res.ok) throw new Error('Failed to fetch movie info');
    return await res.json();
  },
  searchMovies: async (query) => {
    const res = await fetch(api(`/movieplex/search?q=${encodeURIComponent(query)}`));
    if (!res.ok) return [];
    return await res.json();
  }
};

export default movieApi;
