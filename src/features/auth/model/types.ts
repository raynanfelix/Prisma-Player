export type AuthNoticeTone = "error" | "success" | "info";

export interface AuthNoticeState {
  message: string;
  tone: AuthNoticeTone;
}
