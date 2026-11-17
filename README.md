# FRONTEND_TCC2_MATHEUS_PERILLO

Front-end do MVP do buscador OSINT para órgãos policiais (TCC 2, UnB/FCTE). Interface em português para delegado, agente e analista, cobrindo a fatia vertical do MVP: **caso → coleta → entidades → grafo de vínculos → alertas de tipologia → custódia e auditoria → relatório**.

O recorte, a stack e o contrato da API (v0) estão em `docs/mvp-escopo.md` do repositório da monografia; os requisitos, em `docs/requisitos-app.md`. O back-end fica no repositório `BACKEND_TCC2_MATHEUS_PERILLO`, e o README dele traz o contrato atual, com as rotas que os horizontes 1, 2 e 3 do backlog acrescentaram.

## Horizonte 1 do backlog na interface

- **Alerta como pista (H12, RF12).** Cada cartão de alerta mostra a situação (pendente de análise, confirmado ou descartado) e tem um campo de justificativa e os botões "Confirmar alerta" e "Descartar alerta", que só habilitam com a justificativa preenchida. A decisão em vigor aparece com quem decidiu, quando e a justificativa; rever um alerta acrescenta outra decisão, e o histórico fica visível. A aba Alertas resume quantos estão pendentes, confirmados e descartados e filtra por situação.
- **Severidade e política de erro (H13, RF14).** A lista vem do back-end já ordenada por severidade (alta, média, baixa), e cada cartão mostra a política de erro da tipologia: se a regra prefere evitar falso negativo ou falso positivo, e por quê. O filtro de tipologia inclui a T4 (H31).
- **Falhas de coleta (H15, RNF12) e versão do conector (H14, RF07).** Ao fim de cada coleta, com sucesso ou com falha, a aba Coleta atualiza a tabela "Coletas deste caso, por fonte": fonte, conector e versão, situação, tentativas, motivo, início e número de capturas, com aviso quando alguma coleta falhou. O botão "Recoletar e comparar" repete a coleta e mostra, por captura, se o SHA-256 é o mesmo e, se não for, quais campos mudaram, com o valor de antes e o de depois.
- **Finalidade e retenção (H17, RNF04).** O formulário de novo caso exige a finalidade e o prazo de retenção. A lista e o cabeçalho do caso mostram os dois, e o caso vencido aparece como "só leitura", com a explicação do que continua disponível. A recusa do back-end (403) aparece como erro na ação tentada.
- **Relatório.** O resumo da aba Relatório mostra as coletas (e quantas falharam) e os alertas pendentes de decisão; o conteúdo do relatório é gerado pelo back-end.

## Horizonte 2 do backlog na interface

O contrato está na seção "Horizonte 2 do backlog (H18, H19, H32 a H36 e H39)" do README do back-end.

