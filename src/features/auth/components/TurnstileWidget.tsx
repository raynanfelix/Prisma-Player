"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Componente client-side do Cloudflare Turnstile.
 *
 * Renderiza o widget e expõe o token via callback. O token é efêmero e
 * single-use — deve ser validado server-side antes de processar qualquer
 * ação sensível.
 *
 * Site key: passada via prop (vem de env NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY).
 * Secret key: NUNCA no frontend — vive apenas no servidor (CLOUDFLARE_TURNSTILE_SECRET_KEY).
 */

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        action?: string;
        callback?: (token: string) => void;
        "error-callback"?: (error: unknown) => void;
        "expired-callback"?: () => void;
        theme?: "light" | "dark" | "auto";
        size?: "normal" | "compact";
      }) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  action?: string;
  onTokenChange: (token: string | null) => void;
  onError?: (error: unknown) => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
}

export function TurnstileWidget({
  siteKey,
  action = "login",
  onTokenChange,
  onError,
  theme = "auto",
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Carrega o script do Turnstile uma única vez
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Se já carregou, marca como pronto
    if (window.turnstile) {
      setScriptLoaded(true);
      return;
    }

    // Verifica se o script já existe no DOM
    const existingScript = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );
    if (existingScript) {
      // Script já está carregando ou carregado; espera o onload
      existingScript.addEventListener("load", () => setScriptLoaded(true));
      // Se já carregou mas o evento não disparou
      if (window.turnstile) setScriptLoaded(true);
      return;
    }

    // Injeta o script
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.error("[turnstile] Falha ao carregar script do Turnstile");
      onError?.(new Error("Falha ao carregar script do Turnstile"));
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup: não remove o script (pode ser usado por outros widgets)
    };
  }, [onError]);

  // Renderiza o widget quando o script estiver pronto e o container existir
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.turnstile) return;

    // Evita renderizar múltiplas vezes
    if (widgetIdRef.current !== null) return;

    try {
      const id = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme,
        size: "normal",
        callback: (token: string) => {
          onTokenChange(token);
        },
        "error-callback": (error: unknown) => {
          console.error("[turnstile] Erro no widget:", error);
          onTokenChange(null);
          onError?.(error);
        },
        "expired-callback": () => {
          // Token expirou — limpa e deixa o widget re-gerar automaticamente
          onTokenChange(null);
        },
      });
      widgetIdRef.current = id;
    } catch (error) {
      console.error("[turnstile] Falha ao renderizar widget:", error);
      onError?.(error);
    }

    return () => {
      // Cleanup ao desmontar
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignora erros de cleanup
        }
        widgetIdRef.current = null;
      }
    };
  }, [scriptLoaded, siteKey, action, theme, onTokenChange, onError]);

  /**
   * Reseta o widget programaticamente.
   * Útil após falha de login para permitir nova tentativa sem recarregar a página.
   */
  const reset = () => {
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onTokenChange(null);
    }
  };

  // Expõe reset via ref imperativo se necessário no futuro
  // Por ora, o componente é controlado via props/callbacks

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="turnstile-widget"
    />
  );
}

/**
 * Hook para gerenciar o estado do token Turnstile em formulários.
 * Retorna o token atual e uma função de reset para usar após falhas.
 */
export function useTurnstileToken(siteKey: string, action = "login") {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reset = () => {
    setToken(null);
    setError(null);
  };

  return {
    token,
    setToken,
    error,
    setError,
    reset,
    siteKey,
    action,
  };
}