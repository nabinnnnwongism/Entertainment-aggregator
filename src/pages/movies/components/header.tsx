import { Search } from "lucide-react";
import { Button } from "./button";
import { Container } from "./container";

type HeaderProps = {
  onExit: () => void;
  onStreamNow: () => void;
  onSearchClick: () => void;
  onMyListClick: () => void;
  myListCount?: number;
};

export const Header = ({
  onExit,
  onStreamNow,
  onSearchClick,
  onMyListClick,
  myListCount = 0,
}: HeaderProps) => {
  return (
    <>
      <header className="relative z-30 border-b border-white/10 bg-backgroundContrast/90 text-white font-apple backdrop-blur-md">
        <Container className="flex min-h-[--header-row-height] items-center justify-between">
          <button
            onClick={onExit}
            className="-ml-4 flex h-[--header-row-height] items-center gap-2 px-4 text-sm text-fog-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-500"
          >
            <span className="text-xs">←</span>
            <span>Back to EetNet Home</span>
          </button>
          <div className="flex items-center gap-4 text-sm text-fog-500">
            <button
              onClick={onMyListClick}
              className="hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span>My List</span>
              {myListCount > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-ember-500 px-1 text-[10px] font-bold text-white">
                  {myListCount}
                </span>
              )}
            </button>
            <button
              onClick={onSearchClick}
              className="hover:text-white transition-colors p-1"
              aria-label="Search movies"
            >
              <Search size={16} strokeWidth={1.8} />
            </button>
          </div>
        </Container>
      </header>

      <div className="sticky top-0 z-30 border-b border-white/10 bg-backgroundContrast/95 text-white font-apple backdrop-blur-md">
        <Container className="flex min-h-[--header-row-height] items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-white">
              EetNet
            </span>
            <span className="rounded bg-ember-500/90 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">
              MOVIES
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSearchClick}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-fog-500 hover:text-white transition-colors px-2.5 py-1 rounded-full bg-white/5 border border-white/10"
            >
              <Search size={13} strokeWidth={1.8} />
              <span>Browse Catalog</span>
            </button>
            <Button size="small" onClick={onStreamNow}>
              Stream now
            </Button>
          </div>
        </Container>
      </div>
    </>
  );
};
