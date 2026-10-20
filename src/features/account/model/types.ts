import type { BandwidthSeries } from "@/lib/analytics/bandwidth";

type SettingsSection =
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
    provider: string;
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
  status: string;
  user_id: string;
  profile: { email: string; full_name: string | null } | null;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
}

/** Convite pendente endereçado a ESTE usuário (aceite via POST action=accept). */
export interface TeamInvitation {
  id: string;
  role: string;
  expires_at: string | null;
  team: { name: string };
}

export interface AccountTeam {
  team: { name: string };
  currentRole: string;
  seats: number;
  members: TeamMember[];
  invites: TeamInvite[];
  invitations?: TeamInvitation[];
}

export interface MfaFactor {
  id: string;
  friendly_name?: string;
  status: string;
}

/** Fatura do Stripe na tela Faturamento (GET /api/billing/invoices). */
export interface BillingInvoice {
  id: string;
  number: string | null;
  created_at: string;
  total_cents: number;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
}

/** Cartão padrão do customer (GET /api/billing/payment-method). */
export interface BillingCard {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}
