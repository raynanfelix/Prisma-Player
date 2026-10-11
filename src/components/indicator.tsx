import React from "react";

export function StatusIndicator() {
  return (
    <span className="relative flex h-2.5 w-2.5 mr-1.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
    </span>
  );
}
