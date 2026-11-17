import { useEffect, useState, type KeyboardEvent } from 'react';
import type { CasoDetalhe, EntidadeResumo, EstadoImportacaoJudicial, IaEstado, Id } from '../api';
import { Carregando, Mensagem, formatarDia } from '../componentes/basicos';
import { PapelProvider, papelNoCaso, rotuloPapel } from '../sessao/PapelContext';
import { useSessao } from '../sessao/SessaoContext';
import { useChamada } from '../sessao/useChamada';
import { AbaAlertas } from './abas/AbaAlertas';
import { AbaAuditoria } from './abas/AbaAuditoria';
import { AbaColeta } from './abas/AbaColeta';
import { AbaEntidades } from './abas/AbaEntidades';
import { AbaEquipe } from './abas/AbaEquipe';
import { AbaGrafo } from './abas/AbaGrafo';
import { AbaMonitoramento } from './abas/AbaMonitoramento';
import { AbaOrdemJudicial } from './abas/AbaOrdemJudicial';
import { AbaRelatorio } from './abas/AbaRelatorio';
import { AbaSugestoesIa } from './abas/AbaSugestoesIa';
import { AbaTipologias } from './abas/AbaTipologias';

export type NomeAba = 'coleta' | 'entidades' | 'grafo' | 'alertas' | 'ia' | 'tipologias' | 'monitoramento' | 'equipe' | 'judicial' | 'auditoria' | 'relatorio';

/** A aba `judicial` (RF10) só entra na tela quando o servidor diz que o módulo está ligado. */
const TODAS_AS_ABAS: { id: NomeAba; rotulo: string }[] = [
  { id: 'coleta', rotulo: 'Coleta' },
  { id: 'entidades', rotulo: 'Entidades' },
  { id: 'grafo', rotulo: 'Grafo' },
  { id: 'alertas', rotulo: 'Alertas' },
  { id: 'ia', rotulo: 'Sugestões da IA' },
  { id: 'tipologias', rotulo: 'Tipologias' },
  { id: 'monitoramento', rotulo: 'Monitoramento' },
  { id: 'equipe', rotulo: 'Equipe' },
  { id: 'judicial', rotulo: 'Ordem judicial' },
  { id: 'auditoria', rotulo: 'Auditoria' },
  { id: 'relatorio', rotulo: 'Relatório' },
];

export interface CasoProps {
  casoId: Id;
  aoVoltar: () => void;
  abaInicial?: NomeAba;
}

