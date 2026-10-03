import * as Select from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

type SeasonSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
};

const seasons = ["Season 1", "Season 2", "OVAs", "Special Editions"];

export function SeasonSelect({ value, onValueChange }: SeasonSelectProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        aria-label="Select season"
        className="inline-flex h-10 items-center justify-between gap-3 border border-ink-700 bg-ink-800 px-4 font-body text-sm text-paper-100 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-fog-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      >
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={16} strokeWidth={1.7} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[8rem] border border-ink-700 bg-ink-900 font-body text-sm text-paper-100 shadow-2xl"
        >
          <Select.Viewport className="p-1">
            {seasons.map((season) => (
              <Select.Item
                key={season}
                value={season}
                className="flex h-9 cursor-pointer items-center px-3 outline-none transition-colors data-[highlighted]:bg-ink-800 data-[highlighted]:text-paper-100"
              >
                <Select.ItemText>{season}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
