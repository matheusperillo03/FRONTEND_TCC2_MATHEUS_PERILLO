import { describe, expect, it } from 'vitest';
import { calcularDvCnpj, cnpjValido, formatarCnpj, limparCnpj, mascaraDeCnpj, raizDoCnpj, temFormaDeCnpj } from './cnpj';
import { cnpjAlfanumerico, comDvErrado } from './test/cnpjSintetico';

describe('CNPJ numérico e alfanumérico', () => {
  it('confere o exemplo do manual da Receita/Serpro: 12.ABC.345/01DE-35', () => {
    expect(calcularDvCnpj('12ABC34501DE')).toBe('35');
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true);
    expect(cnpjValido('12.abc.345/01de-35')).toBe(true);
    expect(formatarCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(raizDoCnpj('12.ABC.345/01DE-35')).toBe('12ABC345');
  });

  it('o CNPJ numérico continua valendo (mesma conta)', () => {
    expect(calcularDvCnpj('112223330001')).toBe('81');
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(raizDoCnpj('11222333')).toBe('11222333');
  });

  it('valida CNPJs alfanuméricos sintéticos e recusa as variantes inválidas', () => {
    for (let i = 0; i < 50; i++) {
      const cnpj = cnpjAlfanumerico();
      expect(cnpjValido(cnpj)).toBe(true);
      expect(cnpjValido(formatarCnpj(cnpj).toLowerCase())).toBe(true);
      expect(limparCnpj(formatarCnpj(cnpj))).toBe(cnpj);
      expect(cnpjValido(comDvErrado(cnpj))).toBe(false);
      expect(temFormaDeCnpj(comDvErrado(cnpj))).toBe(true);
      // Letra no dígito verificador, tamanho errado e símbolo fora da máscara.
      for (const invalido of [`${cnpj.slice(0, 12)}A${cnpj[13]}`, cnpj.slice(0, 13), `${cnpj}0`, `${cnpj.slice(0, 5)}_${cnpj.slice(6)}`, `${cnpj.slice(0, 5)}Ç${cnpj.slice(6)}`, '']) {
        expect(cnpjValido(invalido)).toBe(false);
        expect(temFormaDeCnpj(invalido)).toBe(false);
      }
    }
  });

  it('calcularDvCnpj recusa entrada fora do formato e formatarCnpj devolve o que não é CNPJ', () => {
    expect(() => calcularDvCnpj('12ABC34501D')).toThrow();
    expect(() => calcularDvCnpj('12ABC34501D*')).toThrow();
    expect(formatarCnpj('123')).toBe('123');
    expect(raizDoCnpj('1234567')).toBe('');
  });

  it('máscara progressiva aceita letras, põe em maiúsculas e corta em 14 posições', () => {
    expect(mascaraDeCnpj('')).toBe('');
    expect(mascaraDeCnpj('12')).toBe('12');
    expect(mascaraDeCnpj('12a')).toBe('12.A');
    expect(mascaraDeCnpj('12abc345')).toBe('12.ABC.345');
    expect(mascaraDeCnpj('12abc34501de')).toBe('12.ABC.345/01DE');
    expect(mascaraDeCnpj('12abc34501de35999')).toBe('12.ABC.345/01DE-35');
    expect(mascaraDeCnpj('12.ABC.345/01DE-35')).toBe('12.ABC.345/01DE-35');
    expect(mascaraDeCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});