- **Aba Coleta: fontes novas (H19).** Além do CNPJ e dos contratos do PNCP, o formulário coleta: **Portal da Transparência** (escolha do recurso; para CEIS e CNEP, "contratadas do caso" ou uma lista de CNPJs; para servidores, o código SIAPE do órgão, de lotação ou de exercício, e o CNPJ do órgão contratante, com o aviso de que essa correspondência é declarada pelo investigador); **termos de contrato do PNCP** (dos contratos do caso); **TSE** (diretório, com UF e município opcionais) e **editais em texto** (diretório, com número de controle da contratação e CNPJ do órgão opcionais). Coleta com situação `nao_configurado` aparece como "fonte não configurada", em aviso neutro com o motivo, no resultado e na tabela de coletas; não conta como falha.
- **Aba Alertas: T5 a T10 (H32 a H36 e H39).** O formulário de execução escolhe as tipologias (T1 a T10) e aceita três limiares só para aquela execução: mínimo de contratações da T5 e os dois percentuais da T8. Em branco, vale a configuração do servidor. Nos alertas de T7 e de T9 com doador pessoa física (`parametros.identidade_confirmada === false`), o cartão traz o selo **"Possível coincidência (não é identificação)"** e a explicação de que seis dígitos do CPF e o nome não identificam uma pessoa. Nos alertas de T10, cada ocorrência aparece com linha, coluna, posição e o trecho literal do edital em bloco pré-formatado (o contexto fica recolhido).
- **Aba Tipologias (nova).** Catálogo de `GET /tipologias`: código, nome, história do backlog, severidade, política de erro, regra, base legal ou fonte, fontes necessárias e os parâmetros com o valor em vigor, marcando os que podem ser sobrescritos por execução. Os limites de dispensa da T5 aparecem numa tabela por exercício (inciso I, inciso II e fonte). A rota exige só o token, então a aba carrega mesmo sem justificativa.
- **Aba Monitoramento (nova, H18).** (a) Formulário para marcar uma entidade do caso, com periodicidade diária (24 h), semanal (168 h), mensal (720 h) ou um valor livre em horas; (b) tabela das entidades monitoradas, com periodicidade, ativo ou inativo e o motivo, próxima e última execução, situação da última execução e as coletas de origem; (c) botões "Executar agora" e "Desativar"/"Reativar"; (d) avisos de novidade (tipo, descrição, data, capturas, lido ou não lido), com "Marcar como lido" e o filtro "Só não lidos". O rótulo da aba e o cabeçalho do caso mostram quantos avisos não foram lidos. No detalhe da entidade (aba Entidades), o botão "Monitorar" leva a entidade ao formulário.
- **Grafo e entidades.** Tipos novos de nó (sanção, candidato, edital) e de aresta (`sancionada_em`, `servidor_de`, `doou_para`, `edital_de`), com cor, forma e rótulo próprios na legenda.
- **Dados pessoais (RNF04).** A interface só mostra CPF no formato descaracterizado `***NNNNNN**`. `src/privacidade.ts` (`mascararCpfs`) é a última barreira, aplicada ao identificador e ao rótulo de entidades, aos atributos e parâmetros (toda tabela chave/valor), ao título, ao motivo e às evidências dos alertas, aos avisos, às sugestões de resolução, aos detalhes da auditoria e, no horizonte 3, às anotações e ao texto dos documentos. Uma sequência de 11 dígitos (com ou sem a pontuação `NNN.NNN.NNN-NN`) é descaracterizada quando vale ao menos uma destas condições: (1) os dois dígitos verificadores conferem, o que cobre todo CPF de verdade, em qualquer contexto; (2) o texto tem a forma de CPF, com hífen antes dos dois últimos dígitos; (3) o contexto diz que é CPF: a palavra "CPF" vem logo antes, o valor está num campo com "cpf" no nome ou é o identificador de uma entidade do tipo pessoa. Fora disso, 11 dígitos não são tratados como CPF: telefone com DDD, número de controle, valor sem separador e parte de identificador maior ficam como vieram (era o defeito da versão anterior, que descaracterizava qualquer número de 11 dígitos). Cerca de 1 em cada 100 números quaisquer passa na conta dos dígitos verificadores; esses continuam descaracterizados, porque o erro escolhido é esconder um número que não é CPF, nunca mostrar um CPF. CNPJ de 14 dígitos não é alterado.

## Horizonte 3 do backlog na interface

O contrato está no código do back-end (`buscador/api/rotas_auth.py`, `rotas_equipe.py`, `rotas_exportacao.py`, `rotas_ia.py` e `esquemas_h3.py`). Nenhuma biblioteca nova foi acrescentada.

