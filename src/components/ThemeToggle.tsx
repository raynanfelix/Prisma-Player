"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  onDarkSurface?: boolean;
}

function subscribe(callback: () => void) {
  window.addEventListener("prisma-theme-change", callback);
  return () => window.removeEventListener("prisma-theme-change", callback);
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

export default function ThemeToggle({ onDarkSurface = false }: ThemeToggleProps) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, () => false);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    window.dispatchEvent(new Event("prisma-theme-change"));
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
      className={cn(
        "size-10 rounded-full text-muted-foreground hover:text-foreground",
        onDarkSurface && "text-white/70 hover:bg-white/10 hover:text-white",
      )}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
