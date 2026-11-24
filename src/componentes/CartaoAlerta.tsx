import { useId, useState, type FormEvent } from 'react';
import {
  grupoDaTipologia,
  mensagemDeErro,
  type Alerta,
  type ComponenteCombinacao,
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
  L1: 'Endereço de registro em massa',
  L2: 'Telefone ou e-mail compartilhado por empresas sem sócio em comum',
  L3: 'Mesmo administrador ou representante em muitas empresas',
  L4: 'Cadeia societária em camadas',
  L5: 'Sócio estrangeiro (nível 1)',
  L6: 'Porte ou regime incompatível com o valor contratado',
  L7: 'Fundadores substituídos logo após a abertura',
  L8: 'Empresa recém-aberta com sócio que possivelmente é agente público',
  L9: 'Eleito possivelmente sócio de empresa contratada pelo próprio ente',
  L10: 'Vínculo com empresa sancionada ou com pessoa expulsa da administração',
  L13: 'Despesa de campanha com fornecedor de perfil incompatível',
  L14: 'Sócio em faixa etária atípica em empresa contratada',
  L15: 'Número excessivo de atividades econômicas',
  L16: 'Entidade sem fins lucrativos convenente com sinais de fachada',
  COMB: 'Combinação de alertas na mesma entidade',
};

/** Texto fixo dos sinais fracos (contrato da API): vale no cartão, na lista e no catálogo. */
export const TEXTO_SINAL_FRACO = 'Sinal fraco: sozinho não indica nada; não gera alerta próprio e só pesa no alerta de combinação.';

/** Aviso do alerta de combinação quando o back-end não manda `parametros.aviso`. */
export const AVISO_COMBINACAO = 'Não é escore de culpa: é uma pista para priorizar a análise (RF12).';

/** Âncora do cartão de um alerta: é para onde os componentes de uma combinação levam. */
export function idCartaoAlerta(alertaId: Id): string {
  return `cartao-alerta-${String(alertaId)}`;
}

/** Peso na combinação, com vírgula decimal (0,5; 1; 2,5). */
export function formatarPeso(peso: unknown): string {
  return typeof peso === 'number' && Number.isFinite(peso) ? peso.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—';
}

/** Componentes do alerta de combinação (`parametros.componentes`), só os que têm o formato esperado. */
function lerComponentes(parametros: Record<string, unknown>): ComponenteCombinacao[] {
  const bruto = parametros?.componentes;
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((c): c is ComponenteCombinacao => !!c && typeof c === 'object' && typeof (c as ComponenteCombinacao).tipologia === 'string');
}

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
  /**
   * Leva ao cartão de um alerta componente da combinação. Sem esta função, o
   * cartão procura a âncora do componente na página e rola até ela.
   */
  aoIrParaAlerta?: (alertaId: Id) => void;
}

/** Rola até o cartão do alerta e põe o foco nele; devolve falso se o cartão não está na página. */
export function irParaCartaoAlerta(alertaId: Id): boolean {
  const cartao = document.getElementById(idCartaoAlerta(alertaId));
  if (!cartao) return false;
  cartao.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  cartao.focus({ preventScroll: true });
  return true;
}

/**
 * Alerta de tipologia com motivo, parâmetros e evidências (RNF05), severidade
 * e política de erro da tipologia (RF14) e a decisão do investigador (RF12).
 */
