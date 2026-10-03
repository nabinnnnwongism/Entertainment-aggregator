import { twMerge } from "tailwind-merge";

type Props = {
  children: React.ReactNode;
  size?: "small" | "medium" | "large";
  className?: string;
  onClick?: () => void;
};

export const Button = ({ children, size = "medium", className, onClick }: Props) => {
  const sizeClassNames = {
    small: "text-xs px-3 py-1.5",
    medium: "text-sm px-5 py-3",
    large: "text-base px-8 py-4",
  };

  return (
    <button
      onClick={onClick}
      className={twMerge(
        "text-textBlack rounded-full bg-white font-apple font-medium transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]",
        sizeClassNames[size],
        className
      )}
    >
      {children}
    </button>
  );
};
