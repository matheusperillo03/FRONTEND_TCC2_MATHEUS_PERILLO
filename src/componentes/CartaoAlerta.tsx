import { useId, useState, type FormEvent } from 'react';
import {
  mensagemDeErro,
  type Alerta,
  type DecisaoAlerta,
  type DecisaoAlertaValor,
  type Evidencia,
  type Id,
  type OcorrenciaClausula,
  type SituacaoAlerta,
  type VerificacaoCaptura,
} from '../api';
import { mascararCpfs } from '../privacidade';
import { useSessao } from '../sessao/SessaoContext';
import { Anotacoes } from './Anotacoes';
import { Hash, Mensagem, Tabela, TabelaChaveValor, formatarData } from './basicos';

const NOMES_TIPOLOGIA: Record<string, string> = {
  T1: 'Empresa aberta pouco antes do contrato',
  T2: 'Endereço compartilhado por empresas contratadas',
  T3: 'Capital social incompatível com o valor contratado',
  T4: 'Empresa contratada sem situação cadastral ativa no CNPJ',
  T5: 'Possível fracionamento de despesa',
  T6: 'Empresa contratada com sanção vigente (CEIS ou CNEP)',
  T7: 'Possível coincidência entre sócio da contratada e servidor do órgão contratante',
  T8: 'Aditivos acima do limite legal',
  T9: 'Doador de campanha contratado pelo ente do candidato eleito',
  T10: 'Cláusula potencialmente restritiva em edital',
};

/** Texto do selo das tipologias que cruzam pessoas por CPF descaracterizado e nome (T7 e T9). */
export const SELO_COINCIDENCIA = 'Possível coincidência (não é identificação)';

/** Ocorrências do T10 (`parametros.ocorrencias`), só as que têm o formato esperado. */
function lerOcorrencias(parametros: Record<string, unknown>): OcorrenciaClausula[] {
  const bruto = parametros?.ocorrencias;
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((o): o is OcorrenciaClausula => !!o && typeof o === 'object' && typeof (o as OcorrenciaClausula).trecho === 'string');
}

/** Nome da tipologia: o que o back-end mandar (tabela única) ou, na falta, o nome local. */
export function nomeTipologia(t: string, nomeDoServidor?: string): string {
  const nome = nomeDoServidor || NOMES_TIPOLOGIA[t];
  return nome ? `${t} — ${nome}` : t;
}

const ROTULOS_SEVERIDADE: Record<string, string> = { alta: 'alta', media: 'média', baixa: 'baixa' };

export function rotuloSeveridade(severidade: string): string {
  return ROTULOS_SEVERIDADE[(severidade ?? '').toLowerCase()] ?? severidade;
}

const ROTULOS_SITUACAO: Record<SituacaoAlerta, string> = {
  pendente: 'pendente de análise',
  confirmado: 'confirmado',
  descartado: 'descartado',
};

const ROTULOS_PREFERE: Record<string, string> = {
  falso_negativo: 'prefere evitar falso negativo',
  falso_positivo: 'prefere evitar falso positivo',
};

export interface CartaoAlertaProps {
  alerta: Alerta;
  rotulosEntidades?: Record<string, string>;
  aoAbrirEntidade?: (id: Id) => void;
  /**
   * Registra a decisão do investigador (RF12). Sem esta função o cartão é só
   * leitura. Deve devolver uma promessa que rejeita se o back-end recusar.
   */
  aoDecidir?: (alertaId: Id, decisao: DecisaoAlertaValor, justificativa: string) => Promise<unknown>;
  /** Caso do alerta. Com ele, o cartão mostra as anotações da equipe (H37), carregadas quando o usuário pede. */
  casoId?: Id;
}

/**
 * Alerta de tipologia com motivo, parâmetros e evidências (RNF05), severidade
 * e política de erro da tipologia (RF14) e a decisão do investigador (RF12).
 */
