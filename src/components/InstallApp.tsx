import { Smartphone, X } from 'lucide-react';

interface Props {
  open: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  hasNativePrompt: boolean;
  onClose: () => void;
  onInstall: () => void;
}

export default function InstallApp({
  open,
  isIOS,
  isAndroid,
  hasNativePrompt,
  onClose,
  onInstall,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-sm bg-spotify-gray rounded-2xl p-6 shadow-xl border border-white/10">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-spotify-green flex items-center justify-center shrink-0">
              <span className="text-black font-bold text-lg">♪</span>
            </div>
            <div>
              <h2 className="text-lg font-bold">Instalar Spot Music</h2>
              <p className="text-sm text-spotify-light">Abra direto da tela inicial, sem link.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-spotify-light hover:text-white p-1"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {hasNativePrompt ? (
          <button
            type="button"
            onClick={onInstall}
            className="w-full py-3 rounded-full bg-spotify-green text-black font-semibold flex items-center justify-center gap-2"
          >
            <Smartphone size={18} />
            Instalar agora
          </button>
        ) : isIOS ? (
          <ol className="text-sm text-spotify-light space-y-3">
            <li>
              No <strong className="text-white">Safari</strong>, toque em{' '}
              <strong className="text-white">Compartilhar</strong> (ícone na barra inferior)
            </li>
            <li>
              Role e toque em <strong className="text-white">Adicionar à Tela de Início</strong>
            </li>
            <li>
              Toque em <strong className="text-white">Adicionar</strong>
            </li>
          </ol>
        ) : isAndroid ? (
          <ol className="text-sm text-spotify-light space-y-3 list-decimal list-inside">
            <li>
              Toque no menu <strong className="text-white">⋮</strong> do Chrome (canto superior)
            </li>
            <li>
              Selecione <strong className="text-white">Instalar app</strong> ou{' '}
              <strong className="text-white">Adicionar à tela inicial</strong>
            </li>
            <li>
              Confirme em <strong className="text-white">Instalar</strong>
            </li>
          </ol>
        ) : (
          <p className="text-sm text-spotify-light">
            No navegador, use o menu e procure por <strong className="text-white">Instalar app</strong> ou{' '}
            <strong className="text-white">Adicionar à tela inicial</strong>.
          </p>
        )}

        {!hasNativePrompt && (
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-4 py-2.5 rounded-full border border-white/20 text-sm font-medium hover:bg-white/5"
          >
            Entendi
          </button>
        )}
      </div>
    </div>
  );
}
