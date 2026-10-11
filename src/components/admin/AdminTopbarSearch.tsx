"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type Result = { kind: "account" | "video" | "checkout"; id: string; title: string; subtitle: string };

function hrefFor(item: Result): string {
  if (item.kind === "account") return `/admin/users/${item.id}`;
  if (item.kind === "video") return `/admin/content?video=${item.id}`;
  return `/admin/billing?checkout=${item.id}`;
}

const kindLabel = { account: "Conta", video: "VSL", checkout: "Checkout" } as const;

/**
 * Busca global do admin. Input não-controlado (digitação nunca re-renderiza
 * por tecla) + debounce + abort da request anterior: sem engasgo e sem
 * resposta fora de ordem.
 */
export default function AdminTopbarSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let timer: number | undefined;
    const onInput = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const term = input.value;
        setQuery(term);
        abortRef.current?.abort();
        if (term.trim().length < 2) {
          setResults([]);
          setLoading(false);
          return;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { cache: "no-store", signal: controller.signal })
          .then((response) => response.json())
          .then((data: { results?: Result[] }) => {
            if (controller.signal.aborted) return;
            setResults(data.results ?? []);
            setOpen(true);
          })
          .catch(() => undefined)
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      }, 350);
    };
    input.addEventListener("input", onInput);
    return () => {
      input.removeEventListener("input", onInput);
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 themeable-border-hairline dark:bg-card">
        <Search size={15} className="shrink-0 themeable-text-ink-muted-48" aria-hidden />
        <input
          ref={inputRef}
          defaultValue=""
          onFocus={() => { if (results.length) setOpen(true); }}
          placeholder="Buscar conta, VSL, checkout…"
          aria-label="Busca global do admin"
          className="w-full bg-transparent text-[13px] outline-none themeable-text-ink placeholder:text-slate-400"
        />
        {loading && <span className="text-[11px] themeable-text-ink-muted-48">…</span>}
      </div>
      {open && results.length > 0 && (
        <div role="listbox" aria-label="Resultados" className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-xl border bg-white shadow-2xl themeable-border-hairline dark:bg-card">
          {results.map((item) => (
            <Link key={`${item.kind}-${item.id}`} href={hrefFor(item)} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white">
              <span className="w-16 shrink-0 text-[10px] font-bold uppercase themeable-text-ink-muted-48">{kindLabel[item.kind]}</span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-semibold themeable-text-ink">{item.title}</span><span className="block truncate text-[11px] themeable-text-ink-muted-48">{item.subtitle}</span></span>
            </Link>
          ))}
        </div>
      )}
      {open && query.trim().length >= 2 && !loading && results.length === 0 && (
        <div className="absolute inset-x-0 top-12 z-50 rounded-xl border bg-white p-4 text-[12px] shadow-2xl themeable-border-hairline themeable-text-ink-muted-48 dark:bg-card">Nada encontrado para “{query.trim()}”.</div>
      )}
    </div>
  );
}
