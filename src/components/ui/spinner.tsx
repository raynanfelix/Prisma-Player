import { Loader } from "lucide-react"
import { cn } from "@/lib/utils"

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | string
  color?: string
}

const sizes: Record<string, string> = {
  xs: "w-4 h-4",
  sm: "w-5 h-5",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-10 h-10",
}

const colors: Record<string, string> = {
  slate: "text-[#191A23] dark:text-white",
  blue: "text-blue-500",
  red: "text-red-500",
  green: "text-emerald-500",
  white: "text-white",
}

export function Spinner({ size = "md", color = "slate" }: SpinnerProps) {
  return (
    <div role="status" aria-label="Carregando...">
      <Loader className={cn("animate-spin", sizes[size] ?? sizes.md, colors[color] ?? colors.slate)} />
    </div>
  )
}