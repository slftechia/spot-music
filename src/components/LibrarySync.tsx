import { useRef, useState } from 'react';
import { CheckSquare, HardDriveDownload, HardDriveUpload, Loader2, Monitor, Smartphone } from 'lucide-react';
import { isMobileDevice } from '../utils/device';
import {
  exportLibraryZip,
  importLibraryZip,
  isLocalDevHost,
  type SyncProgress,
} from '../services/librarySync';

interface Props {
  trackCount: number;
  selectionMode?: boolean;
  selectedCount?: number;
  selectedTrackIds?: string[];
  onImported: () => void;
  onEnterSelection?: () => void;
  onExitSelection?: () => void;
}

function progressLabel(p: SyncProgress) {
  const part =
    p.parts && p.parts > 1 && p.part ? ` (parte ${p.part}/${p.parts})` : '';
  if (p.phase === 'reading') return `Preparando músicas ${p.current}/${p.total}${part}…`;
  if (p.phase === 'zipping') return `Compactando${part}…`;
  if (p.phase === 'saving') return `Salvando .zip${part}…`;
  if (p.phase === 'extracting') return 'Lendo arquivo .zip…';
  return `Importando ${p.current}/${p.total}…`;
}

function progressPct(p: SyncProgress) {
  if (p.phase === 'reading' && p.total) return Math.round((p.current / p.total) * 70);
  if (p.phase === 'zipping') return 80;
  if (p.phase === 'saving') return 95;
  if (p.phase === 'extracting') return 15;
  if (p.phase === 'importing' && p.total) return 15 + Math.round((p.current / p.total) * 85);
  return 0;
}

export default function LibrarySync({
  trackCount,
  selectionMode,
  selectedCount = 0,
  selectedTrackIds = [],
  onImported,
  onEnterSelection,
  onExitSelection,
}: Props) {
  const mobile = isMobileDevice();
  const localDev = isLocalDevHost();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const exportSelectedOnly = selectionMode && selectedCount > 0;

  const handleExport = async () => {
    if (trackCount === 0) {
      alert('Nenhuma música na biblioteca para exportar.');
      return;
    }
    if (selectionMode && selectedCount === 0) {
      alert('Marque pelo menos uma música para exportar.');
      return;
    }

    setExporting(true);
    setProgress(null);
    try {
      const trackIds = exportSelectedOnly ? selectedTrackIds : undefined;
      const { count, filenames } = await exportLibraryZip(setProgress, trackIds);
      const filesText =
        filenames.length === 1
          ? `"${filenames[0]}"`
          : `${filenames.length} arquivos:\n${filenames.join('\n')}`;
      alert(
        `${count} música(s) exportada(s).\n\n${filesText}\n\n${
          filenames.length > 1
            ? 'Importe TODOS os arquivos no celular, um por vez.'
            : 'Envie esse arquivo para o celular.'
        }`
      );
      if (selectionMode) onExitSelection?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof Error && err.message === 'EMPTY_LIBRARY') {
        alert('Biblioteca vazia.');
      } else if (err instanceof Error && err.message === 'EMPTY_SELECTION') {
        alert('Nenhuma música selecionada.');
      } else {
        alert('Erro ao exportar. Tente fechar outras abas e exportar de novo.');
      }
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const handleImport = async (fileList: FileList | null | undefined) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setImporting(true);
    setProgress(null);
    try {
      let total = 0;
      for (let i = 0; i < files.length; i++) {
        const count = await importLibraryZip(files[i], setProgress);
        total += count;
      }
      onImported();
      alert(`${total} música(s) importada(s)! Já pode ouvir offline.`);
    } catch (err) {
      const msg =
        err instanceof Error && err.message === 'INVALID_FILE'
          ? 'Arquivo inválido. Use o .zip exportado do PC.'
          : err instanceof Error && err.message === 'NO_TRACKS'
            ? 'Nenhuma música encontrada no arquivo.'
            : 'Erro ao importar. Feche outras abas, use Wi‑Fi e tente de novo.';
      alert(msg);
    } finally {
      setImporting(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const busy = exporting || importing;
  const exportLabel = exportSelectedOnly
    ? `Exportar selecionadas (${selectedCount})`
    : 'Exportar biblioteca';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-sm">Biblioteca para viagem</h3>
        <p className="text-xs text-spotify-light mt-1 leading-relaxed">
          {mobile
            ? 'Importe o .zip do PC (pode ser grande — use Wi‑Fi e aguarde). Bibliotecas grandes vêm em várias partes.'
            : 'Marque as músicas que quer levar, exporte o .zip e importe no celular.'}
        </p>
        <p className="text-[11px] text-amber-300/90 mt-2 leading-relaxed">
          Não desinstale o app para atualizar — a atualização é automática. Desinstalar pode apagar a biblioteca.
          Exporte o .zip e guarde no Drive como backup.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-spotify-dark/80 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-spotify-green text-sm font-medium">
            <Monitor size={16} />
            No PC
          </div>
          <ol className="text-xs text-spotify-light space-y-1 list-decimal list-inside">
            <li>Baixe as músicas aqui {localDev ? '(modo local)' : '(rode o app localmente)'}</li>
            <li>Marque as que quer exportar (ou exporte tudo)</li>
            <li>Envie os .zip ao celular (Drive, WhatsApp…)</li>
          </ol>
          {!mobile && trackCount > 0 && !selectionMode && (
            <button
              type="button"
              onClick={onEnterSelection}
              disabled={busy}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-full border border-white/20 text-sm font-medium hover:border-white/40 disabled:opacity-40"
            >
              <CheckSquare size={16} />
              Selecionar músicas
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={busy || trackCount === 0 || (selectionMode && selectedCount === 0)}
            className="mt-auto flex items-center justify-center gap-2 py-2 px-3 rounded-full bg-spotify-green text-black text-sm font-semibold disabled:opacity-40"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <HardDriveDownload size={16} />}
            {exportLabel}
          </button>
        </div>

        <div className="rounded-lg bg-spotify-dark/80 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-spotify-green text-sm font-medium">
            <Smartphone size={16} />
            No celular
          </div>
          <ol className="text-xs text-spotify-light space-y-1 list-decimal list-inside">
            <li>Receba o(s) .zip do PC</li>
            <li>Toque em Importar biblioteca</li>
            <li>Se houver parte1, parte2… importe todos</li>
          </ol>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            multiple
            className="hidden"
            onChange={(e) => handleImport(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="mt-auto flex items-center justify-center gap-2 py-2 px-3 rounded-full border border-spotify-green text-spotify-green text-sm font-semibold disabled:opacity-40"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <HardDriveUpload size={16} />}
            Importar biblioteca
          </button>
        </div>
      </div>

      {progress && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-spotify-light">
            <span>{progressLabel(progress)}</span>
            <span>{progressPct(progress)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-spotify-green transition-all duration-300"
              style={{ width: `${progressPct(progress)}%` }}
            />
          </div>
          <p className="text-[11px] text-spotify-light">
            Arquivos grandes podem levar vários minutos. Não feche a aba — clique em Aguarde se o Chrome avisar.
          </p>
        </div>
      )}

      {!localDev && !mobile && (
        <p className="text-[11px] text-amber-300/90">
          Dica: downloads no site online podem falhar. No PC rode{' '}
          <code className="bg-black/30 px-1 rounded">npm run dev:all</code> e abra localhost:5173 para baixar.
        </p>
      )}
    </div>
  );
}
