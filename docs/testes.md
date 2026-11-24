# Testes

[Voltar ao README](../README.md)

## Verificações

```bash
npm run build             # tsc -b && vite build
npm run lint              # eslint
npm test -- --run         # vitest
node scripts/auditoria.mjs     # npm audit: falha com vulnerabilidade alta ou crítica fora das exceções
```

## O que cada arquivo de teste cobre

- `src/api/clienteHttp.test.ts`: cabeçalhos `Authorization` e `X-Justificativa`, rota pública `/health`, erro local sem justificativa, montagem das URLs do contrato (inclusive decisão de alerta, histórico de coletas e recoleta), erros do FastAPI e a recusa por retenção (403).
- `src/api/clienteMock.test.ts`: o simulado aplica as mesmas regras (token, justificativa, auditoria encadeada, grafo, caminho, tipologias por severidade) e as do horizonte 1: finalidade e retenção, caso vencido só leitura, decisão com histórico e evento na auditoria, coletas com situação e tentativas, recoleta com comparação.
- `src/componentes/CartaoAlerta.test.tsx`: alerta com motivo, severidade, parâmetros e evidências com fonte e SHA-256; verificação de integridade íntegra e violada; situação, política de erro, justificativa obrigatória para decidir, histórico de decisões e erro do back-end na decisão.
- `src/telas/abas/AbaAlertas.test.tsx`: ordem por severidade com a política de cada tipologia; descarte com justificativa muda a situação na tela, gera o evento na auditoria e alimenta o filtro por situação.
- `src/telas/abas/AbaColeta.test.tsx`: tabela por fonte com sucesso ou falha, tentativas, motivo e versão do conector; atualização ao fim de uma coleta que falha; recoleta com *hash* igual; comparação com *hash* diferente e campos alterados.
- `src/telas/Casos.test.tsx`: o caso só é criado com finalidade e prazo de retenção; a lista mostra os dois e marca o caso vencido.
- `src/telas/abas/AbaEntidades.test.tsx`: homônimo aparece só como sugestão "não fundida"; a entidade mantém o próprio identificador.
- `src/telas/abas/AbaAuditoria.test.tsx`: estados da verificação da cadeia (em andamento, íntegra, violada com `primeira_quebra`, erro).
- `src/componentes/JustificativaBarra.test.tsx`: aviso sem justificativa, persistência na sessão e recusa de caractere de controle.
- `src/sessao/SessaoContext.test.tsx`: `sair()` limpa *token*, usuário e justificativa (estado e `sessionStorage`).
- `src/api/erros.test.ts`: mensagens para 413 e 422, página HTML de erro do nginx, validação do FastAPI e modo simulado ausente do *build*.
- `src/telas/abas/AbaRelatorio.test.tsx`: relatório com lista de auditoria vazia, ausente ou nula, e com entradas; coletas com falha e alertas pendentes no resumo.
- `src/grafo/mapear.test.ts`: mapeamento do grafo para elementos do Cytoscape (tipos distintos, arestas rotuladas, nó central), inclusive os tipos de nó e de aresta do horizonte 2.

Do horizonte 2:

- `src/privacidade.test.ts`: `mascararCpfs` troca CPF com e sem pontuação pelo formato `***NNNNNN**`, reescreve o formato descaracterizado pontuado e não toca em CNPJ, número de controle do PNCP, *hash*, datas e valores.
- `src/api/clienteHttp.test.ts`: `/tipologias` leva só o token e nunca o `X-Justificativa`; corpo das coletas novas e da execução com tipologias e limiares; rotas de monitoramento e de avisos (inclusive `?nao_lidos=true`); nada sai sem justificativa; 409 vira `ErroApi`.
- `src/api/clienteMock.test.ts`: dados sintéticos (nomes fictícios, CPF só descaracterizado, bases de CNPJ fictícias), um alerta de cada tipologia T5 a T10, seleção de tipologias e limiares, catálogo sem justificativa e sem auditoria, `do_caso` trocado pela lista explícita, fonte não configurada, monitoramento (marcar, reativar, executar, desativar, 409 e 404), avisos (filtro e leitura) e retenção vencida.
- `src/telas/abas/AbaColeta.test.tsx`: formulários do Portal da Transparência (CEIS com contratadas do caso, CNEP com lista de CNPJs, servidores com o aviso da correspondência declarada), dos termos do PNCP, do TSE e dos editais; "fonte não configurada" como aviso neutro no resultado e na tabela.
- `src/componentes/CartaoAlerta.test.tsx`: alertas T5 a T10; selo de possível coincidência em T7 e em T9 de pessoa física (e ausente nos demais); ocorrências do T10 com linha, coluna, posição e trecho em `<pre>`; CPF completo vindo da API mostrado descaracterizado.
- `src/telas/abas/AbaAlertas.test.tsx`: execução sem corpo por padrão, com tipologias escolhidas e os três limiares, bloqueio com limiar fora da faixa e filtro de T1 a T10.
- `src/telas/abas/AbaTipologias.test.tsx`: as dez tipologias com todos os campos, parâmetros com valor em vigor e marca "por execução", tabela de limites de dispensa por exercício, carga sem justificativa e erro do back-end.
- `src/telas/abas/AbaMonitoramento.test.tsx`: lista de monitoramentos; marcar entidade (periodicidade semanal e valor livre); executar agora; desativar e reativar; erro do back-end; avisos (lista, marcar como lido, filtro de não lidos, CPF descaracterizado); e, na tela do caso, a contagem de avisos não lidos na aba e o botão "Monitorar" da entidade.

