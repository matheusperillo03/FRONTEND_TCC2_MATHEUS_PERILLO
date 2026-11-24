// @vitest-environment node
// RNF01: configuração do nginx para TLS, redirecionamento para https e HSTS.
// Confere só o texto dos arquivos. A sintaxe e o comportamento precisam do nginx em execução
// (`nginx -t` e `curl`; roteiro em docs/execucao.md, "TLS").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ler = (nome) => readFileSync(`${raiz}${nome}`, 'utf8');
/** Tira comentários, para as asserções não passarem por causa de um comentário. */
const semComentarios = (texto) =>
  texto
    .split('\n')
    .map((linha) => linha.replace(/(^|\s)#.*$/, ''))
    .join('\n');

describe('RNF01: nginx com TLS (nginx-tls.conf)', () => {
  const tls = semComentarios(ler('nginx-tls.conf'));

  it('atende HTTPS na 8443 com o certificado montado em /etc/nginx/tls e só TLS 1.2 e 1.3', () => {
    expect(tls).toMatch(/listen 8443 ssl;/);
    expect(tls).toMatch(/ssl_certificate\s+\/etc\/nginx\/tls\/servidor\.crt;/);
    expect(tls).toMatch(/ssl_certificate_key\s+\/etc\/nginx\/tls\/servidor\.key;/);
    expect(tls).toMatch(/ssl_protocols TLSv1\.2 TLSv1\.3;/);
    expect(tls).not.toMatch(/TLSv1(\.1)?[ ;]/);
  });

  it('redireciona para https todo pedido http que não venha da própria máquina', () => {
    expect(tls).toMatch(/map \$host \$redirecionar_https \{[^}]*default\s+1;[^}]*localhost\s+0;[^}]*127\.0\.0\.1\s+0;/);
    expect(tls).toMatch(/if \(\$redirecionar_https\) \{\s*return 308 https:\/\/\$host\$request_uri;\s*\}/);
  });

  it('envia HSTS em toda resposta HTTPS e nunca no servidor http', () => {
    const [http, https] = tls.split('listen 8443 ssl;');
    expect(https).toMatch(/set \$hsts "max-age=31536000";/);
    expect(http).toMatch(/set \$hsts "";/);
  });

  it('os dois servidores usam as mesmas locations e os mesmos cabeçalhos', () => {
    expect(tls.match(/include \/etc\/nginx\/servidor-comum\.conf;/g)).toHaveLength(2);
  });
});

describe('RNF01: cabeçalhos e servidor comum', () => {
  it('o HSTS fica no arquivo único de cabeçalhos, sem valor fixo', () => {
    const cabecalhos = semComentarios(ler('nginx-cabecalhos.conf'));
    expect(cabecalhos).toMatch(/add_header Strict-Transport-Security \$hsts always;/);
  });

  it('o nginx.conf sem TLS só envia HSTS quando o Host não é a própria máquina (TLS do proxy)', () => {
    const http = semComentarios(ler('nginx.conf'));
    expect(http).not.toMatch(/ssl_certificate|listen 8443/);
    expect(http).toMatch(/map \$host \$hsts \{[^}]*default\s+"max-age=31536000";[^}]*localhost\s+"";[^}]*127\.0\.0\.1\s+"";/);
    expect(http).toMatch(/include \/etc\/nginx\/servidor-comum\.conf;/);
  });

  it('o servidor comum repassa à API o Host e o esquema reais, e não o que o cliente mandou', () => {
    const comum = semComentarios(ler('nginx-servidor.conf'));
    expect(comum).toMatch(/proxy_set_header Host \$host;/);
    expect(comum).toMatch(/proxy_set_header X-Forwarded-Proto \$scheme;/);
    expect(comum).toMatch(/proxy_set_header X-Forwarded-For \$remote_addr;/);
  });

  it('a imagem leva os arquivos de configuração e nenhum certificado', () => {
    const docker = ler('Dockerfile');
    expect(docker).toMatch(/COPY nginx-tls\.conf \/etc\/nginx\/nginx-tls\.conf/);
    expect(docker).toMatch(/COPY nginx-servidor\.conf \/etc\/nginx\/servidor-comum\.conf/);
    expect(docker).not.toMatch(/\.(key|crt|pem)\b/);
    expect(docker).toMatch(/EXPOSE 8080 8443/);
    const ignorados = ler('.dockerignore').split('\n');
    for (const padrao of ['tls', '*.key', '*.pem', '*.crt']) expect(ignorados).toContain(padrao);
  });
});
