import { useEffect, useState, type FormEvent } from 'react';
import type {
  ColetaRegistro,
  ColetaRequisicao,
  ColetaResultado,
  ComparacaoColeta,
  FonteColeta,
  Id,
  ParametrosEditalArquivo,
  ParametrosPncp,
  ParametrosPortalTransparencia,
  ParametrosTseArquivo,
  RecoletaResultado,
  RecursoPortalTransparencia,
} from '../../api';
import { Campo, Carregando, Caixa, Hash, Mensagem, Radio, Tabela, formatarData } from '../../componentes/basicos';
import { cnpjValido, limparCnpj, mascaraDeCnpj, temFormaDeCnpj } from '../../cnpj';
import { mascararCpfs } from '../../privacidade';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

const ROTULOS_SITUACAO: Record<string, string> = {
  sucesso: 'sucesso',
  falha: 'FALHA',
  em_andamento: 'em andamento',
  nao_configurado: 'fonte não configurada',
};

const FONTES: { id: FonteColeta; rotulo: string }[] = [
  { id: 'cnpj_arquivo', rotulo: 'Dados abertos do CNPJ (arquivos no layout da Receita Federal)' },
  { id: 'pncp', rotulo: 'PNCP — API de consulta de contratos' },
  { id: 'pncp_termos', rotulo: 'PNCP — termos de contrato (aditivos e apostilamentos)' },
  { id: 'portal_transparencia', rotulo: 'Portal da Transparência — sanções (CEIS, CNEP, CEPIM, CEAF), convênios e servidores' },
  { id: 'tse_arquivo', rotulo: 'TSE — candidaturas e receitas de campanha (arquivos)' },
  { id: 'edital_arquivo', rotulo: 'Editais em texto ou PDF (arquivos .txt e .pdf)' },
];

/**
 * CNPJs (14 posições, numéricos ou alfanuméricos, com ou sem pontuação) numa lista separada por
 * vírgula, ponto e vírgula, espaço ou quebra de linha. Só entra o que tem os dígitos
 * verificadores corretos: um CNPJ digitado errado não acharia sanção nenhuma e pareceria "nada consta".
 */
export function lerCnpjs(texto: string): { cnpjs: string[]; invalidos: string[] } {
  const itens = texto
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const cnpjs: string[] = [];
  const invalidos: string[] = [];
  for (const item of itens) {
    if (cnpjValido(item)) {
      const limpo = limparCnpj(item);
      if (!cnpjs.includes(limpo)) cnpjs.push(limpo);
    } else invalidos.push(item);
  }
  return { cnpjs, invalidos };
}

/** Teto de nomes por consulta ao CEAF (SUPOSIÇÃO: o mesmo da lista de CNPJs; o contrato não fixa). */
const MAXIMO_NOMES = 100;

/**
 * Nomes completos para a consulta ao CEAF, um por linha (ou separados por ponto e vírgula).
 * O CEAF nunca é consultado por CPF: um item com dígitos é recusado, e não enviado.
 */
export function lerNomes(texto: string): { nomes: string[]; invalidos: string[] } {
  const itens = texto
    .split(/[\n;]+/)
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const nomes: string[] = [];
  const invalidos: string[] = [];
  for (const item of itens) {
    if (/\d/.test(item) || !/\p{L}{2,}/u.test(item)) invalidos.push(item);
    else if (!nomes.includes(item)) nomes.push(item);
  }
  return { nomes, invalidos };
}

