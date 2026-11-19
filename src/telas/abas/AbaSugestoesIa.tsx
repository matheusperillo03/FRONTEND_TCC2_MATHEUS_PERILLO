import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  mensagemDeErro,
  mesmoId,
  type ApiCliente,
  type BlocoExtracaoIa,
  type ColetaRegistro,
  type DecisaoSugestaoIaValor,
  type ExtracaoIa,
  type IaEstado,
  type Id,
  type ProgressoExtracaoIa,
  type SituacaoSugestaoIa,
  type SugestaoIa,
  type TextoCaptura,
} from '../../api';
import { Campo, Carregando, Hash, Mensagem, Tabela, TabelaChaveValor, contar, formatarData } from '../../componentes/basicos';
import { localizarTrecho } from '../../ia/localizarTrecho';
import { mascararCpfs, mascararCpfsDoCampo } from '../../privacidade';
import { usePapelNoCaso } from '../../sessao/PapelContext';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

const ROTULOS_TIPO: Record<string, string> = { empresa: 'empresa', orgao: 'órgão', pessoa: 'pessoa', valor: 'valor', data: 'data', objeto: 'objeto' };
const ROTULOS_SITUACAO: Record<string, string> = { pendente: 'pendente de decisão', aceita: 'aceita', recusada: 'recusada' };

/** Motivos da recusa automática (verificação do back-end antes de qualquer sugestão existir). */
const ROTULOS_RECUSA: Record<string, string> = {
  esquema_invalido: 'item fora do esquema esperado',
  caractere_de_controle: 'valor ou campo com caractere de controle',
  trecho_vazio: 'sem trecho citado',
  trecho_nao_literal: 'o trecho citado não está, literal, no documento',
  valor_fora_do_trecho: 'o valor não aparece no trecho citado',
  campo_fora_do_trecho: 'um campo não aparece no trecho citado',
  acima_do_limite_de_itens: 'acima do limite de itens por execução',
};

export function rotuloRecusaIa(motivo: string): string {
  return ROTULOS_RECUSA[motivo] ?? motivo;
}

const ROTULOS_EXECUCAO: Record<string, string> = {
  na_fila: 'na fila',
  em_andamento: 'em andamento',
  sucesso: 'concluída',
  concluida_com_falhas: 'concluída com falhas',
  falha: 'falhou',
  cancelada: 'cancelada',
  interrompida: 'interrompida',
};

export function rotuloExecucaoIa(situacao: string): string {
  return ROTULOS_EXECUCAO[situacao] ?? situacao;
}

const ROTULOS_BLOCO: Record<string, string> = { pendente: 'aguardando', em_andamento: 'em andamento', concluido: 'concluído', falho: 'falhou' };

/** Causas de falha de um bloco, como o back-end as registra. */
const ROTULOS_CAUSA: Record<string, string> = {
  tempo_esgotado: 'passou do tempo limite do bloco',
  travamento: 'o modelo parou de responder',
  conexao: 'o servidor do modelo não respondeu',
  http: 'o servidor do modelo devolveu erro',
  resposta_invalida: 'resposta inválida do servidor do modelo',
  saida_cortada: 'a saída do modelo foi cortada pelo limite de tokens',
  json_invalido: 'a resposta do modelo não seguiu o formato esperado',
  modelo_recusado: 'o modelo configurado foi recusado',
};

export function rotuloCausaIa(causa: string): string {
  return ROTULOS_CAUSA[causa] ?? causa;
}

