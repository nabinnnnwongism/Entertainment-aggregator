export function SiteFooter() {
  return (
    <footer className="border-t border-ink-700 bg-ink-950 py-12 text-center font-body text-xs text-fog-500">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12">
        <p>EetNet · Editorial Japanese animation streaming</p>
        <p className="mt-2 text-fog-500/60">
          Content powered by AniList GraphQL API. Video streams via HiAnime, AnimeKai &amp; AnimeRulz.
        </p>
        <p className="mt-4 text-[11px] text-fog-500/40">
          © {new Date().getFullYear()} EetNet. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
