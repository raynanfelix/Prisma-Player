"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { legacyTranslations, message } from "./dictionaries";
import { DEFAULT_LOCALE, localeMeta, normalizeLocale, type AppLocale } from "./types";

type I18nValue = { locale: AppLocale; setLocale: (locale: AppLocale) => void; t: (key: Parameters<typeof message>[1]) => string; currency: "BRL" | "USD" | "EUR" };
const I18nContext = createContext<I18nValue | null>(null);
const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

function translateString(value: string, locale: AppLocale) {
  if (locale === DEFAULT_LOCALE) return value;
  const dictionary: Record<string, string> = legacyTranslations[locale as Exclude<AppLocale, typeof DEFAULT_LOCALE>];
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const clean = value.trim();
  if (!clean) return value;
  const direct = dictionary[clean];
  if (direct) return `${leading}${direct}${trailing}`;
  let translated = clean;
  for (const [source, target] of Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length)) translated = translated.replaceAll(source, target);
  return `${leading}${translated}${trailing}`;
}

function localizeTree(root: ParentNode, locale: AppLocale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const parent = node.parentElement;
    if (
      parent &&
      !parent.closest("[data-i18n-managed]") &&
      !["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"].includes(parent.tagName)
    ) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue ?? "");
      const source = originalText.get(node) ?? "";
      const next = translateString(source, locale);
      if (node.nodeValue !== next) node.nodeValue = next;
    }
    node = walker.nextNode() as Text | null;
  }
  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  for (const element of elements) {
    if (element.closest("[data-i18n-managed]")) continue;
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      if (!originalAttributes.has(element)) originalAttributes.set(element, new Map());
      const values = originalAttributes.get(element)!;
      if (!values.has(attribute)) values.set(attribute, current);
      element.setAttribute(attribute, translateString(values.get(attribute)!, locale));
    }
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    return normalizeLocale(localStorage.getItem("prisma-locale") || navigator.language);
  });
  const setLocale = useCallback((next: AppLocale) => {
    localStorage.setItem("prisma-locale", next);
    document.cookie = `prisma-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setLocaleState(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    localizeTree(document.body, locale);
    let queued = false;
    const observer = new MutationObserver((mutations) => {
      // React reutiliza nós de texto entre renders. Quando o conteúdo muda,
      // a nova string é a fonte correta; manter a fonte antiga fazia títulos
      // como "Estilo" reaparecerem em todos os painéis do Studio.
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target instanceof Text) {
          originalText.set(mutation.target, mutation.target.nodeValue ?? "");
        }
        if (mutation.type === "attributes" && mutation.target instanceof Element && mutation.attributeName) {
          const current = mutation.target.getAttribute(mutation.attributeName);
          if (current) {
            if (!originalAttributes.has(mutation.target)) originalAttributes.set(mutation.target, new Map());
            originalAttributes.get(mutation.target)!.set(mutation.attributeName, current);
          }
        }
      }
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; observer.disconnect(); localizeTree(document.body, locale); observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] }); });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
    return () => observer.disconnect();
  }, [locale]);
  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t: (key) => message(locale, key), currency: localeMeta[locale].currency }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
