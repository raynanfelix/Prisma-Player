# Prisma Player — Refatoração V2: etapa 2

## Escopo concluído

- shell, header, sidebar e menu de conta reconstruídos com shadcn/Base UI;
- navegação ativa derivada da rota atual;
- autenticação reconstruída com layout, campos, feedback e OAuth compartilhados;
- Supabase Auth e telemetria encapsulados em serviço;
- configurações divididas em visão geral, perfil, equipe, senha e segurança;
- MFA opcional para usuários e obrigatório para administradores preservado;
- providers globais compostos em um único ponto;
- componentes V2 protegidos da tradução legada por mutação do DOM;
- ativação do trial encapsulada em serviço;
- tela de boas-vindas reconstruída;
- responsividade aplicada a mobile, tablet e desktop.

## Bibliotecas e padrões

- shadcn/Base UI para primitives acessíveis;
- Motion para transições de autenticação e configurações;
- Lucide para iconografia;
- padrões gratuitos de Origin UI, Kokonut UI e COSS UI adaptados ao design
  system Prisma, sem dependências comerciais ou telemetria externa.

## Validação

- TypeScript sem erros;
- lint dos arquivos alterados sem erros ou avisos;
- 39 testes automatizados aprovados;
- build de produção do Next.js aprovado.

O tradutor legado permanece somente para telas ainda não migradas. Ele será
removido quando Studio, analytics e inteligência adotarem chaves tipadas nas
próximas etapas.
