-- Fix roadmap kanban 400: estende o CHECK de admin_audit_log.action para as
-- ações do roadmap ("roadmap_task_moved"/"updated"/"deleted"). Sem isto, o
-- INSERT do audit violava o CHECK e a rota devolvia 400 APÓS o update já
-- commitado (task movia no banco, cliente via erro). Aditiva e reversível.

ALTER TABLE "admin_audit_log" DROP CONSTRAINT IF EXISTS "admin_audit_log_action_check";

ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_action_check" CHECK ("admin_audit_log"."action" in (
  'plan_change', 'subscription_suspend', 'subscription_reactivate',
  'trial_extend', 'trial_reset', 'credit_adjust',
  'support_case_opened', 'support_case_updated', 'support_note_added',
  'team_role_changed',
  'roadmap_task_moved', 'roadmap_task_updated', 'roadmap_task_deleted'
));