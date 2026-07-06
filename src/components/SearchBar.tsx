import { Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

interface Props {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ onSearch, placeholder = 'O que você quer ouvir?' }: Props) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-xl">
      <Search
        size={20}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-spotify-light pointer-events-none"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white text-black rounded-full py-3 pl-12 pr-10 text-sm font-medium placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-spotify-green"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-black"
        >
          <X size={18} />
        </button>
      )}
    </form>
  );
}
