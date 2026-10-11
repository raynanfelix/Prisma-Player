import type { BandwidthSeries } from "@/lib/analytics/bandwidth";

export type SettingsSection =
  | "overview"
  | "profile"
  | "team"
  | "password"
  | "security";

export interface AccountProfile {
  email: string;
  full_name: string | null;
  phone: string | null;
  locale: string;
  email_notifications: boolean;
  security_notifications: boolean;
  created_at: string;
}

export interface AccountOverview {
  access: {
    trialStatus: string;
    trialEndsAt: string | null;
    subscriptionActive: boolean;
    hasAccess: boolean;
  };
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    billingMethod: string;
  } | null;
  plan: {
    name: string;
    included_plays: number;
    storage_gb: number;
    prisma_ai_analyses: number;
    team_seats: number;
  } | null;
  usage: {
    plays: number;
    storageBytes: number;
    videos: number;
    aiCredits: number;
    aiUsed: number;
    bandwidth?: {
      monthEgressBytes: number;
      monthCostCents: number;
      gb: number;
      centsPerGb: number;
      series30: BandwidthSeries;
      series90: BandwidthSeries;
      trendPct: number | null;
    };
  };
}

export interface TeamMember {
  id: string;
  role: string;
  user_id: string;
  profile: { email: string; full_name: string | null } | null;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}

export interface AccountTeam {
  team: { name: string };
  currentRole: string;
  seats: number;
  members: TeamMember[];
  invites: TeamInvite[];
}

export interface MfaFactor {
  id: string;
  friendly_name?: string;
  status: string;
}
