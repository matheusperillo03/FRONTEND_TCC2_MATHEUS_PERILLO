/**
 * SHA-256 em hexadecimal, pela Web Crypto do navegador. Devolve `null` onde a
 * API não existe (página fora de contexto seguro, por exemplo): quem chama
 * mostra então só o valor informado pelo servidor.
 */
export async function sha256Hex(dados: ArrayBuffer | Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const bytes = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
    // Cópia num ArrayBuffer próprio: o digest não aceita visão sobre SharedArrayBuffer.
    const resumo = await subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
    return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Bytes de um Blob (com `FileReader` onde `Blob.arrayBuffer` não existe). */
export function bytesDoBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(leitor.result as ArrayBuffer);
    leitor.onerror = () => rejeitar(leitor.error ?? new Error('Não foi possível ler o arquivo.'));
    leitor.readAsArrayBuffer(blob);
  });
}
