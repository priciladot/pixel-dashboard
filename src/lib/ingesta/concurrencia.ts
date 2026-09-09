/**
 * Corre `fn` sobre `items` con un máximo de `limite` llamadas en vuelo a la
 * vez. HubSpot limita cada Private App a 100 peticiones / 10 segundos --
 * disparar todos los lotes de golpe con Promise.all (como se hacía antes)
 * funciona con volúmenes chicos, pero con miles de actividades genera
 * decenas de peticiones simultáneas que chocan con ese límite en cascada:
 * todas reciben 429, todas reintentan a la vez tras la misma espera, y
 * vuelven a chocar. Este limitador de concurrencia evita el problema de raíz
 * en vez de depender de que el reintento se salve solo.
 */
export async function conLimiteDeConcurrencia<T, R>(
  items: T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let siguiente = 0;

  async function trabajador() {
    while (siguiente < items.length) {
      const miIndice = siguiente++;
      resultados[miIndice] = await fn(items[miIndice], miIndice);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, items.length) }, () => trabajador()),
  );
  return resultados;
}