- **Entrada com senha e segundo fator (RNF01, H23).** A tela de entrada pede usuário e senha (`POST /auth/login`) e, em seguida, o código de 6 dígitos do aplicativo autenticador (`POST /auth/mfa`, com o token pendente). No primeiro acesso de uma conta, essa etapa também cadastra o segundo fator: a tela mostra a chave secreta (Base32) e a URI `otpauth://` como **texto copiável**. Não há QR code: desenhá-lo exigiria uma biblioteca nova só para isso, e todo aplicativo autenticador aceita a chave digitada. Senha errada mostra "Usuário ou senha inválidos."; código errado mantém a etapa; conta bloqueada (429) mostra a mensagem do servidor. A opção "Entrar com token de desenvolvimento" continua, recolhida num `<details>`: só funciona com o back-end em `MODO_DEV=1` (ou no modo simulado).
- **Sessão.** O token da sessão ativa fica onde o token já ficava: na memória e no `sessionStorage` (nada em `localStorage`). O token pendente, anterior ao segundo fator, fica só na memória da tela de entrada. **Qualquer resposta 401 numa chamada autenticada derruba a sessão local** (token e justificativa) e volta à tela de entrada com o aviso "Sua sessão expirou ou foi encerrada"; a vigia fica em `src/sessao/SessaoContext.tsx` e vale para qualquer método do cliente, menos as duas etapas do login, em que 401 quer dizer credencial errada. "Sair" chama `POST /auth/logout` (não chama para token de desenvolvimento, que não tem sessão no servidor) e limpa a sessão local mesmo se a chamada falhar. Ao recarregar a página com um token guardado, a aplicação consulta `GET /auth/sessao` e retoma a sessão se ela ainda valer.
- **Minha conta e Usuários.** "Minha conta" mostra como o usuário entrou, até quando a sessão vale e o tempo de inatividade, e troca a própria senha (`POST /auth/senha`). "Usuários" aparece só para o perfil admin: lista as contas, cria conta, muda o perfil, ativa ou desativa, redefine a senha e apaga o segundo fator (`GET`/`POST /usuarios`, com justificativa). O administrador nunca vê o segredo do segundo fator.
- **Acesso por caso.** A lista de casos só traz os casos de que o usuário é membro. O cabeçalho do caso mostra o papel (`meu_papel`: responsável, investigador ou leitor) e as contagens novas (membros, tarefas abertas, anotações e sugestões da IA pendentes). `src/sessao/PapelContext.tsx` leva o papel aos componentes de escrita do horizonte 3: para o leitor, eles aparecem **desabilitados, com a explicação**. A interface só antecipa a regra; quem autoriza é o back-end, e a recusa dele (403, "Você não é membro deste caso." ou "Seu papel neste caso (...) não permite esta ação") aparece na ação tentada.
- **Aba Equipe (nova; H23 e H37).** (a) Membros: papel de cada um, quem acrescentou e quando; o responsável acrescenta um membro pelo login, muda papéis e remove, e a tela não deixa rebaixar nem remover o único responsável (o back-end também recusa, com 422). (b) Tarefas: título, descrição, responsável (escolhido entre os membros), situação (aberta, em andamento, concluída, cancelada), prazo e a marca "atrasada"; filtro por situação; a alteração envia só os campos que mudaram (`null` limpa responsável e prazo); cada tarefa mostra o **histórico** (quem mudou, quando, e cada campo com o valor anterior e o novo). (c) Lista geral das anotações do caso.
- **Anotações (H37).** No detalhe da entidade e no cartão do alerta: lista e campo para anotar. São só de acréscimo, e a tela diz isso; não há editar nem apagar. No cartão do alerta as anotações só são consultadas quando o usuário pede, para não gerar uma consulta auditada por alerta ao abrir a lista.
- **Exportar grafo (RNF09, H38).** Na aba Grafo: escolha do formato (ZIP, GraphML, CSV de entidades, CSV de vínculos) e botão "Exportar grafo". O arquivo é baixado por `fetch` autenticado (a rota exige `Authorization` e `X-Justificativa`, que um link comum não envia) e entregue ao navegador como Blob. A tela mostra o **SHA-256 do arquivo baixado**, recalculado no navegador (Web Crypto) e conferido com o cabeçalho `X-Conteudo-SHA256`; se os dois divergem, avisa para não usar o arquivo. O texto de ajuda diz que são formatos abertos, para importação por assistente de dados tabulares em ferramentas como Maltego e i2 Analyst's Notebook, e que essa importação **não foi testada** neste protótipo.
- **Aba Sugestões da IA (nova; RF13, RNF05, H22).** Revisão lado a lado: à esquerda, as sugestões (tipo, valor, campos, confiança quando o modelo a declara, modelo e provedor, situação); à direita, o texto do documento com o **trecho citado em destaque** e rolado até ele. As posições do back-end contam pontos de código Unicode e as strings do JavaScript, unidades UTF-16: `src/ia/localizarTrecho.ts` converte a posição e, mesmo assim, só a aceita se o trecho estiver lá, literal; se não estiver, usa a ocorrência mais próxima e avisa; se o trecho não existir no texto, avisa para não aceitar a sugestão sem conferir o documento. O texto é renderizado como texto (nós de texto do React, sem `dangerouslySetInnerHTML`). Aceitar ou recusar pede justificativa, e a decisão é única. A aba diz que são sugestões de IA local e que nada vira entidade sem decisão humana, e lista as execuções da extração com modelo, versão, parâmetros, resumo do prompt e os **itens recusados automaticamente**, com o motivo. Quando `GET /ia` responde `ativa: false`, a aba mostra "desligada neste servidor" e não oferece o botão de extrair; as sugestões já registradas continuam disponíveis. O botão "Extrair com IA" fica nessa aba (com a escolha da captura do documento) e no detalhe da entidade do tipo edital, que leva a captura do atributo `captura_texto_id`.
- **Aba Coleta.** O formulário do TSE ganhou o campo "Ano da eleição (opcional)": quatro dígitos, enviado como texto no parâmetro `ano` (a mesma regra do back-end, `^(\d{4})?$`); em branco, o parâmetro não é enviado.

