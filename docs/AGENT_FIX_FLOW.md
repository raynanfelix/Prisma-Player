# Agent Fix Flow — Error Capture System (Fase 3)

Este documento define o protocolo completo que o **DeepSeek Harness** (ou Claude Code) deve seguir ao receber uma Issue gerada automaticamente pelo sistema de captura de erros. O objetivo é transformar Issues técnicas em correções verificáveis com evidências, sem merge automático.

## Como Invocar

No DeepSeek Harness, diga:

```
corrija a issue #<número>
```

Ou forneça o link direto:

```
investigue https://github.com/raynanfelix/Prisma-Player/issues/<número>
```

O agente lerá este documento, extrairá o bloco JSON da Issue, e seguirá o fluxo abaixo.

---

## 1. Leitura e Extração de Contexto

1. Leia a Issue completa no GitHub.
2. Extraia o **bloco JSON legível por máquina** (dentro de ````json ... ````).
3. Parseie os campos:
   - `fingerprint`: identificador único do erro
   - `severity`: critical / high / medium / low
   - `occurrences`: quantidade de ocorrências
   - `suspected_files`: lista de caminhos src-relativos a inspecionar
   - `hypothesis`: hipótese inicial de causa raiz
   - `acceptance_criteria`: lista de critérios de aceite
   - `admin_url`: link para o painel admin com filtro por fingerprint
4. Se o bloco JSON não existir ou estiver malformado, pare e reporte na Issue: "Bloco JSON ausente ou inválido — não é possível prosseguir sem contexto estruturado."

## 2. Investigação

### 2.1 Skills Aplicáveis
Antes de escrever qualquer código, consulte as Skills relevantes:
- `systematic-debugging` — para diagnóstico estruturado
- `security-audit` — se o erro envolve auth, RLS, sanitização ou secrets
- `tdd` — para reproduzir o erro via teste antes de corrigir
- `code-review` — para revisar alterações antes do commit
- `neon-postgres` — se o erro envolve queries, RLS ou schema
- `nextjs-app-router-patterns` — se o erro envolve rotas, Server Components ou streaming

### 2.2 Inspeção de Código
1. Leia **todos** os arquivos listados em `suspected_files`.
2. Para cada arquivo, identifique:
   - O ponto exato onde o erro pode ocorrer
   - Validações de entrada ausentes ou insuficientes
   - Tratamento de erro inadequado (catch vazio, mensagem genérica)
   - Dependências externas que podem falhar (Stripe, R2, Neon)
3. Se a hipótese do bloco JSON for confirmada, documente a evidência.
4. Se a hipótese for refutada, formule uma nova hipótese baseada no código real e documente.

### 2.3 Reprodução
1. Escreva um **teste de regressão** que reproduza o erro usando Vitest.
2. O teste deve:
   - Falhar **antes** da correção (red)
   - Passar **depois** da correção (green)
   - Cobrir o caminho exato identificado na investigação
3. Se não for possível reproduzir via teste unitário (ex: erro de rede intermitente), documente o motivo e crie um teste de integração ou E2E alternativo.

## 3. Correção

### 3.1 Princípios
- **Menor correção adequada**: altere apenas o necessário para resolver a causa raiz.
- **Sem soluções improvisadas**: não adicione try/catch vazios, não desabilite validações, não ignore erros.
- **Preserve contratos**: não mude assinaturas de funções públicas sem atualizar todos os callers.
- **Sanitização**: nunca exponha secrets, tokens ou PII em logs, mensagens de erro ou testes.

### 3.2 Implementação
1. Aplique a correção nos arquivos identificados.
2. Garanta que o teste de regressão passe.
3. Execute **todos** os testes existentes (`npx vitest run`) para verificar ausência de regressões.
4. Execute `npx tsc --noEmit` para validar tipos.
5. Se o erro envolver segurança, execute `npm audit` e verifique advisories relevantes.

## 4. Documentação e Commit

### 4.1 Mensagem de Commit
Use o formato convencional:

```
fix(<escopo>): <descrição curta da correção>

- Causa raiz: <explicação técnica concisa>
- Correção: <o que foi alterado e por quê>
- Teste: <nome do teste de regressão adicionado>
- Issue: #<número>
```

### 4.2 Atualização da Issue
Após o commit, comente na Issue com:
- Link para o commit
- Resumo da causa raiz encontrada
- Evidências de que a correção funciona (output do teste)
- Status: "Correção implementada — aguardando revisão"

### 4.3 PR Draft (Opcional)
Se o repositório exigir PR para correções de agente:
1. Crie uma branch `fix/error-<fingerprint>`
2. Abra um **PR como draft** vinculado à Issue
3. Nunca faça merge automático — o PR deve ser revisado e aprovado manualmente

## 5. Critérios de Conclusão

Uma correção só é considerada completa quando **todos** os seguintes critérios forem atendidos:

- [ ] Causa raiz identificada e documentada (não apenas sintoma tratado)
- [ ] Teste de regressão adicionado e passando
- [ ] Todos os testes existentes passando (`vitest run` exit code 0)
- [ ] Compilação TypeScript limpa (`tsc --noEmit` exit code 0)
- [ ] Nenhum segredo ou PII exposto em código, logs ou testes
- [ ] Issue atualizada com evidências e link do commit
- [ ] Alterações limitadas ao escopo do erro (sem mudanças não relacionadas)

Se algum critério não puder ser atendido, documente a limitação explicitamente na Issue e explique o risco residual.

## 6. Limitações e Riscos Conhecidos

- O agente **não** faz merge automático — toda correção exige revisão humana.
- O agente **não** modifica infraestrutura (RLS, Vercel config, DNS) sem autorização explícita.
- O agente **não** executa comandos destrutivos (DROP TABLE, delete em produção, reset de branch).
- Se o erro for intermitente ou dependente de estado externo não reproduzível localmente, o agente documentará a limitação e proporá monitoramento adicional em vez de correção especulativa.
- O agente **nunca** declara sucesso sem evidências observáveis (testes passando, output verificável).

## 7. Fluxo Resumido

```
Issue #N recebida
    ↓
Ler bloco JSON + suspected_files
    ↓
Consultar Skills aplicáveis
    ↓
Inspecionar código real → confirmar/refutar hipótese
    ↓
Escrever teste de regressão (RED)
    ↓
Implementar menor correção adequada
    ↓
Teste passa (GREEN) + todos os testes passam
    ↓
tsc --noEmit + npm audit (se aplicável)
    ↓
Commit com mensagem convencional + link da Issue
    ↓
Comentar na Issue com evidências
    ↓
PR draft (se necessário) → aguardar revisão humana
```

---

*Este documento é parte da Fase 3 do Error Capture System. Atualize-o conforme o fluxo evolui.*