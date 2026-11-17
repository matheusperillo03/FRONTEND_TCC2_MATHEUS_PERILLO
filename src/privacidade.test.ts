import { formatarCnpj } from './cnpj';
import { cnpjAlfanumerico } from './test/cnpjSintetico';
import { describe, expect, it } from 'vitest';
import { cpfComDigitosValidos, mascararCpfs, mascararCpfsDoCampo, mascararCpfsEmValor } from './privacidade';

import { comVerificadorErrado, cpfSinteticoValido, mascarado } from './test/cpfSintetico';

// CPFs de teste sintéticos. Os de dígito verificador inválido (000.666.666-00,
// 999.987.654-00) não são CPF de ninguém. Onde o teste precisa de dígitos
// verificadores que conferem, o número é gerado a cada execução
// (src/test/cpfSintetico.ts), para que nenhum CPF válido fique no repositório.
const CPF_EXEMPLO = cpfSinteticoValido();
const MASCARADO = mascarado(CPF_EXEMPLO);

describe('mascararCpfs — CPF só no formato descaracterizado (RNF04)', () => {
  it('troca 11 dígitos seguidos com dígitos verificadores válidos, em qualquer contexto', () => {
    expect(cpfComDigitosValidos(CPF_EXEMPLO)).toBe(true);
    expect(mascararCpfs(CPF_EXEMPLO)).toBe(MASCARADO);
    expect(mascararCpfs(`Servidor RICARDO FICTICIO LIMA (${CPF_EXEMPLO}) no órgão 90001`)).toBe(`Servidor RICARDO FICTICIO LIMA (${MASCARADO}) no órgão 90001`);
    // Mesmo onde o texto sugere outra coisa, o CPF de verdade não passa.
    expect(mascararCpfs(`telefone ${CPF_EXEMPLO}`)).toBe(`telefone ${MASCARADO}`);
    expect(mascararCpfs(`${CPF_EXEMPLO}/2026`)).toBe(`${MASCARADO}/2026`);
    expect(mascararCpfs(`${CPF_EXEMPLO.slice(0, 3)}.${CPF_EXEMPLO.slice(3, 6)}.${CPF_EXEMPLO.slice(6)}`)).toBe(MASCARADO);
  });

  it('troca o CPF pontuado (com hífen antes dos dois últimos dígitos), mesmo com dígito verificador inválido', () => {
    expect(mascararCpfs('CPF 000.666.666-00.')).toBe('CPF ***666666**.');
    expect(mascararCpfs('000666666-00')).toBe('***666666**');
    expect(mascararCpfs('doador 000.123.456-00 e sócio 999.987.654-00')).toBe('doador ***123456** e sócio ***987654**');
  });

  it('troca 11 dígitos com dígito verificador inválido quando a palavra CPF vem antes', () => {
    expect(mascararCpfs('CPF 00066666600')).toBe('CPF ***666666**');
    expect(mascararCpfs('cpf: 00066666600; telefone 61999990000')).toBe('cpf: ***666666**; telefone 61999990000');
    expect(mascararCpfs('O sócio de CPF nº 00066666600 coincide')).toBe('O sócio de CPF nº ***666666** coincide');
    expect(mascararCpfs('{"cpf":"00066666600","telefone":"61999990000"}')).toBe('{"cpf":"***666666**","telefone":"61999990000"}');
  });

  it('não troca número de 11 dígitos que não é CPF: telefone, número de controle, valor e parte de identificador', () => {
    for (const texto of [
      'telefone 61999990000',
      'Contato: 61 999990000 ou 61999990000.',
      'número de controle 20260000123',
      'protocolo 00012345678/2026',
      'processo 90100001000-1',
      'valor 12345678900',
      'valorGlobal=123456.78900',
      'sequencial 00000000042 do lote',
      'matrícula (00066666600)',
      '00000000000',
      '11111111111',
    ]) {
      expect(mascararCpfs(texto), texto).toBe(texto);
    }
  });

  it('não confunde a palavra CPF distante, nem número depois de outro número, com contexto de CPF', () => {
    // Entre "CPF" e o número há outro número: o contexto é do primeiro.
    expect(mascararCpfs('CPF 000.666.666-00, telefone 61999990000')).toBe('CPF ***666666**, telefone 61999990000');
    expect(mascararCpfs('O CPF do sócio consta da ficha cadastral arquivada no órgão, protocolo 20260000123')).toBe(
      'O CPF do sócio consta da ficha cadastral arquivada no órgão, protocolo 20260000123',
    );
    expect(mascararCpfs('cpfs válidos: nenhum; lote 20260000123')).toBe('cpfs válidos: nenhum; lote 20260000123');
  });

  it('reescreve o formato já descaracterizado com pontuação e mantém o que já está certo', () => {
    expect(mascararCpfs('***.123.456-**')).toBe('***123456**');
    expect(mascararCpfs('sócio ***666666** de DELTA')).toBe('sócio ***666666** de DELTA');
  });

  it('não toca em CNPJ de 14 dígitos, com ou sem pontuação, nem no número de controle do PNCP', () => {
    for (const texto of [
      '90000006000151',
      '90.000.006/0001-51',
      'CNPJ 90100001000100 do órgão',
      '90100001000100-2-000004/2026',
      '12.345.678/0001-95',
      'CPF/CNPJ do sócio: 90100001000100',
      'CNPJ básico 90100001, ordem 0001, DV 00',
    ]) {
      expect(mascararCpfs(texto), texto).toBe(texto);
    }
  });

  it('não toca em hash, em números mais curtos ou mais longos, nem em datas', () => {
    const hash = 'a3f012345678901bc'.padEnd(64, '0');
    for (const texto of [hash, `a${CPF_EXEMPLO}`, `${CPF_EXEMPLO}b`, `1${CPF_EXEMPLO}`, '1234567890', '123456789012', '2026-11-16T10:00:06Z', 'R$ 1.200.000,00', 'R$ 123.456.789,01', 'dataInicial=20260101&dataFinal=20260331']) {
      expect(mascararCpfs(texto), texto).toBe(texto);
    }
  });

  it('aceita texto vazio', () => {
    expect(mascararCpfs('')).toBe('');
  });

  it('contextoCpf e mascararCpfsDoCampo: num campo de CPF, todo candidato é descaracterizado', () => {
    expect(mascararCpfs('00066666600', { contextoCpf: true })).toBe('***666666**');
    expect(mascararCpfsDoCampo('cpf_socio', '00066666600')).toBe('***666666**');
    expect(mascararCpfsDoCampo('cpfDoador', '00066666600')).toBe('***666666**');
    expect(mascararCpfsDoCampo('telefone', '61999990000')).toBe('61999990000');
    expect(mascararCpfsDoCampo('telefone', CPF_EXEMPLO)).toBe(MASCARADO);
    // O contexto não alcança o CNPJ.
    expect(mascararCpfsDoCampo('cpf_cnpj', '90100001000100')).toBe('90100001000100');
  });

  it('mascararCpfsEmValor percorre objetos e listas, usa o nome do campo como contexto e preserva o que não é texto', () => {
    expect(
      mascararCpfsEmValor({
        cpf: '000.666.666-00',
        cpfs: ['00066666600', 7],
        socio: { nr_cpf: '00066666600', telefone: '61999990000' },
        lista: [CPF_EXEMPLO, '61999990000'],
        telefone: '61999990000',
        n: 12345678901,
        nulo: null,
        cnpj: '90000006000151',
      }),
    ).toEqual({
      cpf: '***666666**',
      cpfs: ['***666666**', 7],
      socio: { nr_cpf: '***666666**', telefone: '61999990000' },
      lista: [MASCARADO, '61999990000'],
      telefone: '61999990000',
      n: 12345678901,
      nulo: null,
      cnpj: '90000006000151',
    });
  });
});

