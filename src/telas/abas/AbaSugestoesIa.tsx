import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  mensagemDeErro,
  mesmoId,
  type ColetaRegistro,
  type DecisaoSugestaoIaValor,
  type ExtracaoIa,
  type IaEstado,
  type Id,
  type SituacaoSugestaoIa,
  type SugestaoIa,
  type TextoCaptura,
} from '../../api';
import { Campo, Carregando, Hash, Mensagem, Tabela, TabelaChaveValor, formatarData } from '../../componentes/basicos';
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
}

/**
 * Extração assistida por IA local (RF13, RNF05, H22): revisão lado a lado. À
 * esquerda, as sugestões; à direita, o texto do documento com o trecho citado
 * em destaque. Nada vira entidade sem a decisão de um investigador.
 */
export function AbaSugestoesIa({ casoId, ia, capturaInicial = null, aoAbrirEntidade, aoMudar }: AbaSugestoesIaProps) {
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

  const carregarSugestoes = () => sugestoes.executar(() => cliente.listarSugestoesIa(casoId));
  const carregarExtracoes = () => extracoes.executar(() => cliente.listarExtracoesIa(casoId));

  useEffect(() => {
    void carregarSugestoes();
    void carregarExtracoes();
    void coletas.executar(() => cliente.listarColetas(casoId));
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

  async function extrair(e: FormEvent) {
    e.preventDefault();
    if (!capturaEscolhida || !ia?.ativa || !podeEscrever) return;
    const r = await extracao.executar(() => cliente.extrairComIa(casoId, capturaEscolhida));
    // Mesmo quando a extração falha (502), ela fica registrada: a lista de execuções mostra o motivo.
    await Promise.all([carregarSugestoes(), carregarExtracoes()]);
    if (r) {
      setFiltro('pendente');
      setSelecionada(r.sugestoes[0]?.id ?? null);
      aoMudar?.();
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
          <button type="submit" className="br-button primary small" disabled={!capturaEscolhida || extracao.carregando || !podeEscrever} title={motivoSomenteLeitura ?? undefined}>
            {extracao.carregando ? 'Extraindo…' : 'Extrair com IA'}
          </button>
          {motivoSomenteLeitura && (
            <span className="campo-dica" data-testid="ia-somente-leitura">
              {motivoSomenteLeitura}
            </span>
          )}
        </form>
      )}
      {extracao.carregando && <Carregando texto="O modelo local está lendo o documento. Pode levar alguns minutos." />}
      {extracao.erro && <Mensagem tipo="erro">{extracao.erro}</Mensagem>}
      {extracao.dados && (
        <Mensagem tipo="ok">
          Extração {String(extracao.dados.id)} concluída: {extracao.dados.itens_recebidos} item(ns) devolvido(s) pelo modelo,{' '}
          {extracao.dados.itens_aceitos} virou(aram) sugestão pendente e {extracao.dados.itens_recusados} foi(ram) recusado(s)
          automaticamente (veja os motivos em &quot;Execuções da extração&quot;).
        </Mensagem>
      )}

      <div className="painel-cabecalho">
        <p role="status" data-testid="resumo-sugestoes">
          {contagem('pendente')} pendente(s) de decisão · {contagem('aceita')} aceita(s) · {contagem('recusada')} recusada(s)
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
        {(extracoes.dados ?? []).map((e, i) => (
          <ExecucaoIa key={String(e.id)} extracao={e} aberta={i === 0} />
        ))}
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
          ? `texto extraído do PDF${texto.paginas ? ` (${texto.paginas} página(s))` : ''}${texto.extrator ? ` por ${texto.extrator}` : ''}`
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

function ExecucaoIa({ extracao: e, aberta }: { extracao: ExtracaoIa; aberta: boolean }) {
  return (
    <details className="br-card execucao-ia" open={aberta} data-testid="execucao-ia">
      <summary>
        <code>{String(e.id)}</code> · captura <code>{String(e.captura_id)}</code> · {formatarData(e.iniciado_em)} · por {e.usuario} ·{' '}
        <span className={`br-tag small situacao-coleta situacao-coleta-${e.situacao}`}>{e.situacao}</span> · {e.itens_aceitos} sugestão(ões), {e.itens_recusados}{' '}
        recusado(s) automaticamente
      </summary>
      {e.motivo && <Mensagem tipo="erro">A extração falhou: {e.motivo}</Mensagem>}
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
          {e.itens_recebidos} devolvido(s) pelo modelo em {e.blocos} bloco(s) de texto
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
