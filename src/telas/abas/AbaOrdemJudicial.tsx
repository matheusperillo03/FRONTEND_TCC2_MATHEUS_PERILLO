import { useEffect, useState, type FormEvent } from 'react';
import {
  mesmoId,
  type ContaJudicial,
  type DecisaoJudicial,
  type EstadoImportacaoJudicial,
  type FiltroRegistrosJudiciais,
  type Id,
  type ImportacaoJudicial,
  type NovaDecisaoJudicial,
  type OrigemImportacaoJudicial,
  type PaginaRegistrosJudiciais,
  type RegistroJudicial,
  type TipoArquivoJudicial,
} from '../../api';
import { Campo, Carregando, Hash, Mensagem, Tabela, contar, formatarData, formatarDia, formatarValor } from '../../componentes/basicos';
import { mascararCpfs } from '../../privacidade';
import { usePapelNoCaso } from '../../sessao/PapelContext';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

const ROTULOS_ORIGEM: Record<string, string> = { simba: 'SIMBA', oficio: 'Ofício', midia: 'Mídia' };

/** Registros por página na consulta (o back-end aceita de 1 a 200). */
const REGISTROS_POR_PAGINA = 50;

const CONTA_VAZIA: ContaJudicial = { banco: '', agencia: '', conta: '' };

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Campo cujo nome indica documento de pessoa: 11 dígitos ali são CPF, mesmo sem a palavra por perto (RNF04). */
const CAMPO_DE_DOCUMENTO = /cpf|titular|documento/i;

function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Valor de um campo importado. O back-end já devolve o CPF descaracterizado, a data em ISO e o
 * valor em reais; a tela formata e aplica `mascararCpfs` como última barreira.
 */
export function valorDoCampoJudicial(chave: string, valor: unknown): string {
  if (typeof valor === 'number') return /valor/i.test(chave) ? formatarReais(valor) : formatarValor(valor);
  const texto = formatarValor(valor);
  return mascararCpfs(DATA_ISO.test(texto) ? formatarDia(texto) : texto, { contextoCpf: CAMPO_DE_DOCUMENTO.test(chave) });
}

/** Investigado de uma decisão: CNPJ como veio; CPF só no formato `***NNNNNN**`. */
function investigado(texto: string): string {
  return mascararCpfs(texto, { contextoCpf: true });
}

