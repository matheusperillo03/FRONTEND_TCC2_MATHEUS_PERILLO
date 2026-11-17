import { describe, expect, it } from 'vitest';
import { indiceUtf16, localizarTrecho } from './localizarTrecho';

describe('localizarTrecho — posição em pontos de código, texto em UTF-16', () => {
  it('em texto só com caracteres do plano básico, a posição informada já é o índice', () => {
    const texto = 'O valor estimado é de R$ 480.000,00 (dado sintético).';
    const trecho = 'R$ 480.000,00';
    const posicao = texto.indexOf(trecho);
    expect(localizarTrecho(texto, trecho, posicao)).toEqual({ inicio: posicao, fim: posicao + trecho.length, naPosicaoInformada: true });
  });

  it('com caracteres fora do plano básico antes do trecho, converte pontos de código em índice UTF-16', () => {
    // Cada emoji é 1 ponto de código e 2 unidades UTF-16.
    const texto = '📄📄 ÓRGÃO SINTÉTICO 𝐀 contrata EMPRESA FICTICIA LTDA.';
    const trecho = 'EMPRESA FICTICIA LTDA';
    const indice = texto.indexOf(trecho);
    const pontos = Array.from(texto.slice(0, indice)).length;
    expect(pontos).toBe(indice - 3);
    expect(indiceUtf16(texto, pontos)).toBe(indice);
    const local = localizarTrecho(texto, trecho, pontos)!;
    expect(local.naPosicaoInformada).toBe(true);
    expect(texto.slice(local.inicio, local.fim)).toBe(trecho);
  });

  it('não confia às cegas na posição: se o trecho não está lá, usa a ocorrência mais próxima', () => {
    const texto = 'certidão negativa no item 3; depois, outra certidão negativa no item 9.';
    const segunda = texto.lastIndexOf('certidão negativa');
    const local = localizarTrecho(texto, 'certidão negativa', segunda + 4)!;
    expect(local).toEqual({ inicio: segunda, fim: segunda + 'certidão negativa'.length, naPosicaoInformada: false });
    expect(localizarTrecho(texto, 'certidão negativa', 2)!.inicio).toBe(0);
    // Posição absurda (negativa, além do fim ou não numérica) não quebra.
    expect(localizarTrecho(texto, 'item 9', -50)!.inicio).toBe(texto.indexOf('item 9'));
    expect(localizarTrecho(texto, 'item 3', 10_000)!.inicio).toBe(texto.indexOf('item 3'));
    expect(localizarTrecho(texto, 'item 3', Number.NaN)!.inicio).toBe(texto.indexOf('item 3'));
  });

  it('devolve null quando o trecho não existe no texto, ou quando um dos dois é vazio', () => {
    expect(localizarTrecho('texto do documento', 'trecho inventado pelo modelo', 0)).toBeNull();
    expect(localizarTrecho('texto do documento', '', 0)).toBeNull();
    expect(localizarTrecho('', 'trecho', 0)).toBeNull();
  });
});
