# Decisão de arquitetura: Clerk + Supabase

## Status

Decisão aprovada para a fase de produção do Prisma Player:

- **Next.js 16** continua sendo o framework da aplicação. Não será feito downgrade para Next.js 9.
- **Clerk** será responsável por cadastro, login, sessão, recuperação de conta e identidade.
- **Supabase** será usado para PostgreSQL, Storage, Realtime e demais recursos de dados necessários.
- **Video.js** continua sendo o motor de reprodução no navegador.

Essa combinação é oficialmente suportada pelo Clerk e pelo Supabase por meio da integração **Third-Party Auth**.

## Fluxo de identidade

```text
Usuário
  -> Clerk autentica e mantém a sessão
  -> Next.js valida a sessão com Clerk no servidor
  -> Clerk fornece um session token compatível ao cliente Supabase
  -> Supabase valida o emissor do token
  -> PostgreSQL aplica RLS usando as claims confiáveis do JWT
```

O identificador externo do Clerk deve ser armazenado como texto (`text`), pois não é um UUID do Supabase Auth. As tabelas do produto devem associar o registro ao `user_id` do Clerk ou ao `workspace_id` interno.

## Configuração suportada

1. Conectar a instância Clerk ao Supabase pela página oficial **Connect with Supabase**.
2. Ativar Clerk em **Supabase > Authentication > Third-Party Auth**.
3. Garantir que o token de sessão contenha a claim `role` com valor `authenticated` para usuários autenticados.
4. Configurar o cliente Supabase com uma função `accessToken` que obtenha o token de sessão atual do Clerk.
5. Criar RLS específica para usuário e workspace em todas as tabelas expostas.

Para desenvolvimento local, a documentação atual prevê:

```toml
[auth.third_party.clerk]
enabled = true
domain = "seu-dominio.clerk.accounts.dev"
```

O domínio real será configurado somente quando as instâncias de desenvolvimento forem criadas.

## Regras obrigatórias de segurança

- `CLERK_SECRET_KEY` é somente server-side e nunca pode usar prefixo `NEXT_PUBLIC_`.
- Chaves secretas ou `service_role` do Supabase nunca entram no browser.
- O frontend não decide papel, workspace, limite ou propriedade de um registro.
- Toda tabela exposta pelo Data API terá RLS habilitada e políticas específicas.
- `TO authenticated` sozinho não é autorização; a policy também precisa validar usuário ou workspace.
- Claims editáveis pelo usuário nunca serão usadas para conceder acesso.
- Funções `SECURITY DEFINER` serão evitadas; quando indispensáveis, ficam em schema privado, com grants revogados e validação interna.
- URLs privadas de vídeo serão curtas, assinadas e emitidas pelo backend.
- Webhooks do Clerk serão verificados criptograficamente antes de sincronizar perfis ou organizações.
- Exclusão ou suspensão de conta precisa considerar revogação de sessões e retenção dos dados.

## Integração que não será usada

Não usar a integração antiga baseada em **Clerk JWT Templates** e no compartilhamento do JWT secret do Supabase. Ela foi descontinuada em 1º de abril de 2025. A integração atual usa os session tokens do Clerk e o cadastro nativo de provedor externo no Supabase.

## Next.js 16

Na implementação futura com Clerk:

- usar `@clerk/nextjs`;
- usar `proxy.ts`, conforme a convenção do Next.js 16;
- sempre executar `await auth()` no servidor;
- colocar `ClerkProvider` dentro de `<body>`;
- proteger páginas e Route Handlers no servidor, além da proteção visual do frontend.

Os pacotes ainda não serão instalados enquanto o projeto estiver no MVP visual. Isso evita credenciais falsas, configuração incompleta e telas parcialmente conectadas.

## Fontes oficiais verificadas

- [Clerk: Use Clerk with your Supabase project](https://clerk.com/docs/integrations/databases/supabase)
- [Clerk: Add Clerk Authentication to Next.js](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [Supabase: Clerk third-party authentication](https://supabase.com/docs/guides/auth/third-party/clerk)
- [Supabase changelog](https://supabase.com/changelog)

Documento verificado em 15 de julho de 2026. As versões e instruções devem ser conferidas novamente antes da implementação, pois ambos os serviços evoluem com frequência.
