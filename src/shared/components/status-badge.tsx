type StatusBadgeProps = {
  label: string;
  variant?: "gold" | "ember" | "success";
};

const variantStyles = {
  gold: "border-gold-500/40 text-gold-500 bg-gold-500/10",
  ember: "border-ember-500/40 text-ember-500 bg-ember-500/10",
  success: "border-success-500/40 text-success-500 bg-success-500/10",
};

export function StatusBadge({ label, variant = "gold" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-body text-xs font-medium uppercase tracking-[0.14em] ${variantStyles[variant]}`}
    >
      {label}
    </span>
  );
}
