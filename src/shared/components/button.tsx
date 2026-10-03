import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../utils/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[transform,box-shadow,background-color,color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "border border-white bg-white text-black font-semibold shadow-[inset_0_1px_0_#ffffff,0_4px_0_#cbd5e1,0_8px_14px_rgba(0,0,0,0.30)] hover:translate-y-px hover:bg-zinc-100 hover:shadow-[inset_0_1px_0_#ffffff,0_3px_0_#cbd5e1,0_6px_11px_rgba(0,0,0,0.25)] active:translate-y-[3px] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_0_#cbd5e1]",
        secondary:
          "border border-[#35414A] bg-ink-800 text-fog-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_0_#0A0C0E,0_6px_10px_rgba(0,0,0,0.26)] hover:-translate-y-px hover:border-fog-500 hover:text-paper-100 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_0_#0A0C0E,0_7px_12px_rgba(0,0,0,0.3)] active:translate-y-[2px] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_0_#0A0C0E]",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
