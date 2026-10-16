export type AuthNoticeTone = "error" | "success" | "info";

export interface AuthNoticeAction {
  label: string;
  href: string;
}

export interface AuthNoticeState {
  message: string;
  tone: AuthNoticeTone;
  /** Ação opcional de recuperação exibida junto à mensagem (ex.: "Fazer login"). */
  action?: AuthNoticeAction;
}