describe('cpfComDigitosValidos', () => {
  it('confere os dois dígitos verificadores e recusa sequências de um dígito só', () => {
    expect(cpfComDigitosValidos(CPF_EXEMPLO)).toBe(true);
    expect(cpfComDigitosValidos(comVerificadorErrado(CPF_EXEMPLO))).toBe(false);
    expect(cpfComDigitosValidos(CPF_EXEMPLO.slice(0, 9) + String((Number(CPF_EXEMPLO[9]) + 1) % 10) + CPF_EXEMPLO[10])).toBe(false);
    expect(cpfComDigitosValidos('00066666600')).toBe(false);
    expect(cpfComDigitosValidos('00000000000')).toBe(false);
    expect(cpfComDigitosValidos('99999999999')).toBe(false);
    expect(cpfComDigitosValidos(CPF_EXEMPLO.slice(0, 10))).toBe(false);
    expect(cpfComDigitosValidos(`${CPF_EXEMPLO.slice(0, 3)}.${CPF_EXEMPLO.slice(3, 6)}.${CPF_EXEMPLO.slice(6, 9)}-${CPF_EXEMPLO.slice(9)}`)).toBe(false);
  });
});

describe('mascararCpfs e o CNPJ alfanumérico', () => {
  it('não altera CNPJ alfanumérico (14 posições com letras), com ou sem pontuação', () => {
    for (let i = 0; i < 30; i++) {
      const cnpj = cnpjAlfanumerico();
      expect(mascararCpfs(cnpj)).toBe(cnpj);
      expect(mascararCpfs(`Contratada ${formatarCnpj(cnpj)} (CNPJ)`)).toBe(`Contratada ${formatarCnpj(cnpj)} (CNPJ)`);
      expect(mascararCpfsEmValor({ cnpj, estabelecimentos: [{ cnpj }] })).toEqual({ cnpj, estabelecimentos: [{ cnpj }] });
    }
    expect(mascararCpfs('12.ABC.345/01DE-35')).toBe('12.ABC.345/01DE-35');
  });
});