/** O que cada recurso de lista consulta quando a escolha é "do caso", e o rótulo da opção. */
const ALVO_DO_CASO: Record<'ceis' | 'cnep' | 'cepim' | 'convenios' | 'ceaf', { rotulo: string; explicacao: string }> = {
  ceis: {
    rotulo: 'Contratadas do caso',
    explicacao: 'Serão consultadas todas as empresas contratadas do caso; a lista explícita de CNPJs fica gravada nos parâmetros da coleta.',
  },
  cnep: {
    rotulo: 'Contratadas do caso',
    explicacao: 'Serão consultadas todas as empresas contratadas do caso; a lista explícita de CNPJs fica gravada nos parâmetros da coleta.',
  },
  cepim: {
    rotulo: 'Entidades do caso',
    explicacao: 'O servidor monta a lista de CNPJs a partir das entidades do caso; a lista explícita fica gravada nos parâmetros da coleta.',
  },
  convenios: {
    rotulo: 'Entidades sem fins lucrativos do caso',
    explicacao:
      'Serão consultados os convênios das entidades sem fins lucrativos do caso, reconhecidas pela natureza jurídica no CNPJ; a lista explícita de CNPJs fica gravada nos parâmetros da coleta.',
  },
  ceaf: {
    rotulo: 'Sócios das contratadas e convenentes do caso',
    explicacao:
      'Serão consultados os nomes dos sócios pessoa física das contratadas e convenentes do caso; a lista explícita de nomes fica gravada nos parâmetros da coleta. A consulta é só pelo nome, nunca por CPF: um resultado é possível coincidência, não identificação.',
  },
};

/**
 * Valor de um campo da comparação de capturas. O back-end já devolve todo CPF descaracterizado;
 * esta é a última barreira (RNF04), com o nome do campo como contexto (`niFornecedor`, `cpf...`).
 */
function valorDaComparacao(campo: string, valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return mascararCpfs(valor, { contextoCpf: /cpf|nifornecedor|codigoformatado|codigosancionado|documento/i.test(campo.replace(/[^a-z]/gi, '')) });
}

