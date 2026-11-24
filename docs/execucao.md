# Como rodar, em detalhe

[Voltar ao README](../README.md)

Requisitos: Node 22+ e npm.

```bash
npm install
```

## Modo simulado (sem back-end)

```bash
npm run dev:mock          # equivale a VITE_MOCK=1 vite
```

Abre em <http://localhost:5190>. O cliente simulado roda em memória com **dados sintéticos** (nenhuma pessoa, empresa, CPF ou CNPJ real) e aplica as mesmas regras do back-end: token válido, justificativa obrigatória nas consultas, papel no caso e auditoria encadeada por *hash*. Para entrar com senha, a tela de entrada lista as contas fictícias do simulado (`analista.demo`, `delegado.demo`, `admin.demo` e `novato.demo`, esta ainda sem segundo fator) e preenche usuário e senha; o simulado não calcula TOTP e aceita o código fixo `123456`. Tokens de desenvolvimento aceitos: `dev-delegado`, `dev-agente`, `dev-analista` e `dev-admin` (botões dentro de "Entrar com token de desenvolvimento"). No caso de demonstração, `analista.demo` é o responsável, `delegado.demo` é investigador e `agente.demo` é leitor; `admin.demo` não é membro e não vê o caso. O caso traz três tarefas (uma atrasada), duas anotações e uma extração por IA já feita sobre o edital sintético, com seis sugestões pendentes e dois itens recusados automaticamente; nenhum modelo é chamado no simulado, os itens são fixos. A exportação do simulado gera os mesmos formatos, com um ZIP sem compressão e o SHA-256 calculado de verdade. O cliente simulado, as *fixtures* e esses tokens só entram no *bundle* quando o *build* é feito com `VITE_MOCK=1` (ver [seguranca.md](seguranca.md)). Já existe um caso de demonstração com entidades, vínculos, quinze alertas (ao menos um de cada tipologia, T1 a T10, mais um L6, um sinal fraco L14 e duas combinações, todos pendentes de decisão), um histórico de coletas com uma falha sintética do PNCP (três tentativas, HTTP 503) e uma coleta do Portal da Transparência como "fonte não configurada", dois monitoramentos (um ativo e um desativado) e três avisos de novidade (dois não lidos). Os dados do horizonte 2 seguem as fixtures do back-end (órgão "PREFEITURA SINTETICA DE EXEMPLOPOLIS", CNPJs das bases fictícias 900000xx e 901000xx, CPF só como `***NNNNNN**`). No simulado a recoleta sempre devolve o mesmo *hash*, porque as *fixtures* não mudam; pelo mesmo motivo, "Executar agora" no monitoramento refaz as coletas de origem e não gera aviso novo. Na demonstração, a captura `cap-3` responde como **violada** na verificação de integridade, para mostrar os dois estados da interface.

## Modo real (com o back-end)

```bash
cp .env.example .env      # ajuste VITE_API_URL se preciso
npm run dev
```

O front chama a API em `VITE_API_URL` (padrão `http://localhost:8100`). O back-end precisa liberar CORS para `http://localhost:5190` nesse cenário. Os *tokens* de desenvolvimento são definidos na configuração do back-end.

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
