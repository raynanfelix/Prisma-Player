# Specs de feature

Toda decisão de feature nasce aqui: arquivo novo de componente, rota ou módulo
exige uma spec nesta pasta, referenciada na mensagem do commit (regra
anti-sprawl de AGENTS.md; gate `scripts/check-spec.mjs`, warn no CI). Índice em
ordem alfabética:

| Spec | O que decide |
|---|---|
| AGENTIC_V2_SPEC.md | Agentic v2 (Ora 83/100): 4 itens de código + 2 skips deliberados (21/10/2026) |
| BILLING_COMPLETO_SPEC.md | Pacote de fechamento do billing Stripe (20/10/2026) |
| FIXES_POST_TESTE_SPEC.md | 3 bugs pós-teste do dono no billing e no admin (19/10/2026) |
| HLS_DRM_SPEC.md | Criptografia HLS AES-128 (`drmHlsEnabled`), pronta para implementação |
| IMPECCAVEL_SPEC.md | Serviço Impecável: Vitest 5, reconcile Stripe, toggle mensal/anual, UI de time, LGPD técnico, runbooks de escala (19/10/2026) |
| INTEGRACOES_SPEC.md | Integrações: app store de pixels e webhooks com tela própria (17/10/2026) |
| IS_AGENTIC_SPEC.md | Is Agentic / Ora audit: site público legível por agentes de IA (20/10/2026) |
| LGPD_AUDIT_SPEC.md | LGPD Audit Pipeline B: retrofit de conformidade (23/10/2026) |
| ORGANIZACAO_ANTI_SPRAWL_SPEC.md | Reorganização de docs + regra anti-sprawl (23/10/2026) |
| OTP_STEP_UP_ROADMAP.md | Roadmap de OTP como step-up: dispositivo novo, inatividade, troca de e-mail |
| PAGAMENTOS_CICLO_VIDA_SPEC.md | Pagamentos: dunning, grace de 7 dias, lembretes e reembolso admin (23/10/2026) |
| PIXEL_VERIFY_SPEC.md | Sprint 1 Pixel Verdadeiro: verificação real Meta/Google/TikTok (17/10/2026) |
| SECURITY_HARDENING_SPEC.md | Hardening pós-audit: itens 1 a 6 (19/10/2026) |
| SECURITY_VALIDATION_SPEC.md | Validação do relatório de segurança externo, alegação por alegação (23/10/2026) |
| STRIPE_INTEGRATION_SPEC.md | Stripe Opção A: Checkout hospedado (19/10/2026) |
| STRIPE_PHASE2_OVERAGE.md | Stripe fase 2: overage de plays via Metronome (decisão de 19/10/2026) |
