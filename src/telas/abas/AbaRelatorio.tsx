import { useId, useState } from 'react';
import type { FormatoRelatorio, Id } from '../../api';
import { Carregando, Mensagem } from '../../componentes/basicos';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

/** O que a aba mostra do relatório em JSON, sem depender do formato exato. */
export interface ResumoRelatorio {
  entidades: number | null;
  alertas: number | null;
  capturas: number | null;
  /** RNF12 (H15): coletas do caso e quantas falharam (null se o relatório não trouxer). */
  coletas: number | null;
  coletasComFalha: number | null;
  /** RF12 (H12): alertas ainda sem decisão do investigador (null se o relatório não trouxer). */
  alertasPendentes: number | null;
  /** Resultado da verificação da cadeia de auditoria, quando o relatório o traz. */
  cadeiaIntegra: boolean | null;
  /**
   * Entradas da trilha de auditoria dentro do relatório. O back-end só as
   * inclui para os perfis que podem ler a auditoria (delegado e admin); para
   * analistas a lista vem vazia (ou o campo nem vem), e isso conta como 0.
   */
  entradasAuditoria: number;
}

function contar(resumo: unknown, lista: unknown): number | null {
  if (typeof resumo === 'number') return resumo;
  return Array.isArray(lista) ? lista.length : null;
}

/** Lê o relatório em JSON com tolerância: campo ausente, nulo ou lista vazia não é erro. */
export function resumirRelatorioJson(conteudo: string): ResumoRelatorio | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(conteudo);
  } catch {
    return null;
  }
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null;
  const r = bruto as Record<string, unknown>;
  const resumo = (typeof r.resumo === 'object' && r.resumo !== null ? r.resumo : {}) as Record<string, unknown>;
  const auditoria = (typeof r.auditoria === 'object' && r.auditoria !== null ? r.auditoria : {}) as Record<string, unknown>;
  const entradas = auditoria.entradas_do_caso;
  return {
    entidades: contar(resumo.entidades, r.entidades),
    alertas: contar(resumo.alertas, r.alertas),
    capturas: contar(resumo.capturas, r.custodia),
    coletas: contar(resumo.coletas, r.coletas),
    coletasComFalha: typeof resumo.coletas_com_falha === 'number' ? resumo.coletas_com_falha : null,
    alertasPendentes: typeof resumo.alertas_pendentes === 'number' ? resumo.alertas_pendentes : null,
    cadeiaIntegra: typeof auditoria.integra === 'boolean' ? auditoria.integra : null,
    entradasAuditoria: Array.isArray(entradas) ? entradas.length : 0,
  };
}

const n = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR'));

export function AbaRelatorio({ casoId, numeroProcedimento }: { casoId: Id; numeroProcedimento?: string }) {
  const { cliente } = useSessao();
  const relatorio = useChamada<{ formato: FormatoRelatorio; conteudo: string }>();
  const [previa, setPrevia] = useState(false);
  const idPrevia = useId();

  async function baixar(formato: FormatoRelatorio) {
    const r = await relatorio.executar(async () => ({ formato, conteudo: await cliente.obterRelatorio(casoId, formato) }));
    if (!r) return;
    const nome = `relatorio-${(numeroProcedimento || String(casoId)).replace(/[^\w.-]+/g, '_')}.${formato === 'json' ? 'json' : 'md'}`;
    salvarArquivo(nome, r.conteudo, formato === 'json' ? 'application/json' : 'text/markdown');
  }

  const dados = relatorio.dados;
  const resumo = dados?.formato === 'json' ? resumirRelatorioJson(dados.conteudo) : null;

  return (
    <div className="relatorio">
      <p className="mudo">
        Exportação do caso (finalidade e prazo de retenção, entidades, alertas com a situação de cada um, coletas com
        falhas e tentativas, evidências e cadeia de custódia) com fontes rastreáveis (RF09). As entradas da trilha de
        auditoria só entram no relatório para os perfis que podem ler a auditoria (delegado e admin).
      </p>
      <div className="linha">
        <button type="button" className="br-button primary small" onClick={() => void baixar('json')} disabled={relatorio.carregando}>
          Baixar JSON
        </button>
        <button type="button" className="br-button primary small" onClick={() => void baixar('md')} disabled={relatorio.carregando}>
          Baixar Markdown
        </button>
        <div className="br-checkbox">
          <input id={idPrevia} type="checkbox" checked={previa} onChange={(e) => setPrevia(e.target.checked)} />
          <label htmlFor={idPrevia}>mostrar prévia</label>
        </div>
      </div>
      {relatorio.carregando && <Carregando texto="Gerando…" />}
      {relatorio.erro && <Mensagem tipo="erro">{relatorio.erro}</Mensagem>}
      {dados && (
        <Mensagem tipo="ok">
          Relatório em {dados.formato === 'json' ? 'JSON' : 'Markdown'} gerado ({dados.conteudo.length.toLocaleString('pt-BR')} caracteres).
        </Mensagem>
      )}
      {resumo && (
        <>
          <dl className="resumo-relatorio" aria-label="Resumo do relatório">
            <div>
              <dt>Entidades</dt>
              <dd>{n(resumo.entidades)}</dd>
            </div>
            <div>
              <dt>Alertas</dt>
              <dd>{n(resumo.alertas)}</dd>
            </div>
            <div>
              <dt>Alertas pendentes de decisão</dt>
              <dd data-testid="alertas-pendentes">{n(resumo.alertasPendentes)}</dd>
            </div>
            <div>
              <dt>Capturas</dt>
              <dd>{n(resumo.capturas)}</dd>
            </div>
            <div>
              <dt>Coletas (com falha)</dt>
              <dd data-testid="coletas-com-falha">
                {n(resumo.coletas)} ({n(resumo.coletasComFalha)})
              </dd>
            </div>
            <div>
              <dt>Cadeia de auditoria</dt>
              <dd>{resumo.cadeiaIntegra === null ? '—' : resumo.cadeiaIntegra ? 'íntegra' : 'VIOLADA'}</dd>
            </div>
            <div>
              <dt>Entradas de auditoria no relatório</dt>
              <dd data-testid="entradas-auditoria">{n(resumo.entradasAuditoria)}</dd>
            </div>
          </dl>
          {!!resumo.coletasComFalha && (
            <Mensagem tipo="aviso">
              {resumo.coletasComFalha === 1 ? '1 coleta deste caso falhou' : `${resumo.coletasComFalha} coletas deste caso falharam`}: os dados podem estar incompletos. O relatório traz a
              fonte, as tentativas e o motivo de cada falha.
            </Mensagem>
          )}
          {resumo.entradasAuditoria === 0 && (
            <Mensagem tipo="info">
              Este relatório veio sem as entradas da trilha de auditoria do caso. O servidor só inclui essas entradas para os
              perfis que podem ler a auditoria (delegado e admin). As demais seções do relatório não mudam.
            </Mensagem>
          )}
        </>
      )}
      {previa && dados && (
        <pre className="previa" tabIndex={0} aria-label="Prévia do relatório">
          {dados.conteudo}
        </pre>
      )}
    </div>
  );
}

function salvarArquivo(nome: string, conteudo: string, tipo: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
