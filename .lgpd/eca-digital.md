# ECA Digital - Lei nº 15.211/2025: Avaliação de Aderência

**Avaliação realizada em**: 23/10/2026 · **Próxima revisão**: 23/04/2027 (semestral).
**Fundamento**: Lei 15.211/2025 (ECA Digital), em vigor desde **17 de março de 2026**, fiscalizada pela ANPD (Decreto 12.622/2025). Aplica a fornecedores direcionados a menores **OU de acesso provável** por eles (Arts. 9º, 22, 24, 26). Interação com **Art. 14 LGPD** (dados de crianças: consentimento parental específico).

## Aplicabilidade (avaliação honesta)

| Superfície | Direcionada a menores? | Acesso provável? | Avaliação |
|---|---|---|---|
| App da Prisma (contas, dashboard) | Não - produto B2B para produtores/afiliados de marketing; termos 18+ | Razoavelmente não: exige signup adulto, pagamento, fluxo de negócio | ECA Digital NÃO é gatilho central aqui |
| Embed do player (espectadores de VSLs) | Não é direcionado (player de páginas de venda) | **Possível**: landing pages de clientes podem ser vistas por adolescentes; não há como a Prisma garantir a audiência de cada campanha | Zona de atenção: monitorar |
| Verificação de idade por acesso (Art. 9º, §1º) | - | - | **Inviável e desproporcional hoje**: o embed não tem login, não cria conta, não perfila; exigir documento/biometria a cada reprodução de vídeo de marketing não tem suporte técnico no produto |

## Mecanismos e estado

- [x] Plataforma não cria contas de espectadores: menor assistindo a uma VSL não se cadastra na Prisma.
- [x] Sem perfilamento de espectadores para publicidade própria: os pixels (A006) atribuem conversão da campanha do CLIENTE, com consentimento opt-in do espectador e gate duplo em código (`src/lib/analytics/ingest.ts:303`); a Prisma não segmenta audiência nem recomenda conteúdo.
- [x] Sem loot boxes, gamificação ou sistemas de recomendação para espectadores (Art. 20, Arts. 17-18: N/A).
- [x] Termos do app declaram serviço não direcionado a menores; `/privacy` (conteúdo legal) já traz a seção "menores" apontando o canal do encarregado.
- [x] Analytics de espectador é pseudonimizado (session/viewer id, país, sem IP) - ver [anonymization.md](./anonymization.md).
- [ ] Cláusula contratual com clientes proibindo campanhas direcionadas a menores e atribuindo ao cliente a idade da audiência (GAP-09).
- [ ] Monitoramento de audiência para detectar evidência de menores em escala (gatilho de revisão).
- [ ] Relatórios semestrais (Art. 31): **N/A** - obrigatório só para plataformas com > 1 milhão de usuários menores no Brasil (threshold não atingido e sem indício).

## Posição recomendada (decisão do dono)

1. **Manter o posicionamento de plataforma B2B 18+** e o player como infraestrutura neutra embutida em sites de clientes, documentando esta avaliação (este arquivo) como prova de diligência (**Art. 6º, VIII LGPD**: prevenção).
2. **Repassar por contrato** (termos do cliente, GAP-09): cliente é controlador da audiência e responde pela conformidade da sua campanha (inclusive ECA Digital e Art. 14 LGPD se mirar menores). A Prisma, como operadora, executa o que o contrato definir (**Art. 39**).
3. **Plano de contingência**: se surgir evidência (denúncia, fiscalização, dados) de audiência relevante de menores acessando VSLs veiculadas pelo player, contratar verificação confiável de idade via fornecedor especializado no embed (Art. 9º, §1º veda autodeclaração) e reabrir esta avaliação.
4. **Canal do encarregado** precisa estar publicado (GAP-02) para que responsáveis possam solicitar remoção de dados de menores (seção "menores" da política já aponta o e-mail).

## Riscos residuais

- Interpretação regulatória de "acesso provável" pode evoluir com a fiscalização da ANPD (Res. 30/2025 coloca crianças/adolescentes no ambiente digital como eixo prioritário 2026-2027). Mitigação: revisão semestral deste documento + monitoramento de sanções aplicadas no setor.
- Sanções da Lei 15.211/2025 (Art. 35, II): multa de até 10% do faturamento do grupo no Brasil, ou R$ 10 a R$ 1.000 por usuário, limite de R$ 50 milhões por infração.

## Owner

Encarregado (a designar, GAP-02) - revisão semestral deste documento.
