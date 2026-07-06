interface Props {
  onRefresh: () => void;
  onDismiss: () => void;
}

export default function UpdateBanner({ onRefresh, onDismiss }: Props) {
  return (
    <div className="sticky top-0 z-[60] bg-spotify-green text-black px-4 py-2.5 flex items-center justify-between gap-3 text-sm shadow-lg">
      <p className="font-medium min-w-0 truncate">Nova versão disponível</p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-1 rounded-full text-black/70 hover:text-black font-medium"
        >
          Depois
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1 rounded-full bg-black text-white font-semibold hover:bg-black/90"
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
