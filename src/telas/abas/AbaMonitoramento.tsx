import { useEffect, useState, type FormEvent } from 'react';
import type { Aviso, EntidadeResumo, ExecucaoMonitoramentoResultado, Id, Monitoramento } from '../../api';
import { SeletorEntidade } from '../../componentes/SeletorEntidade';
import { Caixa, Campo, Carregando, EtiquetaTipo, Mensagem, Tabela, TabelaChaveValor, formatarData } from '../../componentes/basicos';
import { mascararCpfs } from '../../privacidade';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

const PERIODICIDADES: { horas: number; rotulo: string }[] = [
  { horas: 24, rotulo: 'diária (24 h)' },
  { horas: 168, rotulo: 'semanal (168 h)' },
  { horas: 720, rotulo: 'mensal (720 h)' },
];

export function rotuloPeriodicidade(horas: number): string {
  return PERIODICIDADES.find((p) => p.horas === horas)?.rotulo ?? `a cada ${horas} h`;
}

const ROTULOS_EXECUCAO: Record<string, string> = {
  em_andamento: 'em andamento',
  sucesso: 'sucesso',
  parcial: 'parcial (alguma recoleta falhou)',
  falha: 'FALHA',
  sem_coletas: 'sem coletas de origem',
  recusada_retencao: 'recusada: prazo de retenção vencido',
};

const ROTULOS_AVISO: Record<string, string> = {
  quadro_societario: 'Quadro societário',
  contrato_novo: 'Contrato novo',
  sancao_nova: 'Sanção nova',
  termo_novo: 'Termo de contrato novo',
};

export interface AbaMonitoramentoProps {
  casoId: Id;
  /** Entidade já escolhida para o formulário (vinda do botão "Monitorar" da aba Entidades). */
  entidadeInicial?: EntidadeResumo | null;
  /** Chamado quando muda algo que o cabeçalho do caso mostra (monitoramentos ativos, avisos não lidos). */
  aoMudar?: () => void;
}

/**
 * Monitoramento contínuo (RF06, H18): entidades acompanhadas, execução manual
 * e avisos de novidade. As execuções automáticas são do agendador do back-end.
 */
