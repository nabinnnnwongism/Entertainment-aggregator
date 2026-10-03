export type ApiConfig = {
  ANIME_API: string;
  DRAMA_API: string;
  COMICS_API: string;
  MOVIES_API: string;
};

const DEFAULT_CONFIG: ApiConfig = {
  ANIME_API: "http://localhost:8080",
  DRAMA_API: "http://localhost:8081",
  COMICS_API: "http://localhost:8082",
  MOVIES_API: "http://localhost:8083",
};

let cachedConfig: ApiConfig | null = null;
let configPromise: Promise<ApiConfig> | null = null;

export async function getApiConfig(): Promise<ApiConfig> {
  if (cachedConfig) return cachedConfig;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    try {
      const res = await fetch("/eetnet-config.json");
      if (res.ok) {
        const json = await res.json();
        cachedConfig = {
          ANIME_API: (json.ANIME_API || DEFAULT_CONFIG.ANIME_API).replace(/\/$/, ""),
          DRAMA_API: (json.DRAMA_API || DEFAULT_CONFIG.DRAMA_API).replace(/\/$/, ""),
          COMICS_API: (json.COMICS_API || DEFAULT_CONFIG.COMICS_API).replace(/\/$/, ""),
          MOVIES_API: (json.MOVIES_API || DEFAULT_CONFIG.MOVIES_API).replace(/\/$/, ""),
        };
        return cachedConfig;
      }
    } catch {
      // Use defaults if config file is not loaded
    }
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  })();

  return configPromise;
}

export function getSyncApiConfig(): ApiConfig {
  return cachedConfig || DEFAULT_CONFIG;
}
