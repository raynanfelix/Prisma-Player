import type React from "react";

export const LogoIcon = ({ className = "size-7", ...props }: React.ComponentProps<"svg">) => (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 select-none ${className}`}
    {...props}
  >
    <defs>
      <linearGradient id="prismaLimeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D2FF52" />
        <stop offset="50%" stopColor="#B9FF66" />
        <stop offset="100%" stopColor="#8BE324" />
      </linearGradient>
      <linearGradient id="prismaLimeOverlay" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#7CC81A" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#E2FF85" stopOpacity="0.8" />
      </linearGradient>
    </defs>
    <path
      d="M10 8.5C10 6.2 12.5 4.8 14.4 6L32.2 17.5C34 18.7 34 21.3 32.2 22.5L14.4 34C12.5 35.2 10 33.8 10 31.5V8.5Z"
      fill="url(#prismaLimeGrad)"
    />
    <path
      d="M10 8.5C10 6.2 12.5 4.8 14.4 6L24 12.2L16 23L10 18V8.5Z"
      fill="url(#prismaLimeOverlay)"
      opacity="0.6"
    />
  </svg>
);

export const Logo = ({ className = "", ...props }: React.ComponentProps<"div">) => (
  <div className={`flex items-center gap-2.5 select-none ${className}`} {...props}>
    <LogoIcon className="size-8" />
    <span className="font-extrabold text-lg tracking-tight text-[#191A23] dark:text-white flex items-center gap-1">
      <span>Prisma</span>
      <span className="font-semibold text-slate-700 dark:text-slate-300">Player</span>
    </span>
  </div>
);
