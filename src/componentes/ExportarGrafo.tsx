import { useId, useState } from 'react';
import type { ArquivoExportado, FormatoExportacao, Id } from '../api';
import { bytesDoBlob, sha256Hex } from '../hash';
import { useSessao } from '../sessao/SessaoContext';
import { useChamada } from '../sessao/useChamada';
import { Campo, Carregando, Hash, Mensagem } from './basicos';

const FORMATOS: { id: FormatoExportacao; rotulo: string }[] = [
  { id: 'zip', rotulo: 'ZIP com GraphML, os dois CSV, LEIAME e manifesto' },
  { id: 'graphml', rotulo: 'GraphML (nós, vínculos e atributos)' },
  { id: 'csv_entidades', rotulo: 'CSV de entidades (uma linha por entidade)' },
  { id: 'csv_vinculos', rotulo: 'CSV de vínculos (uma linha por vínculo, com as duas pontas)' },
];

interface Exportado {
  arquivo: ArquivoExportado;
  /** SHA-256 calculado no navegador sobre os bytes recebidos (`null` se a Web Crypto não existir). */
  sha256Local: string | null;
}

/**
 * Exportação do grafo do caso em formatos abertos (RNF09, H38). O arquivo é
 * baixado por `fetch` autenticado (a rota exige Authorization e
 * X-Justificativa, que um link comum não envia) e entregue ao navegador como
 * Blob. A tela mostra o SHA-256 do arquivo baixado: o que o servidor informou
 * e o recalculado aqui, para a cadeia de custódia.
 */
export function ExportarGrafo({ casoId }: { casoId: Id }) {
  const { cliente } = useSessao();
  const exportacao = useChamada<Exportado>();
  const [formato, setFormato] = useState<FormatoExportacao>('zip');
  const idAjuda = useId();

  async function exportar() {
    const r = await exportacao.executar(async () => {
      const arquivo = await cliente.exportarGrafo(casoId, formato);
      const sha256Local = await sha256Hex(await bytesDoBlob(arquivo.conteudo)).catch(() => null);
      return { arquivo, sha256Local };
    });
    if (r) salvarBlob(r.arquivo.nome, r.arquivo.conteudo);
  }

  const dados = exportacao.dados;
  const informado = dados?.arquivo.sha256 ?? null;
  const local = dados?.sha256Local ?? null;
  const confere = informado && local ? informado.toLowerCase() === local.toLowerCase() : null;

  return (
    <section className="exportacao" aria-label="Exportação do grafo">
      <h3>Exportar grafo</h3>
      <p className="mudo" id={idAjuda}>
        Formatos abertos (GraphML e CSV), para importação por assistente de dados tabulares em ferramentas de análise de
        vínculos, como Maltego e i2 Analyst&apos;s Notebook. Cada item leva o ID e o SHA-256 da captura de origem. A
        importação nesses produtos não foi testada neste protótipo: confira o resultado na ferramenta de destino.
      </p>
      <div className="linha">
        <Campo rotulo="Formato" emLinha>
          <select value={formato} onChange={(e) => setFormato(e.target.value as FormatoExportacao)} aria-describedby={idAjuda}>
            {FORMATOS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <button type="button" className="br-button primary small" onClick={() => void exportar()} disabled={exportacao.carregando}>
          {exportacao.carregando ? 'Exportando…' : 'Exportar grafo'}
        </button>
      </div>
      {exportacao.carregando && <Carregando texto="Gerando o arquivo…" />}
      {exportacao.erro && <Mensagem tipo="erro">{exportacao.erro}</Mensagem>}
      {dados && (
        <div className="captura-detalhe" role="status" data-testid="exportacao-resultado">
          <div>
            Arquivo baixado: <code>{dados.arquivo.nome}</code> · {dados.arquivo.conteudo.size.toLocaleString('pt-BR')} bytes
            {dados.arquivo.tipo && <> · {dados.arquivo.tipo}</>}
          </div>
          <div>
            SHA-256 do arquivo baixado: {local || informado ? <Hash valor={(local ?? informado)!} completo /> : 'não disponível'}
          </div>
          {confere === true && <div className="integridade integridade-ok">Confere com o SHA-256 informado pelo servidor (cabeçalho X-Conteudo-SHA256).</div>}
          {confere === false && (
            <div className="integridade integridade-falha">
              <strong>NÃO CONFERE</strong> com o SHA-256 informado pelo servidor: <Hash valor={informado!} completo />. Não use este arquivo; exporte de novo.
            </div>
          )}
          {confere === null && local && <div className="mudo">O servidor não informou o SHA-256 no cabeçalho; o valor acima foi calculado neste navegador.</div>}
          {confere === null && !local && informado && <div className="mudo">Valor informado pelo servidor; este navegador não pôde recalcular (Web Crypto indisponível).</div>}
          <div className="mudo">A exportação e o SHA-256 do arquivo ficam registrados na trilha de auditoria do caso.</div>
        </div>
      )}
    </section>
  );
}

/** Entrega o Blob ao navegador como download. */
export function salvarBlob(nome: string, blob: Blob): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