## Riscos do piloto corrigidos em 17/11/2026

Acompanham as correções do back-end (seção "Três riscos do piloto corrigidos em 17/11/2026" do README de lá).

- **CNPJ alfanumérico.** `src/cnpj.ts` limpa, valida (dígitos verificadores) e formata o CNPJ numérico e o alfanumérico. Fontes oficiais, acesso em 17/11/2026: [página do projeto na Receita Federal](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico) (Instrução Normativa RFB nº 2.229/2024; "a partir de Julho de 2026, exclusivamente a novas inscrições"), ["Perguntas e Respostas"](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf) (12 posições com dígitos ou letras maiúsculas de A a Z e 2 DVs numéricos, mesma máscara) e o [manual do cálculo do DV](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf) (valor = código ASCII − 48, pesos de 2 a 9, módulo 11; exemplo `12.ABC.345/01DE-35`). Na aba Coleta, os campos de CNPJ do órgão aplicam a máscara `AA.AAA.AAA/AAAA-DV`, aceitam letras e enviam as 14 posições em maiúsculas; a lista de CNPJs do CEIS/CNEP só aceita CNPJ com os dígitos verificadores corretos (um CNPJ digitado errado não acharia sanção e pareceria "nada consta"). Decisão do autor: minúsculas digitadas são convertidas em maiúsculas. `mascararCpfs` não altera CNPJ alfanumérico.
- **CPF na comparação de capturas.** O back-end passou a devolver a comparação campo a campo com o CPF descaracterizado; a tela aplica `mascararCpfs` também ali (valor de antes, de depois e chave do registro), com o nome do campo como contexto (`niFornecedor`, `cpf...`), como última barreira. O texto da captura traz `cpfs_descaracterizados`: quando verdadeiro, a aba Sugestões da IA avisa que o original, íntegro na custódia, tem CPF completo. Não há tela nem rota para ver ou baixar o original.
- **TSE, arquivo grande.** O formulário do TSE ganhou a opção "Ler só as linhas dos candidatos que já estão no caso" (`do_caso`) e a explicação de que arquivo acima do teto do servidor é lido em fluxo, exige filtro (UF, município ou candidatos) e fica na custódia como recorte.
- **Testes:** `src/cnpj.test.ts`, `src/test/cnpjSintetico.ts` (CNPJs alfanuméricos sorteados a cada execução, com DV calculado) e casos novos em `src/telas/abas/AbaColeta.test.tsx` e `src/privacidade.test.ts`. Em 17/11/2026: 244 testes passaram (eram 234).

## Tipologias de lavagem e alerta de combinação

Acompanham o back-end (contrato da API das tipologias L e da combinação). Códigos novos: L1, L3, L4, L5, L6, L7, L8, L10, L14, L15, L16 e COMB (não existem L2, L9, L11, L12 e L13).

