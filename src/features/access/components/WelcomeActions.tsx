"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { accessService } from "@/services/access/client";

export default function WelcomeActions() {
  const router = useRouter();
  const [loading, setLoading] = useState<"activate" | "later" | null>(null);
  const [error, setError] = useState("");

  async function submit(action: "activate" | "later") {
    setLoading(action);
    setError("");
    try {
      await accessService.setTrialAction(action);
      if (action === "activate") posthog.capture("trial_activated");
      router.replace(action === "activate" ? "/dashboard/videos" : "/dashboard/billing");
      router.refresh();
    } catch {
      setError("Não foi possível concluir agora. Tente novamente.");
      setLoading(null);
    }
  }

  return (
    <div className="mt-8 space-y-3">
      <Button
        size="lg"
        onClick={() => void submit("activate")}
        disabled={Boolean(loading)}
        className="w-full rounded-full"
      >
        {loading === "activate" ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
        Ativar meus 14 dias agora
      </Button>
      <Button
        size="lg"
        variant="outline"
        onClick={() => void submit("later")}
        disabled={Boolean(loading)}
        className="w-full rounded-full"
      >
        Ativar depois pelo inbox
      </Button>
      {error && <p role="alert" className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}
