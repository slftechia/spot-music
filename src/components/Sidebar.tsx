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

export default function Sidebar({ current, onChange, showInstall, onInstall }: Props) {
  return (
    <aside className="hidden md:flex w-56 lg:w-64 flex-col gap-2 p-6 bg-spotify-black shrink-0">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-full bg-spotify-green flex items-center justify-center">
          <span className="text-black font-bold text-sm">♪</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight">Spot Music</h1>
      </div>

      <nav className="flex flex-col gap-1">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex items-center gap-4 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              current === id
                ? 'text-white bg-spotify-gray'
                : 'text-spotify-light hover:text-white'
            }`}
          >
            <Icon size={22} />
            {label}
          </button>
        ))}
        {showInstall && onInstall && (
          <button
            onClick={onInstall}
            className="flex items-center gap-4 px-3 py-2.5 rounded-md text-sm font-semibold text-spotify-green hover:text-white hover:bg-spotify-gray transition-colors mt-2"
          >
            <Smartphone size={22} />
            Instalar app
          </button>
        )}
      </nav>
    </aside>
  );
}
