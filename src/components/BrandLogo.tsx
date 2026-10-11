import Image from "next/image";

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
  darkSurface?: boolean;
}

export default function BrandLogo({
  className = "h-8 w-auto",
  priority = false,
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2 font-black tracking-tight text-[#191A23] dark:text-white ${className}`}>
      <Image
        src="/faviconnovo.ico"
        alt="Prisma Player Logo"
        width={32}
        height={32}
        priority={priority}
        className="h-8 w-8 object-contain rounded-lg"
      />
      <span className="text-base font-extrabold tracking-tight">PRISMA</span>
    </div>
  );
}
