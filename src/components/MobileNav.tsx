import { Home, Library, Search, Smartphone } from 'lucide-react';
import type { View } from '../types';

interface Props {
  current: View;
  onChange: (view: View) => void;
  showInstall?: boolean;
  onInstall?: () => void;
}

const items: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'search', label: 'Buscar', icon: Search },
  { id: 'library', label: 'Biblioteca', icon: Library },
];

export default function MobileNav({ current, onChange, showInstall, onInstall }: Props) {
  return (
    <nav className="md:hidden fixed bottom-[72px] left-0 right-0 z-40 flex justify-around bg-spotify-dark border-t border-white/10 py-1.5 px-1">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex flex-col items-center gap-0.5 min-w-[52px] px-1 py-1 rounded-lg transition-colors ${
            current === id ? 'text-spotify-green' : 'text-spotify-light'
          }`}
          aria-label={label}
        >
          <Icon size={22} />
          <span className="text-[10px] font-medium leading-none">{label}</span>
        </button>
      ))}
      {showInstall && onInstall && (
        <button
          onClick={onInstall}
          className="flex flex-col items-center gap-0.5 min-w-[52px] px-1 py-1 rounded-lg text-spotify-green"
          aria-label="Instalar app"
        >
          <Smartphone size={22} />
          <span className="text-[10px] font-semibold leading-none">Instalar</span>
        </button>
      )}
    </nav>
  );
}
