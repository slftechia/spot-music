import { Download, Home, Library, Search } from 'lucide-react';
import type { View } from '../types';

interface Props {
  current: View;
  onChange: (view: View) => void;
  showInstall?: boolean;
  onInstall?: () => void;
}

const items: { id: View; icon: typeof Home }[] = [
  { id: 'home', icon: Home },
  { id: 'search', icon: Search },
  { id: 'library', icon: Library },
];

export default function MobileNav({ current, onChange, showInstall, onInstall }: Props) {
  return (
    <nav className="md:hidden fixed bottom-[72px] left-0 right-0 z-40 flex justify-around bg-spotify-dark border-t border-white/10 py-2">
      {items.map(({ id, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`p-2 rounded-full transition-colors ${
            current === id ? 'text-spotify-green' : 'text-spotify-light'
          }`}
          aria-label={id}
        >
          <Icon size={24} />
        </button>
      ))}
      {showInstall && onInstall && (
        <button
          onClick={onInstall}
          className="p-2 rounded-full text-spotify-green"
          aria-label="Instalar app"
          title="Instalar app"
        >
          <Download size={24} />
        </button>
      )}
    </nav>
  );
}