export function CartaoAlerta({ alerta, rotulosEntidades = {}, aoAbrirEntidade, aoDecidir, casoId, aoIrParaAlerta }: CartaoAlertaProps) {
  const sev = (alerta.severidade ?? '').toLowerCase();
  const situacao: SituacaoAlerta = alerta.situacao ?? 'pendente';
  const parametros = alerta.parametros ?? {};
  // T7 e T9 de pessoa física: seis dígitos do CPF e o nome não identificam ninguém.
  const possivelCoincidencia = parametros.identidade_confirmada === false;
  const ocorrencias = lerOcorrencias(parametros);
  const totalOcorrencias = typeof parametros.ocorrencias_total === 'number' ? parametros.ocorrencias_total : ocorrencias.length;
  const grupo = grupoDaTipologia(alerta.tipologia, alerta.grupo);
  const ehCombinacao = grupo === 'combinacao';
  const sinalFraco = alerta.sinal_fraco === true;
  // Nas tipologias de lavagem e na combinação, o aviso de que o alerta é pista vem no alto do cartão (RF12).
  const avisoDePista = grupo !== 'contratacao';
  // As ocorrências e os componentes têm seção própria; na tabela de parâmetros virariam um JSON ilegível.
  // O limite e o excesso da L6 também: são lidos em reais e com o dispositivo da lei.
  const ehL6 = alerta.tipologia === 'L6' && typeof parametros.limite_legal === 'number';
  const FORA_DA_TABELA = ['ocorrencias', ...(ehCombinacao ? ['componentes', 'aviso'] : []), ...(ehL6 ? PARAMETROS_SECAO_L6 : [])];
  const parametrosDaTabela = Object.fromEntries(Object.entries(parametros).filter(([chave]) => !FORA_DA_TABELA.includes(chave)));
  return (
    <article
      id={idCartaoAlerta(alerta.id)}
      tabIndex={-1}
      className={`br-card alerta alerta-${situacao}${ehCombinacao ? ' alerta-combinacao' : ''}${sinalFraco ? ' alerta-sinal-fraco' : ''}`}
      aria-labelledby={`alerta-${alerta.id}-titulo`}
    >
      <header className="alerta-cabecalho">
        <span className="br-tag small etiqueta-tipologia">{alerta.tipologia}</span>
        <h3 id={`alerta-${alerta.id}-titulo`}>{mascararCpfs(alerta.titulo)}</h3>
        {sinalFraco && (
          <span className="br-tag small etiqueta-sinal-fraco" data-testid="selo-sinal-fraco">
            sinal fraco
          </span>
        )}
        {possivelCoincidencia && (
          <span className="br-tag small etiqueta-coincidencia" data-testid="selo-coincidencia">
            {SELO_COINCIDENCIA}
          </span>
        )}
        <span className={`br-tag small situacao situacao-${situacao}`}>{ROTULOS_SITUACAO[situacao]}</span>
        <span className={`br-tag small severidade severidade-${sev}`}>severidade: {rotuloSeveridade(alerta.severidade)}</span>
      </header>
      <p className="alerta-tipologia mudo">
        <span>{nomeTipologia(alerta.tipologia, alerta.tipologia_nome)}</span>
        {!ehCombinacao && typeof alerta.peso === 'number' && <span data-testid="peso-alerta"> · peso na combinação: {formatarPeso(alerta.peso)}</span>}
      </p>
      {avisoDePista && (
        <div data-testid="aviso-pista">
          <Mensagem tipo="aviso">
            <strong>Pista, não conclusão.</strong>{' '}
            {ehCombinacao
              ? 'A combinação só diz que vários sinais recaem sobre a mesma entidade; não mede culpa nem prova lavagem de dinheiro.'
              : 'Este sinal de possível ocultação não prova lavagem de dinheiro: tem explicações legítimas e precisa ser conferido.'}{' '}
            Confirme ou descarte, com justificativa.
            {sinalFraco && <div>{TEXTO_SINAL_FRACO}</div>}
          </Mensagem>
        </div>
      )}
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
      {ehCombinacao && <SecaoCombinacao alerta={alerta} aoIrParaAlerta={aoIrParaAlerta} />}
      {ehL6 && <SecaoLimiteL6 alerta={alerta} />}
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
      <SecaoDecisao alerta={alerta} situacao={situacao} aoDecidir={aoDecidir} avisoNoAlto={avisoDePista} />
      {casoId !== undefined && (
        <div className="alerta-decisao">
          <Anotacoes casoId={casoId} alvoTipo="alerta" alvoId={alerta.id} sobDemanda />
        </div>
      )}
    </article>
  );
}

/** Parâmetros da L6 mostrados na seção própria (e por isso fora da tabela de parâmetros). */
const PARAMETROS_SECAO_L6 = [
  'soma_contratada',
  'limite_anual',
  'limite_legal',
  'fonte_limite',
  'meses_no_ano_de_inicio',
  'dispositivo_proporcional',
  'excesso',
  'faixa_excesso',
  'dispositivo_excesso',
  'anos_nao_avaliados',
];

const ROTULOS_FAIXA_EXCESSO: Record<string, string> = {
  ate_20: 'até 20% do limite',
  acima_de_20: 'acima de 20% do limite',
};

function reais(valor: unknown): string {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
}

