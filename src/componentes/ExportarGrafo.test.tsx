import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroApi, type ArquivoExportado, type FormatoExportacao } from '../api';
import { sha256Hex } from '../hash';
import { SessaoProvider } from '../sessao/SessaoContext';
import { clienteFalso } from '../test/clienteFalso';
import { ExportarGrafo } from './ExportarGrafo';

const CONTEUDO = 'id,tipo\r\nemp-1,empresa\r\n';

function arquivo(sha256: string | null): ArquivoExportado {
  return { nome: 'caso-caso-1-entidades.csv', tipo: 'text/csv', sha256, conteudo: new Blob([CONTEUDO], { type: 'text/csv' }) };
}

describe('ExportarGrafo — formatos abertos com SHA-256 (RNF09, H38)', () => {
  let criados: Blob[];
  let cliques: { nome: string; href: string }[];

  beforeEach(() => {
    criados = [];
    cliques = [];
    // jsdom não implementa URL.createObjectURL nem a navegação do clique no link de download.
    URL.createObjectURL = vi.fn((blob: Blob) => {
      criados.push(blob);
      return 'blob:teste';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      cliques.push({ nome: this.download, href: this.href });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderizar(exportarGrafo: (casoId: unknown, formato: FormatoExportacao) => Promise<ArquivoExportado>) {
    const usuario = userEvent.setup();
    const espia = vi.fn(exportarGrafo);
    render(
      <SessaoProvider cliente={clienteFalso({ exportarGrafo: espia })}>
        <ExportarGrafo casoId="caso-1" />
      </SessaoProvider>,
    );
    return { usuario, exportarGrafo: espia };
  }

  it('explica os formatos sem afirmar compatibilidade testada com Maltego e i2', () => {
    renderizar(async () => arquivo(null));
    const ajuda = screen.getByText(/Formatos abertos \(GraphML e CSV\)/);
    expect(ajuda).toHaveTextContent('assistente de dados tabulares');
    expect(ajuda).toHaveTextContent("Maltego e i2 Analyst's Notebook");
    expect(ajuda).toHaveTextContent('Cada item leva o ID e o SHA-256 da captura de origem');
    expect(ajuda).toHaveTextContent('não foi testada neste protótipo');
    expect(ajuda).not.toHaveTextContent(/compatível com|importa diretamente/i);
    expect(Array.from((screen.getByLabelText('Formato') as HTMLSelectElement).options).map((o) => o.value)).toEqual(['zip', 'graphml', 'csv_entidades', 'csv_vinculos']);
  });

  it('exporta no formato escolhido, entrega o arquivo ao navegador e mostra o SHA-256, conferido com o do servidor', async () => {
    const sha = (await sha256Hex(new TextEncoder().encode(CONTEUDO)))!;
    const { usuario, exportarGrafo } = renderizar(async () => arquivo(sha));
    await usuario.selectOptions(screen.getByLabelText('Formato'), 'csv_entidades');
    await usuario.click(screen.getByRole('button', { name: 'Exportar grafo' }));

    const resultado = await screen.findByTestId('exportacao-resultado');
    expect(exportarGrafo).toHaveBeenCalledWith('caso-1', 'csv_entidades');
    expect(resultado).toHaveTextContent('caso-caso-1-entidades.csv');
    expect(resultado).toHaveTextContent(`${CONTEUDO.length} bytes`);
    expect(resultado).toHaveTextContent(sha);
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(resultado).toHaveTextContent('Confere com o SHA-256 informado pelo servidor');
    // O arquivo foi entregue como Blob, com o nome do anexo.
    expect(cliques).toEqual([{ nome: 'caso-caso-1-entidades.csv', href: 'blob:teste' }]);
    expect(criados).toHaveLength(1);
    expect(criados[0].size).toBe(CONTEUDO.length);
  });

  it('avisa quando o SHA-256 recalculado não confere com o informado pelo servidor', async () => {
    const { usuario } = renderizar(async () => arquivo('0'.repeat(64)));
    await usuario.click(screen.getByRole('button', { name: 'Exportar grafo' }));
    const resultado = await screen.findByTestId('exportacao-resultado');
    expect(resultado).toHaveTextContent('NÃO CONFERE');
    expect(resultado).toHaveTextContent('0'.repeat(64));
  });

  it('sem o cabeçalho do servidor, mostra o SHA-256 calculado no navegador e diz de onde ele veio', async () => {
    const { usuario } = renderizar(async () => arquivo(null));
    await usuario.click(screen.getByRole('button', { name: 'Exportar grafo' }));
    const resultado = await screen.findByTestId('exportacao-resultado');
    expect(resultado).toHaveTextContent((await sha256Hex(new TextEncoder().encode(CONTEUDO)))!);
    expect(resultado).toHaveTextContent('foi calculado neste navegador');
  });

  it('com o cliente simulado: o padrão é o ZIP, e o SHA-256 mostrado é o do arquivo baixado', async () => {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <ExportarGrafo casoId="caso-1" />
      </SessaoProvider>,
    );
    await usuario.click(screen.getByRole('button', { name: 'Exportar grafo' }));
    const resultado = await screen.findByTestId('exportacao-resultado');
    expect(resultado).toHaveTextContent('caso-caso-1-grafo.zip');
    expect(resultado).toHaveTextContent('Confere com o SHA-256 informado pelo servidor');
    expect(cliques[0].nome).toBe('caso-caso-1-grafo.zip');
  });

  it('erro do servidor (por exemplo, retenção vencida) aparece e nada é baixado', async () => {
    const { usuario } = renderizar(async () => {
      throw new ErroApi(403, '/casos/caso-1/exportacao', 'O prazo de retenção deste caso terminou em 2026-06-30');
    });
    await usuario.click(screen.getByRole('button', { name: 'Exportar grafo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('prazo de retenção');
    expect(cliques).toEqual([]);
    expect(screen.queryByTestId('exportacao-resultado')).not.toBeInTheDocument();
  });
});
