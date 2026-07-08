/**
 * Pede ao navegador para não apagar dados do IndexedDB automaticamente
 * (falta de espaço, limpeza de cache, etc.).
 *
 * Não impede desinstalação manual — isso é controle do Android/Chrome.
 * Se o usuário desinstalar E limpar dados, a biblioteca some.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;

    const already = await navigator.storage.persisted();
    if (already) return true;

    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