export function CartaoAlerta({ alerta, rotulosEntidades = {}, aoAbrirEntidade, aoDecidir, casoId }: CartaoAlertaProps) {
  const sev = (alerta.severidade ?? '').toLowerCase();
  const situacao: SituacaoAlerta = alerta.situacao ?? 'pendente';
  const parametros = alerta.parametros ?? {};
  // T7 e T9 de pessoa física: seis dígitos do CPF e o nome não identificam ninguém.
  const possivelCoincidencia = parametros.identidade_confirmada === false;
  const ocorrencias = lerOcorrencias(parametros);
  const totalOcorrencias = typeof parametros.ocorrencias_total === 'number' ? parametros.ocorrencias_total : ocorrencias.length;
  // As ocorrências têm seção própria; na tabela de parâmetros virariam um JSON ilegível.
  const parametrosDaTabela = ocorrencias.length ? Object.fromEntries(Object.entries(parametros).filter(([chave]) => chave !== 'ocorrencias')) : parametros;
  return (
    <article className={`br-card alerta alerta-${situacao}`} aria-labelledby={`alerta-${alerta.id}-titulo`}>
      <header className="alerta-cabecalho">
        <span className="br-tag small etiqueta-tipologia">{alerta.tipologia}</span>
        <h3 id={`alerta-${alerta.id}-titulo`}>{mascararCpfs(alerta.titulo)}</h3>
        {possivelCoincidencia && (
          <span className="br-tag small etiqueta-coincidencia" data-testid="selo-coincidencia">
            {SELO_COINCIDENCIA}
          </span>
        )}
        <span className={`br-tag small situacao situacao-${situacao}`}>{ROTULOS_SITUACAO[situacao]}</span>
        <span className={`br-tag small severidade severidade-${sev}`}>severidade: {rotuloSeveridade(alerta.severidade)}</span>
      </header>
      <p className="alerta-tipologia mudo">{nomeTipologia(alerta.tipologia, alerta.tipologia_nome)}</p>
      {alerta.ativo === false && (
        <Mensagem tipo="aviso">
          A última execução desta tipologia não detectou mais este alerta. Ele continua aqui porque tem decisão registrada.
        </Mensagem>
      )}
      {alerta.politica_erro && (
        <section className="alerta-politica">
          <h4>
            Política de erro da tipologia
            {alerta.prefere_evitar && ROTULOS_PREFERE[alerta.prefere_evitar] && (
              <span className="br-tag small etiqueta-politica">{ROTULOS_PREFERE[alerta.prefere_evitar]}</span>
            )}
          </h4>
          <p>{alerta.politica_erro}</p>
        </section>
      )}
      <section className="alerta-motivo">
        <h4>Motivo</h4>
        <p>{mascararCpfs(alerta.motivo)}</p>
        {possivelCoincidencia && (
          <Mensagem tipo="aviso">
            {SELO_COINCIDENCIA}: o cruzamento usa só os seis dígitos visíveis do CPF e o nome. Isso não identifica uma
            pessoa; homônimos com os mesmos seis dígitos são possíveis. Confirme a identidade por outros meios antes de
            qualquer conclusão.
          </Mensagem>
        )}
      </section>
      {ocorrencias.length > 0 && (
        <section className="alerta-ocorrencias" aria-label={`Ocorrências no texto do edital, alerta ${String(alerta.id)}`}>
          <h4>
            Ocorrências no texto do edital ({ocorrencias.length}
            {totalOcorrencias > ocorrencias.length ? ` de ${totalOcorrencias}` : ''})
          </h4>
          <p className="mudo">Trecho literal do arquivo guardado na custódia, com a posição para conferência.</p>
          <ol className="lista-simples lista-ocorrencias">
            {ocorrencias.map((o, i) => (
              <li key={`${o.posicao}-${i}`} data-testid="ocorrencia">
                <div>
                  linha {o.linha}, coluna {o.coluna}, posição {o.posicao}
                </div>
                <pre className="trecho-literal" aria-label={`Trecho literal da ocorrência ${i + 1}`}>
                  {o.trecho}
                </pre>
                {o.contexto && (
                  <details>
                    <summary>Contexto</summary>
                    <pre className="trecho-literal">{o.contexto}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="alerta-grade">
        <section>
          <h4>Parâmetros da regra</h4>
          <TabelaChaveValor dados={parametrosDaTabela} />
        </section>
        <section>
          <h4>Entidades envolvidas</h4>
          <ul className="lista-simples">
            {alerta.entidades.map((id) => (
              <li key={String(id)}>
                {aoAbrirEntidade ? (
                  <button type="button" className="botao-link" onClick={() => aoAbrirEntidade(id)}>
                    {rotulosEntidades[String(id)] ?? String(id)}
                  </button>
                ) : (
                  rotulosEntidades[String(id)] ?? String(id)
                )}
                <span className="mudo"> ({String(id)})</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section>
        <h4>Evidências ({alerta.evidencias.length})</h4>
        <Tabela className="tabela-evidencias" rotulo={`Evidências do alerta ${String(alerta.id)}`}>
          <thead>
            <tr>
              <th scope="col">Descrição</th>
              <th scope="col">Fonte</th>
              <th scope="col">URL ou arquivo</th>
              <th scope="col">SHA-256</th>
              <th scope="col">Integridade</th>
            </tr>
          </thead>
          <tbody>
            {alerta.evidencias.map((ev, i) => (
              <LinhaEvidencia key={`${String(ev.captura_id)}-${i}`} evidencia={ev} />
            ))}
          </tbody>
        </Tabela>
      </section>
      <SecaoDecisao alerta={alerta} situacao={situacao} aoDecidir={aoDecidir} />
      {casoId !== undefined && (
        <div className="alerta-decisao">
          <Anotacoes casoId={casoId} alvoTipo="alerta" alvoId={alerta.id} sobDemanda />
        </div>
      )}
    </article>
  );
}

function LinhaDecisao({ decisao, emVigor }: { decisao: DecisaoAlerta; emVigor: boolean }) {
  return (
    <li data-testid="decisao">
      <strong>{decisao.decisao}</strong> por {decisao.usuario}
      {decisao.perfil ? ` (${decisao.perfil})` : ''} em {formatarData(decisao.decidido_em)}
      {emVigor && <span className="br-tag small etiqueta-em-vigor">em vigor</span>}
      <div className="quebra">Justificativa: {decisao.justificativa}</div>
    </li>
  );
}

/** Decisão do investigador (RF12): o alerta é pista; confirmar ou descartar exige justificativa. */
function SecaoDecisao({ alerta, situacao, aoDecidir }: { alerta: Alerta; situacao: SituacaoAlerta; aoDecidir?: CartaoAlertaProps['aoDecidir'] }) {
  const idCampo = useId();
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState<DecisaoAlertaValor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const decisoes = alerta.decisoes ?? [];
  const decidido = situacao !== 'pendente';
  // Mesma regra do back-end: a justificativa precisa ter letras ou números.
  const valida = /[\p{L}\p{N}]/u.test(justificativa);

  async function decidir(decisao: DecisaoAlertaValor) {
    if (!aoDecidir || !valida) return;
    setEnviando(decisao);
    setErro(null);
    try {
      await aoDecidir(alerta.id, decisao, justificativa.trim());
      setJustificativa('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section className="alerta-decisao" aria-label={`Decisão sobre o alerta ${String(alerta.id)}`}>
      <h4>Decisão do investigador</h4>
      <p className="mudo">O alerta é uma pista, não uma conclusão. A decisão e a justificativa ficam no alerta e na trilha de auditoria.</p>
      {decisoes.length > 0 ? (
        <ol className="lista-decisoes" aria-label="Histórico de decisões">
          {decisoes.map((d, i) => (
            <LinhaDecisao key={`${d.decidido_em}-${i}`} decisao={d} emVigor={i === decisoes.length - 1} />
          ))}
        </ol>
      ) : (
        <p className="vazio">Nenhuma decisão registrada.</p>
      )}
      {aoDecidir && (
        <form className="formulario formulario-decisao" onSubmit={(e: FormEvent) => e.preventDefault()}>
          <div className="br-textarea small campo">
            <label htmlFor={idCampo}>{decidido ? 'Justificativa da revisão (obrigatória)' : 'Justificativa da decisão (obrigatória)'}</label>
            <textarea id={idCampo} value={justificativa} onChange={(e) => setJustificativa(e.target.value.replace(/[\r\n]+/g, ' '))} rows={2} maxLength={500} required />
          </div>
          <div className="linha">
            <button type="button" className="br-button primary small" onClick={() => void decidir('confirmado')} disabled={!valida || enviando !== null}>
              {enviando === 'confirmado' ? 'Registrando…' : decidido ? 'Rever: confirmar' : 'Confirmar alerta'}
            </button>
            <button type="button" className="br-button secondary small" onClick={() => void decidir('descartado')} disabled={!valida || enviando !== null}>
              {enviando === 'descartado' ? 'Registrando…' : decidido ? 'Rever: descartar' : 'Descartar alerta'}
            </button>
          </div>
          {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
        </form>
      )}
    </section>
  );
}

function LinhaEvidencia({ evidencia }: { evidencia: Evidencia }) {
  const { cliente } = useSessao();
  const [estado, setEstado] = useState<{ carregando: boolean; resultado: VerificacaoCaptura | null; erro: string | null }>({
    carregando: false,
    resultado: null,
    erro: null,
  });

  async function verificar() {
    setEstado({ carregando: true, resultado: null, erro: null });
    try {
      const resultado = await cliente.verificarCaptura(evidencia.captura_id);
      setEstado({ carregando: false, resultado, erro: null });
    } catch (e) {
      setEstado({ carregando: false, resultado: null, erro: mensagemDeErro(e) });
    }
  }

  const ehUrl = /^https?:\/\//i.test(evidencia.url_ou_arquivo ?? '');
  return (
    <tr>
      <td>{mascararCpfs(evidencia.descricao)}</td>
      <td>
        <code>{evidencia.fonte}</code>
        <div className="mudo">captura {String(evidencia.captura_id)}</div>
      </td>
      <td className="quebra">
        {ehUrl ? (
          <a href={evidencia.url_ou_arquivo} target="_blank" rel="noreferrer noopener">
            {evidencia.url_ou_arquivo}
          </a>
        ) : (
          <code>{evidencia.url_ou_arquivo}</code>
        )}
        {(evidencia.url_ou_arquivo ?? '').startsWith('simulado://') && (
          <div>
            <span className="br-tag">dado sintético (demonstração)</span>
          </div>
        )}
      </td>
      <td>
        <Hash valor={evidencia.sha256} />
      </td>
      <td>
        <button type="button" className="br-button secondary small" onClick={verificar} disabled={estado.carregando}>
          {estado.carregando ? 'Verificando…' : 'Verificar integridade'}
        </button>
        {estado.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
        {estado.resultado && (
          <div className={`integridade ${estado.resultado.integra ? 'integridade-ok' : 'integridade-falha'}`} role="status">
            <strong>{estado.resultado.integra ? 'Íntegra' : 'VIOLADA'}</strong>
            <div className="mudo">
              registrado: <Hash valor={estado.resultado.sha256_registrado} />
            </div>
            <div className="mudo">
              recalculado: <Hash valor={estado.resultado.sha256_recalculado} />
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