- **Aba Tipologias.** O catálogo vem em três grupos: contratações (T), lavagem e ocultação (L) e combinação. Cada cartão mostra o grupo, o peso na combinação e, nos sinais fracos (L14 e L15), o selo e o texto "sinal fraco: sozinho não indica nada; só pesa no alerta de combinação". `l6_limites` vira uma tabela ano → limite do MEI (com o limite mensal do ano de início e a fonte), mais ME e EPP; `comb_pesos` vira uma tabela tipologia → peso.
- **Aba Alertas.** Três blocos: (a) **combinação em destaque**, com a tabela dos componentes (código, tipologia, título, peso e "conta" ou "não conta", com a observação), a soma dos pesos e o número de tipologias distintas contra os mínimos, e o aviso de que não é escore de culpa; cada componente leva ao cartão do alerta (rolagem e foco, sem biblioteca); (b) alertas por tipologia; (c) **sinais fracos**, à parte e recolhidos. Todo cartão L ou COMB traz no alto o aviso "Pista, não conclusão" (RF12); nos T o aviso continua na seção da decisão. O filtro e a seleção para executar incluem os códigos novos, por grupo, e o formulário aceita os quinze limiares novos por execução (recolhidos em "Limiares das tipologias de lavagem e da combinação").
- **Aba Coleta.** O Portal da Transparência ganhou CEPIM e convênios (do caso ou lista de CNPJs) e CEAF (do caso ou **lista de nomes**; nunca CPF: item com dígitos bloqueia o envio).
- **Grafo.** Tipo de nó `convenio` e arestas `convenente_de` e `concedente_de`, com cor, forma e rótulo próprios.
- **Campos opcionais.** `grupo`, `sinal_fraco` e `peso` (catálogo e alerta) são opcionais na leitura: numa resposta antiga, o grupo é deduzido do código (T, L ou COMB) e nada mais muda.
- **Simulado.** A ALFA tem um alerta L normal (L6) e um sinal fraco (L14), além de T1, T2 e T3. A combinação não é fixa: o simulado a calcula a cada execução, a partir dos alertas cuja primeira entidade é a mesma (simplificação), sem os descartados; com os mínimos padrão (2 tipologias, peso 2) saem duas, a da ALFA e a da ZETA. Os limiares, o `prefere_evitar` e o texto das políticas das L são ilustrativos (os reais vêm do back-end); CEPIM, CEAF e convênios não têm carga sintética (a coleta fecha sem capturas, com aviso).

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

## Como rodar

Requisitos: Node 22+ e npm.

```bash
npm install
```

### Modo simulado (sem back-end)

```bash
npm run dev:mock          # equivale a VITE_MOCK=1 vite
```

Abre em <http://localhost:5190>. O cliente simulado roda em memória com **dados sintéticos** (nenhuma pessoa, empresa, CPF ou CNPJ real) e aplica as mesmas regras do back-end: token válido, justificativa obrigatória nas consultas, papel no caso e auditoria encadeada por *hash*. Para entrar com senha, a tela de entrada lista as contas fictícias do simulado (`analista.demo`, `delegado.demo`, `admin.demo` e `novato.demo`, esta ainda sem segundo fator) e preenche usuário e senha; o simulado não calcula TOTP e aceita o código fixo `123456`. Tokens de desenvolvimento aceitos: `dev-delegado`, `dev-agente`, `dev-analista` e `dev-admin` (botões dentro de "Entrar com token de desenvolvimento"). No caso de demonstração, `analista.demo` é o responsável, `delegado.demo` é investigador e `agente.demo` é leitor; `admin.demo` não é membro e não vê o caso. O caso traz três tarefas (uma atrasada), duas anotações e uma extração por IA já feita sobre o edital sintético, com seis sugestões pendentes e dois itens recusados automaticamente; nenhum modelo é chamado no simulado, os itens são fixos. A exportação do simulado gera os mesmos formatos, com um ZIP sem compressão e o SHA-256 calculado de verdade. O cliente simulado, as *fixtures* e esses tokens só entram no *bundle* quando o *build* é feito com `VITE_MOCK=1` (ver "Segurança"). Já existe um caso de demonstração com entidades, vínculos, quinze alertas (ao menos um de cada tipologia, T1 a T10, mais um L6, um sinal fraco L14 e duas combinações, todos pendentes de decisão), um histórico de coletas com uma falha sintética do PNCP (três tentativas, HTTP 503) e uma coleta do Portal da Transparência como "fonte não configurada", dois monitoramentos (um ativo e um desativado) e três avisos de novidade (dois não lidos). Os dados do horizonte 2 seguem as fixtures do back-end (órgão "PREFEITURA SINTETICA DE EXEMPLOPOLIS", CNPJs das bases fictícias 900000xx e 901000xx, CPF só como `***NNNNNN**`). No simulado a recoleta sempre devolve o mesmo *hash*, porque as *fixtures* não mudam; pelo mesmo motivo, "Executar agora" no monitoramento refaz as coletas de origem e não gera aviso novo. Na demonstração, a captura `cap-3` responde como **violada** na verificação de integridade, para mostrar os dois estados da interface.

### Modo real (com o back-end)

```bash
cp .env.example .env      # ajuste VITE_API_URL se preciso
npm run dev
```

O front chama a API em `VITE_API_URL` (padrão `http://localhost:8100`). O back-end precisa liberar CORS para `http://localhost:5190` nesse cenário. Os *tokens* de desenvolvimento são definidos na configuração do back-end.

### Verificações

