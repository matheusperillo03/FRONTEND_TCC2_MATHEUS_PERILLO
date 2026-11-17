import { useCallback, useRef, useState } from 'react';
import { mensagemDeErro } from '../api';

export interface EstadoChamada<T> {
  dados: T | null;
  erro: string | null;
  carregando: boolean;
  executar: (fn: () => Promise<T>) => Promise<T | null>;
  limpar: () => void;
}

/** Estado padrão de uma chamada assíncrona: dados, erro e carregamento. */
export function useChamada<T>(): EstadoChamada<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const ultima = useRef(0);

  const executar = useCallback(async (fn: () => Promise<T>) => {
    const id = ++ultima.current;
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await fn();
      if (id === ultima.current) setDados(resultado);
      return resultado;
    } catch (e) {
      if (id === ultima.current) setErro(mensagemDeErro(e));
      return null;
    } finally {
      if (id === ultima.current) setCarregando(false);
    }
  }, []);

  const limpar = useCallback(() => {
    setDados(null);
    setErro(null);
  }, []);

  return { dados, erro, carregando, executar, limpar };
}
