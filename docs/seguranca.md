# Segurança

[Voltar ao README](../README.md)

Correções feitas a partir da auditoria de segurança do MVP:

- **Sair limpa a justificativa.** `sair()` apaga o *token* e também a justificativa, na memória e no `sessionStorage`. O próximo usuário da mesma aba não herda o `X-Justificativa` do anterior. O mesmo vale quando a sessão expira (401).
- **Autenticação (H23).** A senha e o código do segundo fator só existem no estado da tela de entrada, e os campos são limpos assim que a etapa termina. O token pendente (antes do segundo fator) nunca vai para o `sessionStorage`. O segredo do segundo fator aparece uma única vez, na etapa de cadastro, e não é guardado em lugar nenhum pelo front-end. As contas e os tokens do modo simulado continuam fora do *bundle* de produção (conferido no *build*).
- **Texto de terceiros como texto.** O texto dos documentos, as anotações e os valores extraídos pela IA vão para a tela como nós de texto do React; não há `dangerouslySetInnerHTML` no projeto. O nome do arquivo exportado vem do `Content-Disposition` e tem as barras trocadas, para valer só como nome.
- **Modo simulado fora do *bundle* de produção.** `src/api/index.ts` só importa o cliente simulado e os *tokens* de demonstração por `import()` dinâmico, atrás da constante de *build* `__MODO_MOCK__` (definida em `vite.config.ts`, verdadeira só com `VITE_MOCK=1`). Sem ela, o ramo é código morto e o empacotador o remove. O `Dockerfile` confere isso: o *build* falha se algum *token* `dev-*` aparecer em `dist/` fora do modo simulado.
- **Content-Security-Policy no nginx** (`nginx-cabecalhos.conf`): `default-src 'self'; script-src 'self'; style-src 'self' 'sha256-…'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`. O CSS do Design System é um arquivo estático, então `style-src` não precisa de `'unsafe-inline'`; o único *hash* libera o `<style>` fixo que o Cytoscape.js insere. Um *build* com `VITE_API_URL` em outra origem exige incluir essa origem em `connect-src`.
- **Cabeçalhos em todas as *locations*.** No nginx, uma `location` com `add_header` próprio deixa de herdar os do `server`. O arquivo `nginx-cabecalhos.conf` (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) é incluído no `server` e em toda `location` que usa `add_header`.
- **Limite de corpo em `/api/`:** `client_max_body_size 64k`. Acima disso o nginx responde 413 sem repassar ao back-end.
- **`X-Forwarded-For` com `$remote_addr`:** o valor enviado pelo cliente não é repassado.
- **`.dockerignore` exclui `.env.*`** (mantendo `.env.example`), para que nenhum arquivo de ambiente entre no contexto de *build*.
- ***Healthcheck* com `wget` do busybox**, sem `apk add curl`.

Erros do back-end aparecem com o motivo e o que fazer: justificativa recusada (400/422, por exemplo com caracteres de controle), corpo grande demais (413) e erros de validação do FastAPI no formato "campo: mensagem". A barra de justificativa também recusa localmente texto com caracteres de controle, antes de guardá-lo na sessão; a regra que vale é a do back-end.

## Pipeline de integração (RNF11, H16)

`.github/workflows/ci.yml` roda a cada `push` e `pull_request`: `npm ci` (versões travadas no `package-lock.json`), `eslint`, `vitest`, `build`, a conferência de que os *tokens* do modo simulado não entraram em `dist/` e `node scripts/auditoria.mjs`. Não há `continue-on-error`: qualquer etapa que falhe derruba o pipeline.

`scripts/auditoria.mjs` roda o `npm audit` e falha com vulnerabilidade alta ou crítica, menos as listadas em `auditoria-excecoes.json`, cada uma com o motivo. Em 24/11/2026 o `npm audit` não aponta nenhuma vulnerabilidade (nem nas dependências de desenvolvimento) e a lista de exceções está vazia. Uma exceção que deixe de aparecer na auditoria faz o script falhar até ser removida da lista.
