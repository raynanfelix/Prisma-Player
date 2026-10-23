# Encarregado (DPO) - Designação e Canal

**Versão**: draft para decisão do dono - 23/10/2026 · **Fundamento**: **Art. 41 LGPD** + **Resolução CD/ANPD nº 18/2024**.

## O que a norma exige

- **Art. 41 LGPD**: o controlador deve designar encarregado, cuja identidade e canal de contato devem ser divulgados publicamente.
- **Res. 18/2024**: pode ser pessoa natural ou jurídica; divulgação obrigatória **em destaque no sítio eletrônico**; não há exigência de certificação; sem responsabilidade direta perante a ANPD pela conformidade do controlador; **vedação a conflito de interesses** (Art. 2º, II).
- **ATPP (Res. 2/2022, Art. 11)**: se a Prisma for agente de pequeno porte, a designação formal é dispensável, **mas o canal público de comunicação com titulares NÃO é**.

## Estado atual

- Canal existe e é público: **privacidade@prismaplayer.com.br** (usado nas páginas `/privacy`, `/terms`, `/cookies`) + página `/contact`.
- A política `/privacy` já diz "fale com nosso encarregado pelo e-mail", mas **não nomeia** ninguém e a razão social/CNPJ estão como placeholders (GAP-01 + GAP-02).

## Draft de designação (o dono escolhe a opção)

**Opção A (recomendada para o porte atual)**: o próprio dono acumula a função.

- Nome: [PREENCHER: nome do dono]
- Canal: privacidade@prismaplayer.com.br (+ `/contact` como formulário)
- Publicação: seção "Encarregado (DPO)" em `/privacy` com nome, e-mail e a descrição de atribuições; link no rodapé do site em destaque.
- Conflito de interesses (Res. 18/2024, Art. 2º, II): acumular dono + encarregado é prática comum em pequenos agentes e não é vedada per se; a vedação é atuar contra os interesses dos titulares. Documentar a ciência disso.

**Opção B**: designar pessoa jurídica especializada (consultoria/advogado como encarregado externo) - útil se houver orçamento; canal continua o mesmo e-mail.

**Opção C (se ATPP)**: sem designação formal, mantendo só o canal público - só vale após registrar por escrito a classificação ATPP (critério: microempresa, EPP, startup até R$ 16M/ano - Res. 2/2022).

## Atribuições do encarregado (Art. 41, §2º, VIII e Res. 18/2024)

1. Receber demandas de titulares (DSAR pelo canal do encarregado - workflow em [dsar/workflow.md](./dsar/workflow.md)) e responder no prazo (Art. 19, II).
2. Centralizar a resposta a incidentes: é quem decide notificação à ANPD (Res. 15/2024; runbook em [incidents/runbook.md](./incidents/runbook.md)).
3. Manter vivo o acervo `.lgpd/`: ROPA (Art. 37), gaps, vendors, retenção.
4. Zelar pelos prazos e pelas provas de conformidade (dosimetria: Res. 4/2023 - política de governança é atenuante).
5. Interagir com a ANPD quando acionado.

## Checklist de publicação (assim que o dono decidir)

- [ ] Definir nome do encarregado e opção (A/B/C).
- [ ] Preencher razão social/CNPJ/endereço na política (GAP-01).
- [ ] Publicar nome + canal em `/privacy` e rodapé em destaque (Res. 18/2024).
- [ ] Registrar classificação ATPP por escrito (se opção C).
- [ ] Atualizar este arquivo com a decisão e a data.