```bash
npm run build             # tsc -b && vite build
npm run lint              # eslint
npm test -- --run         # vitest
npm audit --audit-level=high   # falha com vulnerabilidade alta ou crítica nas dependências
```

### Pipeline de integração (RNF11, H16)

`.github/workflows/ci.yml` roda a cada `push` e `pull_request`: `npm ci` (versões travadas no `package-lock.json`), `eslint`, `vitest`, `build`, a conferência de que os *tokens* do modo simulado não entraram em `dist/` e `npm audit --audit-level=high`. Não há `continue-on-error`: qualquer etapa que falhe derruba o pipeline.

Na data desta versão, `npm audit --omit=dev` não aponta nada nas dependências que vão para o navegador. Nas dependências de desenvolvimento há 9 avisos de severidade moderada, todos pela mesma causa (`minimatch`, usada pelo `eslint` e pelo `typescript-eslint`; [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)). Eles ficam abaixo do nível que barra o pipeline e não chegam ao *bundle*; `npm audit fix` os resolve quando for conveniente atualizar o `package-lock.json`.

## Docker

A imagem é *multi-stage*: `node:22-alpine` faz `npm ci && npm run build`; `nginx:alpine` serve `dist/` como usuário `nginx` (sem root) na porta **8080 dentro do contêiner**, com *healthcheck* em `/saude` feito pelo `wget` do busybox (nenhum pacote é instalado na etapa final).

```bash
docker build -t osint-frontend .
docker run --rm -d --name osint-frontend -p 127.0.0.1:8090:8080 osint-frontend
curl -s localhost:8090 | head
docker stop osint-frontend
```

A interface fica em <http://localhost:8090> (porta 8090 do *host*; 8080 no contêiner). O `nginx.conf` tem *fallback* de SPA (`try_files $uri /index.html`) e um *reverse proxy* em `location /api/` para `http://api:8000/` — o navegador fala só com o nginx, sem CORS. Dentro da imagem, `VITE_API_URL` vale `/api` por padrão; por isso o contêiner do back-end precisa se chamar `api` na mesma rede Docker (a composição dos dois serviços é feita fora deste repositório). Sem o back-end no ar, o nginx sobe normalmente e as chamadas a `/api/` respondem 502. O nome `api` é resolvido pelo DNS interno do Docker (`127.0.0.11`), que só existe em redes criadas pelo usuário ou pelo Compose; num `docker run` avulso na rede padrão, as chamadas a `/api/` registram "resolver: connection refused" no log do nginx, sem afetar o restante.

Para apontar a outra origem na hora do *build*:

```bash
docker build --build-arg VITE_API_URL=http://localhost:8100 -t osint-frontend .
docker build --build-arg VITE_MOCK=1 -t osint-frontend-mock .   # imagem só com dados sintéticos
```

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8100` (dev) / `/api` (imagem Docker) | URL base da API do contrato v0 |
| `VITE_MOCK` | `0` | Só o valor `1` liga o cliente simulado em memória; é decidido no *build* |

As variáveis são lidas em tempo de *build* (Vite): num `.env` local ou como `--build-arg` no Docker.

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
    Entrada.tsx         usuário e senha → segundo fator; token de desenvolvimento, recolhido
    Conta.tsx           sessão atual e troca da própria senha
    Usuarios.tsx        administração de contas (perfil admin)
    Casos.tsx           listar e criar casos (com finalidade e prazo de retenção)
    Caso.tsx            abas Coleta, Entidades, Grafo, Alertas, Sugestões da IA, Tipologias, Monitoramento, Equipe, Auditoria, Relatório
    abas/               uma aba por arquivo
  test/                 setup do Vitest e cliente falso para componentes
public/licencas/        licença MIT do @govbr-ds/core (vai para dist/)
Dockerfile, nginx.conf, nginx-cabecalhos.conf, .dockerignore
.github/workflows/ci.yml   pipeline: eslint, vitest, build e npm audit
```

## Justificativa e auditoria

Toda rota que consulta dados de caso, capturas ou auditoria exige o cabeçalho `X-Justificativa`. A barra de justificativa fica no topo de todas as telas após a entrada: é editável, vale para a sessão (guardada em `sessionStorage`) e, quando vazia, a interface avisa e o cliente nem envia a requisição (`ErroJustificativa`). O texto entra na trilha de auditoria com usuário, data e caso. Isso é o que sustenta o RNF02 (auditoria imutável) junto do RF07 (cadeia de custódia): cada evidência de alerta mostra fonte, URL ou arquivo e SHA-256, com botão para recalcular o *hash* em `/capturas/{id}/verificar`, e a aba Auditoria verifica a cadeia inteira em `/auditoria/verificar`.

