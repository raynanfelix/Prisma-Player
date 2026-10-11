/** Contador estável de espectadores (prova social): varia por hora, igual para todos na mesma hora. */
export function hookLiveViewersCount(seed: string): number {
  const hour = new Date().getHours();
  let hash = hour * 31;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return 87 + (hash % 380);
}
