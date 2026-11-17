# Etapa 1: build da aplicação (Vite)
FROM node:22-alpine AS build
WORKDIR /app

# URL base da API vista pelo navegador. Dentro da imagem o padrão é "/api",
# caminho que o nginx encaminha ao back-end (ver nginx.conf). Para apontar
# direto a outra origem: docker build --build-arg VITE_API_URL=http://host:8000 .
ARG VITE_API_URL=/api
ARG VITE_MOCK=0
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_MOCK=${VITE_MOCK}

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
# Fora do modo simulado, o bundle não pode levar os tokens de demonstração
# (eles só entram por import dinâmico quando VITE_MOCK=1).
RUN if [ "$VITE_MOCK" != "1" ] && grep -rlE "dev-(delegado|agente|analista|admin)" dist; then \
        echo "ERRO: tokens de demonstração no bundle de produção" >&2; exit 1; \
    fi

# Etapa 2: servidor estático nginx, sem root, na porta 8080.
# O healthcheck usa o wget do busybox, que já vem na imagem: nenhum pacote é
# baixado na etapa final.
FROM nginx:alpine AS runtime
RUN rm /etc/nginx/conf.d/default.conf \
    && mkdir -p /var/cache/nginx /var/run/nginx \
    && chown -R nginx:nginx /var/cache/nginx /var/run/nginx /var/log/nginx
COPY nginx.conf /etc/nginx/nginx.conf
COPY nginx-cabecalhos.conf /etc/nginx/cabecalhos-seguranca.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -T 2 -O /dev/null http://127.0.0.1:8080/saude || exit 1
CMD ["nginx", "-g", "daemon off;"]