/**
 * L6 explicada: o limite legal do ano (proporcional no ano de início de atividade), o excesso,
 * a faixa de 20% com o dispositivo da LC nº 123/2006 e os anos que ficaram sem avaliação.
 */
function SecaoLimiteL6({ alerta }: { alerta: Alerta }) {
  const p = alerta.parametros ?? {};
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '');
  const meses = typeof p.meses_no_ano_de_inicio === 'number' ? p.meses_no_ano_de_inicio : null;
  const faixa = texto(p.faixa_excesso);
  const anosFora = Array.isArray(p.anos_nao_avaliados) ? p.anos_nao_avaliados.map(String) : [];
  const proporcional = meses !== null && typeof p.limite_anual === 'number' && p.limite_anual !== p.limite_legal;
  return (
    <section className="alerta-limite-l6" aria-label={`Limite legal e excesso, alerta ${String(alerta.id)}`}>
      <h4>Limite legal e excesso</h4>
      <dl className="combinacao-totais">
        <dt>Soma contratada no ano</dt>
        <dd data-testid="l6-soma">{reais(p.soma_contratada)}</dd>
        <dt>Limite legal</dt>
        <dd data-testid="l6-limite">
          <strong>{reais(p.limite_legal)}</strong>
          {proporcional && <> (limite anual: {reais(p.limite_anual)})</>}
          {texto(p.fonte_limite) && <div className="mudo quebra">{texto(p.fonte_limite)}</div>}
        </dd>
        <dt>Meses no ano de início</dt>
        <dd data-testid="l6-meses">
          {meses === null ? (
            'não é o ano de início de atividade: vale o limite anual'
          ) : (
            <>
              {meses} {meses === 1 ? 'mês' : 'meses'}, contada a fração de mês como mês inteiro
              {texto(p.dispositivo_proporcional) && <> ({texto(p.dispositivo_proporcional)})</>}
            </>
          )}
        </dd>
        <dt>Excesso</dt>
        <dd data-testid="l6-excesso">
          <strong>{reais(p.excesso)}</strong>
        </dd>
        <dt>Faixa e dispositivo</dt>
        <dd data-testid="l6-faixa">
          {faixa ? (ROTULOS_FAIXA_EXCESSO[faixa] ?? faixa) : 'a lei não prevê faixa de 20% para este regime'}
          {texto(p.dispositivo_excesso) && <> ({texto(p.dispositivo_excesso)})</>}
        </dd>
        <dt>Anos não avaliados</dt>
        <dd data-testid="l6-anos-nao-avaliados">
          {anosFora.length === 0 ? 'nenhum' : `${anosFora.join(', ')} (limites não conferidos no texto legal)`}
        </dd>
      </dl>
      <p className="mudo">A faixa de 20% não dispensa o excesso: só muda a data em que a saída do regime produz efeitos.</p>
    </section>
  );
}

const ROTULOS_SITUACAO_COMPONENTE: Record<string, string> = { pendente: 'pendente', confirmado: 'confirmado', descartado: 'descartado' };

/**
 * Alerta de combinação explicado: cada alerta componente (com o peso e se conta ou não), a soma
 * dos pesos e o número de tipologias distintas contra os mínimos, e o aviso de que não é escore de culpa.
 */
