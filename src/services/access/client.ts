"use client";

import { apiRequest } from "@/services/http/client";

export const accessService = {
  setTrialAction(action: "activate" | "later") {
    return apiRequest<Record<string, never>>("/api/account/trial", {
      method: "POST",
      body: { action },
    });
  },
};
