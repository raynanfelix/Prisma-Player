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

- Biblioteca e URL: shadcn/ui — https://ui.shadcn.com (registry oficial `@shadcn`);
- Licença: MIT (componentes gerados) e `input-otp` MIT (https://input-otp.1st.dev, package npm `input-otp`);
- Componentes: `input-otp` (InputOTP/InputOTPGroup/InputOTPSlot/InputOTPSeparator), `field`
  (Field/FieldLabel/FieldDescription/FieldError/FieldGroup…), `label`, `card` (atualizado,
  adicionou export `CardFooter`) e `separator` (atualizado) — consulta em 17/10/2025;
- Adaptações: apenas o import de `cn` apontado para `@/lib/utils` (alias oficial do
  projeto) — nenhuma regra de produto dentro dos arquivos gerados;
- Wrappers/aplicações com regras de produto ficam em `ui/custom` ou em
  `features/` (ex.: `EmailVerificationCard`).