export function AbaMonitoramento({ casoId, entidadeInicial = null, aoMudar }: AbaMonitoramentoProps) {
  const { cliente } = useSessao();
  const lista = useChamada<Monitoramento[]>();
  const avisos = useChamada<Aviso[]>();
  const criacao = useChamada<Monitoramento>();
  const acao = useChamada<Monitoramento>();
  const execucao = useChamada<ExecucaoMonitoramentoResultado>();
  const leitura = useChamada<Aviso>();
  const [entidade, setEntidade] = useState<EntidadeResumo | null>(entidadeInicial);
  const [periodicidade, setPeriodicidade] = useState<'24' | '168' | '720' | 'outro'>('24');
  const [horasLivres, setHorasLivres] = useState('48');
  const [soNaoLidos, setSoNaoLidos] = useState(false);

  const carregarLista = () => lista.executar(() => cliente.listarMonitoramentos(casoId));
  const carregarAvisos = (naoLidos = soNaoLidos) => avisos.executar(() => cliente.listarAvisos(casoId, naoLidos));

  useEffect(() => {
    void carregarLista();
    void carregarAvisos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId]);

  const horas = periodicidade === 'outro' ? Number(horasLivres) : Number(periodicidade);
  const horasValidas = Number.isInteger(horas) && horas >= 1 && horas <= 8760;
  const ocupado = criacao.carregando || acao.carregando || execucao.carregando;

  async function marcar(e: FormEvent) {
    e.preventDefault();
    if (!entidade || !horasValidas) return;
    const r = await criacao.executar(() => cliente.criarMonitoramento(casoId, { entidade_id: entidade.id, periodicidade_horas: horas }));
    if (r) {
      setEntidade(null);
      await carregarLista();
      aoMudar?.();
    }
  }

  async function executarAgora(m: Monitoramento) {
    acao.limpar();
    const r = await execucao.executar(() => cliente.executarMonitoramento(casoId, m.id));
    // Mesmo quando a execução é recusada, a lista diz o que ficou registrado.
    await Promise.all([carregarLista(), carregarAvisos()]);
    if (r) aoMudar?.();
  }

  async function alternar(m: Monitoramento) {
    execucao.limpar();
    const r = await acao.executar(() => cliente.alterarMonitoramento(casoId, m.id, { ativo: !m.ativo }));
    if (r) {
      await carregarLista();
      aoMudar?.();
    }
  }

  async function marcarLido(aviso: Aviso) {
    const r = await leitura.executar(() => cliente.marcarAvisoLido(casoId, aviso.id));
    if (r) {
      await carregarAvisos();
      aoMudar?.();
    }
  }

  function alternarFiltro(marcado: boolean) {
    setSoNaoLidos(marcado);
    void carregarAvisos(marcado);
  }

  const monitoramentos = lista.dados ?? [];
  const listaAvisos = avisos.dados ?? [];

  return (
    <div className="monitoramento">
      <p className="mudo">
        Marque uma entidade do caso para acompanhamento. Na periodicidade escolhida, o agendador do servidor refaz as
        coletas que deram origem à entidade (como recoletas comuns, com novas capturas na custódia) e cria um aviso para
        cada novidade: sócio, contrato, sanção ou termo de contrato novo. A justificativa informada no topo da página
        fica gravada no monitoramento e acompanha cada execução automática na auditoria.
      </p>

      <section aria-labelledby="monitorar-titulo">
        <h3 id="monitorar-titulo">Marcar entidade para monitoramento</h3>
        <SeletorEntidade casoId={casoId} rotulo="Entidade a monitorar" valor={entidade} aoSelecionar={setEntidade} />
        <form onSubmit={marcar} className="formulario" aria-label="Marcar entidade para monitoramento">
          <div className="linha">
            <Campo rotulo="Periodicidade" emLinha>
              <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as typeof periodicidade)}>
                {PERIODICIDADES.map((p) => (
                  <option key={p.horas} value={String(p.horas)}>
                    {p.rotulo}
                  </option>
                ))}
                <option value="outro">outro valor, em horas</option>
              </select>
            </Campo>
            {periodicidade === 'outro' && (
              <Campo rotulo="Horas entre execuções" emLinha dica="Inteiro de 1 a 8760.">
                <input type="number" min={1} max={8760} step={1} value={horasLivres} onChange={(e) => setHorasLivres(e.target.value)} required />
              </Campo>
            )}
            <button type="submit" className="br-button primary small" disabled={!entidade || !horasValidas || ocupado}>
              {criacao.carregando ? 'Marcando…' : 'Monitorar entidade'}
            </button>
          </div>
          <p className="campo-dica">Marcar de novo uma entidade já monitorada reativa o monitoramento e atualiza a periodicidade.</p>
        </form>
        {criacao.erro && <Mensagem tipo="erro">{criacao.erro}</Mensagem>}
        {criacao.dados && (
          <Mensagem tipo="ok">
            {criacao.dados.entidade_rotulo ?? String(criacao.dados.entidade_id)} está sendo monitorada: {rotuloPeriodicidade(criacao.dados.periodicidade_horas)},
            próxima execução em {formatarData(criacao.dados.proxima_execucao_em)}.
          </Mensagem>
        )}
      </section>

      <section aria-labelledby="monitoradas-titulo">
        <div className="painel-cabecalho">
          <h3 id="monitoradas-titulo">Entidades monitoradas</h3>
          <button type="button" className="br-button secondary small" onClick={() => void carregarLista()} disabled={lista.carregando}>
            Atualizar
          </button>
        </div>
        {lista.carregando && !lista.dados && <Carregando />}
        {lista.erro && <Mensagem tipo="erro">{lista.erro}</Mensagem>}
        {acao.erro && <Mensagem tipo="erro">{acao.erro}</Mensagem>}
        {execucao.erro && <Mensagem tipo="erro">A execução não foi feita: {execucao.erro}</Mensagem>}
        {execucao.dados && <ResultadoExecucao execucao={execucao.dados} />}
        {lista.dados && monitoramentos.length === 0 && <p className="vazio">Nenhuma entidade monitorada neste caso.</p>}
        {monitoramentos.length > 0 && (
          <Tabela rotulo="Entidades monitoradas" className="tabela-monitoramentos">
            <thead>
              <tr>
                <th scope="col">Entidade</th>
                <th scope="col">Periodicidade</th>
                <th scope="col">Situação</th>
                <th scope="col">Próxima execução</th>
                <th scope="col">Última execução</th>
                <th scope="col">Coletas de origem</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {monitoramentos.map((m) => (
                <tr key={String(m.id)} data-testid="monitoramento">
                  <td>
                    {m.entidade_tipo && <EtiquetaTipo tipo={m.entidade_tipo} />} {m.entidade_rotulo ?? String(m.entidade_id)}
                    {m.entidade_identificador && (
                      <div>
                        <code>{mascararCpfs(m.entidade_identificador)}</code>
                      </div>
                    )}
                    <div className="mudo quebra">
                      Marcada por {m.criado_por} em {formatarData(m.criado_em)}
                      {m.justificativa ? ` — ${m.justificativa}` : ''}
                    </div>
                  </td>
                  <td>{rotuloPeriodicidade(m.periodicidade_horas)}</td>
                  <td>
                    {m.ativo ? <span className="br-tag small etiqueta-ativo">ativo</span> : <span className="br-tag small etiqueta-inativo">inativo</span>}
                    {!m.ativo && m.motivo_inativo && <div className="mudo quebra">{m.motivo_inativo}</div>}
                  </td>
                  <td>{m.ativo ? formatarData(m.proxima_execucao_em) : '—'}</td>
                  <td>
                    {m.ultima_execucao ? (
                      <>
                        {formatarData(m.ultima_execucao.concluido_em ?? m.ultima_execucao.iniciado_em)}
                        <div>
                          <strong>{ROTULOS_EXECUCAO[m.ultima_execucao.situacao] ?? m.ultima_execucao.situacao}</strong>
                        </div>
                        <div className="mudo quebra">
                          {m.ultima_execucao.origem === 'agendador' ? 'automática (agendador)' : `manual, por ${m.ultima_execucao.usuario}`} ·{' '}
                          {m.ultima_execucao.coletas.length} recoleta(s) · {m.ultima_execucao.avisos_gerados} aviso(s)
                          {m.ultima_execucao.motivo ? ` · ${m.ultima_execucao.motivo}` : ''}
                        </div>
                      </>
                    ) : (
                      'ainda não executado'
                    )}
                  </td>
                  <td>
                    {m.coletas_de_origem.length === 0 ? (
                      <span className="mudo">nenhuma</span>
                    ) : (
                      <ul className="lista-simples">
                        {m.coletas_de_origem.map((c) => (
                          <li key={String(c.coleta_id)}>
                            <code>{c.fonte}</code> <span className="mudo">({String(c.coleta_id)}, {formatarData(c.iniciado_em)})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    <div className="linha">
                      <button
                        type="button"
                        className="br-button secondary small"
                        onClick={() => void executarAgora(m)}
                        disabled={ocupado || !m.ativo}
                        title={m.ativo ? 'Refaz agora as coletas de origem e compara com as anteriores. Nada é apagado.' : 'Reative o monitoramento para executar.'}
                      >
                        Executar agora
                      </button>
                      <button type="button" className="br-button secondary small" onClick={() => void alternar(m)} disabled={ocupado}>
                        {m.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>

      <section aria-labelledby="avisos-titulo">
        <div className="painel-cabecalho">
          <h3 id="avisos-titulo">Avisos de novidade</h3>
          <div className="linha">
            <Caixa marcado={soNaoLidos} aoMudar={alternarFiltro}>
              Só não lidos
            </Caixa>
            <button type="button" className="br-button secondary small" onClick={() => void carregarAvisos()} disabled={avisos.carregando}>
              Atualizar
            </button>
          </div>
        </div>
        <p className="mudo">Cada aviso é uma novidade a conferir, não uma conclusão. Os avisos ficam só aqui e na API: não há envio por e-mail.</p>
        {avisos.carregando && !avisos.dados && <Carregando />}
        {avisos.erro && <Mensagem tipo="erro">{avisos.erro}</Mensagem>}
        {leitura.erro && <Mensagem tipo="erro">{leitura.erro}</Mensagem>}
        {avisos.dados && listaAvisos.length === 0 && <p className="vazio">{soNaoLidos ? 'Nenhum aviso não lido.' : 'Nenhum aviso neste caso.'}</p>}
        {listaAvisos.map((a) => (
          <CartaoAviso key={String(a.id)} aviso={a} aoMarcarLido={() => void marcarLido(a)} ocupado={leitura.carregando} />
        ))}
      </section>
    </div>
  );
}

function ResultadoExecucao({ execucao }: { execucao: ExecucaoMonitoramentoResultado }) {
  const tipo = execucao.situacao === 'sucesso' ? 'ok' : execucao.situacao === 'falha' ? 'erro' : 'aviso';
  return (
    <Mensagem tipo={tipo}>
      <div>
        Execução concluída: <strong>{ROTULOS_EXECUCAO[execucao.situacao] ?? execucao.situacao}</strong> · {execucao.coletas.length} recoleta(s) ·{' '}
        {execucao.avisos_gerados} aviso(s) gerado(s).
      </div>
      {execucao.motivo && <div>{execucao.motivo}</div>}
      {execucao.coletas.map((c, i) => (
        <div key={`${String(c.recoleta_de)}-${i}`}>
          <code>{c.fonte}</code>: {c.situacao}
          {c.mesmo_conteudo === true && ', mesmo conteúdo da coleta anterior'}
          {c.mesmo_conteudo === false && ', conteúdo diferente da coleta anterior'}
          {c.coleta_id != null && ` (coleta ${String(c.coleta_id)}, recoleta de ${String(c.recoleta_de)})`}
          {c.motivo ? ` — ${c.motivo}` : ''}
        </div>
      ))}
    </Mensagem>
  );
}

export function CartaoAviso({ aviso, aoMarcarLido, ocupado = false }: { aviso: Aviso; aoMarcarLido?: () => void; ocupado?: boolean }) {
  const lido = !!aviso.lido_em;
  const idTitulo = `aviso-${String(aviso.id)}-titulo`;
  return (
    <article className={`br-card aviso-novidade ${lido ? '' : 'aviso-novidade-nao-lido'}`.trim()} aria-labelledby={idTitulo} data-testid="aviso">
      <header>
        <span className="br-tag small etiqueta-tipologia">{ROTULOS_AVISO[aviso.tipo] ?? aviso.tipo}</span>
        <h4 id={idTitulo}>{mascararCpfs(aviso.titulo)}</h4>
        {lido ? <span className="br-tag small etiqueta-lido">lido</span> : <span className="br-tag small etiqueta-nao-lido">não lido</span>}
        {!lido && aoMarcarLido && (
          <button type="button" className="br-button secondary small" onClick={aoMarcarLido} disabled={ocupado}>
            Marcar como lido
          </button>
        )}
      </header>
      <p>{mascararCpfs(aviso.descricao)}</p>
      <p className="mudo quebra">
        {aviso.entidade_rotulo ?? String(aviso.entidade_id)} · detectado em {formatarData(aviso.criado_em)} · capturas:{' '}
        {aviso.captura_ids.length ? aviso.captura_ids.map((id) => <code key={String(id)}>{String(id)} </code>) : 'nenhuma'}
        {lido && (
          <>
            {' '}
            · lido por {aviso.lido_por ?? '—'} em {formatarData(aviso.lido_em)}
          </>
        )}
      </p>
      {Object.keys(aviso.detalhes ?? {}).length > 0 && (
        <details>
          <summary>Detalhes</summary>
          <TabelaChaveValor dados={aviso.detalhes} />
        </details>
      )}
    </article>
  );
}
