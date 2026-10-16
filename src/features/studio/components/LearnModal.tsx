"use client";

import { useEffect, useRef } from "react";
import { BookOpen } from "lucide-react";

export type LearnModuleId =
  | "style" | "progress" | "autoplay" | "turbo" | "headlines" | "hooks"
  | "traffic" | "actions" | "thumbnail" | "resume" | "pixels" | "captions"
  | "protection" | "playback";

const CONTENT: Record<LearnModuleId, { title: string; points: string[] }> = {
  style: { title: "Estilo do player", points: ["Troca as cores e o raio do player para combinar com a sua página.", "A cor de destaque aparece na barra de progresso e nos botões.", "Tudo é salvo automaticamente ao publicar."] },
  progress: { title: "Barra de progresso", points: ["Mostra o quanto do vídeo já foi assistido.", "O modo Smart acelera o preenchimento no começo para prender atenção.", "Altura e cor seguem a identidade configurada."] },
  autoplay: { title: "Smart Autoplay™", points: ["O vídeo começa sozinho e mudo; um toque ativa o som.", "A capa pode ser padrão, GIF animado ou imagem com link https.", "Mensagem, selo e animação do botão aumentam o clique para ouvir."] },
  turbo: { title: "Turbo", points: ["Acelera a reprodução sem distorcer o áudio.", "No modo automático, cada visitante recebe uma velocidade entre o mínimo e o máximo.", "No manual, todos assistem na velocidade que você definir."] },
  headlines: { title: "Headlines", points: ["Título sobre o vídeo que reforça a promessa antes do play.", "Pode ser texto ou imagem (desktop e mobile separados).", "Teste variações para achar a que mais segura atenção."] },
  hooks: { title: "Mini-ganchos", points: ["Mensagens que aparecem em pontos do vídeo para segurar quem ia sair.", "Use uma promessa curta ligada ao que vem a seguir.", "Menos é mais: 1 a 3 ganchos por VSL."] },
  traffic: { title: "Regras de tráfego", points: ["Controla país, dispositivo e idioma de quem pode assistir.", "Quem não passa na regra vê bloqueio em vez do vídeo.", "Use para ofertas com restrição geográfica."] },
  actions: { title: "Botão de ação (CTA)", points: ["Aparece no intervalo de tempo configurado para levar ao checkout.", "Texto, cor, tamanho e link https próprio.", "Ative o pulsar com moderação para não cansar."] },
  thumbnail: { title: "ThumbSniper", points: ["Capas do início, da pausa e do fim do vídeo.", "A capa do início aparece antes do play (desligue o autoplay para vê-la).", "Envie imagens 1280×720 para ficar nítido."] },
  resume: { title: "Continuar assistindo", points: ["Lembra onde o visitante parou e oferece continuar.", "Funciona por navegador; limpar dados apaga o ponto.", "Bom para VSLs longas."] },
  pixels: { title: "Pixels e conversões", points: ["Liga Meta, Google e TikTok para medir e otimizar campanhas.", "Conversões do player viram eventos de compra nas plataformas.", "Confira o diagnóstico antes de escalar verba."] },
  captions: { title: "Legendas", points: ["Arquivo .vtt exibido como legenda opcional.", "Ajuda quem assiste sem som e acessibilidade.", "Envie um arquivo por vídeo."] },
  protection: { title: "Proteção", points: ["Domínios permitidos travam o embed no seu site.", "Anti-download esconde o menu do navegador.", "Marca d'água identifica vazamentos."] },
  playback: { title: "Reprodução", points: ["Loop repete o vídeo; mudo inicia sem som.", "Pausa inteligente para quando a aba some.", "Taxa padrão vale para quem não usa o Turbo."] },
};

function learnContent(module: LearnModuleId) {
  return CONTENT[module];
}

/** Telinha didática padrão de todos os "Aprenda sobre". */
export default function LearnModal({ module, label, onClose }: { module: LearnModuleId; label: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const content = CONTENT[module];
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={content.title} tabIndex={-1} className="w-full max-w-md rounded-[20px] border bg-white shadow-2xl outline-none themeable-border-hairline dark:bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-4 themeable-border-hairline">
          <BookOpen size={17} className="text-prisma-blue dark:text-white" aria-hidden />
          <h2 className="text-[15px] font-bold themeable-text-ink">{content.title}</h2>
        </div>
        <ul className="space-y-2.5 px-5 py-4">
          {content.points.map((point) => <li key={point} className="flex gap-2 text-[13px] leading-relaxed themeable-text-ink"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-selected" /><span>{point}</span></li>)}
        </ul>
        <div className="px-5 pb-5">
          <button type="button" onClick={onClose} className="h-10 w-full rounded-xl bg-selected text-[13px] font-bold text-selected-foreground">Entendi{label ? ` — ${label}` : ""}</button>
        </div>
      </div>
    </div>
  );
}