export function AbaColeta({ casoId, aoConcluir }: { casoId: Id; aoConcluir?: () => void }) {
  const { cliente } = useSessao();
  const coleta = useChamada<ColetaResultado>();
  const historico = useChamada<ColetaRegistro[]>();
  const recoleta = useChamada<RecoletaResultado>();
  const [fonte, setFonte] = useState<FonteColeta>('cnpj_arquivo');
  // Um diretório por fonte de arquivo: cada uma tem a sua raiz de ingestão no servidor.
  const [diretorio, setDiretorio] = useState('');
  const [diretorioTse, setDiretorioTse] = useState('');
  const [diretorioEditais, setDiretorioEditais] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [cnpjOrgao, setCnpjOrgao] = useState('');
  const [maxPaginas, setMaxPaginas] = useState(1);
  // Portal da Transparência (H19)
  const [recurso, setRecurso] = useState<RecursoPortalTransparencia>('ceis');
  const [alvoSancoes, setAlvoSancoes] = useState<'do_caso' | 'lista'>('do_caso');
  const [listaCnpjs, setListaCnpjs] = useState('');
  const [listaNomes, setListaNomes] = useState('');
  const [tipoCodigoSiape, setTipoCodigoSiape] = useState<'lotacao' | 'exercicio'>('lotacao');
  const [codigoSiape, setCodigoSiape] = useState('');
  const [cnpjOrgaoContratante, setCnpjOrgaoContratante] = useState('');
  // TSE e editais
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [anoTse, setAnoTse] = useState('');
  const [soCandidatosDoCaso, setSoCandidatosDoCaso] = useState(false);
  const [numeroControleCompra, setNumeroControleCompra] = useState('');
  const [cnpjOrgaoEdital, setCnpjOrgaoEdital] = useState('');

  const carregarHistorico = () => historico.executar(() => cliente.listarColetas(casoId));

  useEffect(() => {
    void carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId]);

  const cnpjsLidos = lerCnpjs(listaCnpjs);
  const nomesLidos = lerNomes(listaNomes);

  function montar(): ColetaRequisicao {
    switch (fonte) {
      case 'cnpj_arquivo':
        return { fonte, parametros: { diretorio: diretorio.trim() } };
      case 'pncp': {
        const parametros: ParametrosPncp = { dataInicial: dataInicial.trim(), dataFinal: dataFinal.trim(), max_paginas: maxPaginas };
        if (cnpjOrgao.trim()) parametros.cnpjOrgao = limparCnpj(cnpjOrgao);
        return { fonte, parametros };
      }
      case 'pncp_termos':
        return { fonte, parametros: { do_caso: true } };
      case 'portal_transparencia': {
        const parametros: ParametrosPortalTransparencia = { recurso };
        if (recurso === 'servidores') {
          if (tipoCodigoSiape === 'lotacao') parametros.orgaoServidorLotacao = codigoSiape.trim();
          else parametros.orgaoServidorExercicio = codigoSiape.trim();
          parametros.cnpjOrgao = limparCnpj(cnpjOrgaoContratante);
        } else if (alvoSancoes === 'do_caso') parametros.do_caso = true;
        // CEAF: só nomes. CPF nunca é enviado.
        else if (recurso === 'ceaf') parametros.nomeSancionado = nomesLidos.nomes;
        else parametros.codigoSancionado = cnpjsLidos.cnpjs;
        return { fonte, parametros };
      }
      case 'tse_arquivo': {
        const parametros: ParametrosTseArquivo = { diretorio: diretorioTse.trim() };
        if (uf.trim()) parametros.uf = uf.trim().toUpperCase();
        if (municipio.trim()) parametros.municipio = municipio.trim();
        if (anoTse.trim()) parametros.ano = anoTse.trim();
        if (soCandidatosDoCaso) parametros.do_caso = true;
        return { fonte, parametros };
      }
      case 'edital_arquivo': {
        const parametros: ParametrosEditalArquivo = { diretorio: diretorioEditais.trim() };
        if (numeroControleCompra.trim()) parametros.numero_controle_pncp_compra = numeroControleCompra.trim();
        if (cnpjOrgaoEdital.trim()) parametros.cnpjOrgao = limparCnpj(cnpjOrgaoEdital);
        return { fonte, parametros };
      }
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    recoleta.limpar();
    const r = await coleta.executar(() => cliente.iniciarColeta(casoId, montar()));
    // Com sucesso ou com falha, o histórico diz o que houve com a fonte (RNF12).
    await carregarHistorico();
    if (r) aoConcluir?.();
  }

  async function recoletar(coletaId: Id) {
    coleta.limpar();
    const r = await recoleta.executar(() => cliente.recoletar(casoId, coletaId));
    await carregarHistorico();
    if (r) aoConcluir?.();
  }

  const dataOk = (d: string) => /^\d{8}$/.test(d);
  function formularioValido(): boolean {
    switch (fonte) {
      case 'cnpj_arquivo':
        return diretorio.trim().length > 0;
      case 'pncp':
        return dataOk(dataInicial) && dataOk(dataFinal) && maxPaginas >= 1;
      case 'pncp_termos':
        return true;
      case 'portal_transparencia':
        if (recurso === 'servidores') return /^\d+$/.test(codigoSiape.trim()) && temFormaDeCnpj(cnpjOrgaoContratante);
        if (alvoSancoes === 'do_caso') return true;
        if (recurso === 'ceaf') return nomesLidos.nomes.length > 0 && nomesLidos.nomes.length <= MAXIMO_NOMES && nomesLidos.invalidos.length === 0;
        return cnpjsLidos.cnpjs.length > 0 && cnpjsLidos.cnpjs.length <= 100 && cnpjsLidos.invalidos.length === 0;
      case 'tse_arquivo':
        // `ano`: vazio ou quatro dígitos, a mesma regra do back-end (`^(\d{4})?$`).
        return diretorioTse.trim().length > 0 && /^([A-Za-z]{2})?$/.test(uf.trim()) && /^(\d{4})?$/.test(anoTse.trim());
      case 'edital_arquivo':
        return diretorioEditais.trim().length > 0;
    }
  }
  const valido = formularioValido();
  const ocupado = coleta.carregando || recoleta.carregando;
  const coletas = historico.dados ?? [];
  const falhas = coletas.filter((c) => c.situacao === 'falha').length;
  const naoConfiguradas = coletas.filter((c) => c.situacao === 'nao_configurado').length;
  const resultado = coleta.dados;

  return (
    <div className="coleta">
      <p className="mudo">
        Coleta passiva de fontes oficiais abertas. Cada carga bruta é guardada com SHA-256, carimbo de tempo UTC, origem e a
        versão do conector que a produziu (cadeia de custódia, RF07).
      </p>
      <form onSubmit={enviar} className="formulario">
        <fieldset className="fieldset-linha">
          <legend>Fonte</legend>
          {FONTES.map((f) => (
            <Radio key={f.id} nome="fonte" valor={f.id} marcado={fonte === f.id} aoMarcar={() => setFonte(f.id)}>
              {f.rotulo}
            </Radio>
          ))}
        </fieldset>

        {fonte === 'cnpj_arquivo' && (
          <Campo rotulo="Diretório com os arquivos" dica="Pasta relativa à raiz de ingestão configurada no servidor (CNPJ_DIR_BASE), com os arquivos Empresas, Estabelecimentos e Sócios no layout oficial. Caminhos fora dessa raiz são recusados.">
            <input type="text" value={diretorio} onChange={(e) => setDiretorio(e.target.value)} placeholder="cnpj" maxLength={500} required />
          </Campo>
        )}

        {fonte === 'pncp' && (
          <div className="grade-2">
            <Campo rotulo="Data inicial (AAAAMMDD)">
              <input type="text" inputMode="numeric" pattern="\d{8}" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} placeholder="20260101" maxLength={8} required />
            </Campo>
            <Campo rotulo="Data final (AAAAMMDD)">
              <input type="text" inputMode="numeric" pattern="\d{8}" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} placeholder="20260331" maxLength={8} required />
            </Campo>
            <Campo rotulo="CNPJ do órgão (opcional)">
              <input type="text" value={cnpjOrgao} onChange={(e) => setCnpjOrgao(mascaraDeCnpj(e.target.value))} placeholder="00.000.000/0000-00 (aceita letras)" maxLength={18} />
            </Campo>
            <Campo rotulo="Máximo de páginas">
              <input type="number" min={1} max={100} value={maxPaginas} onChange={(e) => setMaxPaginas(Number(e.target.value) || 1)} required />
            </Campo>
          </div>
        )}

        {fonte === 'pncp_termos' && (
          <p data-testid="termos-do-caso">
            Serão consultados os termos (aditivos e apostilamentos) dos <strong>contratos do caso</strong>, contrato a contrato,
            na API de integração do PNCP. É preciso ter feito antes a coleta de contratos do PNCP; a lista de contratos
            consultados fica gravada nos parâmetros da coleta.
          </p>
        )}

        {fonte === 'portal_transparencia' && (
          <>
            <fieldset className="fieldset-linha">
              <legend>Recurso do Portal da Transparência</legend>
              <Radio nome="recurso" valor="ceis" marcado={recurso === 'ceis'} aoMarcar={() => setRecurso('ceis')}>
                CEIS — empresas inidôneas e suspensas
              </Radio>
              <Radio nome="recurso" valor="cnep" marcado={recurso === 'cnep'} aoMarcar={() => setRecurso('cnep')}>
                CNEP — empresas punidas (Lei 12.846/2013)
              </Radio>
              <Radio nome="recurso" valor="cepim" marcado={recurso === 'cepim'} aoMarcar={() => setRecurso('cepim')}>
                CEPIM — entidades sem fins lucrativos impedidas
              </Radio>
              <Radio nome="recurso" valor="ceaf" marcado={recurso === 'ceaf'} aoMarcar={() => setRecurso('ceaf')}>
                CEAF — expulsões da administração federal (por nome)
              </Radio>
              <Radio nome="recurso" valor="convenios" marcado={recurso === 'convenios'} aoMarcar={() => setRecurso('convenios')}>
                Convênios — por convenente
              </Radio>
              <Radio nome="recurso" valor="servidores" marcado={recurso === 'servidores'} aoMarcar={() => setRecurso('servidores')}>
                Servidores de um órgão
              </Radio>
            </fieldset>
            <p className="mudo">
              A chave de acesso fica só no servidor. Sem ela, a coleta é registrada como "fonte não configurada", sem
              capturas, e as outras fontes continuam funcionando.
            </p>
            {recurso !== 'servidores' ? (
              <>
                <fieldset className="fieldset-linha">
                  <legend>{recurso === 'ceaf' ? 'Pessoas a consultar (pelo nome)' : recurso === 'convenios' ? 'Convenentes a consultar' : 'Empresas a consultar'}</legend>
                  <Radio nome="alvo-sancoes" valor="do_caso" marcado={alvoSancoes === 'do_caso'} aoMarcar={() => setAlvoSancoes('do_caso')}>
                    {ALVO_DO_CASO[recurso].rotulo}
                  </Radio>
                  <Radio nome="alvo-sancoes" valor="lista" marcado={alvoSancoes === 'lista'} aoMarcar={() => setAlvoSancoes('lista')}>
                    {recurso === 'ceaf' ? 'Lista de nomes' : 'Lista de CNPJs'}
                  </Radio>
                </fieldset>
                {alvoSancoes === 'do_caso' ? (
                  <p className="mudo" data-testid="alvo-do-caso">
                    {ALVO_DO_CASO[recurso].explicacao}
                  </p>
                ) : recurso === 'ceaf' ? (
                  <Campo
                    rotulo="Nomes a consultar"
                    tipo="textarea"
                    dica={`Até ${MAXIMO_NOMES} nomes completos, um por linha (ou separados por ponto e vírgula). Só nomes: o CEAF nunca é consultado por CPF, e item com dígitos é recusado.`}
                  >
                    <textarea value={listaNomes} onChange={(e) => setListaNomes(e.target.value)} rows={3} placeholder="NOME COMPLETO" required />
                  </Campo>
                ) : (
                  <Campo rotulo="CNPJs a consultar" tipo="textarea" dica="Até 100 CNPJs de 14 dígitos, separados por vírgula, espaço ou quebra de linha. Sanção de pessoa física (CPF) não é consultada.">
                    <textarea value={listaCnpjs} onChange={(e) => setListaCnpjs(e.target.value)} rows={3} placeholder="90000006000151, 90000007000104" required />
                  </Campo>
                )}
                {alvoSancoes === 'lista' && recurso === 'ceaf' && nomesLidos.invalidos.length > 0 && (
                  <Mensagem tipo="aviso">Não é nome (tem dígitos ou não tem letras; CPF não é aceito): {mascararCpfs(nomesLidos.invalidos.join('; '), { contextoCpf: true })}</Mensagem>
                )}
                {alvoSancoes === 'lista' && recurso !== 'ceaf' && cnpjsLidos.invalidos.length > 0 && (
                  <Mensagem tipo="aviso">Não é CNPJ válido (14 posições, com os dígitos verificadores corretos): {cnpjsLidos.invalidos.join(', ')}</Mensagem>
                )}
              </>
            ) : (
              <>
                <div className="grade-2">
                  <Campo rotulo="O código SIAPE é do órgão de" dica="A consulta é sempre por órgão, nunca por CPF.">
                    <select value={tipoCodigoSiape} onChange={(e) => setTipoCodigoSiape(e.target.value as typeof tipoCodigoSiape)}>
                      <option value="lotacao">lotação</option>
                      <option value="exercicio">exercício</option>
                    </select>
                  </Campo>
                  <Campo rotulo="Código SIAPE do órgão">
                    <input type="text" inputMode="numeric" pattern="\d+" value={codigoSiape} onChange={(e) => setCodigoSiape(e.target.value)} placeholder="somente dígitos" maxLength={10} required />
                  </Campo>
                  <Campo rotulo="CNPJ do órgão contratante">
                    <input type="text" value={cnpjOrgaoContratante} onChange={(e) => setCnpjOrgaoContratante(mascaraDeCnpj(e.target.value))} placeholder="00.000.000/0000-00 (aceita letras)" maxLength={18} required />
                  </Campo>
                </div>
                <Mensagem tipo="info">
                  A correspondência entre o código SIAPE e o CNPJ do órgão contratante é <strong>declarada por você</strong>:
                  não há tabela oficial conferida que ligue os dois. Ela fica gravada nos parâmetros da coleta e é o que
                  liga os servidores coletados ao órgão contratante do caso.
                </Mensagem>
              </>
            )}
          </>
        )}

        {fonte === 'tse_arquivo' && (
          <div className="grade-2">
            <Campo rotulo="Diretório com os arquivos do TSE" dica="Pasta relativa à raiz de ingestão do servidor (TSE_DIR_BASE), com consulta_cand_*.csv e receitas_candidatos_*.csv (ou ZIP com eles). O CPF do candidato nunca é lido.">
              <input type="text" value={diretorioTse} onChange={(e) => setDiretorioTse(e.target.value)} placeholder="tse" maxLength={500} required />
            </Campo>
            <Campo rotulo="UF (opcional)">
              <input type="text" value={uf} onChange={(e) => setUf(e.target.value)} placeholder="GO" maxLength={2} pattern="[A-Za-z]{2}" />
            </Campo>
            <Campo rotulo="Município (opcional)">
              <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="nome da unidade eleitoral" maxLength={100} />
            </Campo>
            <Campo rotulo="Ano da eleição (opcional)" dica="Quatro dígitos. Só vale quando nem a coluna ANO_ELEICAO do arquivo nem o nome do arquivo dizem o ano.">
              <input
                type="text"
                inputMode="numeric"
                value={anoTse}
                onChange={(e) => setAnoTse(e.target.value)}
                placeholder="2024"
                maxLength={4}
                pattern="[0-9]{4}"
                aria-invalid={!/^(\d{4})?$/.test(anoTse.trim())}
              />
            </Campo>
            <div style={{ gridColumn: '1 / -1' }}>
              <Caixa marcado={soCandidatosDoCaso} aoMudar={setSoCandidatosDoCaso}>
                Ler só as linhas dos candidatos que já estão no caso
              </Caixa>
            </div>
            <p className="campo-dica" style={{ gridColumn: '1 / -1' }}>
              Arquivo grande (o CSV de receitas de uma UF grande passa do teto de leitura integral do servidor) é lido em fluxo e exige ao menos um filtro: UF,
              município ou os candidatos do caso. Nesse modo a captura guarda só o recorte filtrado; o SHA-256 do arquivo inteiro fica nos metadados da captura.
            </p>
          </div>
        )}

        {fonte === 'edital_arquivo' && (
          <div className="grade-2">
            <Campo rotulo="Diretório com os editais" dica="Pasta relativa à raiz de ingestão do servidor (EDITAIS_DIR_BASE), com arquivos .txt ou .pdf. O PDF precisa ter camada de texto: PDF escaneado fica guardado, mas sem texto para analisar (não há OCR); PDF protegido por senha é recusado.">
              <input type="text" value={diretorioEditais} onChange={(e) => setDiretorioEditais(e.target.value)} placeholder="editais" maxLength={500} required />
            </Campo>
            <Campo rotulo="Número de controle da contratação no PNCP (opcional)">
              <input type="text" value={numeroControleCompra} onChange={(e) => setNumeroControleCompra(e.target.value)} maxLength={100} />
            </Campo>
            <Campo rotulo="CNPJ do órgão do edital (opcional)">
              <input type="text" value={cnpjOrgaoEdital} onChange={(e) => setCnpjOrgaoEdital(mascaraDeCnpj(e.target.value))} placeholder="00.000.000/0000-00 (aceita letras)" maxLength={18} />
            </Campo>
          </div>
        )}

        <div className="linha">
          <button type="submit" className="br-button primary small" disabled={ocupado || !valido}>
            {coleta.carregando ? 'Coletando…' : 'Iniciar coleta'}
          </button>
        </div>
      </form>

      {coleta.erro && (
        <Mensagem tipo="erro">
          A coleta falhou: {coleta.erro} A falha, as tentativas e o motivo estão na tabela abaixo; não tire conclusões de
          dados incompletos.
        </Mensagem>
      )}
      {resultado?.situacao === 'nao_configurado' && (
        <Mensagem tipo="info">
          <div>
            <strong>Fonte não configurada.</strong> Nada foi coletado e nenhuma captura foi registrada. Não é uma falha: as
            outras fontes continuam disponíveis.
          </div>
          <div>Motivo: {resultado.motivo || (resultado.avisos ?? [])[0] || 'o servidor não informou o motivo.'}</div>
        </Mensagem>
      )}
      {resultado && resultado.situacao !== 'nao_configurado' && (
        <Mensagem tipo="ok">
          <div>
            Coleta concluída: <strong>{resultado.entidades_novas}</strong> entidade(s) nova(s)
            {resultado.tentativas !== undefined && <> em {resultado.tentativas} tentativa(s)</>}.
          </div>
          <div>
            Capturas registradas:{' '}
            {resultado.captura_ids.length ? resultado.captura_ids.map((id) => <code key={String(id)}>{String(id)} </code>) : 'nenhuma'}
          </div>
          {resultado.motivo && <div>{resultado.motivo}</div>}
          {(resultado.avisos ?? []).map((aviso, i) => (
            <div key={i}>Aviso: {aviso}</div>
          ))}
        </Mensagem>
      )}

      {recoleta.erro && <Mensagem tipo="erro">A recoleta falhou: {recoleta.erro}</Mensagem>}
      {recoleta.dados && <ResultadoComparacao comparacao={recoleta.dados.comparacao} />}

      <section aria-labelledby="coletas-titulo">
        <div className="painel-cabecalho">
          <h3 id="coletas-titulo">Coletas deste caso, por fonte</h3>
          <button type="button" className="br-button secondary small" onClick={() => void carregarHistorico()} disabled={historico.carregando}>
            Atualizar
          </button>
        </div>
        {historico.carregando && !historico.dados && <Carregando />}
        {historico.erro && <Mensagem tipo="erro">{historico.erro}</Mensagem>}
        {falhas > 0 && (
          <Mensagem tipo="aviso">
            {falhas} coleta(s) deste caso falharam. Os dados do caso podem estar incompletos: veja a fonte e o motivo de cada
            falha.
          </Mensagem>
        )}
        {naoConfiguradas > 0 && (
          <Mensagem tipo="info">
            {naoConfiguradas} coleta(s) deste caso ficaram como "fonte não configurada" (sem capturas). Não são falhas; o
            motivo de cada uma está na tabela.
          </Mensagem>
        )}
        {historico.dados && coletas.length === 0 && <p className="vazio">Nenhuma coleta feita neste caso.</p>}
        {coletas.length > 0 && (
          <Tabela rotulo="Coletas do caso" className="tabela-coletas">
            <thead>
              <tr>
                <th scope="col">Fonte</th>
                <th scope="col">Conector</th>
                <th scope="col">Situação</th>
                <th scope="col">Tentativas</th>
                <th scope="col">Motivo</th>
                <th scope="col">Iniciada em</th>
                <th scope="col">Capturas</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {coletas.map((c) => (
                <tr key={String(c.id)} data-testid="coleta">
                  <td>
                    <code>{c.fonte}</code>
                    {c.recoleta_de && <div className="mudo">recoleta de {String(c.recoleta_de)}</div>}
                  </td>
                  <td>
                    {c.conector_nome} <code>{c.conector_versao}</code>
                  </td>
                  <td>
                    <span className={`br-tag small situacao-coleta situacao-coleta-${c.situacao}`}>{ROTULOS_SITUACAO[c.situacao] ?? c.situacao}</span>
                  </td>
                  <td>{c.tentativas}</td>
                  <td className="quebra">
                    {c.motivo || '—'}
                    {c.avisos
                      // Na fonte não configurada o back-end repete o motivo nos avisos.
                      .filter((aviso) => aviso !== c.motivo)
                      .map((aviso, i) => (
                      <div key={i} className="mudo">
                        Aviso: {aviso}
                      </div>
                    ))}
                  </td>
                  <td>{formatarData(c.iniciado_em)}</td>
                  <td>{c.captura_ids.length}</td>
                  <td>
                    <button
                      type="button"
                      className="br-button secondary small"
                      onClick={() => void recoletar(c.id)}
                      disabled={ocupado || c.situacao === 'em_andamento'}
                      title="Repete a coleta com os mesmos parâmetros e compara com as capturas desta. Nada é apagado."
                    >
                      Recoletar e comparar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
    </div>
  );
}

/** Resultado da recoleta (RF07, H14): mesmo hash ou não e, se não, o que mudou. */
export function ResultadoComparacao({ comparacao }: { comparacao: ComparacaoColeta }) {
  const semPar = comparacao.capturas_sem_anterior.length + comparacao.capturas_anteriores_sem_correspondente.length;
  return (
    <section className="br-card comparacao" aria-label="Comparação com a coleta anterior">
      <h3>Comparação com a coleta anterior</h3>
      <Mensagem tipo={comparacao.mesmo_conteudo ? 'ok' : 'aviso'}>
        {comparacao.mesmo_conteudo
          ? 'Mesmo conteúdo: todas as capturas têm o mesmo SHA-256 da coleta anterior.'
          : `O conteúdo mudou: ${comparacao.capturas_diferentes} captura(s) com hash diferente, ${comparacao.capturas_iguais} igual(is)${semPar ? ` e ${semPar} sem correspondente` : ''}.`}{' '}
        As capturas anteriores continuam guardadas.
      </Mensagem>
      <p className="mudo">
        Conector desta coleta: {comparacao.conector.nome} <code>{comparacao.conector.versao}</code>; da anterior:{' '}
        {comparacao.anterior_conector.nome} <code>{comparacao.anterior_conector.versao}</code>.
      </p>
      <Tabela rotulo="Capturas comparadas">
        <thead>
          <tr>
            <th scope="col">Origem</th>
            <th scope="col">Hash</th>
            <th scope="col">SHA-256 anterior</th>
            <th scope="col">SHA-256 novo</th>
            <th scope="col">Campos que mudaram</th>
          </tr>
        </thead>
        <tbody>
          {comparacao.capturas.map((c) => (
            <tr key={String(c.captura_id)} data-testid="captura-comparada">
              <td className="quebra">
                <code>{c.url_ou_arquivo}</code>
              </td>
              <td>
                <strong>{c.mesmo_hash ? 'igual' : 'DIFERENTE'}</strong>
              </td>
              <td>
                <Hash valor={c.anterior_sha256} />
              </td>
              <td>
                <Hash valor={c.sha256} />
              </td>
              <td className="quebra">
                {c.mesmo_hash ? '—' : c.campos_alterados.length ? c.campos_alterados.map((campo) => <code key={campo}>{campo} </code>) : 'nenhum campo interpretado'}
                {!c.mesmo_hash && (
                  <div className="mudo">
                    {c.registros.alterados} registro(s) alterado(s), {c.registros.adicionados} novo(s), {c.registros.removidos} removido(s)
                  </div>
                )}
                {c.observacao && !c.mesmo_hash && <div className="mudo">{c.observacao}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </Tabela>
      {comparacao.capturas
        .filter((c) => c.diferencas.length > 0)
        .map((c) => (
          <details key={String(c.captura_id)} className="diferencas">
            <summary>
              Diferenças em <code>{c.url_ou_arquivo}</code> ({c.diferencas.length}
              {c.diferencas_omitidas ? ` de ${c.diferencas.length + c.diferencas_omitidas}` : ''})
            </summary>
            <ul className="lista-simples">
              {c.diferencas.map((d, i) => (
                <li key={`${d.registro}-${i}`}>
                  <strong>{d.tipo}</strong>: registro <code>{mascararCpfs(d.registro ?? '')}</code>
                  {d.campos.map((campo) => (
                    <div key={campo.campo} className="quebra">
                      <code>{campo.campo}</code>: {valorDaComparacao(campo.campo, campo.antes)} → {valorDaComparacao(campo.campo, campo.depois)}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        ))}
    </section>
  );
}
