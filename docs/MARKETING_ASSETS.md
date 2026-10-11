# Assets da página de vendas

Todos os arquivos exclusivos da landing page ficam em `public/marketing`.

## Estrutura

- `mascot/`: imagem oficial e materiais do coelho da Prisma.
- `mascot/hero/`: animações usadas ou avaliadas para o hero.
- `product/`: capturas e mockups reais do produto.
- `sections/`: artes específicas das seções da landing page.
- `icons/`: ícones exclusivos da comunicação de marketing.

## Arquivos atuais

Os diretórios estão reservados, mas nenhum asset de mascote está publicado. O primeiro vídeo gerado foi removido porque era um rascunho com o quadriculado renderizado no próprio arquivo.

## Convenção

Use nomes minúsculos em `kebab-case`, sem espaços e sem números de versão vagos como `final-2`.

- Imagens: WebP ou AVIF; PNG apenas quando a transparência exigir.
- Vídeos transparentes: WebM VP9 com alpha ou MOV ProRes 4444 como arquivo fonte.
- Fallback mobile: imagem WebP estática.
- Referências de sites externos não devem ser copiadas para `public`.

Quando o hero definitivo estiver pronto, use:

- `prisma-rabbit-hero.webm`
- `prisma-rabbit-hero-poster.webp`
