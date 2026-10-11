export type AbacateEnvelope<T> = {
  data: T;
  success: boolean;
  error: string | null;
};

export type AbacateProduct = {
  id: string;
  externalId: string;
  name: string;
  price: number;
  cycle?: string | null;
};

export type AbacateCustomer = {
  id: string;
  email: string;
};

export type AbacateCheckout = {
  id: string;
  externalId: string;
  url: string;
  amount: number;
  status: string;
  devMode?: boolean;
  currency?: string;
  receiptUrl?: string | null;
};

export type AbacateWebhook = {
  id: string;
  event: string;
  apiVersion?: number;
  devMode?: boolean;
  data?: Record<string, unknown>;
};
