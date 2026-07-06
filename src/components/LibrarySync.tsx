import { useRef, useState } from 'react';
import { HardDriveDownload, HardDriveUpload, Loader2, Monitor, Smartphone } from 'lucide-react';
import { isMobileDevice } from '../utils/device';
import {
  exportLibraryZip,
  importLibraryZip,
  isLocalDevHost,
  type SyncProgress,
} from '../services/librarySync';

interface Props {
  trackCount: number;
  onImported: () => void;
}

function progressLabel(p: SyncProgress) {
  if (p.phase === 'reading') return `Lendo músicas ${p.current}/${p.total}…`;
  if (p.phase === 'zipping') return 'Compactando arquivo…';
  return 'Salvando .zip…';
}

function progressPct(p: SyncProgress) {
  if (p.phase === 'reading') return Math.round((p.current / p.total) * 85);
  if (p.phase === 'zipping') return 90;
  return 100;
}

export default function LibrarySync({ trackCount, onImported }: Props) {
  const mobile = isMobileDevice();
  const localDev = isLocalDevHost();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const handleExport = async () => {
    if (trackCount === 0) {
      alert('Nenhuma música na biblioteca para exportar.');
      return;
    }
    setExporting(true);
    setProgress(null);
    try {
      const { count, filename } = await exportLibraryZip(setProgress);
      alert(`${count} música(s) exportada(s) em "${filename}". Envie esse arquivo para o celular.`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof Error && err.message === 'EMPTY_LIBRARY') {
        alert('Biblioteca vazia.');
      } else {
        alert('Erro ao exportar. Tente fechar outras abas e exportar de novo.');
      }
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setProgress(null);
    try {
      const count = await importLibraryZip(file, setProgress);
      onImported();
      alert(`${count} música(s) importada(s)! Já pode ouvir offline.`);
    } catch (err) {
      const msg =
        err instanceof Error && err.message === 'INVALID_FILE'
          ? 'Arquivo inválido. Use o .zip exportado do PC.'
          : err instanceof Error && err.message === 'NO_TRACKS'
            ? 'Nenhuma música encontrada no arquivo.'
            : 'Erro ao importar. Verifique o arquivo.';
      alert(msg);
    } finally {
      setImporting(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const busy = exporting || importing;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-sm">Biblioteca para viagem</h3>
        <p className="text-xs text-spotify-light mt-1 leading-relaxed">
          {mobile
            ? 'No PC baixe as músicas e exporte. No celular, importe o arquivo .zip antes da viagem.'
            : 'Baixe no PC, exporte o .zip e importe no celular. Na estrada ouça offline sem baixar de novo.'}
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
            <li>Clique em Exportar biblioteca</li>
            <li>Envie o .zip ao celular (Drive, WhatsApp…)</li>
          </ol>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy || trackCount === 0}
            className="mt-auto flex items-center justify-center gap-2 py-2 px-3 rounded-full bg-spotify-green text-black text-sm font-semibold disabled:opacity-40"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <HardDriveDownload size={16} />}
            Exportar biblioteca
          </button>
        </div>

        <div className="rounded-lg bg-spotify-dark/80 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-spotify-green text-sm font-medium">
            <Smartphone size={16} />
            No celular
          </div>
          <ol className="text-xs text-spotify-light space-y-1 list-decimal list-inside">
            <li>Receba o arquivo .zip do PC</li>
            <li>Toque em Importar biblioteca</li>
            <li>Ouça offline na viagem</li>
          </ol>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => handleImport(e.target.files?.[0])}
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
            Bibliotecas grandes podem levar alguns minutos. Não feche a aba.
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
