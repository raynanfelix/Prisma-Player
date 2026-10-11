# Arquitetura e diretrizes de interface

## Stack oficial

O frontend da Prisma Player utiliza exclusivamente:

- Next.js com App Router;
- React;
- TypeScript;
- Tailwind CSS;
- shadcn/ui como base;
- Motion/Framer Motion;
- Lucide Icons.

Não introduza outro framework de aplicação, linguagem de template, solução de
estilo ou biblioteca de ícones sem uma decisão arquitetural explícita.

## Fontes de componentes

Antes de criar um componente novo, pesquise nesta ordem:

1. [Kokonut UI](https://kokonutui.com/docs)
2. [Origin UI](https://www.originui-ng.com/)
3. [Magic UI](https://magicui.design/)
4. [Aceternity UI](https://ui.aceternity.com/components)
5. [COSS UI](https://coss.com/ui)
6. [BKLit](https://bklit.com/)
7. [React Aria](https://react-aria.adobe.com/getting-started)
8. [Motion Primitives](https://motion-primitives.com/docs/installation)
9. [Anime.js](https://animejs.com/)

Use somente componentes gratuitos e compatíveis com a licença do projeto.
Nunca copie código ou assets Premium/Pro.

Não instale todas as bibliotecas preventivamente. Instale apenas a dependência
necessária para o componente escolhido, depois de verificar se o mesmo
resultado já pode ser obtido com a stack instalada. Isso protege o bundle, o
tempo de build e a superfície de manutenção.

## Fluxo obrigatório

Para cada tarefa de interface:

1. entenda o fluxo real do usuário e os estados necessários;
2. procure primeiro nos componentes existentes da Prisma;
3. pesquise o equivalente nas fontes acima;
4. valide licença, acessibilidade, compatibilidade com React/Next e custo de
   bundle;
5. reutilize e adapte quando existir uma boa base;
6. crie um componente novo somente quando não houver equivalente adequado;
7. aplique o design system da Prisma;
8. valide estados de loading, vazio, erro, sucesso e disabled;
9. teste desktop, tablet, mobile, teclado e tema escuro;
10. execute TypeScript, lint aplicável, testes e build.

A prioridade é:

`componentes da Prisma → biblioteca gratuita → wrapper/adaptação → componente customizado`

## Personalização

Um componente externo é apenas uma base. Adapte:

- identidade visual;
- tokens de cor;
- tipografia;
- espaçamentos;
- bordas e raios;
- sombras;
- animações;
- estados;
- responsividade;
- acessibilidade.

O resultado deve parecer nativo da Prisma Player. Não altere diretamente o
arquivo importado de uma biblioteca: crie um wrapper ou uma composição em
`src/components/ui/custom`.

## Componentes e acessibilidade

Reutilize componentes e evite páginas monolíticas. Separe comportamento,
apresentação e acesso a dados quando isso tornar o código mais claro.

Para Dialog, Popover, Menu, Select, ComboBox, ListBox, Tooltip, Calendar e
DatePicker, prefira primitivas acessíveis já existentes no shadcn/Base UI. Use
React Aria quando as primitivas atuais não cobrirem corretamente o caso. Não
implemente manualmente foco, navegação por teclado ou semântica ARIA quando uma
primitiva madura já resolver o problema.

## Animações

Prioridade:

1. Motion Primitives;
2. Motion/Framer Motion;
3. Anime.js, somente quando os anteriores não atenderem.

As animações devem ser rápidas, naturais e discretas. Respeite
`prefers-reduced-motion`, evite animações que atrasem uma ação e não anime
propriedades que causem layout thrashing quando `transform` e `opacity`
resolverem.

## Organização

O shadcn CLI está configurado para `@/components/ui`; portanto, os componentes
base gerados pelo shadcn permanecem nesse diretório para preservar atualizações
e imports existentes.

Componentes de outras origens seguem:

```text
src/components/
├── ui/
│   ├── kokonut/
│   ├── origin/
│   ├── magic/
│   ├── aceternity/
│   ├── coss/
│   ├── bklit/
│   ├── motion/
│   └── custom/
├── layouts/
├── sections/
├── shared/
└── providers/
```

Não mova componentes existentes em massa apenas para satisfazer a estrutura.
Faça a migração quando o arquivo for naturalmente refatorado, preservando
compatibilidade e histórico.

## Checklist de conclusão

- [ ] Pesquisou e reutilizou antes de criar.
- [ ] Usou apenas componentes gratuitos e licenciados.
- [ ] Seguiu os tokens do design system.
- [ ] Não duplicou componente ou lógica.
- [ ] Cobre loading, vazio, erro, sucesso e disabled.
- [ ] Funciona em desktop, tablet e mobile.
- [ ] Funciona com teclado e leitores de tela.
- [ ] Respeita tema escuro e movimento reduzido.
- [ ] TypeScript e build passam.
- [ ] A alteração não ampliou desnecessariamente o bundle.