/** Duração para leitura: "45 s", "3 min 05 s", "1 h 12 min". */
export function formatarDuracao(ms: number): string {
  const segundos = Math.max(0, Math.round(ms / 1000));
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min ${String(segundos % 60).padStart(2, '0')} s`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}

/** Intervalo padrão da consulta do andamento e teto de falhas seguidas antes de parar de consultar. */
const INTERVALO_ANDAMENTO_MS = 3000;
const MAX_FALHAS_DE_CONSULTA = 5;

interface Acompanhamento {
  /** Andamento por id da execução (as ativas ao abrir a aba e as iniciadas ou retomadas nela). */
  andamentos: Record<string, ProgressoExtracaoIa>;
  /** Falha ao consultar o andamento, por id. A consulta continua até `MAX_FALHAS_DE_CONSULTA`. */
  erros: Record<string, string>;
  /** Consulta desistida depois de falhas seguidas, por id. */
  paradas: Record<string, boolean>;
  acompanhar: (progresso: ProgressoExtracaoIa) => void;
  dispensar: (id: Id) => void;
}

/**
 * Acompanha execuções por consulta periódica (*polling*), sem travar a tela:
 * cada execução ativa é consultada a cada `intervaloMs`, uma chamada por vez.
 * `aoAvancar` é chamado quando um bloco termina (há sugestões novas) e
 * `aoTerminar`, quando a execução deixa de estar ativa.
 */
function useAcompanhamento(
  cliente: ApiCliente,
  casoId: Id,
  intervaloMs: number,
  aoAvancar: (progresso: ProgressoExtracaoIa) => void,
  aoTerminar: (progresso: ProgressoExtracaoIa) => void,
): Acompanhamento {
  const [andamentos, setAndamentos] = useState<Record<string, ProgressoExtracaoIa>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [paradas, setParadas] = useState<Record<string, boolean>>({});
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const ultimos = useRef(new Map<string, ProgressoExtracaoIa>());
  const falhas = useRef(new Map<string, number>());
  const vivo = useRef(true);
  const retornos = useRef({ aoAvancar, aoTerminar });
  retornos.current = { aoAvancar, aoTerminar };

  const receber = useCallback((progresso: ProgressoExtracaoIa) => {
    const id = String(progresso.id);
    const anterior = ultimos.current.get(id);
    ultimos.current.set(id, progresso);
    setAndamentos((a) => ({ ...a, [id]: progresso }));
    const feitos = (p: ProgressoExtracaoIa) => p.blocos_concluidos + p.blocos_falhos;
    if (anterior && (feitos(progresso) !== feitos(anterior) || progresso.itens_aceitos !== anterior.itens_aceitos)) retornos.current.aoAvancar(progresso);
    if (anterior?.ativa && !progresso.ativa) retornos.current.aoTerminar(progresso);
  }, []);

  const agendar = useCallback(
    (id: string) => {
      if (!vivo.current) return;
      clearTimeout(temporizadores.current.get(id));
      temporizadores.current.set(
        id,
        setTimeout(async () => {
          let progresso: ProgressoExtracaoIa | null = null;
          try {
            progresso = await cliente.progressoExtracaoIa(casoId, id);
          } catch (e) {
            if (!vivo.current) return;
            const seguidas = (falhas.current.get(id) ?? 0) + 1;
            falhas.current.set(id, seguidas);
            setErros((x) => ({ ...x, [id]: mensagemDeErro(e) }));
            if (seguidas >= MAX_FALHAS_DE_CONSULTA) {
              temporizadores.current.delete(id);
              setParadas((x) => ({ ...x, [id]: true }));
              return;
            }
          }
          if (!vivo.current) return;
          if (progresso) {
            falhas.current.delete(id);
            setErros((x) => (id in x ? Object.fromEntries(Object.entries(x).filter(([chave]) => chave !== id)) : x));
            receber(progresso);
            if (!progresso.ativa) {
              temporizadores.current.delete(id);
              return;
            }
          }
          agendar(id);
        }, intervaloMs),
      );
    },
    [cliente, casoId, intervaloMs, receber],
  );

  const acompanhar = useCallback(
    (progresso: ProgressoExtracaoIa) => {
      const id = String(progresso.id);
      falhas.current.delete(id);
      setParadas((x) => ({ ...x, [id]: false }));
      receber(progresso);
      if (progresso.ativa) agendar(id);
    },
    [agendar, receber],
  );

  const dispensar = useCallback((id: Id) => {
    const chave = String(id);
    clearTimeout(temporizadores.current.get(chave));
    temporizadores.current.delete(chave);
    ultimos.current.delete(chave);
    setAndamentos((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== chave)));
  }, []);

  useEffect(() => {
    vivo.current = true;
    const pendentes = temporizadores.current;
    return () => {
      vivo.current = false;
      pendentes.forEach((t) => clearTimeout(t));
      pendentes.clear();
    };
  }, []);

  return { andamentos, erros, paradas, acompanhar, dispensar };
}

/** Fontes de coleta cujas capturas são documentos de texto (onde a extração se aplica). */
const FONTES_DE_DOCUMENTO = new Set(['edital_arquivo']);

export interface AbaSugestoesIaProps {
  casoId: Id;
  /** Estado de `GET /ia`, carregado pela tela do caso. `null` enquanto não chegou. */
  ia: IaEstado | null;
  /** Captura já escolhida para extrair (vinda do botão "Extrair com IA" da entidade). */
  capturaInicial?: Id | null;
  aoAbrirEntidade?: (id: Id) => void;
  /** Avisa a tela do caso para atualizar as contagens do cabeçalho. */
  aoMudar?: () => void;
  /** Intervalo da consulta do andamento das execuções (os testes usam um valor curto). */
  intervaloAndamentoMs?: number;
}

/**
 * Extração assistida por IA local (RF13, RNF05, H22): revisão lado a lado. À
 * esquerda, as sugestões; à direita, o texto do documento com o trecho citado
 * em destaque. Nada vira entidade sem a decisão de um investigador.
 *
 * A extração roda em segundo plano no servidor: o botão só a põe na fila, e a
 * tela acompanha o andamento por consulta periódica. As sugestões aparecem
 * conforme os blocos do documento terminam, e a tela continua utilizável.
 */
export function AbaSugestoesIa({ casoId, ia, capturaInicial = null, aoAbrirEntidade, aoMudar, intervaloAndamentoMs = INTERVALO_ANDAMENTO_MS }: AbaSugestoesIaProps) {
  const { cliente } = useSessao();
  const { podeEscrever, motivoSomenteLeitura } = usePapelNoCaso();
  const sugestoes = useChamada<SugestaoIa[]>();
  const extracoes = useChamada<ExtracaoIa[]>();
  const coletas = useChamada<ColetaRegistro[]>();
  const extracao = useChamada<ExtracaoIa>();
  const texto = useChamada<TextoCaptura>();
  const [filtro, setFiltro] = useState<'todas' | SituacaoSugestaoIa>('pendente');
  const [selecionada, setSelecionada] = useState<Id | null>(null);
  const [captura, setCaptura] = useState<string>(capturaInicial == null ? '' : String(capturaInicial));
  /** Sugestões devolvidas pela decisão, por id: substituem as da lista sem nova consulta. */
  const [decididas, setDecididas] = useState<Record<string, SugestaoIa>>({});
  /** Erro e ação em curso dos botões de cancelar e retomar, por id da execução. */
  const [erroDaAcao, setErroDaAcao] = useState<Record<string, string>>({});
  const [acaoEmCurso, setAcaoEmCurso] = useState<Record<string, 'cancelar' | 'retomar'>>({});

  const carregarSugestoes = () => sugestoes.executar(() => cliente.listarSugestoesIa(casoId));
  const carregarExtracoes = () => extracoes.executar(() => cliente.listarExtracoesIa(casoId));

  const { andamentos, erros, paradas, acompanhar, dispensar } = useAcompanhamento(
    cliente,
    casoId,
    intervaloAndamentoMs,
    // Um bloco terminou: as sugestões dele já existem no servidor.
    () => {
      void carregarSugestoes();
      aoMudar?.();
    },
    () => {
      void carregarSugestoes();
      void carregarExtracoes();
      aoMudar?.();
    },
  );

  useEffect(() => {
    void carregarSugestoes();
    void coletas.executar(() => cliente.listarColetas(casoId));
    // As execuções que já estavam na fila ou em andamento (de outra sessão, ou de antes de
    // recarregar a página) passam a ser acompanhadas.
    void carregarExtracoes().then((lista) => (lista ?? []).forEach((e) => e.progresso?.ativa && acompanhar(e.progresso)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId]);

  const todas = (sugestoes.dados ?? []).map((s) => decididas[String(s.id)] ?? s);
  const visiveis = todas.filter((s) => filtro === 'todas' || s.situacao === filtro);
  const atual = todas.find((s) => mesmoId(s.id, selecionada)) ?? null;
  const contagem = (situacao: string) => todas.filter((s) => s.situacao === situacao).length;

  // O texto do documento é buscado quando a sugestão escolhida é de outra captura.
  const capturaAtual = atual ? String(atual.captura_id) : null;
  useEffect(() => {
    if (capturaAtual === null) return;
    if (texto.dados && mesmoId(texto.dados.captura_id, capturaAtual)) return;
    texto.limpar();
    void texto.executar(() => cliente.obterTextoCaptura(casoId, capturaAtual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId, capturaAtual]);

  // Capturas de documento do caso: as das coletas de editais, a que veio da entidade e as que já têm extração.
  const capturasDeDocumento = [
    ...new Set([
      ...(capturaInicial == null ? [] : [String(capturaInicial)]),
      ...(coletas.dados ?? []).filter((c) => FONTES_DE_DOCUMENTO.has(c.fonte) && c.situacao === 'sucesso').flatMap((c) => c.captura_ids.map(String)),
      ...(extracoes.dados ?? []).map((e) => String(e.captura_id)),
    ]),
  ];
  const capturaEscolhida = captura || capturasDeDocumento[0] || '';
  const acompanhadas = Object.values(andamentos).sort((a, b) => (a.iniciado_em < b.iniciado_em ? 1 : -1));
  /** Execução na fila ou em andamento para o documento escolhido: só uma por documento. */
  const ativaDoDocumento = acompanhadas.find((p) => p.ativa && mesmoId(p.captura_id, capturaEscolhida)) ?? null;

  async function extrair(e: FormEvent) {
    e.preventDefault();
    if (!capturaEscolhida || !ia?.ativa || !podeEscrever || ativaDoDocumento) return;
    // O pedido volta na hora (202): a execução entra na fila e passa a ser acompanhada.
    const r = await extracao.executar(() => cliente.extrairComIa(casoId, capturaEscolhida));
    void carregarExtracoes();
    if (r?.progresso) {
      setFiltro('pendente');
      acompanhar(r.progresso);
    }
  }

  async function acionar(acao: 'cancelar' | 'retomar', id: Id) {
    const chave = String(id);
    if (!podeEscrever || acaoEmCurso[chave]) return;
    setAcaoEmCurso((a) => ({ ...a, [chave]: acao }));
    setErroDaAcao((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== chave)));
    try {
      const progresso = acao === 'cancelar' ? await cliente.cancelarExtracaoIa(casoId, id) : await cliente.retomarExtracaoIa(casoId, id);
      acompanhar(progresso);
      if (acao === 'retomar' || !progresso.ativa) void carregarExtracoes();
    } catch (e) {
      setErroDaAcao((x) => ({ ...x, [chave]: mensagemDeErro(e) }));
    } finally {
      setAcaoEmCurso((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== chave)));
    }
  }

  /** Erros sobem para o painel da sugestão, que os mostra junto do formulário. */
  async function decidir(sugestao: SugestaoIa, decisao: DecisaoSugestaoIaValor, justificativa: string) {
    const atualizada = await cliente.decidirSugestaoIa(casoId, sugestao.id, { decisao, justificativa });
    setDecididas((d) => ({ ...d, [String(sugestao.id)]: atualizada }));
    aoMudar?.();
  }

  return (
    <div className="sugestoes-ia">
      <Mensagem tipo="info">
        <strong>Sugestões de IA local, não conclusões.</strong> Um modelo de linguagem executado no próprio servidor lê o texto do
        documento capturado e propõe itens (empresa, órgão, pessoa, valor, data, objeto), cada um com o trecho literal que o
        ampara. O documento não sai do servidor. <strong>Nada vira entidade sem a decisão de um investigador</strong>: confira o
        trecho no documento ao lado e aceite ou recuse, com justificativa. A decisão fica na trilha de auditoria.
      </Mensagem>

      <section aria-label="Estado da extração por IA" data-testid="estado-ia">
        {ia === null && <Carregando texto="Consultando o estado da IA…" />}
        {ia?.ativa && (
          <p>
            <span className="br-tag small etiqueta-ia-ativa">IA local ativa</span> provedor <code>{ia.provedor ?? '—'}</code>, modelo <code>{ia.modelo ?? '—'}</code>
            {ia.tipos.length > 0 && <span className="mudo"> · tipos extraídos: {ia.tipos.map((t) => ROTULOS_TIPO[t] ?? t).join(', ')}</span>}
          </p>
        )}
        {ia && !ia.ativa && (
          <Mensagem tipo="aviso">
            <strong>A extração por IA está desligada neste servidor.</strong> Nenhum documento é enviado a modelo algum e não há
            como iniciar uma extração por aqui. As sugestões já registradas continuam disponíveis para revisão.
          </Mensagem>
        )}
      </section>

      {ia?.ativa && (
        <form onSubmit={extrair} className="linha formulario-extracao" aria-label="Extrair com IA">
          <Campo rotulo="Captura do documento" emLinha dica={capturasDeDocumento.length ? undefined : 'O caso ainda não tem captura de documento: faça a coleta de editais em texto na aba Coleta.'}>
            <select value={capturaEscolhida} onChange={(e) => setCaptura(e.target.value)} disabled={!capturasDeDocumento.length || !podeEscrever}>
              {capturasDeDocumento.length === 0 && <option value="">nenhuma captura de documento</option>}
              {capturasDeDocumento.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </Campo>
          <button
            type="submit"
            className="br-button primary small"
            disabled={!capturaEscolhida || extracao.carregando || !podeEscrever || ativaDoDocumento !== null}
            title={motivoSomenteLeitura ?? undefined}
          >
            {extracao.carregando ? 'Enviando o pedido…' : 'Extrair com IA'}
          </button>
          {motivoSomenteLeitura && (
            <span className="campo-dica" data-testid="ia-somente-leitura">
              {motivoSomenteLeitura}
            </span>
          )}
          {ativaDoDocumento && (
            <span className="campo-dica" data-testid="ia-documento-ocupado">
              Este documento já tem uma extração {rotuloExecucaoIa(ativaDoDocumento.situacao)}. Acompanhe abaixo; para recomeçar, cancele-a antes.
            </span>
          )}
        </form>
      )}
      {extracao.erro && <Mensagem tipo="erro">{extracao.erro}</Mensagem>}

      {acompanhadas.length > 0 && (
        <section aria-labelledby="andamento-ia-titulo" className="andamento-ia">
          <h3 id="andamento-ia-titulo">Andamento da extração</h3>
          <p className="mudo">
            A extração roda em segundo plano no servidor, um documento por vez. Pode levar vários minutos em documentos longos: você pode continuar
            usando o sistema, sair desta aba e voltar depois. As sugestões aparecem conforme cada bloco do documento termina.
          </p>
          {acompanhadas.map((p) => (
            <AndamentoExtracao
              key={String(p.id)}
              progresso={p}
              erroDeConsulta={erros[String(p.id)] ?? null}
              consultaParada={paradas[String(p.id)] ?? false}
              erroDaAcao={erroDaAcao[String(p.id)] ?? null}
              acaoEmCurso={acaoEmCurso[String(p.id)] ?? null}
              aoCancelar={() => void acionar('cancelar', p.id)}
              aoRetomar={() => void acionar('retomar', p.id)}
              aoConsultarDeNovo={() => acompanhar(p)}
              aoDispensar={() => dispensar(p.id)}
            />
          ))}
        </section>
      )}

      <div className="painel-cabecalho">
        <p role="status" data-testid="resumo-sugestoes">
          {contar(contagem('pendente'), 'pendente')} de decisão · {contar(contagem('aceita'), 'aceita')} · {contar(contagem('recusada'), 'recusada')}
        </p>
        <Campo rotulo="Situação das sugestões" emLinha>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
            <option value="todas">todas</option>
            <option value="pendente">pendentes</option>
            <option value="aceita">aceitas</option>
            <option value="recusada">recusadas</option>
          </select>
        </Campo>
      </div>
      {sugestoes.carregando && !sugestoes.dados && <Carregando />}
      {sugestoes.erro && <Mensagem tipo="erro">{sugestoes.erro}</Mensagem>}

      <div className="revisao-ia">
        <section aria-label="Sugestões da IA">
          {sugestoes.dados && todas.length === 0 && <p className="vazio">Nenhuma sugestão neste caso.</p>}
          {todas.length > 0 && visiveis.length === 0 && <p className="vazio">Nenhuma sugestão com esta situação.</p>}
          <ul className="lista-sugestoes-ia">
            {visiveis.map((s) => (
              <CartaoSugestaoIa
                key={String(s.id)}
                sugestao={s}
                selecionada={mesmoId(s.id, selecionada)}
                aoSelecionar={() => setSelecionada(s.id)}
                aoDecidir={(decisao, justificativa) => decidir(s, decisao, justificativa)}
                aoAbrirEntidade={aoAbrirEntidade}
              />
            ))}
          </ul>
        </section>

        <section aria-label="Documento de origem" className="documento-ia-painel">
          <h3>Documento de origem</h3>
          {!atual && <p className="vazio">Escolha uma sugestão para ver o trecho citado no texto do documento.</p>}
          {atual && texto.carregando && <Carregando texto="Carregando o texto do documento…" />}
          {atual && texto.erro && <Mensagem tipo="erro">{texto.erro}</Mensagem>}
          {atual && texto.dados && mesmoId(texto.dados.captura_id, atual.captura_id) && <DocumentoComTrecho sugestao={atual} texto={texto.dados} />}
        </section>
      </div>

      <section aria-labelledby="execucoes-ia-titulo" className="execucoes-ia">
        <h3 id="execucoes-ia-titulo">Execuções da extração</h3>
        <p className="mudo">
          Cada execução guarda o modelo, a versão, os parâmetros e o resumo do prompt, para que o resultado possa ser explicado
          depois. Os itens abaixo de &quot;recusados automaticamente&quot; não viraram sugestão: não passaram na verificação (por exemplo, o
          trecho citado não existe no documento).
        </p>
        {extracoes.carregando && !extracoes.dados && <Carregando />}
        {extracoes.erro && <Mensagem tipo="erro">{extracoes.erro}</Mensagem>}
        {extracoes.dados && extracoes.dados.length === 0 && <p className="vazio">Nenhuma extração feita neste caso.</p>}
        {(extracoes.dados ?? []).map((e, i) => {
          // O andamento acompanhado nesta tela é mais novo que o da lista.
          const progresso = andamentos[String(e.id)] ?? e.progresso ?? null;
          return (
            <ExecucaoIa
              key={String(e.id)}
              extracao={e}
              progresso={progresso}
              aberta={i === 0}
              aoRetomar={progresso?.retomavel && ia?.ativa && podeEscrever && !acaoEmCurso[String(e.id)] ? () => void acionar('retomar', e.id) : undefined}
            />
          );
        })}
      </section>
    </div>
  );
}

interface CartaoSugestaoIaProps {
  sugestao: SugestaoIa;
  selecionada: boolean;
  aoSelecionar: () => void;
  aoDecidir: (decisao: DecisaoSugestaoIaValor, justificativa: string) => Promise<unknown>;
  aoAbrirEntidade?: (id: Id) => void;
}

function CartaoSugestaoIa({ sugestao: s, selecionada, aoSelecionar, aoDecidir, aoAbrirEntidade }: CartaoSugestaoIaProps) {
  const { podeEscrever, motivoSomenteLeitura } = usePapelNoCaso();
  const idCampo = useId();
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState<DecisaoSugestaoIaValor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Mesma regra do back-end: a justificativa precisa ter letras ou números.
  const valida = /[\p{L}\p{N}]/u.test(justificativa);
  const pendente = s.situacao === 'pendente';
  const campos = Object.entries(s.campos ?? {});

  async function decidir(decisao: DecisaoSugestaoIaValor) {
    if (!valida || !podeEscrever) return;
    setEnviando(decisao);
    setErro(null);
    try {
      await aoDecidir(decisao, justificativa.trim());
      setJustificativa('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(null);
    }
  }

  return (
    <li className={`br-card sugestao-ia sugestao-ia-${s.situacao}${selecionada ? ' sugestao-ia-selecionada' : ''}`} data-testid="sugestao-ia" aria-current={selecionada ? 'true' : undefined}>
      <header className="sugestao-ia-cabecalho">
        <span className="br-tag small etiqueta-tipologia">{ROTULOS_TIPO[s.tipo] ?? s.tipo}</span>
        <strong className="quebra">{mascararCpfs(s.valor)}</strong>
        <span className={`br-tag small situacao-ia situacao-ia-${s.situacao}`}>{ROTULOS_SITUACAO[s.situacao] ?? s.situacao}</span>
      </header>
      {campos.length > 0 && (
        <dl className="campos-ia">
          {campos.map(([chave, valor]) => (
            <div key={chave}>
              <dt>{chave}</dt>
              <dd>{mascararCpfsDoCampo(chave, valor)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mudo">
        Sugestão de IA · modelo <code>{s.modelo}</code> ({s.provedor}) ·{' '}
        {typeof s.confianca === 'number' ? `confiança declarada pelo modelo: ${Math.round(s.confianca * 100)}%` : 'o modelo não declarou confiança'} · captura{' '}
        <code>{String(s.captura_id)}</code>
      </p>
      <button type="button" className="br-button secondary small" onClick={aoSelecionar} aria-pressed={selecionada}>
        {selecionada ? 'Trecho em destaque no documento' : 'Ver o trecho no documento'}
      </button>

      {!pendente && (
        <p className="quebra" data-testid="decisao-ia">
          <strong>{s.situacao === 'aceita' ? 'Aceita' : 'Recusada'}</strong> por {s.decidido_por ?? '—'} em {formatarData(s.decidido_em)}. Justificativa:{' '}
          {s.justificativa_decisao ?? '—'}
          {s.situacao === 'aceita' &&
            (s.entidade_id != null ? (
              <>
                {' '}
                Entidade:{' '}
                {aoAbrirEntidade ? (
                  <button type="button" className="botao-link" onClick={() => aoAbrirEntidade(s.entidade_id!)}>
                    {String(s.entidade_id)}
                  </button>
                ) : (
                  <code>{String(s.entidade_id)}</code>
                )}
                .
              </>
            ) : (
              ' Ficou como campo confirmado, sem entidade.'
            ))}
        </p>
      )}

      {pendente && selecionada && (
        <form className="formulario formulario-decisao" onSubmit={(e) => e.preventDefault()} aria-label={`Decisão sobre a sugestão ${s.valor}`}>
          <div className="br-textarea small campo">
            <label htmlFor={idCampo}>Justificativa da decisão (obrigatória)</label>
            <textarea
              id={idCampo}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={2}
              maxLength={2000}
              disabled={!podeEscrever}
              required
            />
          </div>
          {motivoSomenteLeitura && <p className="campo-dica">{motivoSomenteLeitura}</p>}
          <div className="linha">
            <button type="button" className="br-button primary small" onClick={() => void decidir('aceita')} disabled={!podeEscrever || !valida || enviando !== null}>
              {enviando === 'aceita' ? 'Registrando…' : 'Aceitar sugestão'}
            </button>
            <button type="button" className="br-button secondary small" onClick={() => void decidir('recusada')} disabled={!podeEscrever || !valida || enviando !== null}>
              {enviando === 'recusada' ? 'Registrando…' : 'Recusar sugestão'}
            </button>
          </div>
          <p className="campo-dica">A decisão é única: depois de aceita ou recusada, a sugestão não muda. Confira o trecho no documento antes.</p>
          {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
        </form>
      )}
    </li>
  );
}

/**
 * Texto do documento com o trecho citado em destaque e rolado até ele. O texto
 * é sempre renderizado como texto (nós de texto do React), nunca como HTML.
 */
export function DocumentoComTrecho({ sugestao, texto }: { sugestao: SugestaoIa; texto: TextoCaptura }) {
  const marca = useRef<HTMLElement | null>(null);
  const local = localizarTrecho(texto.texto, sugestao.trecho, sugestao.posicao_inicio);

  useEffect(() => {
    // jsdom não implementa scrollIntoView; no navegador, o trecho vai para o meio da área visível.
    marca.current?.scrollIntoView?.({ block: 'center' });
  }, [sugestao.id, texto.captura_id, local?.inicio]);

  const hashMudou = !!sugestao.captura_sha256 && !!texto.sha256 && sugestao.captura_sha256 !== texto.sha256;

  return (
    <div data-testid="documento-ia">
      <p className="mudo">
        Captura <code>{String(texto.captura_id)}</code> · SHA-256 <Hash valor={texto.sha256} /> · {texto.caracteres.toLocaleString('pt-BR')} caracteres ·{' '}
        {texto.formato === 'pdf'
          ? `texto extraído do PDF${texto.paginas ? ` (${contar(texto.paginas, 'página')})` : ''}${texto.extrator ? ` por ${texto.extrator}` : ''}`
          : texto.codificacao}
      </p>
      {texto.formato === 'pdf' && (
        <p className="mudo">
          O SHA-256 acima é o do arquivo PDF original, guardado na custódia. O texto abaixo foi extraído dele, e as posições dos trechos
          referem-se a este texto extraído.
        </p>
      )}
      {texto.confere_com_coleta === false && (
        <Mensagem tipo="aviso">
          O texto extraído agora é diferente do extraído na coleta (a versão do extrator pode ter mudado). Confira o trecho no documento original
          antes de decidir.
        </Mensagem>
      )}
      {texto.cpfs_descaracterizados && (
        <p className="mudo">
          O documento original traz CPF completo. Aqui todo CPF aparece descaracterizado (só os seis dígitos centrais); o original permanece
          íntegro na custódia, e o SHA-256 acima é o dele.
        </p>
      )}
      {texto.truncado && <Mensagem tipo="aviso">O texto foi cortado no limite do servidor: só o começo do documento aparece aqui.</Mensagem>}
      {hashMudou && (
        <Mensagem tipo="erro">
          O SHA-256 desta captura não é o da captura usada na extração. Verifique a integridade da captura antes de decidir.
        </Mensagem>
      )}
      {!local && (
        <Mensagem tipo="aviso">
          O trecho citado não foi encontrado no texto exibido{texto.truncado ? ' (o texto está cortado)' : ''}. Não aceite a sugestão sem conferir o
          documento original. Trecho citado: <q>{mascararCpfs(sugestao.trecho)}</q>
        </Mensagem>
      )}
      {local && !local.naPosicaoInformada && (
        <p className="mudo">O trecho foi localizado pelo conteúdo: não estava na posição registrada ({sugestao.posicao_inicio}).</p>
      )}
      <pre className="documento-ia" tabIndex={0} aria-label="Texto do documento">
        {local ? (
          <>
            {mascararCpfs(texto.texto.slice(0, local.inicio))}
            <mark ref={marca} className="trecho-citado" data-testid="trecho-destacado">
              {mascararCpfs(texto.texto.slice(local.inicio, local.fim))}
            </mark>
            {mascararCpfs(texto.texto.slice(local.fim))}
          </>
        ) : (
          mascararCpfs(texto.texto)
        )}
      </pre>
    </div>
  );
}

interface AndamentoExtracaoProps {
  progresso: ProgressoExtracaoIa;
  erroDeConsulta: string | null;
  consultaParada: boolean;
  erroDaAcao: string | null;
  acaoEmCurso: 'cancelar' | 'retomar' | null;
  aoCancelar: () => void;
  aoRetomar: () => void;
  aoConsultarDeNovo: () => void;
  aoDispensar: () => void;
}

/** Texto do bloco para quem não vê a cor: "Bloco 3: falhou (passou do tempo limite do bloco), 2 tentativas". */
function descricaoDoBloco(b: BlocoExtracaoIa): string {
  const partes = [`Bloco ${b.numero}: ${ROTULOS_BLOCO[b.situacao] ?? b.situacao}`];
  if (b.situacao === 'falho' && b.causa) partes[0] += ` (${rotuloCausaIa(b.causa)})`;
  if (b.tentativas > 1) partes.push(`${b.tentativas} tentativas`);
  if (b.duracao_ms > 0) partes.push(formatarDuracao(b.duracao_ms));
  if (b.pai_numero != null) partes.push(`metade do bloco ${b.pai_numero}, que foi dividido`);
  return partes.join(', ');
}

/** Barra de progresso por bloco, tempo, estimativa e os botões de cancelar e retomar de uma execução. */
export function AndamentoExtracao({ progresso: p, erroDeConsulta, consultaParada, erroDaAcao, acaoEmCurso, aoCancelar, aoRetomar, aoConsultarDeNovo, aoDispensar }: AndamentoExtracaoProps) {
  const { podeEscrever, motivoSomenteLeitura } = usePapelNoCaso();
  const idBarra = useId();
  const feitos = p.blocos_concluidos + p.blocos_falhos;
  const falhos = p.blocos.filter((b) => b.situacao === 'falho');
  const semBlocos = p.blocos_total === 0;

  let resumo: string;
  if (p.situacao === 'na_fila') {
    resumo = `Na fila${p.posicao_na_fila ? ` (posição ${p.posicao_na_fila})` : ''}. O servidor processa um documento por vez.`;
  } else if (semBlocos) {
    resumo = p.ativa ? 'Preparando o documento…' : 'Nenhum bloco foi processado.';
  } else {
    resumo = `Blocos concluídos: ${p.blocos_concluidos} de ${p.blocos_total}`;
    if (p.blocos_falhos > 0) resumo += ` · com falha: ${p.blocos_falhos}`;
    if (!p.ativa && p.blocos_pendentes > 0) resumo += ` · por fazer: ${p.blocos_pendentes}`;
  }

  let estimativa: string | null = null;
  if (p.situacao === 'em_andamento') {
    estimativa = p.estimativa_restante_ms == null ? 'estimativa depois do primeiro bloco' : `faltam cerca de ${formatarDuracao(p.estimativa_restante_ms)}`;
  }

  return (
    <article className={`br-card andamento-extracao andamento-extracao-${p.situacao}`} data-testid="andamento-extracao" aria-label={`Extração ${String(p.id)}`}>
      <header className="andamento-cabecalho">
        <span>
          Extração <code>{String(p.id)}</code> · captura <code>{String(p.captura_id)}</code>
        </span>
        <span className={`br-tag small situacao-coleta situacao-coleta-${p.situacao}`}>{rotuloExecucaoIa(p.situacao)}</span>
      </header>

      <p id={idBarra} className="andamento-rotulo" role="status" data-testid="andamento-resumo">
        {resumo}
      </p>
      {/* Sem blocos ainda (fila ou preparo), a barra fica indeterminada. */}
      <progress className="andamento-barra" aria-labelledby={idBarra} max={semBlocos ? undefined : p.blocos_total} value={semBlocos ? undefined : feitos} />

      {p.blocos.length > 0 && (
        <ol className="andamento-blocos" aria-label="Blocos do documento">
          {p.blocos.map((b) => (
            <li key={b.numero} className={`andamento-bloco andamento-bloco-${b.situacao}`} title={descricaoDoBloco(b)} data-testid="andamento-bloco">
              <span aria-hidden="true">{b.numero}</span>
              <span className="sr-only">{descricaoDoBloco(b)}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="mudo" data-testid="andamento-tempo">
        Tempo de processamento: {formatarDuracao(p.tempo_decorrido_ms)}
        {estimativa && <> · {estimativa}</>} · {contar(p.itens_aceitos, 'sugestão', 'sugestões')} até agora
        {p.itens_recusados > 0 && <>, {contar(p.itens_recusados, 'item recusado', 'itens recusados')} automaticamente</>}
        {p.retomadas > 0 && <> · retomada {contar(p.retomadas, 'vez', 'vezes')}</>}
      </p>

      {p.situacao === 'sucesso' && <Mensagem tipo="ok">Extração concluída: todos os blocos do documento foram processados. Revise as sugestões abaixo.</Mensagem>}
      {p.situacao === 'concluida_com_falhas' && (
        <Mensagem tipo="aviso">
          <strong>A extração terminou, mas {contar(p.blocos_falhos, 'bloco falhou', 'blocos falharam')}.</strong> As sugestões dos outros blocos estão gravadas e
          podem ser revisadas. &quot;Retomar&quot; tenta de novo só os blocos que falharam.
          {falhos.length > 0 && (
            <ul className="andamento-falhas">
              {falhos.map((b) => (
                <li key={b.numero}>
                  Bloco {b.numero}: {rotuloCausaIa(b.causa)}
                </li>
              ))}
            </ul>
          )}
        </Mensagem>
      )}
      {p.situacao === 'falha' && (
        <Mensagem tipo="erro">
          <strong>A extração falhou.</strong> {p.motivo || 'Nenhum bloco foi concluído.'} Depois de corrigir a causa, use &quot;Retomar&quot;.
        </Mensagem>
      )}
      {p.situacao === 'cancelada' && (
        <Mensagem tipo="info">
          <strong>Extração cancelada.</strong> Os blocos já concluídos e as sugestões deles continuam gravados. &quot;Retomar&quot; processa os blocos que faltaram.
        </Mensagem>
      )}
      {p.situacao === 'interrompida' && (
        <Mensagem tipo="aviso">
          <strong>A extração foi interrompida.</strong> {p.motivo || 'O serviço parou durante a execução.'}
        </Mensagem>
      )}
      {p.ativa && p.cancelamento_pedido && <Mensagem tipo="info">Cancelamento pedido: o modelo para assim que o servidor receber o pedido.</Mensagem>}
      {erroDeConsulta && !consultaParada && <Mensagem tipo="aviso">Não foi possível consultar o andamento agora ({erroDeConsulta}). A consulta será repetida; a extração continua no servidor.</Mensagem>}
      {consultaParada && (
        <Mensagem tipo="erro">
          A consulta do andamento falhou várias vezes seguidas ({erroDeConsulta ?? 'sem resposta'}). A extração pode continuar rodando no servidor.{' '}
          <button type="button" className="botao-link" onClick={aoConsultarDeNovo}>
            Consultar de novo
          </button>
        </Mensagem>
      )}
      {erroDaAcao && <Mensagem tipo="erro">{erroDaAcao}</Mensagem>}

      <div className="linha">
        {p.ativa && (
          <button type="button" className="br-button secondary small" onClick={aoCancelar} disabled={!podeEscrever || p.cancelamento_pedido || acaoEmCurso !== null} title={motivoSomenteLeitura ?? undefined}>
            {acaoEmCurso === 'cancelar' ? 'Cancelando…' : p.cancelamento_pedido ? 'Cancelamento pedido' : 'Cancelar extração'}
          </button>
        )}
        {p.retomavel && (
          <button type="button" className="br-button primary small" onClick={aoRetomar} disabled={!podeEscrever || acaoEmCurso !== null} title={motivoSomenteLeitura ?? undefined}>
            {acaoEmCurso === 'retomar' ? 'Retomando…' : 'Retomar extração'}
          </button>
        )}
        {!p.ativa && (
          <button type="button" className="br-button secondary small" onClick={aoDispensar}>
            Fechar este aviso
          </button>
        )}
      </div>
    </article>
  );
}

function ExecucaoIa({ extracao: e, progresso, aberta, aoRetomar }: { extracao: ExtracaoIa; progresso: ProgressoExtracaoIa | null; aberta: boolean; aoRetomar?: () => void }) {
  // A lista pode estar mais velha que o andamento acompanhado: a situação e as contagens vêm dele.
  const situacao = progresso?.situacao ?? e.situacao;
  const motivo = progresso ? progresso.motivo : e.motivo;
  const aceitos = progresso?.itens_aceitos ?? e.itens_aceitos;
  const recusados = progresso?.itens_recusados ?? e.itens_recusados;
  const emCurso = situacao === 'na_fila' || situacao === 'em_andamento';
  return (
    <details className="br-card execucao-ia" open={aberta} data-testid="execucao-ia">
      <summary>
        <code>{String(e.id)}</code> · captura <code>{String(e.captura_id)}</code> · {formatarData(e.iniciado_em)} · por {e.usuario} ·{' '}
        <span className={`br-tag small situacao-coleta situacao-coleta-${situacao}`}>{rotuloExecucaoIa(situacao)}</span> · {contar(aceitos, 'sugestão', 'sugestões')},{' '}
        {contar(recusados, 'recusado')} automaticamente
      </summary>
      {motivo && !emCurso && <Mensagem tipo={situacao === 'falha' ? 'erro' : 'aviso'}>{situacao === 'falha' ? 'A extração falhou: ' : ''}{motivo}</Mensagem>}
      {progresso && progresso.blocos_total > 0 && (
        <p className="mudo" data-testid="execucao-blocos">
          Blocos concluídos: {progresso.blocos_concluidos} de {progresso.blocos_total}
          {progresso.blocos_falhos > 0 && <> · com falha: {progresso.blocos_falhos}</>}
          {progresso.blocos_pendentes > 0 && <> · por fazer: {progresso.blocos_pendentes}</>} · tempo de processamento: {formatarDuracao(progresso.tempo_decorrido_ms)}
        </p>
      )}
      {aoRetomar && (
        <button type="button" className="br-button secondary small" onClick={aoRetomar}>
          Retomar esta extração
        </button>
      )}
      <dl className="tipologia-catalogo-dl">
        <dt>Modelo</dt>
        <dd>
          <code>{e.modelo}</code> ({e.provedor}){e.modelo_versao && <> · versão <code className="quebra">{e.modelo_versao}</code></>}
          {e.servidor_versao && <> · servidor {e.servidor_versao}</>}
        </dd>
        <dt>Prompt (SHA-256)</dt>
        <dd>{e.prompt_sha256 ? <Hash valor={e.prompt_sha256} /> : '—'}</dd>
        <dt>Captura (SHA-256)</dt>
        <dd>{e.captura_sha256 ? <Hash valor={e.captura_sha256} /> : '—'}</dd>
        <dt>Itens</dt>
        <dd>
          {contar(e.itens_recebidos, 'devolvido')} pelo modelo em {contar(e.blocos, 'bloco')} de texto
        </dd>
      </dl>
      <TabelaChaveValor dados={e.parametros} titulo="Parâmetros do modelo" />
      <h4>Itens recusados automaticamente ({e.recusas.length})</h4>
      {e.recusas.length === 0 ? (
        <p className="vazio">Nenhum item recusado nesta execução.</p>
      ) : (
        <Tabela rotulo={`Itens recusados automaticamente na extração ${String(e.id)}`}>
          <thead>
            <tr>
              <th scope="col">Motivo</th>
              <th scope="col">Tipo</th>
              <th scope="col">Valor</th>
              <th scope="col">Trecho informado</th>
            </tr>
          </thead>
          <tbody>
            {e.recusas.map((r, i) => (
              <tr key={`${r.motivo}-${i}`} data-testid="recusa-ia">
                <td>
                  {rotuloRecusaIa(r.motivo)}
                  <div className="mudo">
                    <code>{r.motivo}</code>
                  </div>
                </td>
                <td>{ROTULOS_TIPO[r.tipo] ?? (r.tipo || '—')}</td>
                <td className="quebra">{mascararCpfs(r.valor) || '—'}</td>
                <td className="quebra">{mascararCpfs(r.trecho) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </details>
  );
}
