import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroApi, type ColetaRegistro, type ColetaRequisicao, type ColetaResultado, type ComparacaoCaptura, type ComparacaoColeta } from '../../api';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { formatarCnpj } from '../../cnpj';
import { cnpjAlfanumerico, comDvErrado } from '../../test/cnpjSintetico';
import { comVerificadorErrado, cpfSinteticoValido, mascarado, pontuado } from '../../test/cpfSintetico';
import { AbaColeta, ResultadoComparacao, lerCnpjs, lerNomes } from './AbaColeta';

function coleta(parcial: Partial<ColetaRegistro>): ColetaRegistro {
  return {
    id: 'col-x',
    fonte: 'pncp',
    parametros: {},
    conector_nome: 'pncp',
    conector_versao: '1.1.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 0,
    avisos: [],
    usuario: 'ana',
    iniciado_em: '2026-11-16T12:00:00Z',
    concluido_em: '2026-11-16T12:00:01Z',
    recoleta_de: null,
    captura_ids: [],
    ...parcial,
  };
}

describe('AbaColeta — falhas por fonte (RNF12) e versão do conector (RF07)', () => {
  it('mostra, por fonte, sucesso ou falha, tentativas, motivo e a versão do conector', async () => {
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <AbaColeta casoId="caso-1" />
      </SessaoProvider>,
    );
    // As três mais antigas são as do horizonte 1; as do horizonte 2 vêm antes, por serem mais recentes.
    const todas = await screen.findAllByTestId('coleta');
    expect(todas).toHaveLength(13);
    const linhas = todas.slice(-3);
    const falha = linhas[1];
    expect(within(falha).getByText('pncp', { selector: 'code' })).toBeInTheDocument();
    expect(within(falha).getByText('FALHA')).toBeInTheDocument();
    expect(within(falha).getByText('3')).toBeInTheDocument();
    expect(within(falha).getByText(/após 3 tentativas: PNCP respondeu HTTP 503/)).toBeInTheDocument();
    expect(within(falha).getByText('1.2.0')).toBeInTheDocument();
    expect(within(linhas[2]).getByText('sucesso')).toBeInTheDocument();
    expect(screen.getByText(/1 coleta deste caso falhou/)).toBeInTheDocument();
  });

  it('ao fim de uma coleta que falha, mostra o erro e atualiza a tabela com a falha', async () => {
    const usuario = userEvent.setup();
    const historico = [coleta({ id: 'col-9', fonte: 'cnpj_arquivo', conector_nome: 'cnpj_arquivo', situacao: 'falha', tentativas: 3, motivo: 'Não foi possível abrir ou ler o arquivo X após 3 tentativas: OSError' })];
    const listarColetas = vi.fn(async () => (listarColetas.mock.calls.length > 1 ? historico : []));
    const iniciarColeta = vi.fn(async () => {
      throw new ErroApi(422, '/casos/caso-1/coletas', historico[0].motivo);
    });
    render(
      <SessaoProvider cliente={clienteFalso({ listarColetas, iniciarColeta })}>
        <AbaColeta casoId="caso-1" />
      </SessaoProvider>,
    );
    expect(await screen.findByText('Nenhuma coleta feita neste caso.')).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Diretório com os arquivos'), 'cnpj');
    await usuario.click(screen.getByRole('button', { name: 'Iniciar coleta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A coleta falhou');
    const linha = await screen.findByTestId('coleta');
    expect(within(linha).getByText('FALHA')).toBeInTheDocument();
    expect(within(linha).getByText(/após 3 tentativas: OSError/)).toBeInTheDocument();
    expect(listarColetas).toHaveBeenCalledTimes(2);
  });

  it('ao fim de uma coleta com sucesso, informa as tentativas e os avisos', async () => {
    const usuario = userEvent.setup();
    const iniciarColeta = vi.fn(async () => ({
      captura_ids: ['cap-77'],
      entidades_novas: 2,
      avisos: ['Coleta interrompida no limite de max_paginas=1'],
      coleta_id: 'col-77',
      situacao: 'sucesso' as const,
      tentativas: 3,
      motivo: 'Sucesso depois de 3 tentativas; última falha transitória: PNCP respondeu HTTP 503',
      conector_nome: 'pncp',
      conector_versao: '1.1.0',
    }));
    render(
      <SessaoProvider cliente={clienteFalso({ iniciarColeta })}>
        <AbaColeta casoId="caso-1" />
      </SessaoProvider>,
    );
    await usuario.type(screen.getByLabelText('Diretório com os arquivos'), 'cnpj');
    await usuario.click(screen.getByRole('button', { name: 'Iniciar coleta' }));
    expect(await screen.findByText(/em 3 tentativas/)).toBeInTheDocument();
    expect(screen.getByText(/última falha transitória: PNCP respondeu HTTP 503/)).toBeInTheDocument();
    expect(screen.getByText(/Aviso: Coleta interrompida/)).toBeInTheDocument();
  });

  it('recoleta e mostra que o conteúdo é o mesmo (hash igual), sem apagar a coleta anterior', async () => {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <AbaColeta casoId="caso-1" />
      </SessaoProvider>,
    );
    const linhas = (await screen.findAllByTestId('coleta')).slice(-3);
    await usuario.click(within(linhas[2]).getByRole('button', { name: 'Recoletar e comparar' }));
    const comparacao = await screen.findByRole('region', { name: 'Comparação com a coleta anterior' });
    expect(within(comparacao).getByText(/Mesmo conteúdo/)).toBeInTheDocument();
    expect(within(comparacao).getAllByTestId('captura-comparada')).toHaveLength(3);
    expect(within(comparacao).getAllByText('igual')).toHaveLength(3);
    // A coleta original continua no histórico, e a nova aparece como recoleta dela.
    await waitFor(() => expect(screen.getAllByTestId('coleta')).toHaveLength(14));
    expect(screen.getByText('recoleta de col-1')).toBeInTheDocument();
  });
});

