# Front-end do buscador OSINT (MVP, TCC2 - UnB/FCTE)

## O que é

Front-end do MVP de um buscador OSINT para órgãos policiais, feito como TCC na UnB/FCTE. É uma interface em português (React, TypeScript e Vite, com o Padrão Digital de Governo como base visual) que cobre o fluxo **caso → coleta → entidades → grafo de vínculos → alertas de tipologia → custódia e auditoria → relatório**. Conversa com a API do repositório `BACKEND_TCC2_MATHEUS_PERILLO` ou roda sozinho, em modo simulado, só com dados sintéticos.

## Requisitos

- Node 22 ou mais novo e npm (o pipeline e a imagem Docker usam o Node 22).
- Docker, só para rodar pela imagem (`node:22-alpine` no build e `nginx:alpine` para servir).
- Para o modo real, o back-end rodando (API em `http://localhost:8100`).

## Configuração

```bash
cp .env.example .env
```

| Variável | Padrão | Uso |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8100` | URL base da API |
| `VITE_MOCK` | `0` | Só o valor `1` liga o cliente simulado em memória |

As variáveis são lidas em tempo de build. O `.env` não vai para o git. O modo simulado (`npm run dev:mock`) não precisa de `.env`.

## Como rodar

### Local

```bash
npm install
npm run dev:mock    # modo simulado, sem back-end, em http://localhost:5190
npm run dev         # modo real, com o back-end, em http://localhost:5190
```

No modo real, o back-end precisa liberar CORS para `http://localhost:5190`.

### Com Docker

```bash
docker build -t osint-frontend .
docker run --rm -d --name osint-frontend -p 127.0.0.1:8090:8080 osint-frontend
docker stop osint-frontend
```

A interface fica em <http://localhost:8090>. Essa imagem repassa `/api/` para o serviço `api` do back-end; por isso, para subir tudo junto (front-end, API e PostgreSQL), use o `docker compose up --build -d` do repositório do back-end. Para uma imagem só com dados sintéticos:

```bash
docker build --build-arg VITE_MOCK=1 -t osint-frontend-mock .
```

## Como rodar os testes

```bash
npm run lint                  # eslint
npm test -- --run             # vitest
npm run build                 # tsc -b && vite build
node scripts/auditoria.mjs    # npm audit: falha com vulnerabilidade alta ou crítica fora das exceções
```

São os mesmos comandos do pipeline (`.github/workflows/ci.yml`), que instala as dependências com `npm ci`.

## Licença

MIT. Ver [LICENSE](LICENSE).

## Documentação

- [docs/execucao.md](docs/execucao.md): como rodar, em detalhe (modo simulado, modo real, Docker e variáveis de ambiente).
- [docs/telas.md](docs/telas.md): telas e funcionalidades da interface.
- [docs/arquitetura.md](docs/arquitetura.md): stack, Padrão Digital de Governo, estrutura do código e suposições sobre o contrato da API.
- [docs/seguranca.md](docs/seguranca.md): segurança e pipeline de integração.
- [docs/testes.md](docs/testes.md): o que cada arquivo de teste cobre.
- [docs/limitacoes.md](docs/limitacoes.md): limitações.
