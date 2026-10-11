import ThemeToggle from "@/components/ThemeToggle";
import AccountMenu from "./AccountMenu";
import InboxButton from "@/features/inbox/components/InboxButton";

export default function Header(props: { title?: string; description?: string; fullWidth?: boolean }) {
  return <header aria-label={props.title ? `${props.title}: ações da conta` : "Ações da conta"} className="sticky top-0 z-30 border-b themeable-bg-canvas/80 backdrop-blur-xl themeable-border-hairline"><div className={`flex min-h-16 items-center justify-end gap-3 px-4 sm:px-6 lg:px-8 ${props.fullWidth ? "" : "pl-16"}`}><div className="flex shrink-0 items-center gap-2 sm:gap-3"><ThemeToggle /><InboxButton /><AccountMenu /></div></div></header>;
}