describe('ResultadoComparacao — o que mudou entre duas coletas (RF07)', () => {
  it('nunca mostra CPF completo na comparação campo a campo (RNF04), mesmo que a API o devolvesse', () => {
    const cpf = cpfSinteticoValido();
    const errado = comVerificadorErrado(cpf);
    const captura = {
      captura_id: 'cap-2',
      anterior_id: 'cap-1',
      fonte: 'pncp',
      url_ou_arquivo: 'simulado://pncp/contratos?pagina=1',
      coletado_em: '2026-11-17T13:00:00Z',
      anterior_coletado_em: '2026-11-17T12:00:00Z',
      sha256: 'b'.repeat(64),
      anterior_sha256: 'a'.repeat(64),
      mesmo_hash: false,
      tamanho_bytes: 10,
      anterior_tamanho_bytes: 10,
      conector: { nome: 'pncp', versao: '1.3.0' },
      anterior_conector: { nome: 'pncp', versao: '1.3.0' },
      mesma_versao_conector: true,
      registros_comparados: true,
      registros: { adicionados: 0, removidos: 0, alterados: 1, iguais: 0 },
      campos_alterados: ['niFornecedor', 'objetoContrato'],
      diferencas: [
        {
          registro: `fornecedor ${cpf}`,
          tipo: 'alterado',
          campos: [
            { campo: 'niFornecedor', antes: cpf, depois: errado },
            { campo: 'objetoContrato', antes: null, depois: `Serviço; fiador CPF ${pontuado(cpf)}` },
          ],
        },
      ],
      diferencas_omitidas: 0,
      observacao: null,
    } as ComparacaoCaptura;
    const comparacao: ComparacaoColeta = {
      coleta_id: 'col-2',
      anterior_id: 'col-1',
      fonte: 'pncp',
      conector: captura.conector,
      anterior_conector: captura.anterior_conector,
      mesmo_conteudo: false,
      capturas_iguais: 0,
      capturas_diferentes: 1,
      capturas: [captura],
      capturas_sem_anterior: [],
      capturas_anteriores_sem_correspondente: [],
    };
    const { container } = render(<ResultadoComparacao comparacao={comparacao} />);
    const texto = container.textContent ?? '';
    expect(texto).not.toContain(cpf);
    expect(texto).not.toContain(pontuado(cpf));
    // Em campo de documento, 11 dígitos são ocultados mesmo com dígito verificador errado.
    expect(texto).not.toContain(errado);
    expect(texto).toContain(`${mascarado(cpf)} → ${mascarado(errado)}`);
    expect(texto).toContain(`— → Serviço; fiador CPF ${mascarado(cpf)}`);
  });

  it('mostra o hash diferente, os campos que mudaram e o valor de antes e de depois', () => {
    const captura: ComparacaoCaptura = {
      captura_id: 'cap-2',
      anterior_id: 'cap-1',
      fonte: 'cnpj_arquivo',
      url_ou_arquivo: 'simulado://cnpj_arquivo/CNPJ_DIR_BASE/cnpj/X.EMPRECSV',
      coletado_em: '2026-11-16T13:00:00Z',
      anterior_coletado_em: '2026-11-16T12:00:00Z',
      sha256: 'b'.repeat(64),
      anterior_sha256: 'a'.repeat(64),
      mesmo_hash: false,
      tamanho_bytes: 10,
      anterior_tamanho_bytes: 10,
      conector: { nome: 'cnpj_arquivo', versao: '1.2.0' },
      anterior_conector: { nome: 'cnpj_arquivo', versao: '1.1.0' },
      mesma_versao_conector: false,
      registros_comparados: true,
      registros: { adicionados: 0, removidos: 0, alterados: 1, iguais: 14 },
      campos_alterados: ['capital_social'],
      diferencas: [{ registro: '90000002', tipo: 'alterado', campos: [{ campo: 'capital_social', antes: '100000,00', depois: '999000,00' }] }],
      diferencas_omitidas: 0,
      observacao: null,
    };
    const comparacao: ComparacaoColeta = {
      coleta_id: 'col-2',
      anterior_id: 'col-1',
      fonte: 'cnpj_arquivo',
      conector: captura.conector,
      anterior_conector: captura.anterior_conector,
      mesmo_conteudo: false,
      capturas_iguais: 2,
      capturas_diferentes: 1,
      capturas: [captura],
      capturas_sem_anterior: [],
      capturas_anteriores_sem_correspondente: [],
    };
    render(<ResultadoComparacao comparacao={comparacao} />);
    expect(screen.getByText(/O conteúdo mudou: 1 captura com hash diferente, 2 iguais/)).toBeInTheDocument();
    expect(screen.getByText('DIFERENTE')).toBeInTheDocument();
    expect(screen.getByTitle('a'.repeat(64))).toBeInTheDocument();
    expect(screen.getByTitle('b'.repeat(64))).toBeInTheDocument();
    expect(screen.getByText('1.2.0')).toBeInTheDocument();
    expect(screen.getByText(/100000,00 → 999000,00/)).toBeInTheDocument();
    expect(screen.getByText('90000002')).toBeInTheDocument();
  });
});

