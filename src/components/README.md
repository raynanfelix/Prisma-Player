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

