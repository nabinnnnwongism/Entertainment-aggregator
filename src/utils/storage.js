/**
 * storage.js — Universal persistent storage
 *
 * On Android APK  → uses @capacitor/preferences (survives RAM kills, app restarts, OS updates)
 * On web browser  → falls back to localStorage seamlessly
 */

function isNative() {
  return typeof window !== 'undefined' &&
    window.Capacitor !== undefined &&
    window.Capacitor.isNativePlatform?.();
}

let PreferencesPlugin = null;

async function getPreferences() {
  if (PreferencesPlugin) return PreferencesPlugin;
  if (isNative()) {
    try {
      const mod = await import('@capacitor/preferences');
      PreferencesPlugin = mod.Preferences;
    } catch {
      PreferencesPlugin = null;
    }
  }
  return PreferencesPlugin;
}

export const storage = {
  set: async (key, value) => {
    const serialized = JSON.stringify(value);
    try {
      const Pref = await getPreferences();
      if (Pref) { await Pref.set({ key, value: serialized }); return; }
    } catch { /* fall through */ }
    try { localStorage.setItem(key, serialized); } catch { /* storage full */ }
  },

  get: async (key) => {
    try {
      const Pref = await getPreferences();
      if (Pref) {
        const { value } = await Pref.get({ key });
        if (value === null || value === undefined) return null;
        return JSON.parse(value);
      }
    } catch { /* fall through */ }
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },

  remove: async (key) => {
    try {
      const Pref = await getPreferences();
      if (Pref) { await Pref.remove({ key }); return; }
    } catch { /* fall through */ }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },

  clear: async () => {
    try {
      const Pref = await getPreferences();
      if (Pref) { await Pref.clear(); return; }
    } catch { /* fall through */ }
    try { localStorage.clear(); } catch { /* ignore */ }
  },
};