function SecaoCombinacao({ alerta, aoIrParaAlerta }: { alerta: Alerta; aoIrParaAlerta?: (alertaId: Id) => void }) {
  const parametros = alerta.parametros ?? {};
  const componentes = lerComponentes(parametros);
  const contam = componentes.filter((c) => c.conta !== false);
  const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  // Na falta dos totais, a tela soma o que os componentes dizem (o número mostrado é sempre conferível na tabela).
  const soma = numero(parametros.soma_pesos) ?? contam.reduce((total, c) => total + (numero(c.peso) ?? 0), 0);
  const distintas = numero(parametros.tipologias_distintas) ?? new Set(contam.map((c) => c.tipologia)).size;
  const pesoMinimo = numero(parametros.comb_peso_minimo);
  const minimoTipologias = numero(parametros.comb_minimo_tipologias);
  const aviso = typeof parametros.aviso === 'string' && parametros.aviso.trim() ? parametros.aviso : AVISO_COMBINACAO;
  const entidade = typeof parametros.entidade_rotulo === 'string' ? parametros.entidade_rotulo : '';
  const ir = (alertaId: Id) => (aoIrParaAlerta ? aoIrParaAlerta(alertaId) : void irParaCartaoAlerta(alertaId));

  return (
    <section className="alerta-combinacao-detalhe" aria-label={`Combinação explicada, alerta ${String(alerta.id)}`}>
      <h4>Como esta combinação foi formada{entidade ? `: ${mascararCpfs(entidade)}` : ''}</h4>
      <dl className="combinacao-totais">
        <dt>Soma dos pesos</dt>
        <dd data-testid="combinacao-soma">
          <strong>{formatarPeso(soma)}</strong>
          {pesoMinimo !== undefined && <> (mínimo para disparar: {formatarPeso(pesoMinimo)})</>}
        </dd>
        <dt>Tipologias distintas</dt>
        <dd data-testid="combinacao-distintas">
          <strong>{distintas}</strong>
          {minimoTipologias !== undefined && <> (mínimo para disparar: {minimoTipologias})</>}
        </dd>
      </dl>
      {componentes.length === 0 ? (
        <p className="vazio">O servidor não informou os alertas componentes desta combinação.</p>
      ) : (
        <Tabela rotulo={`Alertas que compõem a combinação ${String(alerta.id)}`} className="tabela-componentes">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Tipologia</th>
              <th scope="col">Alerta</th>
              <th scope="col">Peso</th>
              <th scope="col">Conta na soma?</th>
            </tr>
          </thead>
          <tbody>
            {componentes.map((c, i) => {
              const conta = c.conta !== false;
              // H49: o sinal fraco não tem alerta próprio; a explicação dele vem no componente.
              const semAlerta = c.alerta_id === undefined || c.alerta_id === null;
              return (
                <tr key={`${String(c.alerta_id)}-${i}`} data-testid="componente-combinacao" className={conta ? undefined : 'componente-nao-conta'}>
                  <td>
                    <span className="br-tag small etiqueta-tipologia">{c.tipologia}</span>
                  </td>
                  <td>
                    {c.tipologia_nome || NOMES_TIPOLOGIA[c.tipologia] || '—'}
                    {c.sinal_fraco && (
                      <div>
                        <span className="br-tag small etiqueta-sinal-fraco">sinal fraco</span>
                      </div>
                    )}
                  </td>
                  <td className="quebra">
                    {c.alerta_id !== undefined && c.alerta_id !== null ? (
                      <button type="button" className="botao-link" onClick={() => ir(c.alerta_id as Id)} title="Ir para o cartão deste alerta">
                        {mascararCpfs(c.titulo)}
                      </button>
                    ) : (
                      mascararCpfs(c.titulo)
                    )}
                    {semAlerta ? (
                      <>
                        <div className="mudo">sem alerta próprio: só pesa nesta combinação</div>
                        {c.motivo && (
                          <p className="motivo-sinal-fraco" data-testid="motivo-sinal-fraco">
                            {mascararCpfs(c.motivo)}
                          </p>
                        )}
                      </>
                    ) : (
                      c.situacao && <div className="mudo">situação: {ROTULOS_SITUACAO_COMPONENTE[c.situacao] ?? c.situacao}</div>
                    )}
                  </td>
                  <td>{formatarPeso(c.peso)}</td>
                  <td>
                    <strong>{conta ? 'conta' : 'não conta'}</strong>
                    {c.observacao && <div className="mudo quebra">{mascararCpfs(c.observacao)}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      )}
      <p className="mudo">Alertas descartados pelo investigador não entram na combinação. Os pesos são decisão do autor do protótipo e estão na aba Tipologias.</p>
      <div data-testid="aviso-combinacao">
        <Mensagem tipo="info">{aviso}</Mensagem>
      </div>
    </section>
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
function SecaoDecisao({
  alerta,
  situacao,
  aoDecidir,
  avisoNoAlto = false,
}: {
  alerta: Alerta;
  situacao: SituacaoAlerta;
  aoDecidir?: CartaoAlertaProps['aoDecidir'];
  /** Verdadeiro: o cartão já diz, no alto, que o alerta é pista; aqui o texto não se repete. */
  avisoNoAlto?: boolean;
}) {
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
      <p className="mudo">
        {!avisoNoAlto && 'O alerta é uma pista, não uma conclusão. '}A decisão e a justificativa ficam no alerta e na trilha de auditoria.
      </p>
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