describe('AbaColeta — fontes do horizonte 2 (H19)', () => {
  const RESULTADO = { captura_ids: ['cap-90'], entidades_novas: 1, avisos: [], coleta_id: 'col-90', situacao: 'sucesso' as const, tentativas: 1, motivo: '', conector_nome: 'x', conector_versao: '1.0.0' };

  function renderizar(resultado: ColetaResultado = RESULTADO) {
    const usuario = userEvent.setup();
    const iniciarColeta = vi.fn(async (_casoId: unknown, _corpo: ColetaRequisicao) => resultado);
    render(
      <SessaoProvider cliente={clienteFalso({ iniciarColeta })}>
        <AbaColeta casoId="caso-1" />
      </SessaoProvider>,
    );
    const enviar = async () => {
      await usuario.click(screen.getByRole('button', { name: 'Iniciar coleta' }));
      await waitFor(() => expect(iniciarColeta).toHaveBeenCalled());
      return iniciarColeta.mock.calls.at(-1)![1];
    };
    return { usuario, iniciarColeta, enviar };
  }

  it('Portal da Transparência, CEIS: por padrão consulta as contratadas do caso (do_caso)', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/Portal da Transparência — sanções/));
    expect(screen.getByLabelText(/CEIS — empresas inidôneas/)).toBeChecked();
    expect(screen.getByLabelText('Contratadas do caso')).toBeChecked();
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'ceis', do_caso: true } });
  });

  it('Portal da Transparência, CNEP com lista de CNPJs: valida os 14 dígitos e envia só os dígitos', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/Portal da Transparência — sanções/));
    await usuario.click(screen.getByLabelText(/CNEP — empresas punidas/));
    await usuario.click(screen.getByLabelText('Lista de CNPJs'));
    const botao = screen.getByRole('button', { name: 'Iniciar coleta' });
    expect(botao).toBeDisabled();
    await usuario.type(screen.getByLabelText('CNPJs a consultar'), '90.000.006/0001-51, 123');
    expect(screen.getByText(/Não é CNPJ válido \(14 posições, com os dígitos verificadores corretos\): 123/)).toBeInTheDocument();
    expect(botao).toBeDisabled();
    await usuario.clear(screen.getByLabelText('CNPJs a consultar'));
    await usuario.type(screen.getByLabelText('CNPJs a consultar'), '90.000.006/0001-51, 90000007000104');
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'cnep', codigoSancionado: ['90000006000151', '90000007000104'] } });
  });

  it('lista de CNPJs: aceita CNPJ alfanumérico sintético (com ou sem pontuação, em minúsculas) e recusa dígito verificador errado', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/Portal da Transparência — sanções/));
    await usuario.click(screen.getByLabelText('Lista de CNPJs'));
    const alfa = cnpjAlfanumerico();
    const outro = cnpjAlfanumerico();
    const campo = screen.getByLabelText('CNPJs a consultar');
    const botao = screen.getByRole('button', { name: 'Iniciar coleta' });
    await usuario.type(campo, `${formatarCnpj(alfa).toLowerCase()}, ${comDvErrado(outro)}`);
    expect(screen.getByText(new RegExp(`Não é CNPJ válido .*: ${comDvErrado(outro)}`))).toBeInTheDocument();
    expect(botao).toBeDisabled();
    await usuario.clear(campo);
    await usuario.type(campo, `${formatarCnpj(alfa).toLowerCase()} ${outro} 90000007000104 ${alfa}`);
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'ceis', codigoSancionado: [alfa, outro, '90000007000104'] } });
    expect(lerCnpjs(`${alfa};${alfa.slice(0, 13)}\n12.ABC.345/01DE-35`)).toEqual({ cnpjs: [alfa, '12ABC34501DE35'], invalidos: [alfa.slice(0, 13)] });
  });

  it('CNPJ do órgão: o campo aplica a máscara, aceita letras e envia as 14 posições em maiúsculas', async () => {
    const { usuario, enviar } = renderizar();
    const alfa = cnpjAlfanumerico();
    await usuario.click(screen.getByLabelText(/Portal da Transparência — sanções/));
    await usuario.click(screen.getByLabelText('Servidores de um órgão'));
    await usuario.type(screen.getByLabelText('Código SIAPE do órgão'), '90001');
    const campo = screen.getByLabelText('CNPJ do órgão contratante');
    await usuario.type(campo, alfa.slice(0, 13).toLowerCase());
    expect(screen.getByRole('button', { name: 'Iniciar coleta' })).toBeDisabled();
    await usuario.type(campo, alfa[13]);
    expect(campo).toHaveValue(formatarCnpj(alfa));
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'servidores', orgaoServidorLotacao: '90001', cnpjOrgao: alfa } });
  });

  it('TSE: "só os candidatos do caso" envia do_caso e a tela explica a leitura em fluxo de arquivo grande', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/TSE — candidaturas e receitas de campanha/));
    await usuario.type(screen.getByLabelText('Diretório com os arquivos do TSE'), 'tse');
    expect(screen.getByText(/é lido em fluxo e exige ao menos um filtro/)).toBeInTheDocument();
    await usuario.click(screen.getByLabelText('Ler só as linhas dos candidatos que já estão no caso'));
    expect(await enviar()).toEqual({ fonte: 'tse_arquivo', parametros: { diretorio: 'tse', do_caso: true } });
  });

  it('Portal da Transparência, servidores: código SIAPE (lotação ou exercício) e CNPJ do órgão, com o aviso da correspondência declarada', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/Portal da Transparência — sanções/));
    await usuario.click(screen.getByLabelText('Servidores de um órgão'));
    expect(screen.getByText(/declarada por você/)).toBeInTheDocument();
    expect(screen.getByText(/não há tabela oficial conferida que ligue os dois/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar coleta' })).toBeDisabled();
    await usuario.type(screen.getByLabelText('Código SIAPE do órgão'), '90001');
    await usuario.type(screen.getByLabelText('CNPJ do órgão contratante'), '90.100.001/0001-00');
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'servidores', orgaoServidorLotacao: '90001', cnpjOrgao: '90100001000100' } });

    await usuario.selectOptions(screen.getByLabelText('O código SIAPE é do órgão de'), 'exercicio');
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'servidores', orgaoServidorExercicio: '90001', cnpjOrgao: '90100001000100' } });
  });

  it('termos do PNCP: consulta os contratos do caso (do_caso)', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/PNCP — termos de contrato/));
    expect(screen.getByTestId('termos-do-caso')).toHaveTextContent('contratos do caso');
    expect(await enviar()).toEqual({ fonte: 'pncp_termos', parametros: { do_caso: true } });
  });

  it('TSE: diretório obrigatório, UF e município opcionais', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/TSE — candidaturas e receitas de campanha/));
    expect(screen.getByRole('button', { name: 'Iniciar coleta' })).toBeDisabled();
    await usuario.type(screen.getByLabelText('Diretório com os arquivos do TSE'), 'tse');
    expect(await enviar()).toEqual({ fonte: 'tse_arquivo', parametros: { diretorio: 'tse' } });
    await usuario.type(screen.getByLabelText('UF (opcional)'), 'go');
    await usuario.type(screen.getByLabelText('Município (opcional)'), 'EXEMPLOPOLIS');
    expect(await enviar()).toEqual({ fonte: 'tse_arquivo', parametros: { diretorio: 'tse', uf: 'GO', municipio: 'EXEMPLOPOLIS' } });
  });

  it('TSE: o ano da eleição é opcional, vai como texto de quatro dígitos e bloqueia o envio fora desse formato', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/TSE — candidaturas e receitas de campanha/));
    await usuario.type(screen.getByLabelText('Diretório com os arquivos do TSE'), 'tse');
    const ano = screen.getByLabelText('Ano da eleição (opcional)');
    const botao = screen.getByRole('button', { name: 'Iniciar coleta' });
    await usuario.type(ano, '24');
    expect(botao).toBeDisabled();
    expect(ano).toHaveAttribute('aria-invalid', 'true');
    await usuario.clear(ano);
    await usuario.type(ano, '20a4');
    expect(botao).toBeDisabled();
    await usuario.clear(ano);
    await usuario.type(ano, '2024');
    expect(ano).toHaveAttribute('aria-invalid', 'false');
    expect(await enviar()).toEqual({ fonte: 'tse_arquivo', parametros: { diretorio: 'tse', ano: '2024' } });
    // Em branco, o parâmetro não é enviado (o back-end usa o ano do arquivo).
    await usuario.clear(ano);
    expect(await enviar()).toEqual({ fonte: 'tse_arquivo', parametros: { diretorio: 'tse' } });
  });

  it('editais: diretório obrigatório, número de controle da contratação e CNPJ do órgão opcionais', async () => {
    const { usuario, enviar } = renderizar();
    await usuario.click(screen.getByLabelText(/Editais em texto/));
    await usuario.type(screen.getByLabelText('Diretório com os editais'), 'editais');
    expect(await enviar()).toEqual({ fonte: 'edital_arquivo', parametros: { diretorio: 'editais' } });
    await usuario.type(screen.getByLabelText(/Número de controle da contratação no PNCP/), '90100001000100-1-000001/2026');
    await usuario.type(screen.getByLabelText('CNPJ do órgão do edital (opcional)'), '90.100.001/0001-00');
    expect(await enviar()).toEqual({
      fonte: 'edital_arquivo',
      parametros: { diretorio: 'editais', numero_controle_pncp_compra: '90100001000100-1-000001/2026', cnpjOrgao: '90100001000100' },
    });
  });

  it('fonte não configurada aparece como aviso neutro, com o motivo, e não como erro', async () => {
    const motivo = 'Portal da Transparência não configurado: defina a chave de API.';
    const { usuario, enviar } = renderizar({ ...RESULTADO, captura_ids: [], entidades_novas: 0, situacao: 'nao_configurado', tentativas: 0, motivo, avisos: [motivo] });
    await usuario.click(screen.getByLabelText(/Portal da Transparência — sanções/));
    await enviar();
    const aviso = (await screen.findByText('Fonte não configurada.')).closest('.br-message')!;
    expect(aviso).toHaveClass('info');
    expect(aviso).toHaveTextContent(`Motivo: ${motivo}`);
    expect(aviso).toHaveTextContent('Não é uma falha');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Coleta concluída/)).not.toBeInTheDocument();
  });

  it('no histórico, a coleta não configurada tem etiqueta própria, o motivo uma vez só, e não conta como falha', async () => {
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <AbaColeta casoId="caso-1" />
      </SessaoProvider>,
    );
    const linhas = await screen.findAllByTestId('coleta');
    const linha = linhas.find((l) => within(l).queryByText('fonte não configurada'))!;
    expect(within(linha).getByText('fonte não configurada')).toHaveClass('situacao-coleta-nao_configurado');
    expect(within(linha).getAllByText(/Portal da Transparência não configurado/)).toHaveLength(1);
    expect(screen.getByText(/1 coleta deste caso ficou como "fonte não configurada"/)).toBeInTheDocument();
    expect(screen.getByText(/1 coleta deste caso falhou/)).toBeInTheDocument();
  });
});