## Segurança

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

## Testes

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
- `src/telas/abas/AbaSugestoesIa.test.tsx` e `src/ia/localizarTrecho.test.ts`: **revisão das sugestões com o trecho destacado** (inclusive trecho em duas linhas e posição em pontos de código com emoji antes), rolagem até o trecho, posição errada e trecho ausente, documento renderizado como texto, decisão com justificativa obrigatória, 409, itens recusados automaticamente, extração e falha (502), IA desligada sem botão de extrair e leitor só leitura.
- `src/telas/abas/AbaColeta.test.tsx`: o **ano do TSE** (opcional, quatro dígitos, bloqueia fora do formato).
- `src/api/clienteHttp.h3.test.ts`: `/auth/login` público, `/auth/mfa` com o token pendente, `/auth/*` e `/ia` sem `X-Justificativa`, URLs e corpos das rotas novas, download da exportação com nome e SHA-256, 401, 403, 409, 429 e 502 como `ErroApi`.
- `src/api/clienteMock.h3.test.ts`: o simulado aplica as regras do horizonte 3: login, código errado, bloqueio depois de cinco falhas, logout, troca de senha, administração de contas, casos só de quem é membro, 403 por papel e a negação na auditoria, gestão de membros, anotações só de acréscimo, tarefas e histórico, exportação (CSV, GraphML bem formado, ZIP, SHA-256 real) e extração por IA (trecho literal na posição informada, recusas, decisão única, aceitação que une ou cria entidade).

### Tipologias de lavagem e combinação

- `src/componentes/CartaoAlerta.test.tsx`: alerta L explicado como os T; aviso "pista, não conclusão" uma vez só; selo e texto do sinal fraco; cartão COMB com componentes ("conta" e "não conta"), soma e tipologias distintas contra os mínimos, aviso de que não é escore de culpa, navegação até o cartão do componente e CPF descaracterizado.
- `src/telas/abas/AbaAlertas.test.tsx`: combinação em destaque; sinais fracos à parte e recolhidos; componente que abre os sinais fracos e limpa o filtro; filtro e seleção com os códigos novos; limiares novos e faixa.
- `src/telas/abas/AbaTipologias.test.tsx`: três grupos, sinal fraco, peso, tabela de `l6_limites` e de `comb_pesos`, resposta antiga sem os campos novos.
- `src/telas/abas/AbaColeta.test.tsx`: CEPIM, convênios e CEAF (só nomes; CPF bloqueia). `src/grafo/mapear.test.ts`: convênio e as duas arestas.
- `src/api/clienteHttp.test.ts` e `src/api/clienteMock.test.ts`: corpo com os códigos e limiares novos; coleta dos recursos novos; catálogo com grupo, sinal fraco e peso; combinação coerente com os componentes; descartado sai da combinação; faixas (422).

## Suposições sobre o contrato v0

Onde a seção 5 de `docs/mvp-escopo.md` não fixa o formato, o front assumiu o seguinte (marcado como `SUPOSIÇÃO` em `src/api/tipos.ts`):