Do horizonte 3:

- `src/privacidade.test.ts`: os casos novos de `mascararCpfs`: CPF com dígitos verificadores válidos é descaracterizado em qualquer contexto; com dígito inválido, só na forma de CPF (com hífen), depois da palavra "CPF" ou num campo de CPF; telefone, número de controle, valor e parte de identificador ficam como vieram; `cpfComDigitosValidos`.
- `src/telas/Entrada.test.tsx`: login com segundo fator (o token pendente não é guardado; o da sessão ativa vai só para o `sessionStorage`), senha errada, **código errado**, conta bloqueada, cadastro do segundo fator com segredo e URI como texto (sem imagem), **sessão expirada** (401 derruba a sessão e mostra o aviso), "Sair" com e sem falha do logout, retomada da sessão ao recarregar, token de desenvolvimento recolhido, "Minha conta" com troca de senha e a tela de usuários do admin.
- `src/telas/abas/AbaEquipe.test.tsx`: **membros com papéis** (acrescentar, mudar papel, remover, único responsável travado, 422 de login desconhecido), investigador e leitor com os controles desabilitados e a explicação; **tarefas com histórico** (lista, atrasada, filtro, criar com responsável entre os membros, alterar só os campos mudados, recusa do back-end); lista geral de anotações; e, na tela do caso, o papel, as contagens novas e o botão "Extrair com IA" da entidade (ausente com a IA desligada).
- `src/componentes/Anotacoes.test.tsx`: **anotações** no detalhe da entidade e no cartão do alerta (sob demanda), só de acréscimo, leitor com o formulário desabilitado, recusa do back-end, texto mostrado como texto e com CPF descaracterizado.
- `src/componentes/ExportarGrafo.test.tsx`: **exportação**: texto de ajuda (sem afirmar compatibilidade testada), formato escolhido, entrega como Blob com o nome do anexo, SHA-256 recalculado e conferido com o do servidor, divergência, cabeçalho ausente e erro do servidor.
- `src/telas/abas/AbaSugestoesIa.test.tsx` e `src/ia/localizarTrecho.test.ts`: **revisão das sugestões com o trecho destacado** (inclusive trecho em duas linhas e posição em pontos de código com emoji antes), rolagem até o trecho, posição errada e trecho ausente, documento renderizado como texto, decisão com justificativa obrigatória, 409, itens recusados automaticamente, pedido recusado (409), IA desligada sem botão de extrair e leitor só leitura; e o **andamento da extração em segundo plano**: fila com posição e barra indeterminada, barra por bloco com tempo e estimativa, sugestões recarregadas só quando um bloco termina, tela utilizável durante a extração, cancelar e retomar, concluída com falhas (blocos e causas), falha e interrupção com o motivo, falha da consulta do andamento (aviso, nova tentativa e parada depois de cinco), execução já em andamento ao abrir a aba, retomada pela lista de execuções, leitor sem cancelar nem retomar e fim da consulta ao sair da aba.
- `src/telas/abas/AbaColeta.test.tsx`: o **ano do TSE** (opcional, quatro dígitos, bloqueia fora do formato).
- `src/api/clienteHttp.h3.test.ts`: `/auth/login` público, `/auth/mfa` com o token pendente, `/auth/*` e `/ia` sem `X-Justificativa`, URLs e corpos das rotas novas, download da exportação com nome e SHA-256, 401, 403, 409, 429 e 502 como `ErroApi`.
- `src/api/clienteMock.h3.test.ts`: o simulado aplica as regras do horizonte 3: login, código errado, bloqueio depois de cinco falhas, logout, troca de senha, administração de contas, casos só de quem é membro, 403 por papel e a negação na auditoria, gestão de membros, anotações só de acréscimo, tarefas e histórico, exportação (CSV, GraphML bem formado, ZIP, SHA-256 real) e extração por IA (trecho literal na posição informada, recusas, decisão única, aceitação que une ou cria entidade).

### Tipologias de lavagem e combinação

- `src/componentes/CartaoAlerta.test.tsx`: alerta L explicado como os T; aviso "pista, não conclusão" uma vez só; selo e texto do sinal fraco; cartão COMB com componentes ("conta" e "não conta"), soma e tipologias distintas contra os mínimos, aviso de que não é escore de culpa, navegação até o cartão do componente e CPF descaracterizado.
- `src/telas/abas/AbaAlertas.test.tsx`: combinação em destaque; sinais fracos à parte e recolhidos; componente que abre os sinais fracos e limpa o filtro; filtro e seleção com os códigos novos; limiares novos e faixa.
- `src/telas/abas/AbaTipologias.test.tsx`: três grupos, sinal fraco, peso, tabela de `l6_limites` e de `comb_pesos`, resposta antiga sem os campos novos.
- `src/telas/abas/AbaColeta.test.tsx`: CEPIM, convênios e CEAF (só nomes; CPF bloqueia). `src/grafo/mapear.test.ts`: convênio e as duas arestas.
- `src/api/clienteHttp.test.ts` e `src/api/clienteMock.test.ts`: corpo com os códigos e limiares novos; coleta dos recursos novos; catálogo com grupo, sinal fraco e peso; combinação coerente com os componentes; descartado sai da combinação; faixas (422).
