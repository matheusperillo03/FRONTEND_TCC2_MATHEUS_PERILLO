# Arquitetura

[Voltar ao README](../README.md)

## Visão geral

Front-end do MVP do buscador OSINT para órgãos policiais (TCC 2, UnB/FCTE). Interface em português para delegado, agente e analista, cobrindo a fatia vertical do MVP: **caso → coleta → entidades → grafo de vínculos → alertas de tipologia → custódia e auditoria → relatório**.

O recorte, a stack e o contrato da API (v0) estão em `docs/mvp-escopo.md` do repositório da monografia; os requisitos, em `docs/requisitos-app.md`. O back-end fica no repositório `BACKEND_TCC2_MATHEUS_PERILLO`, e o `docs/api.md` dele traz o contrato atual, com as rotas que os horizontes 1, 2 e 3 do backlog acrescentaram.

## Stack

React 19, TypeScript, Vite 7, Cytoscape.js (grafo), Vitest + Testing Library (testes), ESLint e o Padrão Digital de Governo (`@govbr-ds/core` 3.7.0) como base visual.

## Padrão Digital de Governo (Design System gov.br)

A interface usa o pacote oficial [`@govbr-ds/core`](https://www.npmjs.com/package/@govbr-ds/core), versão 3.7.0 (fixada no `package.json`), do [Padrão Digital de Governo](https://www.gov.br/ds/home).

- **O que é usado:** a folha `dist/core.min.css` inteira (importada em `src/main.tsx`), com os tokens de cor, tipografia e espaçamento e as classes dos componentes: `br-header` (compacto), `br-button`, `br-input`, `br-textarea`, `br-radio`, `br-checkbox`, `br-message`, `br-tag`, `br-tab`, `br-table`, `br-card`, `br-loading` e `br-skiplink`, nas variantes de alta densidade (`small`). O `src/styles.css` só ajusta densidade e layout, sempre com os tokens do DS.
- **O que não é usado:** o JavaScript do pacote (`core.min.js`). Ele manipula o DOM diretamente e conflitaria com o React; abas, mensagens e formulários são controlados pelo React com as mesmas classes. Por isso a seleção usa o `<select>` nativo com os tokens do campo do DS, em vez do `br-select`, que depende desse JavaScript. Os ícones (Font Awesome) também não são usados: o pacote não os traz.
- **Marca:** a aplicação **não** usa a logo nem a marca gov.br. O cabeçalho mostra "Buscador OSINT — Protótipo acadêmico, UnB/FCTE", e o rodapé informa que não é um serviço oficial do governo.
- **Licença do pacote:** MIT, "Copyright (c) 2022 SERPRO". O texto completo está em `node_modules/@govbr-ds/core/LICENSE`, é copiado para `public/licencas/govbr-ds-core-LICENSE.txt` (servido em `/licencas/govbr-ds-core-LICENSE.txt`) e é citado no rodapé da aplicação. Ao atualizar o pacote, copie o arquivo de novo.
- **Fonte Rawline:** o token `--font-family-base` do DS é `Rawline, Raleway, sans-serif`, e a aplicação o mantém. Mas o pacote `@govbr-ds/core` 3.7.0 **não traz os arquivos da fonte nem a licença dela**: não há `.woff`, `.ttf` nem `@font-face` no pacote, e o `LICENSE` cobre só o código. O `README` do pacote aponta a Rawline como dependência externa, a ser carregada de um CDN. Este projeto não carrega fonte de CDN (a CSP só aceita a própria origem). Resultado: o texto aparece em Rawline ou Raleway se uma delas estiver instalada na máquina; caso contrário, na fonte sem serifa padrão do sistema. Para embutir a Rawline é preciso antes obter os arquivos de uma fonte oficial e conferir a licença, o que fica como pendência.
- **Acessibilidade:** `lang="pt-BR"`, link "Ir para o conteúdo" (`br-skiplink`), rótulos ligados aos campos por `for`/`id`, texto auxiliar por `aria-describedby`, erros com `role="alert"`, abas com `role="tablist"` e navegação por setas, Home e End, tabelas com `scope="col"`, foco visível do DS e contraste conferido nas etiquetas coloridas (texto branco só sobre tons 60 ou mais escuros da paleta).

## Estrutura

```
src/
  api/
    tipos.ts            tipos do contrato v0 e a interface ApiCliente
    clienteHttp.ts      cliente HTTP (Authorization: Bearer e X-Justificativa; download da exportação como Blob)
    clienteMock.ts      cliente simulado em memória (mesma interface e regras)
    dadosSinteticos.ts  fixtures sintéticas da demonstração e dos testes
    simulado.ts         única porta de entrada do modo simulado (import dinâmico)
    zipSimulado.ts      ZIP sem compressão, só para a exportação do simulado
    erros.ts            ErroApi, ErroJustificativa, ErroAutenticacao, mensagemDeErro
    index.ts            criarCliente() a partir de VITE_MOCK / VITE_API_URL
  privacidade.ts        mascararCpfs: CPF só no formato ***NNNNNN** (RNF04)
  cnpj.ts               CNPJ numérico e alfanumérico: limpeza, dígitos verificadores e máscara
  hash.ts               SHA-256 pela Web Crypto e leitura de Blob (exportação)
  sessao/               token, usuário, justificativa (e sua validação), cliente, vigia de 401 e papel no caso (contextos React)
  grafo/mapear.ts       grafo do contrato → elementos do Cytoscape (função pura)
  ia/localizarTrecho.ts trecho citado → posição no texto (pontos de código → UTF-16)
  componentes/          Moldura (cabeçalho e rodapé), JustificativaBarra, CartaoAlerta, Anotacoes, ExportarGrafo, GrafoCytoscape, SeletorEntidade, básicos
  telas/
    Entrada.tsx         usuário e senha → segundo fator; token de desenvolvimento, recolhido (só em modo de desenvolvimento)
    Conta.tsx           sessão atual e troca da própria senha
    Usuarios.tsx        administração de contas (perfil admin)
    Casos.tsx           listar e criar casos (com finalidade e prazo de retenção)
    Caso.tsx            abas Coleta, Entidades, Grafo, Alertas, Sugestões da IA, Tipologias, Monitoramento, Equipe, Ordem judicial (só com o módulo do RF10 ligado), Auditoria, Relatório
    abas/               uma aba por arquivo
  test/                 setup do Vitest e cliente falso para componentes
public/licencas/        licença MIT do @govbr-ds/core (vai para dist/)
Dockerfile, nginx.conf, nginx-cabecalhos.conf, .dockerignore
.github/workflows/ci.yml   pipeline: eslint, vitest, build e npm audit
```

## Suposições sobre o contrato v0

Onde a seção 5 de `docs/mvp-escopo.md` não fixa o formato, o front assumiu o seguinte (marcado como `SUPOSIÇÃO` em `src/api/tipos.ts`):

- `GET /casos/{id}`: o caso com um objeto `contagens: {entidades, alertas, capturas, coletas?, sugestoes?, monitoramentos?, avisos_nao_lidos?}` (opcional na interface; sem `avisos_nao_lidos`, a aba Monitoramento não mostra contagem).
- Os campos novos do horizonte 1 (`finalidade`, `retencao_ate` e `somente_leitura` no caso; `situacao`, `decisao`, `decisoes`, `politica_erro`, `prefere_evitar`, `tipologia_nome` e `ativo` no alerta; `coleta_id`, `situacao`, `tentativas`, `motivo` e o conector na coleta) seguem a tabela de rotas do back-end (`docs/api.md` de lá). Na interface eles são opcionais: um alerta sem `situacao` é tratado como pendente, e um caso sem `retencao_ate` aparece sem prazo.
- `GET /casos/{id}/entidades/{eid}`: campos `fontes: [{captura_id, fonte?, url_ou_arquivo?}]` e `sugestoes: [{entidade_id, rotulo, identificador?, motivo, confianca?}]`.
- Identificadores (`id`, `captura_id`, `eid`) podem ser string ou número; a interface compara por `String()`.
- `X-Justificativa` é exigido pelo front em toda rota sob `/casos/{id}/...`, `/capturas/...` e `/auditoria...`; em `/me`, `GET /casos` e `POST /casos` ele é enviado se existir, mas não é exigido; em `GET /tipologias` e em `GET /importacao-judicial/estado` ele nunca é enviado. Cabeçalhos HTTP só aceitam Latin-1: acentos do português passam; caracteres fora dessa faixa (travessão, emoji) viram `?`.
- Nós do tipo `contrato` no grafo: no simulado, o contrato liga fornecedor e órgão por duas arestas `contratado_por`. A interface desenha o que o back-end devolver.
- `GET /auditoria/verificar` verifica a cadeia inteira (não há parâmetro de caso no contrato).
- `GET /casos/{id}/relatorio` devolve o corpo bruto (JSON ou Markdown), que o front baixa como arquivo. No JSON, a aba Relatório lê `resumo` e `auditoria.entradas_do_caso` só para mostrar um resumo; para analistas o back-end deixa de enviar as entradas de auditoria, e a aba trata lista vazia, campo ausente ou nulo como "sem entradas", com um aviso.
