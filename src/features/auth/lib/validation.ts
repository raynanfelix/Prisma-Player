const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

const EMAIL_DOMAIN_FIXES: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmall.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outllook.com": "outlook.com",
  "outlook.co": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
  "icloud.co": "icloud.com",
};

/**
 * Sugere a correção para erros comuns de digitação no domínio do e-mail
 * (ex.: "voce@gmial.com" → "voce@gmail.com"). Retorna null quando não há sugestão.
 */
export function suggestEmailCorrection(value: string) {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = trimmed.slice(at + 1).toLowerCase();
  const fixed = EMAIL_DOMAIN_FIXES[domain];
  if (!fixed) return null;
  return `${trimmed.slice(0, at)}@${fixed}`;
}

export interface PasswordCheck {
  id: string;
  label: string;
  met: boolean;
  /** Obrigatório: impede o envio do formulário quando não atendido. */
  required: boolean;
}

export function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { id: "length", label: "8+ caracteres", met: password.length >= 8, required: true },
    { id: "upper", label: "1 letra maiúscula", met: /[A-Z]/.test(password), required: false },
    { id: "number", label: "1 número", met: /\d/.test(password), required: false },
    { id: "symbol", label: "1 símbolo (!@#…)", met: /[^A-Za-z0-9\s]/.test(password), required: false },
  ];
}

const STRENGTH_LABELS = ["Muito fraca", "Fraca", "Média", "Forte", "Excelente"] as const;

/**
 * Heurística client-side de força da senha (0-4). Apenas o comprimento mínimo
 * é obrigatório; os demais critérios aumentam a força sem bloquear o envio -
 * a política real continua sendo aplicada pelo servidor.
 */
export function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: STRENGTH_LABELS[0] as string };
  const optionalMet = [
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9\s]/.test(password),
  ].filter(Boolean).length;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (optionalMet >= 2) score += 1;
  if (optionalMet === 3) score += 1;

  return { score, label: STRENGTH_LABELS[score] as string };
}