export function Caso({ casoId, aoVoltar, abaInicial = 'coleta' }: CasoProps) {
  const { cliente, justificativa } = useSessao();
  const detalhe = useChamada<CasoDetalhe>();
  const [aba, setAba] = useState<NomeAba>(abaInicial);
  /** Entidade a abrir na aba Entidades (navegação vinda do grafo ou dos alertas). */
  const [entidadeFoco, setEntidadeFoco] = useState<Id | null>(null);
  /** Centro a usar na aba Grafo (navegação vinda da entidade). */
  const [centroGrafo, setCentroGrafo] = useState<Id | null>(null);
  /** Entidade a levar ao formulário da aba Monitoramento (vinda do detalhe da entidade). */
  const [entidadeMonitorar, setEntidadeMonitorar] = useState<EntidadeResumo | null>(null);
  /** Captura a levar ao formulário da aba Sugestões da IA (vinda da entidade do tipo edital). */
  const [capturaIa, setCapturaIa] = useState<Id | null>(null);
  /** Estado da extração por IA no servidor (`GET /ia`): não é dado de caso e não pede justificativa. */
  const ia = useChamada<IaEstado>();
  /** Estado do módulo de importação sob ordem judicial (`GET /importacao-judicial/estado`): só o token. */
  const judicial = useChamada<EstadoImportacaoJudicial>();

  useEffect(() => {
    if (justificativa.trim()) void detalhe.executar(() => cliente.obterCaso(casoId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId, justificativa]);

  useEffect(() => {
    // Se a consulta falhar, a aba mostra o estado como desconhecido e não oferece a extração.
    void ia.executar(() => cliente.estadoIa());
    // RF10: com o módulo desligado, ou se a consulta falhar, nada do módulo aparece.
    void judicial.executar(() => cliente.estadoImportacaoJudicial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente]);

  const moduloJudicial = judicial.dados?.ativa === true ? judicial.dados : null;
  const ABAS = TODAS_AS_ABAS.filter((a) => a.id !== 'judicial' || moduloJudicial !== null);

  function abrirEntidade(id: Id) {
    setEntidadeFoco(id);
    setAba('entidades');
  }

  function verNoGrafo(id: Id) {
    setCentroGrafo(id);
    setAba('grafo');
  }

  function monitorar(entidade: EntidadeResumo) {
    setEntidadeMonitorar(entidade);
    setAba('monitoramento');
  }

  function extrairComIa(capturaId: Id) {
    setCapturaIa(capturaId);
    setAba('ia');
  }

  const recarregar = () => void detalhe.executar(() => cliente.obterCaso(casoId));
  const contagens = detalhe.dados?.contagens;
  const avisosNaoLidos = contagens?.avisos_nao_lidos ?? 0;
  const sugestoesIaPendentes = contagens?.sugestoes_ia_pendentes ?? 0;
  const tarefasAbertas = contagens?.tarefas_abertas ?? 0;
  // Enquanto o caso não chegou, o papel é desconhecido e a interface não bloqueia nada (quem autoriza é o back-end).
  const papel = papelNoCaso(detalhe.dados ? detalhe.dados.meu_papel : undefined);

  /** Setas, Home e End trocam de aba (padrão de teclado para role="tablist"). */
  function aoTeclarNasAbas(e: KeyboardEvent<HTMLUListElement>) {
    const atual = ABAS.findIndex((a) => a.id === aba);
    let proxima: number;
    if (e.key === 'ArrowRight') proxima = (atual + 1) % ABAS.length;
    else if (e.key === 'ArrowLeft') proxima = (atual - 1 + ABAS.length) % ABAS.length;
    else if (e.key === 'Home') proxima = 0;
    else if (e.key === 'End') proxima = ABAS.length - 1;
    else return;
    e.preventDefault();
    setAba(ABAS[proxima].id);
    document.getElementById(`aba-${ABAS[proxima].id}`)?.focus();
  }

  return (
    <PapelProvider value={papel}>
    <main className="caso" id="conteudo">
      <header className="caso-cabecalho">
        <button type="button" className="br-button secondary small" onClick={aoVoltar}>
          ← Casos
        </button>
        <div>
          {detalhe.carregando && !detalhe.dados && <Carregando />}
          {detalhe.dados ? (
            <>
              <h2>
                <code>{detalhe.dados.numero_procedimento || '—'}</code> {detalhe.dados.titulo}
              </h2>
              <p className="mudo">
                {detalhe.dados.descricao}
                {detalhe.dados.contagens && (
                  <>
                    {' '}
                    · {detalhe.dados.contagens.entidades} entidades · {detalhe.dados.contagens.alertas} alertas · {detalhe.dados.contagens.capturas} capturas
                    {detalhe.dados.contagens.monitoramentos !== undefined && <> · {detalhe.dados.contagens.monitoramentos} monitoramento(s) ativo(s)</>}
                    {detalhe.dados.contagens.avisos_nao_lidos !== undefined && <> · {detalhe.dados.contagens.avisos_nao_lidos} aviso(s) não lido(s)</>}
                    {detalhe.dados.contagens.membros !== undefined && <> · {detalhe.dados.contagens.membros} membro(s)</>}
                    {detalhe.dados.contagens.tarefas_abertas !== undefined && <> · {detalhe.dados.contagens.tarefas_abertas} tarefa(s) aberta(s)</>}
                    {detalhe.dados.contagens.anotacoes !== undefined && <> · {detalhe.dados.contagens.anotacoes} anotação(ões)</>}
                    {detalhe.dados.contagens.sugestoes_ia_pendentes !== undefined && (
                      <> · {detalhe.dados.contagens.sugestoes_ia_pendentes} sugestão(ões) de IA pendente(s)</>
                    )}
                  </>
                )}
              </p>
              <p className="mudo">
                Finalidade: {detalhe.dados.finalidade || 'não informada'} · Retenção até {formatarDia(detalhe.dados.retencao_ate)}
                {detalhe.dados.meu_papel !== undefined && (
                  <>
                    {' '}
                    · Seu papel neste caso: <strong data-testid="papel-no-caso">{rotuloPapel(detalhe.dados.meu_papel)}</strong>
                  </>
                )}
              </p>
            </>
          ) : (
            <h2>Caso {String(casoId)}</h2>
          )}
        </div>
      </header>
      {detalhe.erro && <Mensagem tipo="erro">{detalhe.erro}</Mensagem>}
      {detalhe.dados?.somente_leitura && (
        <Mensagem tipo="aviso">
          O prazo de retenção deste caso terminou em {formatarDia(detalhe.dados.retencao_ate)}. O caso está só para leitura: o
          relatório, os alertas já gerados, a custódia e a auditoria continuam disponíveis; novas coletas, consultas,
          execuções de tipologia, decisões e o monitoramento são recusados, e cada tentativa fica registrada na auditoria.
        </Mensagem>
      )}
      {detalhe.dados && papel.motivoSomenteLeitura && !detalhe.dados.somente_leitura && (
        <Mensagem tipo="info">
          {papel.motivoSomenteLeitura} O servidor recusa as ações de escrita (403) e registra cada tentativa na auditoria.
        </Mensagem>
      )}
      {!justificativa.trim() && <Mensagem tipo="aviso">Informe a justificativa no topo da página para consultar este caso.</Mensagem>}

      <div className="br-tab small abas">
        <nav className="tab-nav">
          <ul role="tablist" aria-label="Seções do caso" onKeyDown={aoTeclarNasAbas}>
            {ABAS.map((a) => (
              <li key={a.id} role="presentation" className={`tab-item ${aba === a.id ? 'active' : ''}`}>
                <button
                  role="tab"
                  type="button"
                  id={`aba-${a.id}`}
                  aria-selected={aba === a.id}
                  aria-controls={`painel-${a.id}`}
                  tabIndex={aba === a.id ? 0 : -1}
                  onClick={() => setAba(a.id)}
                >
                  <span className="name">
                    {a.rotulo}
                    {a.id === 'monitoramento' && avisosNaoLidos > 0 && (
                      <span className="br-tag small contagem-aba" data-testid="avisos-nao-lidos" title="Avisos de novidade não lidos">
                        {avisosNaoLidos}
                        <span className="sr-only"> aviso(s) não lido(s)</span>
                      </span>
                    )}
                    {a.id === 'ia' && sugestoesIaPendentes > 0 && (
                      <span className="br-tag small contagem-aba" data-testid="sugestoes-ia-pendentes" title="Sugestões da IA pendentes de decisão">
                        {sugestoesIaPendentes}
                        <span className="sr-only"> sugestão(ões) pendente(s)</span>
                      </span>
                    )}
                    {a.id === 'equipe' && tarefasAbertas > 0 && (
                      <span className="br-tag small contagem-aba" data-testid="tarefas-abertas" title="Tarefas abertas ou em andamento">
                        {tarefasAbertas}
                        <span className="sr-only"> tarefa(s) aberta(s)</span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="tab-content">
          <section role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="tab-panel active painel-aba">
        {aba === 'coleta' && <AbaColeta casoId={casoId} aoConcluir={recarregar} />}
        {aba === 'entidades' && (
          <AbaEntidades
            key={entidadeFoco == null ? 'sem-foco' : String(entidadeFoco)}
            casoId={casoId}
            entidadeInicial={entidadeFoco}
            aoVerNoGrafo={verNoGrafo}
            aoMonitorar={monitorar}
            aoExtrairIa={ia.dados?.ativa ? extrairComIa : undefined}
            aoAnotar={recarregar}
          />
        )}
        {aba === 'grafo' && <AbaGrafo casoId={casoId} centroInicial={centroGrafo} aoAbrirEntidade={abrirEntidade} />}
        {aba === 'alertas' && <AbaAlertas casoId={casoId} aoAbrirEntidade={abrirEntidade} aoExecutar={recarregar} />}
        {aba === 'ia' && (
          <AbaSugestoesIa
            key={capturaIa == null ? 'sem-captura' : String(capturaIa)}
            casoId={casoId}
            ia={ia.dados}
            capturaInicial={capturaIa}
            aoAbrirEntidade={abrirEntidade}
            aoMudar={recarregar}
          />
        )}
        {aba === 'tipologias' && <AbaTipologias />}
        {aba === 'monitoramento' && (
          <AbaMonitoramento
            key={entidadeMonitorar == null ? 'sem-entidade' : String(entidadeMonitorar.id)}
            casoId={casoId}
            entidadeInicial={entidadeMonitorar}
            aoMudar={recarregar}
          />
        )}
        {aba === 'equipe' && <AbaEquipe casoId={casoId} aoMudar={recarregar} />}
        {aba === 'judicial' && moduloJudicial && <AbaOrdemJudicial casoId={casoId} estado={moduloJudicial} />}
        {aba === 'auditoria' && <AbaAuditoria casoId={casoId} />}
        {aba === 'relatorio' && <AbaRelatorio casoId={casoId} numeroProcedimento={detalhe.dados?.numero_procedimento} />}
          </section>
        </div>
      </div>
    </main>
    </PapelProvider>
  );
}
