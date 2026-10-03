type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
};

export function SectionHeader({ eyebrow, title }: SectionHeaderProps) {
  return (
    <header className="mb-6">
      {eyebrow && (
        <p className="font-body text-xs font-medium uppercase tracking-[0.16em] text-fog-500">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-1 font-display text-[25px] leading-[30px] tracking-display text-paper-100 sm:text-[31px] sm:leading-[37px]">
        {title}
      </h2>
    </header>
  );
}