/** CPFs e CNPJs digitados, um por linha ou separados por vírgula ou ponto e vírgula. */
function lerInvestigados(texto: string): string[] {
  return texto
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface AbaOrdemJudicialProps {
  casoId: Id;
  /** Estado do módulo (`GET /importacao-judicial/estado`). A tela do caso só mostra esta aba com `ativa: true`. */
  estado: EstadoImportacaoJudicial;
}

/**
 * RF10: importação sob ordem judicial. Módulo separado do dado aberto: o que entra aqui não vai
 * para entidades, grafo, relatório nem exportações. Nada é importado sem uma decisão judicial
 * registrada, e cada chamada (inclusive as consultas desta tela) fica na auditoria (RNF02).
 */
export function AbaOrdemJudicial({ casoId, estado }: AbaOrdemJudicialProps) {
  const { cliente, me } = useSessao();
  const { podeEscrever, motivoSomenteLeitura } = usePapelNoCaso();
  const decisoes = useChamada<DecisaoJudicial[]>();
  const importacoes = useChamada<ImportacaoJudicial[]>();
  const importacao = useChamada<ImportacaoJudicial>();
  const registros = useChamada<PaginaRegistrosJudiciais>();
  /** Decisão sob a qual se importa. Sem ela, o formulário de importação não existe. */
  const [decisaoEscolhida, setDecisaoEscolhida] = useState<string | null>(null);

  // Importação
  const [diretorio, setDiretorio] = useState('');
  const [origem, setOrigem] = useState<string>(estado.origens[0] ?? 'simba');
  const [descricaoOrigem, setDescricaoOrigem] = useState('');

  // Registros
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroQuarentena, setFiltroQuarentena] = useState<'' | 'true' | 'false'>('');
  const [filtroDecisao, setFiltroDecisao] = useState('');
  const [deslocamento, setDeslocamento] = useState(0);

  const perfil = me?.perfil ?? '';
  const perfilAutorizado = perfil !== '' && estado.perfis_autorizados.includes(perfil);
  const perfisTexto = estado.perfis_autorizados.join(' ou ') || 'autorizado';

  const carregarDecisoes = () => decisoes.executar(() => cliente.listarDecisoesJudiciais(casoId));
  const carregarImportacoes = () => importacoes.executar(() => cliente.listarImportacoesJudiciais(casoId));

  useEffect(() => {
    void carregarDecisoes();
    void carregarImportacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId]);

  const listaDecisoes = decisoes.dados ?? [];
  const escolhida = listaDecisoes.find((d) => mesmoId(d.id, decisaoEscolhida)) ?? null;
  const importacaoValida = diretorio.trim().length > 0 && origem !== '';

  async function importar(e: FormEvent) {
    e.preventDefault();
    if (!escolhida || !importacaoValida || !podeEscrever) return;
    const corpo = { diretorio: diretorio.trim(), origem: origem as OrigemImportacaoJudicial, ...(descricaoOrigem.trim() ? { descricao_origem: descricaoOrigem.trim() } : {}) };
    const r = await importacao.executar(() => cliente.importarSobOrdemJudicial(casoId, escolhida.id, corpo));
    if (r) {
      await carregarImportacoes();
      await carregarDecisoes();
    }
  }

  function consultarRegistros(novoDeslocamento = 0) {
    const filtro: FiltroRegistrosJudiciais = { limite: REGISTROS_POR_PAGINA, deslocamento: novoDeslocamento };
    if (filtroDecisao) filtro.decisao_id = filtroDecisao;
    if (filtroTipo) filtro.tipo = filtroTipo as TipoArquivoJudicial;
    if (filtroQuarentena) filtro.quarentena = filtroQuarentena === 'true';
    setDeslocamento(novoDeslocamento);
    void registros.executar(() => cliente.listarRegistrosJudiciais(casoId, filtro));
  }

  const pagina = registros.dados;
  // O relatório da importação recém-feita vem em destaque; as demais ficam no histórico.
  const anteriores = (importacoes.dados ?? []).filter((i) => !mesmoId(i.id, importacao.dados?.id));

  return (
    <div className="ordem-judicial">
      <div data-testid="faixa-sigilo" className="faixa-sigilo">
        <Mensagem tipo="aviso">
          <strong>Dado sigiloso, obtido sob ordem judicial.</strong> Neste protótipo, <strong>só dados sintéticos</strong>
          {estado.somente_sintetico && <> (o servidor recusa pasta sem o marcador SINTETICO)</>}. Este módulo é{' '}
          <strong>separado do dado aberto</strong>: o que entra aqui fica fora do relatório, do grafo e das exportações.{' '}
          <strong>Cada acesso fica na auditoria</strong>, inclusive abrir esta aba e consultar os registros.
          <div className="mudo">Leiaute dos arquivos: {estado.leiaute || 'não informado pelo servidor'}.</div>
        </Mensagem>
      </div>

      <section aria-labelledby="decisoes-judiciais-titulo">
        <div className="painel-cabecalho">
          <h3 id="decisoes-judiciais-titulo">Decisões judiciais registradas</h3>
          <button type="button" className="br-button secondary small" onClick={() => void carregarDecisoes()} disabled={decisoes.carregando}>
            Atualizar
          </button>
        </div>
        {decisoes.carregando && !decisoes.dados && <Carregando />}
        {decisoes.erro && <Mensagem tipo="erro">{decisoes.erro}</Mensagem>}
        {decisoes.dados && listaDecisoes.length === 0 && (
          <p className="vazio">Nenhuma decisão judicial registrada neste caso. Sem decisão registrada, nada é importado.</p>
        )}
        {listaDecisoes.length > 0 && (
          <Tabela rotulo="Decisões judiciais do caso" className="tabela-decisoes-judiciais">
            <thead>
              <tr>
                <th scope="col">Processo e decisão</th>
                <th scope="col">Juízo e data</th>
                <th scope="col">Período e contas</th>
                <th scope="col">Escopo</th>
                <th scope="col">Marca</th>
                <th scope="col">Registro</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listaDecisoes.map((d) => {
                const ativa = mesmoId(d.id, decisaoEscolhida);
                return (
                  <tr key={String(d.id)} data-testid="decisao-judicial" className={ativa ? 'linha-ativa' : undefined}>
                    <td className="quebra">
                      <code>{d.numero_processo}</code>
                      <div>{d.numero_decisao}</div>
                    </td>
                    <td>
                      {d.juizo}
                      <div className="mudo">decisão de {formatarDia(d.data_decisao)}</div>
                    </td>
                    <td>
                      {formatarDia(d.periodo_inicio)} a {formatarDia(d.periodo_fim)}
                      {d.contas.map((c, i) => (
                        <div key={i} className="mudo">
                          banco {c.banco}, agência {c.agencia}, conta {c.conta}
                        </div>
                      ))}
                    </td>
                    <td className="quebra">
                      {d.descricao_escopo}
                      {d.investigados.length > 0 && <div className="mudo">Investigados: {d.investigados.map(investigado).join(', ')}</div>}
                    </td>
                    <td>
                      <span className="br-tag small etiqueta-sigiloso" data-testid="marca-sigilo">
                        {d.marca}
                      </span>
                    </td>
                    <td>
                      {d.registrado_por}
                      <div className="mudo">{formatarData(d.registrado_em)}</div>
                      <div className="mudo">{contar(d.importacoes, 'importação', 'importações')}</div>
                    </td>
                    <td>
                      <button type="button" className="br-button secondary small" aria-pressed={ativa} onClick={() => setDecisaoEscolhida(ativa ? null : String(d.id))}>
                        {ativa ? 'Decisão escolhida' : 'Importar sob esta decisão'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </section>

      <section aria-labelledby="registrar-decisao-titulo" className="secao-judicial">
        <h3 id="registrar-decisao-titulo">Registrar decisão judicial</h3>
        {perfilAutorizado && podeEscrever ? (
          <FormularioDecisao
            casoId={casoId}
            aoRegistrar={async (nova) => {
              await carregarDecisoes();
              setDecisaoEscolhida(String(nova.id));
            }}
          />
        ) : (
          <div data-testid="sem-permissao-decisao">
            <Mensagem tipo="info">
              {perfilAutorizado ? (
                <>{motivoSomenteLeitura ?? 'Seu papel neste caso não permite registrar a decisão.'} Registrar a decisão exige o papel de investigador ou de responsável no caso.</>
              ) : (
                <>
                  Só o perfil <strong>{perfisTexto}</strong> registra a decisão judicial que autoriza a importação
                  {perfil ? <> (seu perfil é {perfil})</> : null}. As decisões já registradas continuam visíveis acima; o
                  servidor recusa o registro por outros perfis (403) e guarda a tentativa na auditoria.
                </>
              )}
            </Mensagem>
          </div>
        )}
      </section>

      <section aria-labelledby="importar-judicial-titulo" className="secao-judicial">
        <h3 id="importar-judicial-titulo">Importar arquivos sob a decisão</h3>
        {!escolhida ? (
          <p className="vazio" data-testid="sem-decisao-escolhida">
            {listaDecisoes.length === 0
              ? 'A importação só abre depois que uma decisão judicial for registrada.'
              : 'Escolha acima a decisão judicial que autoriza a importação. Sem decisão escolhida, nada é importado.'}
          </p>
        ) : (
          <form className="formulario" aria-label="Importação sob ordem judicial" onSubmit={importar}>
            <p>
              Importando sob: <span className="br-tag small etiqueta-sigiloso">{escolhida.marca}</span>
            </p>
            <p className="mudo">
              Linha válida no leiaute, mas fora do escopo da decisão (conta ou período), vai para a <strong>quarentena</strong>:
              fica guardada e marcada, com o motivo. Linha inválida é rejeitada e não é guardada.
            </p>
            <div className="grade-2">
              <Campo rotulo="Diretório com os arquivos" dica="Pasta relativa à raiz configurada no servidor (IMPORTACAO_JUDICIAL_DIR_BASE). Só pasta sintética, com o marcador SINTETICO.">
                <input type="text" value={diretorio} onChange={(e) => setDiretorio(e.target.value)} placeholder="caso-sintetico" maxLength={500} required />
              </Campo>
              <Campo rotulo="Origem">
                <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                  {estado.origens.map((o) => (
                    <option key={o} value={o}>
                      {ROTULOS_ORIGEM[o] ?? o}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Descrição da origem (opcional)">
                <input type="text" value={descricaoOrigem} onChange={(e) => setDescricaoOrigem(e.target.value)} maxLength={300} />
              </Campo>
            </div>
            <div className="linha">
              <button type="submit" className="br-button primary small" disabled={!importacaoValida || importacao.carregando || !podeEscrever} title={motivoSomenteLeitura ?? undefined}>
                {importacao.carregando ? 'Importando…' : 'Importar arquivos'}
              </button>
              {motivoSomenteLeitura && <span className="mudo">{motivoSomenteLeitura}</span>}
            </div>
            {importacao.erro && <Mensagem tipo="erro">A importação foi recusada: {importacao.erro}</Mensagem>}
          </form>
        )}
        {importacao.dados && <RelatorioImportacao importacao={importacao.dados} recente />}
      </section>

      <section aria-labelledby="importacoes-judiciais-titulo" className="secao-judicial">
        <h3 id="importacoes-judiciais-titulo">Importações deste caso</h3>
        {importacoes.erro && <Mensagem tipo="erro">{importacoes.erro}</Mensagem>}
        {importacoes.dados && importacoes.dados.length === 0 && <p className="vazio">Nenhuma importação feita neste caso.</p>}
        {anteriores.map((i) => (
          <details key={String(i.id)} className="diferencas" data-testid="importacao-anterior">
            <summary>
              {formatarData(i.importado_em)} · {ROTULOS_ORIGEM[i.origem] ?? i.origem} · {contar(i.totais.aceitas, 'linha aceita', 'linhas aceitas')}, {contar(i.totais.rejeitadas, 'rejeitada')},{' '}
              {i.totais.em_quarentena} em quarentena
            </summary>
            <RelatorioImportacao importacao={i} />
          </details>
        ))}
      </section>

      <section aria-labelledby="registros-judiciais-titulo" className="secao-judicial">
        <h3 id="registros-judiciais-titulo">Registros importados</h3>
        <p className="mudo">A consulta é feita quando você pede, porque cada consulta fica na auditoria. CPF aparece sempre descaracterizado.</p>
        <form
          className="linha"
          aria-label="Consulta dos registros importados"
          onSubmit={(e) => {
            e.preventDefault();
            consultarRegistros(0);
          }}
        >
          <Campo rotulo="Tipo de arquivo" emLinha>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">todos</option>
              {estado.arquivos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Quarentena" emLinha>
            <select value={filtroQuarentena} onChange={(e) => setFiltroQuarentena(e.target.value as typeof filtroQuarentena)}>
              <option value="">todos</option>
              <option value="true">só em quarentena</option>
              <option value="false">só fora da quarentena</option>
            </select>
          </Campo>
          <Campo rotulo="Decisão" emLinha>
            <select value={filtroDecisao} onChange={(e) => setFiltroDecisao(e.target.value)}>
              <option value="">todas</option>
              {listaDecisoes.map((d) => (
                <option key={String(d.id)} value={String(d.id)}>
                  {d.numero_decisao}
                </option>
              ))}
            </select>
          </Campo>
          <button type="submit" className="br-button secondary small" disabled={registros.carregando}>
            {registros.carregando ? 'Consultando…' : 'Consultar registros'}
          </button>
        </form>
        {registros.erro && <Mensagem tipo="erro">{registros.erro}</Mensagem>}
        {pagina && (
          <>
            <p role="status" data-testid="total-registros">
              {contar(pagina.total, 'registro')} com os filtros escolhidos
              {pagina.total > pagina.itens.length && (
                <>
                  ; mostrando de {deslocamento + 1} a {deslocamento + pagina.itens.length}
                </>
              )}
              .
            </p>
            {pagina.itens.length > 0 && (
              <Tabela rotulo="Registros importados sob ordem judicial" className="tabela-registros-judiciais">
                <thead>
                  <tr>
                    <th scope="col">Arquivo e linha</th>
                    <th scope="col">Campos</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Marca</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.itens.map((r) => (
                    <LinhaRegistro key={String(r.id)} registro={r} />
                  ))}
                </tbody>
              </Tabela>
            )}
            {pagina.total > REGISTROS_POR_PAGINA && (
              <div className="linha">
                <button type="button" className="br-button secondary small" disabled={deslocamento === 0 || registros.carregando} onClick={() => consultarRegistros(Math.max(0, deslocamento - REGISTROS_POR_PAGINA))}>
                  Página anterior
                </button>
                <button
                  type="button"
                  className="br-button secondary small"
                  disabled={deslocamento + pagina.itens.length >= pagina.total || registros.carregando}
                  onClick={() => consultarRegistros(deslocamento + REGISTROS_POR_PAGINA)}
                >
                  Próxima página
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Linha importada: os campos, a marca de sigilo e, em quarentena, o destaque com o motivo. */
function LinhaRegistro({ registro: r }: { registro: RegistroJudicial }) {
  return (
    <tr data-testid="registro-judicial" className={r.quarentena ? 'linha-quarentena' : undefined}>
      <td>
        <code>{r.tipo}</code>
        <div className="mudo">linha {r.linha}</div>
      </td>
      <td>
        <dl className="campos-registro">
          {Object.entries(r.campos ?? {}).map(([chave, valor]) => (
            <div key={chave}>
              <dt>{chave}</dt>
              <dd>{valorDoCampoJudicial(chave, valor)}</dd>
            </div>
          ))}
        </dl>
      </td>
      <td>
        {r.quarentena ? (
          <>
            <span className="br-tag small etiqueta-quarentena" data-testid="selo-quarentena">
              em quarentena
            </span>
            <div className="quebra">Motivo: {mascararCpfs(r.motivo_quarentena) || 'o servidor não informou o motivo.'}</div>
            <div className="mudo">Fora do escopo da decisão: não use sem nova autorização judicial.</div>
          </>
        ) : (
          'dentro do escopo'
        )}
      </td>
      <td>
        <span className="br-tag small etiqueta-sigiloso">{r.marca}</span>
      </td>
    </tr>
  );
}

/** Relatório de validação de uma importação, arquivo a arquivo, com as rejeições e o SHA-256. */
export function RelatorioImportacao({ importacao: i, recente = false }: { importacao: ImportacaoJudicial; recente?: boolean }) {
  const comRejeicao = i.arquivos.filter((a) => a.rejeicoes.length > 0);
  return (
    <section className="br-card comparacao" aria-label={`Relatório de validação da importação ${String(i.id)}`} data-testid="relatorio-importacao">
      <h4>{recente ? 'Importação concluída: relatório de validação' : 'Relatório de validação'}</h4>
      <p>
        <span className="br-tag small etiqueta-sigiloso">{i.marca}</span>
      </p>
      <p className="mudo">
        Origem: {ROTULOS_ORIGEM[i.origem] ?? i.origem}
        {i.descricao_origem ? ` (${i.descricao_origem})` : ''} · importado por {i.importado_por} em {formatarData(i.importado_em)}
      </p>
      <Mensagem tipo={i.totais.rejeitadas > 0 || i.totais.em_quarentena > 0 ? 'aviso' : 'ok'}>
        <span data-testid="totais-importacao">
          {contar(i.totais.linhas, 'linha lida', 'linhas lidas')}: {contar(i.totais.aceitas, 'aceita')}, {contar(i.totais.rejeitadas, 'rejeitada')} e{' '}
          {i.totais.em_quarentena} em quarentena.
        </span>{' '}
        As aceitas incluem as que foram para a quarentena.
      </Mensagem>
      <Tabela rotulo={`Validação por arquivo da importação ${String(i.id)}`}>
        <thead>
          <tr>
            <th scope="col">Arquivo</th>
            <th scope="col">Linhas</th>
            <th scope="col">Aceitas</th>
            <th scope="col">Rejeitadas</th>
            <th scope="col">Em quarentena</th>
            <th scope="col">Tamanho</th>
            <th scope="col">SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {i.arquivos.map((a) => (
            <tr key={a.nome_arquivo} data-testid="arquivo-importado">
              <th scope="row">
                <code>{a.tipo}</code>
                <div className="mudo quebra">{a.nome_arquivo}</div>
              </th>
              <td>{a.linhas}</td>
              <td>{a.aceitas}</td>
              <td>{a.rejeitadas > 0 ? <strong>{a.rejeitadas}</strong> : a.rejeitadas}</td>
              <td>{a.em_quarentena > 0 ? <strong>{a.em_quarentena}</strong> : a.em_quarentena}</td>
              <td>{formatarValor(a.tamanho_bytes)} bytes</td>
              <td>
                <Hash valor={a.sha256} />
              </td>
            </tr>
          ))}
        </tbody>
      </Tabela>
      {comRejeicao.length === 0 ? (
        <p className="mudo">Nenhuma linha rejeitada.</p>
      ) : (
        <>
          <h5>Linhas rejeitadas</h5>
          <ul className="lista-simples">
            {comRejeicao.flatMap((a) =>
              a.rejeicoes.map((rejeicao, n) => (
                <li key={`${a.nome_arquivo}-${rejeicao.linha}-${n}`} data-testid="rejeicao-importacao">
                  <code>{a.nome_arquivo}</code>, linha {rejeicao.linha}, campo <code>{rejeicao.campo}</code>: {mascararCpfs(rejeicao.motivo)}
                </li>
              )),
            )}
          </ul>
        </>
      )}
    </section>
  );
}

interface PropsFormularioDecisao {
  casoId: Id;
  aoRegistrar: (decisao: DecisaoJudicial) => Promise<void> | void;
}

/** Formulário da decisão judicial: todos os campos são obrigatórios, menos os investigados. */
function FormularioDecisao({ casoId, aoRegistrar }: PropsFormularioDecisao) {
  const { cliente } = useSessao();
  const registro = useChamada<DecisaoJudicial>();
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [numeroDecisao, setNumeroDecisao] = useState('');
  const [juizo, setJuizo] = useState('');
  const [dataDecisao, setDataDecisao] = useState('');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [contas, setContas] = useState<ContaJudicial[]>([{ ...CONTA_VAZIA }]);
  const [investigados, setInvestigados] = useState('');
  const [escopo, setEscopo] = useState('');
  /** As pendências só aparecem depois da primeira tentativa de registrar. */
  const [tentou, setTentou] = useState(false);

  const contasPreenchidas = contas
    .map((c) => ({ banco: c.banco.trim(), agencia: c.agencia.trim(), conta: c.conta.trim() }))
    .filter((c) => c.banco || c.agencia || c.conta);
  const contaIncompleta = contasPreenchidas.some((c) => !c.banco || !c.agencia || !c.conta);

  const faltas: Record<string, boolean> = {
    numero_processo: !numeroProcesso.trim(),
    numero_decisao: !numeroDecisao.trim(),
    juizo: !juizo.trim(),
    data_decisao: !DATA_ISO.test(dataDecisao),
    periodo_inicio: !DATA_ISO.test(periodoInicio),
    periodo_fim: !DATA_ISO.test(periodoFim),
    descricao_escopo: !escopo.trim(),
  };
  const pendencias: string[] = [];
  if (faltas.numero_processo) pendencias.push('número do processo');
  if (faltas.numero_decisao) pendencias.push('número ou identificação da decisão');
  if (faltas.juizo) pendencias.push('juízo');
  if (faltas.data_decisao) pendencias.push('data da decisão');
  if (faltas.periodo_inicio) pendencias.push('início do período');
  if (faltas.periodo_fim) pendencias.push('fim do período');
  if (!faltas.periodo_inicio && !faltas.periodo_fim && periodoInicio > periodoFim) pendencias.push('período: o fim não pode ser anterior ao início');
  if (contasPreenchidas.length === 0) pendencias.push('ao menos uma conta (banco, agência e conta)');
  else if (contaIncompleta) pendencias.push('banco, agência e número de cada conta informada');
  if (faltas.descricao_escopo) pendencias.push('escopo da decisão');

  function mudarConta(indice: number, campo: keyof ContaJudicial, valor: string) {
    setContas((atual) => atual.map((c, i) => (i === indice ? { ...c, [campo]: valor } : c)));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    const corpo: NovaDecisaoJudicial = {
      numero_processo: numeroProcesso.trim(),
      numero_decisao: numeroDecisao.trim(),
      juizo: juizo.trim(),
      data_decisao: dataDecisao,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      contas: contasPreenchidas,
      descricao_escopo: escopo.trim(),
    };
    const lista = lerInvestigados(investigados);
    if (lista.length) corpo.investigados = lista;
    const nova = await registro.executar(() => cliente.registrarDecisaoJudicial(casoId, corpo));
    if (!nova) return;
    setNumeroProcesso('');
    setNumeroDecisao('');
    setJuizo('');
    setDataDecisao('');
    setPeriodoInicio('');
    setPeriodoFim('');
    setContas([{ ...CONTA_VAZIA }]);
    setInvestigados('');
    setEscopo('');
    setTentou(false);
    await aoRegistrar(nova);
  }

  const invalido = (campo: string) => tentou && faltas[campo];

  return (
    <form className="formulario" aria-label="Registro da decisão judicial" onSubmit={enviar} noValidate>
      <p className="mudo">
        A decisão delimita o que pode ser importado: as contas e o período. Todos os campos são obrigatórios, menos os
        investigados.
      </p>
      <div className="grade-2">
        <Campo rotulo="Número do processo">
          <input type="text" value={numeroProcesso} onChange={(e) => setNumeroProcesso(e.target.value)} placeholder="0000000-00.0000.0.00.0000" maxLength={100} required aria-invalid={invalido('numero_processo')} />
        </Campo>
        <Campo rotulo="Número ou identificação da decisão">
          <input type="text" value={numeroDecisao} onChange={(e) => setNumeroDecisao(e.target.value)} maxLength={100} required aria-invalid={invalido('numero_decisao')} />
        </Campo>
        <Campo rotulo="Juízo">
          <input type="text" value={juizo} onChange={(e) => setJuizo(e.target.value)} maxLength={200} required aria-invalid={invalido('juizo')} />
        </Campo>
        <Campo rotulo="Data da decisão">
          <input type="date" value={dataDecisao} onChange={(e) => setDataDecisao(e.target.value)} required aria-invalid={invalido('data_decisao')} />
        </Campo>
        <Campo rotulo="Início do período autorizado">
          <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} required aria-invalid={invalido('periodo_inicio')} />
        </Campo>
        <Campo rotulo="Fim do período autorizado">
          <input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} required aria-invalid={invalido('periodo_fim')} />
        </Campo>
      </div>
      <fieldset>
        <legend>Contas autorizadas pela decisão (ao menos uma)</legend>
        {contas.map((c, i) => (
          <div key={i} className="linha" data-testid="conta-da-decisao">
            <Campo rotulo={`Banco (conta ${i + 1})`}>
              <input type="text" inputMode="numeric" value={c.banco} onChange={(e) => mudarConta(i, 'banco', e.target.value)} maxLength={10} />
            </Campo>
            <Campo rotulo={`Agência (conta ${i + 1})`}>
              <input type="text" inputMode="numeric" value={c.agencia} onChange={(e) => mudarConta(i, 'agencia', e.target.value)} maxLength={20} />
            </Campo>
            <Campo rotulo={`Número da conta (conta ${i + 1})`}>
              <input type="text" value={c.conta} onChange={(e) => mudarConta(i, 'conta', e.target.value)} maxLength={30} />
            </Campo>
            {contas.length > 1 && (
              <button type="button" className="br-button secondary small" onClick={() => setContas((atual) => atual.filter((_, j) => j !== i))}>
                Remover conta {i + 1}
              </button>
            )}
          </div>
        ))}
        <div className="linha">
          <button type="button" className="br-button secondary small" onClick={() => setContas((atual) => [...atual, { ...CONTA_VAZIA }])}>
            Acrescentar conta
          </button>
        </div>
      </fieldset>
      <Campo rotulo="Investigados (opcional)" tipo="textarea" dica="CPF ou CNPJ, um por linha, só dígitos ou formatado. O CPF é guardado e mostrado só descaracterizado (***NNNNNN**).">
        <textarea value={investigados} onChange={(e) => setInvestigados(e.target.value)} rows={2} />
      </Campo>
      <Campo rotulo="Escopo da decisão" tipo="textarea" dica="O que a decisão autoriza, em uma ou duas frases.">
        <textarea value={escopo} onChange={(e) => setEscopo(e.target.value)} rows={2} maxLength={1000} required aria-invalid={invalido('descricao_escopo')} />
      </Campo>
      {tentou && pendencias.length > 0 && (
        <div data-testid="pendencias-decisao">
          <Mensagem tipo="aviso">A decisão não foi registrada. Falta informar: {pendencias.join('; ')}.</Mensagem>
        </div>
      )}
      <div className="linha">
        <button type="submit" className="br-button primary small" disabled={registro.carregando}>
          {registro.carregando ? 'Registrando…' : 'Registrar decisão'}
        </button>
      </div>
      {registro.erro && <Mensagem tipo="erro">A decisão não foi registrada: {registro.erro}</Mensagem>}
    </form>
  );
}