- `GET /casos/{id}`: o caso com um objeto `contagens: {entidades, alertas, capturas, coletas?, sugestoes?, monitoramentos?, avisos_nao_lidos?}` (opcional na interface; sem `avisos_nao_lidos`, a aba Monitoramento não mostra contagem).
- Os campos novos do horizonte 1 (`finalidade`, `retencao_ate` e `somente_leitura` no caso; `situacao`, `decisao`, `decisoes`, `politica_erro`, `prefere_evitar`, `tipologia_nome` e `ativo` no alerta; `coleta_id`, `situacao`, `tentativas`, `motivo` e o conector na coleta) seguem a tabela de rotas do README do back-end. Na interface eles são opcionais: um alerta sem `situacao` é tratado como pendente, e um caso sem `retencao_ate` aparece sem prazo.
- `GET /casos/{id}/entidades/{eid}`: campos `fontes: [{captura_id, fonte?, url_ou_arquivo?}]` e `sugestoes: [{entidade_id, rotulo, identificador?, motivo, confianca?}]`.
- Identificadores (`id`, `captura_id`, `eid`) podem ser string ou número; a interface compara por `String()`.
- `X-Justificativa` é exigido pelo front em toda rota sob `/casos/{id}/...`, `/capturas/...` e `/auditoria...`; em `/me`, `GET /casos` e `POST /casos` ele é enviado se existir, mas não é exigido; em `GET /tipologias` ele nunca é enviado. Cabeçalhos HTTP só aceitam Latin-1: acentos do português passam; caracteres fora dessa faixa (travessão, emoji) viram `?`.
- Nós do tipo `contrato` no grafo: no simulado, o contrato liga fornecedor e órgão por duas arestas `contratado_por`. A interface desenha o que o back-end devolver.
- `GET /auditoria/verificar` verifica a cadeia inteira (não há parâmetro de caso no contrato).
- `GET /casos/{id}/relatorio` devolve o corpo bruto (JSON ou Markdown), que o front baixa como arquivo. No JSON, a aba Relatório lê `resumo` e `auditoria.entradas_do_caso` só para mostrar um resumo; para analistas o back-end deixa de enviar as entradas de auditoria, e a aba trata lista vazia, campo ausente ou nulo como "sem entradas", com um aviso.

## Limitações

- Sem roteamento por URL (navegação por estado); recarregar a página volta à lista de casos (token e justificativa ficam na sessão do navegador).
- O grafo usa o *layout* `cose` embutido do Cytoscape; grafos grandes (RNF06) ficam para depois.
- O perfil só decide, na interface, se o botão "Usuários" aparece (admin); o papel no caso só desabilita, com explicação, os controles de escrita do horizonte 3 (equipe, tarefas, anotações, extração e decisão das sugestões da IA). Nas abas dos horizontes anteriores (coleta, execução de tipologias, decisão de alertas, monitoramento) o leitor ainda vê os controles habilitados e recebe a recusa do back-end (403) na ação tentada. A autorização é sempre do back-end.
- A interface não esconde as ações de um caso vencido: ela avisa que o caso está só para leitura e mostra a recusa do back-end (403) na ação tentada. Não há tela para prorrogar o prazo de retenção nem para alterar a finalidade (o back-end não tem essas rotas).
- A comparação de capturas aparece só no resultado da recoleta; não há tela para comparar duas capturas quaisquer (`GET /capturas/{id}/comparar` existe no back-end).
- No simulado, a tabela de severidade e política de erro é uma cópia resumida da tabela do back-end (`src/api/dadosSinteticos.ts`); a referência é a do back-end.
- A exportação (RNF09) entrega formatos abertos; a importação no Maltego e no i2 Analyst's Notebook não foi testada. Demais itens fora do MVP seguem a seção 2 de `docs/mvp-escopo.md`.
- Horizonte 3: sem QR code no cadastro do segundo fator (chave e URI como texto); o front-end não renova a sessão sozinho nem avisa antes de ela expirar (o usuário só percebe no próximo 401); a tela de usuários não mostra as sessões abertas de cada conta; não há tela para ver o texto de uma captura fora da revisão das sugestões; a escolha da captura para a extração só lista capturas de coletas de editais em texto (e as que já tiveram extração); a aba Relatório não resume equipe, tarefas e sugestões da IA; as listas não se atualizam sozinhas quando outro membro altera o caso.
- No simulado, `agente.demo` tem o perfil `agente`, que não existe no back-end (perfis: analista, delegado e admin); ele foi mantido como estava e serve de leitor no caso de demonstração. O simulado aceita o código fixo `123456` no lugar do TOTP e não envia nada a modelo de linguagem.
- Horizonte 2: na coleta de termos do PNCP só há a opção "contratos do caso" (a lista explícita de contratos que a API aceita não tem formulário); a execução das tipologias só expõe os três limiares novos (T5 e T8), não os de T1 a T3; a periodicidade de um monitoramento só muda marcando a entidade de novo; não há tela com o histórico de execuções de um monitoramento (a lista mostra a última); a aba Relatório não resume monitoramentos e avisos (eles vêm no relatório gerado pelo back-end); os avisos não são atualizados sozinhos (use "Atualizar").
- No simulado, o catálogo de tipologias é uma cópia resumida do catálogo do back-end, e os limiares por execução só afetam os alertas sintéticos de T5, de T8 e de L14 e a combinação; os demais limiares das L são só validados.
- Dados do modo simulado são fictícios e servem só para demonstração e testes.
