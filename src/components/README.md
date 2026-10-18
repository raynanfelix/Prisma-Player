# Organização dos componentes

## Diretórios

- `ui/`: primitivas shadcn e componentes básicos compartilhados.
- `ui/kokonut/`, `ui/origin/`, `ui/magic/`, `ui/aceternity/`, `ui/coss/`,
  `ui/bklit/`: componentes gratuitos preservados por origem.
- `ui/motion/`: primitivas de movimento reutilizáveis.
- `ui/custom/`: wrappers e adaptações visuais da Prisma.
- `layouts/`: estruturas de página e shells.
- `sections/`: seções compostas de páginas.
- `shared/`: componentes de domínio usados por várias features.
- `providers/`: providers React.
- pastas de domínio existentes, como `admin`, `charts` e `dashboard`, continuam
  válidas.

O shadcn CLI grava em `src/components/ui`, conforme `components.json`. Não mova
uma primitiva shadcn para um subdiretório sem atualizar todos os imports e a
configuração do registry.

## Origem e licença

Ao importar um componente externo, registre no cabeçalho ou no README da pasta:

- biblioteca e URL;
- licença;
- nome do componente original;
- adaptações realizadas;
- versão ou data da consulta.

Não copie componentes Premium/Pro. Não edite diretamente uma cópia externa para
implementar regras de produto; envolva-a com um componente em `ui/custom`.

## Registro de origem — shadcn/ui (CLI `npx shadcn@latest add`)

### Consulta em 17/10/2025

- Biblioteca e URL: shadcn/ui — https://ui.shadcn.com (registry oficial `@shadcn`);
- Licença: MIT (componentes gerados) e `input-otp` MIT (https://input-otp.1st.dev, package npm `input-otp`);
- Componentes: `input-otp` (InputOTP/InputOTPGroup/InputOTPSlot/InputOTPSeparator), `field`
  (Field/FieldLabel/FieldDescription/FieldError/FieldGroup…), `label`, `card` (atualizado,
  adicionou export `CardFooter`) e `separator` (atualizado);
- Adaptações: apenas o import de `cn` apontado para `@/lib/utils` (alias oficial do
  projeto) — nenhuma regra de produto dentro dos arquivos gerados;
- Wrappers/aplicações com regras de produto ficam em `ui/custom` ou em
  `features/` (ex.: `EmailVerificationCard`).

### Consulta em 18/10/2026 (CLI 4.22.1, style `base-nova`/Base UI)

- Biblioteca e URL: shadcn/ui — https://ui.shadcn.com (registry oficial `@shadcn`);
- Licença: MIT (componentes gerados). Deps instaladas pelo CLI: `react-day-picker`
  (MIT) e `date-fns` (MIT) para o `calendar`; `@shadcn/react` (MIT) para o
  `message-scroller`. A dep espúria `cn` (bug conhecido do CLI 4.22, que gera
  `import { cn } from "cn"`) foi removida do `package.json` — o alias oficial
  `@/lib/utils` é a única fonte de `cn`;
- Componentes: `popover`, `calendar`, `message` (Message/MessageGroup/
  MessageAvatar/MessageContent…), `bubble` (Bubble/BubbleContent/BubbleGroup/
  BubbleReactions), `marker` (Marker/MarkerIcon/MarkerContent) e
  `message-scroller` (MessageScroller/Viewport/Content/Item/Button + hooks);
- Adaptações: import de `cn` corrigido para `@/lib/utils` em todos os gerados;
  `button.tsx` restaurou o export `buttonVariants` (o calendar upstream o
  consome; o arquivo local do projeto não exportava); `calendar.tsx` calibrado
  nos tokens da Prisma — hoje `bg-[#B9FF66]/15`, dia selecionado
  `bg-selected`/`text-selected-foreground`, range `bg-[#B9FF66]/20`;
  `message-scroller.tsx` com sr-only em PT-BR ("Ir para o fim da conversa");
- Aplicações Prisma sobre essas primitivas: `ui/date-picker.tsx` (single +
  range com presets PT-BR "Hoje/Últimos 7/30/90 dias/Este mês", "Escolha um
  período"), o chat de suporte (`/dashboard/support/[id]`) e o drawer "Prisma
  IA" da analytics renderam a conversa com Message/Bubble/Marker/
  MessageScroller; o multi-select de VSLs do Marketplace
  (`features/integrations/components/VslMultiSelect.tsx`) usa o Popover.


