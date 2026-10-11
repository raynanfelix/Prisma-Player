import type { LucideIcon } from "lucide-react";
import Header from "./Header";

interface FeaturePlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}

export default function FeaturePlaceholder({
  icon: Icon,
  title,
  description,
  emptyTitle,
  emptyDescription,
}: FeaturePlaceholderProps) {
  return (
    <>
      <Header title={title} description={description} />
      <section className="dashboard-content flex flex-1 flex-col">
        <div className="mb-5 flex items-center gap-3 sm:mb-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-prisma-blue/10 text-prisma-blue">
            <Icon size={21} strokeWidth={1.7} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold tracking-[-0.35px] themeable-text-ink">{title}</h2>
            <p className="mt-0.5 text-[14px] themeable-text-ink-muted-48 sm:hidden">{description}</p>
          </div>
        </div>

        <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-[18px] border themeable-bg-canvas themeable-border-hairline">
          <div className="max-w-md px-6 py-16 text-center">
            <Icon size={36} strokeWidth={1.3} className="mx-auto mb-5 themeable-text-ink-muted-48" />
            <h3 className="text-[21px] font-semibold tracking-[-0.35px] themeable-text-ink">{emptyTitle}</h3>
            <p className="mt-2 text-[15px] leading-relaxed themeable-text-ink-muted-48">{emptyDescription}</p>
          </div>
        </div>
      </section>
    </>
  );
}
