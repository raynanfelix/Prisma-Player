import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface AuthFieldProps extends ComponentProps<typeof Input> {
  label: string;
  hint?: string;
  trailing?: ReactNode;
}

export function AuthField({ label, hint, trailing, className, id, ...props }: AuthFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-4">
        <label htmlFor={id} className="text-xs font-semibold text-[#191A23]">
          {label}
        </label>
        {trailing}
      </div>
      <Input
        id={id}
        className={cn(
          "h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#191A23] transition-all focus-visible:outline-none focus-visible:border-[#B9FF66] focus-visible:ring-2 focus-visible:ring-[#B9FF66]/50 placeholder:text-slate-400 shadow-none",
          className,
        )}
        {...props}
      />
      {hint && <p className="text-xs font-medium text-slate-500">{hint}</p>}
    </div>
  );
}
