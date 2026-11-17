/**
 * Moldura comum das telas: cabeçalho (br-header do Padrão Digital de Governo,
 * sem a logo e sem a marca gov.br) e rodapé com o aviso de licença do
 * Design System.
 */
import type { ReactNode } from 'react';
import { useSessao } from '../sessao/SessaoContext';

/** Assinatura do cabeçalho. Não usa a logo nem a marca gov.br. */
export const TITULO_APLICACAO = 'Buscador OSINT — Protótipo acadêmico, UnB/FCTE';

export function Cabecalho({ children }: { children?: ReactNode }) {
  const { config } = useSessao();
  return (
    <header className="br-header compact cabecalho" data-no-logo="true">
      <div className="container-fluid">
        <div className="header-top">
          <div className="header-logo">
            <span className="cabecalho-titulo">{TITULO_APLICACAO}</span>
            {config.modoMock && (
              <span className="br-tag small etiqueta-mock" title="Dados sintéticos em memória; nenhum back-end é chamado">
                modo simulado
              </span>
            )}
          </div>
          {children && <div className="header-actions cabecalho-usuario">{children}</div>}
        </div>
      </div>
    </header>
  );
}

export function Rodape() {
  return (
    <footer className="rodape">
      <p>
        Coleta passiva de dados abertos. Dados de demonstração são sintéticos. Toda consulta exige justificativa e é registrada
        na auditoria.
      </p>
      <p>
        Protótipo acadêmico (UnB/FCTE); não é um serviço oficial do governo. A interface usa o Padrão Digital de Governo
        (@govbr-ds/core), software sob licença MIT, Copyright (c) 2022 SERPRO —{' '}
        <a href="/licencas/govbr-ds-core-LICENSE.txt" target="_blank" rel="noreferrer noopener">
          texto da licença
        </a>
        .
      </p>
    </footer>
  );
}
