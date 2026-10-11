import { describe, expect, it } from "vitest";
import { isSubscriptionEffective } from "@/lib/access/service";

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

describe("ciclo de vida do plano", () => {
  it("assinatura ativa no prazo é efetiva", () => {
    expect(isSubscriptionEffective({ status: "active", current_period_end: future })).toBe(true);
  });

  it("assinatura com período vencido não é efetiva", () => {
    expect(isSubscriptionEffective({ status: "active", current_period_end: past })).toBe(false);
  });

  it("fail-closed: período nulo com status active não dá acesso", () => {
    expect(isSubscriptionEffective({ status: "active", current_period_end: null })).toBe(false);
    expect(isSubscriptionEffective({ status: "active" })).toBe(false);
  });

  it("outros status nunca dão acesso", () => {
    for (const status of ["pending", "past_due", "suspended", "cancelled", "expired", "", null]) {
      expect(isSubscriptionEffective({ status, current_period_end: future })).toBe(false);
    }
  });

  it("linha inexistente não dá acesso", () => {
    expect(isSubscriptionEffective(null)).toBe(false);
  });
});
