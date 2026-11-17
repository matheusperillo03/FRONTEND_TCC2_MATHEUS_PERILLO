/**
 * CNPJ alfanumérico sintético para testes: a raiz é sorteada a cada execução (sempre com ao
 * menos uma letra e um dígito) e os dígitos verificadores são calculados pela regra oficial.
 */
import { calcularDvCnpj } from '../cnpj';

const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function raizAlfanumerica(): string {
  for (;;) {
    const v = new Uint8Array(8);
    crypto.getRandomValues(v);
    const raiz = Array.from(v, (x) => ALFABETO[x % ALFABETO.length]).join('');
    if (/[A-Z]/.test(raiz) && /\d/.test(raiz)) return raiz;
  }
}

export function cnpjAlfanumerico(raiz: string = raizAlfanumerica(), ordem = '0001'): string {
  const doze = raiz + ordem;
  return doze + calcularDvCnpj(doze);
}

export function comDvErrado(cnpj: string): string {
  return cnpj.slice(0, 13) + String((Number(cnpj[13]) + 1) % 10);
}
