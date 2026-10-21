/**
 * Versão da API pública no formato de data (dia da última mudança de
 * contrato, item 3 da spec Agentic v2). Viaja no header `X-API-Version`
 * das respostas públicas baratas (health, markdown, openapi.json) e é a
 * mesma string de `info.version` do OpenAPI, para o consumidor conferir
 * que o documento que leu descreve a API que respondeu.
 *
 * Política completa está no `info.description` do OpenAPI: breaking change
 * exige aviso prévio de 90 dias via header `Sunset` + changelog em
 * /developers; não há /v1 no path porque a superfície pública é estável.
 */
export const API_VERSION = "2026-10-21";
