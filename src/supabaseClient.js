import { createClient } from '@supabase/supabase-js';
import { storage } from './utils/storage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Custom persistent storage adapter for Capacitor Preferences + localStorage
const customAuthStorage = {
  getItem: async (key) => {
    const val = await storage.get(key);
    return typeof val === 'string' ? val : (val ? JSON.stringify(val) : null);
  },
  setItem: async (key, value) => {
    await storage.set(key, value);
  },
  removeItem: async (key) => {
    await storage.remove(key);
  },
};

// Check if credentials are valid/configured
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client = null;

if (isConfigured) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: customAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      }
    });
  } catch (err) {
    console.error('[Supabase Client] Failed to initialize real client:', err.message);
  }
}

if (!client) {
  console.warn(
    '[Supabase Client] Warning: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.\n' +
    'The application will fall back to local browser storage (localStorage) for Watch History and Watchlist.\n' +
    'To enable cloud sync and Google/Discord social logins, create a free project on https://supabase.com and add the credentials to your .env file.'
  );

  // Return a mock no-op client to prevent any JS runtime errors when database features are called
  const mockQuery = () => {
    const builder = {
      select: () => builder,
      insert: () => Promise.resolve({ data: [], error: null }),
      upsert: () => Promise.resolve({ data: [], error: null }),
      delete: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  };

  client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      signInWithPassword: () => {
        alert('Supabase credentials are not configured. Standard login is disabled. Showing mock success.');
        return Promise.resolve({ data: { user: { email: 'mock@example.com', id: 'mock-uuid' } }, error: null });
      },
      signUp: () => {
        alert('Supabase credentials are not configured. Registration is disabled. Showing mock success.');
        return Promise.resolve({ data: { user: { email: 'mock@example.com', id: 'mock-uuid' } }, error: null });
      },
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: (callback) => {
        // Fire once with null session
        setTimeout(() => callback('SIGNED_OUT', null), 0);
        return {
          data: {
            subscription: {
              unsubscribe: () => {}
            }
          }
        };
      },
      signInWithOAuth: ({ provider }) => {
        alert(`OAuth integration for ${provider} requires your own Supabase project. Set up credentials in .env to proceed.`);
        return Promise.resolve({ data: null, error: null });
      }
    },
    from: mockQuery,
    isMock: true
  };
}

export const supabase = client;