describe('RF01: recursos do Portal da Transparência das tipologias de lavagem (CEPIM, CEAF e convênios)', () => {
  const RESULTADO: ColetaResultado = { captura_ids: [], entidades_novas: 0, avisos: [], coleta_id: 'col-91', situacao: 'sucesso', tentativas: 1, motivo: '', conector_nome: 'portal_transparencia', conector_versao: '1.0.0' };

  async function renderizar(recurso: RegExp) {
    const usuario = userEvent.setup();
    const iniciarColeta = vi.fn(async (_casoId: unknown, _corpo: ColetaRequisicao) => RESULTADO);
    render(
      <SessaoProvider cliente={clienteFalso({ iniciarColeta })}>
        <AbaColeta casoId="caso-1" />
      </SessaoProvider>,
    );
    await usuario.click(screen.getByLabelText(/Portal da Transparência — sanções/));
    await usuario.click(screen.getByLabelText(recurso));
    const botao = screen.getByRole('button', { name: 'Iniciar coleta' });
    const enviar = async () => {
      await usuario.click(botao);
      await waitFor(() => expect(iniciarColeta).toHaveBeenCalled());
      return iniciarColeta.mock.calls.at(-1)![1];
    };
    return { usuario, iniciarColeta, enviar, botao };
  }

  it('CEPIM: por padrão consulta as entidades do caso (do_caso); com lista, envia os CNPJs só com dígitos', async () => {
    const { usuario, enviar } = await renderizar(/CEPIM — entidades sem fins lucrativos impedidas/);
    expect(screen.getByLabelText('Entidades do caso')).toBeChecked();
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'cepim', do_caso: true } });
    await usuario.click(screen.getByLabelText('Lista de CNPJs'));
    await usuario.type(screen.getByLabelText('CNPJs a consultar'), '90.000.006/0001-51');
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'cepim', codigoSancionado: ['90000006000151'] } });
  });

  it('convênios: "do caso" são as entidades sem fins lucrativos, pela natureza jurídica; a lista é de CNPJs do convenente', async () => {
    const { usuario, enviar, botao } = await renderizar(/Convênios — por convenente/);
    expect(screen.getByLabelText('Entidades sem fins lucrativos do caso')).toBeChecked();
    expect(screen.getByTestId('alvo-do-caso')).toHaveTextContent('reconhecidas pela natureza jurídica no CNPJ');
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'convenios', do_caso: true } });
    await usuario.click(screen.getByLabelText('Lista de CNPJs'));
    expect(botao).toBeDisabled();
    await usuario.type(screen.getByLabelText('CNPJs a consultar'), '90000007000104');
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'convenios', codigoSancionado: ['90000007000104'] } });
  });

  it('CEAF: "do caso" consulta os sócios pelo nome, e a tela diz que nunca é por CPF', async () => {
    const { enviar } = await renderizar(/CEAF — expulsões da administração federal/);
    expect(screen.getByLabelText('Sócios das contratadas e convenentes do caso')).toBeChecked();
    expect(screen.getByTestId('alvo-do-caso')).toHaveTextContent('só pelo nome, nunca por CPF');
    expect(screen.getByTestId('alvo-do-caso')).toHaveTextContent('possível coincidência, não identificação');
    expect(await enviar()).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'ceaf', do_caso: true } });
  });

  it('RNF04: CEAF com lista envia só nomes (nomeSancionado); item com CPF bloqueia o envio e não aparece completo na tela', async () => {
    const { usuario, enviar, botao, iniciarColeta } = await renderizar(/CEAF — expulsões da administração federal/);
    await usuario.click(screen.getByLabelText('Lista de nomes'));
    expect(botao).toBeDisabled();
    const cpf = cpfSinteticoValido();
    const campo = screen.getByLabelText('Nomes a consultar');
    await usuario.type(campo, `FULANO FICTICIO DE TAL\n${pontuado(cpf)}`);
    expect(botao).toBeDisabled();
    const aviso = screen.getByText(/Não é nome \(tem dígitos ou não tem letras; CPF não é aceito\)/);
    expect(aviso).toHaveTextContent(mascarado(cpf));
    expect(aviso).not.toHaveTextContent(cpf);
    expect(aviso).not.toHaveTextContent(pontuado(cpf));
    expect(iniciarColeta).not.toHaveBeenCalled();

    await usuario.clear(campo);
    await usuario.type(campo, '  FULANO   FICTICIO DE TAL ;BELTRANA SINTETICA SOUZA\nFULANO FICTICIO DE TAL');
    const corpo = await enviar();
    expect(corpo).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'ceaf', nomeSancionado: ['FULANO FICTICIO DE TAL', 'BELTRANA SINTETICA SOUZA'] } });
    expect(JSON.stringify(corpo)).not.toMatch(/codigoSancionado|cpf/i);
  });

  it('lerNomes: um nome por linha ou por ponto e vírgula, sem repetição; dígitos e itens sem letras são recusados', () => {
    expect(lerNomes('ANA EXEMPLO\n\nJOSE D\'AVILA FICTICIO; ana exemplo;ANA EXEMPLO')).toEqual({ nomes: ['ANA EXEMPLO', "JOSE D'AVILA FICTICIO", 'ana exemplo'], invalidos: [] });
    expect(lerNomes('12345678900\n---\nMARIA 2')).toEqual({ nomes: [], invalidos: ['12345678900', '---', 'MARIA 2'] });
    expect(lerNomes('  ')).toEqual({ nomes: [], invalidos: [] });
  });
});
