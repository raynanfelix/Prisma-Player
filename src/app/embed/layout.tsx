export default function EmbedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <style>{`html,body{height:auto!important;min-height:0!important;overflow:hidden!important;background:transparent!important;background-color:transparent!important;color-scheme:normal!important}body{margin:0!important}`}</style>
      {children}
    </>
  );
}
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false, noarchive: true } };
