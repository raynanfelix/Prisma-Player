import type { Metadata } from "next";
import { PartyPopper, ShieldCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { Card, CardContent } from "@/components/ui/card";
import WelcomeActions from "@/features/access/components/WelcomeActions";
import { getAccountAccess } from "@/lib/access/service";
import { requireUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Boas-vindas",
  robots: { index: false, follow: false },
};

export default async function WelcomePage() {
  const userId = await requireUser("/welcome");
  const access = await getAccountAccess(userId);
  if (access.onboardingCompleted && access.trialStatus !== "available") {
    redirect("/dashboard/videos");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/35 p-5">
      <Card className="w-full max-w-lg rounded-3xl border-border/70 p-0 shadow-xl shadow-black/5">
        <CardContent className="p-7 text-center sm:p-10">
          <BrandLogo className="mx-auto h-9 w-[180px]" />
          <div className="mx-auto mt-8 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <PartyPopper className="size-8" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">Sua conta Prisma está pronta.</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Você ganhou 14 dias de acesso completo, sem cartão e sem cobrança automática.
          </p>
          <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-2xl bg-muted/70 p-4">
              <Sparkles className="size-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">Todas as ferramentas</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Publique, personalize e analise VSLs reais.</p>
            </div>
            <div className="rounded-2xl bg-muted/70 p-4">
              <ShieldCheck className="size-5 text-green-500" />
              <p className="mt-2 text-sm font-semibold">Sem compromisso</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">O teste termina sozinho e nunca gera cobrança.</p>
            </div>
          </div>
          <WelcomeActions />
        </CardContent>
      </Card>
    </main>
  );
}
