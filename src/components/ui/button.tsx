import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#B9FF66] text-[#191A23] font-bold border border-slate-300/40 dark:border-zinc-700/50 shadow-xs hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66]",
        outline:
          "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-[#191A23] dark:text-zinc-100 hover:bg-slate-50 dark:hover:bg-transparent font-semibold shadow-xs",
        secondary:
          "bg-slate-100 dark:bg-card text-slate-800 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-transparent font-semibold",
        ghost:
          "hover:bg-slate-100 dark:hover:bg-transparent text-slate-700 dark:text-zinc-300 hover:text-[#191A23] dark:hover:text-white font-medium",
        destructive:
          "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 font-semibold border border-red-200 dark:border-red-900/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5",
        xs: "h-7 gap-1 rounded-lg px-2 text-xs",
        sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
        lg: "h-11 gap-2 px-5 text-sm font-bold",
        icon: "size-9 rounded-xl",
        "icon-xs": "size-7 rounded-lg",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button,  }
