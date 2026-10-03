import { Search, UserRound } from "lucide-react";

export type NavigationPage = "home" | "anime" | "drama" | "comics" | "movies";

type SiteNavProps = {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
};

export function SiteNav({ activePage, onNavigate }: SiteNavProps) {
  const links: Array<{ page: NavigationPage; label: string; unavailable?: boolean }> = [
    { page: "home", label: "Home" },
    { page: "anime", label: "Anime" },
    { page: "movies", label: "Movies" },
    { page: "drama", label: "Drama" },
    { page: "comics", label: "Comics" },
  ];
  const section =
    activePage === "anime"
      ? { label: "ANIME", color: "text-gold-500" }
      : activePage === "movies"
      ? { label: "MOVIES", color: "text-ember-500" }
      : activePage === "drama"
      ? { label: "DRAMA", color: "text-[#E86D7B]" }
      : undefined;

  return (
    <nav
      className="flex min-h-16 items-center justify-between border-y border-ink-700 bg-ink-900 px-6 font-body text-sm"
      aria-label="Primary navigation"
    >
      <button
        className={`text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${
          section
            ? "font-body text-[1.35rem] font-semibold tracking-[-0.065em]"
            : "font-display text-2xl tracking-display"
        }`}
        onClick={() => onNavigate("home")}
      >
        EetNet
        {section && (
          <span className={`ml-0.5 text-[0.68em] font-bold tracking-[0.015em] ${section.color}`}>
            {section.label}
          </span>
        )}
      </button>
      <div className="hidden items-center gap-6 text-fog-500 lg:flex">
        {links.map((link) => (
          <button
            key={link.page}
            className={`transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${
              activePage === link.page ? "text-paper-100" : "hover:text-paper-100"
            } ${link.unavailable ? "cursor-not-allowed opacity-45" : ""}`}
            onClick={() => onNavigate(link.page)}
            title={link.unavailable ? "Coming later" : undefined}
            disabled={link.unavailable}
          >
            {link.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4 text-paper-100">
        <button aria-label="Search">
          <Search size={19} strokeWidth={1.7} />
        </button>
        <button aria-label="Profile">
          <UserRound size={19} strokeWidth={1.7} />
        </button>
      </div>
    </nav>
  );
}
