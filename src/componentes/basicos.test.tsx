import { describe, expect, it } from 'vitest';
import { contar } from './basicos';

describe('contar — número com o substantivo concordando', () => {
  it('usa o singular só para 1; zero e os demais vão para o plural', () => {
    expect(contar(1, 'aviso')).toBe('1 aviso');
    expect(contar(0, 'aviso')).toBe('0 avisos');
    expect(contar(2, 'aviso')).toBe('2 avisos');
  });

  it('aceita o plural irregular e expressões com adjetivo', () => {
    expect(contar(1, 'sugestão', 'sugestões')).toBe('1 sugestão');
    expect(contar(6, 'sugestão', 'sugestões')).toBe('6 sugestões');
    expect(contar(2, 'tarefa aberta', 'tarefas abertas')).toBe('2 tarefas abertas');
  });
});
