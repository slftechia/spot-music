import { Home, Library, Search } from 'lucide-react';
import type { View } from '../types';

interface Props {
  current: View;
  onChange: (view: View) => void;
}

const items: { id: View; icon: typeof Home }[] = [
  { id: 'home', icon: Home },
  { id: 'search', icon: Search },
  { id: 'library', icon: Library },
];

export default function MobileNav({ current, onChange }: Props) {
  return (
    <nav className="md:hidden fixed bottom-[72px] left-0 right-0 z-40 flex justify-around bg-spotify-dark border-t border-white/10 py-2">
      {items.map(({ id, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`p-2 rounded-full transition-colors ${
            current === id ? 'text-spotify-green' : 'text-spotify-light'
          }`}
        >
          <Icon size={24} />
        </button>
      ))}
    </nav>
  );
}
