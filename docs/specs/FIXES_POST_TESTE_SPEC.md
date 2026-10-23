# Fixes pós-teste do dono (19/10/2026) — 3 bugs

## 1. Billing em trial não mostra o plano
`src/app/dashboard/billing/page.tsx` — no bloco do trial ("TESTE 14 DIAS ATIVO"), mostrar qual é o nível de acesso: trocar "Acesso completo liberado" por `"Acesso completo liberado — nível Escala durante o teste"` (ou seja: deixar claro qual plano o trial representa). Também garantir que o card de estado atual aparece ANTES da vitrine (já deve estar).

## 2. Admin: suspender conta sem assinatura → "Falhou: subscription_not_found"
`src/app/admin/users/[id]/page.tsx` + `src/components/admin/UserActions.tsx`: quando `subStatus` é null (trial/sem assinatura), NÃO oferecer a ação de suspender — mostrar estado honesto "Trial / sem assinatura" no lugar do botão de suspender (ou botão desabilitado com tooltip "Sem assinatura ativa"). A ação só aparece quando há subscription. Qualquer outra ação que dependa de assinatura segue o mesmo padrão (ex.: trocar plano mantém — sem plano é upgrade).

## 3. Admin: inputs "não dá para digitar direito"
Suspeita principal: refresh/polling re-montando as páginas do admin no meio da digitação. Investigue com: grep -rn "setInterval\|router.refresh\|location.reload\|revalidate" src/app/admin src/components/admin. Se encontrar polling global, transformar em opt-in ou pausar quando um input está focado (document.activeElement é input/textarea → skip). Se NÃO houver polling, teste a segunda hipótese: inputs dentro de <AdminPanel> com keys instáveis ou parent re-montando (React key por timestamp/resultado de fetch). Fix real com causa comprovada — não maquie.

## Regras
- PowerShell Set-Content PROIBIDO em arquivos com acentos; tsc 0 + npm test (470+) + eslint 0 após tudo; sem build; sem push.
- Outro agente está voando em guard/integrations/alert-webhooks — NÃO toque em: src/lib/api/guard.ts, src/lib/security/*, src/app/api/integrations/**, src/features/integrations/components/**, src/app/api/webhooks/**, .github/**.
