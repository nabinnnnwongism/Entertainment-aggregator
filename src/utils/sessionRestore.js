/**
 * sessionRestore.js — Save and restore the exact app state
 *
 * Saves on every meaningful navigation so when the user leaves and comes back
 * (even hours later, even after phone restart), the app resumes exactly where they left off.
 */

import { storage } from './storage';

const SESSION_KEY = 'eetnet_session_state';
const VIDEO_PROGRESS_PREFIX = 'eetnet_vp_';

/**
 * Save the current full app session state.
 * Call this whenever the user navigates or a video progresses.
 */
export async function saveSession(state) {
  try {
    await storage.set(SESSION_KEY, {
      ...state,
      savedAt: Date.now(),
    });
  } catch (e) {
    console.warn('[Session] Save failed:', e);
  }
}

/**
 * Load the last saved session state.
 * Returns null if nothing was saved or data is too old (>7 days).
 */
export async function loadSession() {
  try {
    const saved = await storage.get(SESSION_KEY);
    if (!saved) return null;

    // Expire sessions older than 7 days
    const AGE_LIMIT = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - (saved.savedAt || 0) > AGE_LIMIT) {
      await storage.remove(SESSION_KEY);
      return null;
    }

    return saved;
  } catch {
    return null;
  }
}

/**
 * Clear the saved session (e.g. when user explicitly goes home).
 */
export async function clearSession() {
  await storage.remove(SESSION_KEY);
}

/**
 * Save video playback progress for a specific media item.
 * mediaId: unique ID string for the anime/movie/drama
 * seconds: current playback position in seconds
 * duration: total duration in seconds
 */
export async function saveVideoProgress(mediaId, seconds, duration) {
  if (!mediaId || seconds < 5) return; // Don't save tiny amounts
  try {
    await storage.set(`${VIDEO_PROGRESS_PREFIX}${mediaId}`, {
      seconds: Math.floor(seconds),
      duration: Math.floor(duration || 0),
      savedAt: Date.now(),
    });
  } catch { /* ignore */ }
}

/**
 * Get the saved video progress for a media item.
 * Returns { seconds, duration } or null.
 */
export async function getVideoProgress(mediaId) {
  if (!mediaId) return null;
  try {
    const prog = await storage.get(`${VIDEO_PROGRESS_PREFIX}${mediaId}`);
    if (!prog) return null;

    // Expire video positions older than 30 days
    const AGE_LIMIT = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - (prog.savedAt || 0) > AGE_LIMIT) return null;

    // Don't restore if nearly finished (>95%)
    if (prog.duration > 0 && prog.seconds / prog.duration > 0.95) return null;

    return prog;
  } catch {
    return null;
  }
}

/**
 * Build a session snapshot from App.jsx state.
 * Call this on every view change.
 */
export function buildSessionSnapshot({
  view,
  activeSection,
  selectedAnime,
  currentEpisode,
  selectedMovie,
  selectedDrama,
  dramaEpisode,
  selectedManga,
  currentMangaChapter,
  activeCategory,
}) {
  return {
    view,
    activeSection,
    activeCategory,
    // Only store minimal data (IDs + title + cover) to keep storage small
    selectedAnime: selectedAnime ? {
      id: selectedAnime.id,
      title: selectedAnime.title,
      coverImage: selectedAnime.coverImage,
      idMal: selectedAnime.idMal,
    } : null,
    currentEpisode: currentEpisode ? {
      number: currentEpisode.number,
    } : null,
    selectedMovie: selectedMovie ? {
      id: selectedMovie.id,
      title: selectedMovie.title,
      slug: selectedMovie.slug,
      movieplexSlug: selectedMovie.movieplexSlug,
      source: selectedMovie.source,
      coverImage: selectedMovie.coverImage,
      thumbnail: selectedMovie.thumbnail,
    } : null,
    selectedDrama: selectedDrama ? {
      id: selectedDrama.id,
      title: selectedDrama.title,
      thumbnail: selectedDrama.thumbnail,
    } : null,
    dramaEpisode: dramaEpisode ? {
      id: dramaEpisode.id,
      number: dramaEpisode.number,
      title: dramaEpisode.title,
    } : null,
    selectedManga: selectedManga ? {
      id: selectedManga.id,
      mangadexId: selectedManga.mangadexId,
      title: selectedManga.title,
      coverImage: selectedManga.coverImage,
    } : null,
    currentMangaChapter: currentMangaChapter ? {
      id: currentMangaChapter.id,
      chapterNumber: currentMangaChapter.chapterNumber,
    } : null,
  };
}
