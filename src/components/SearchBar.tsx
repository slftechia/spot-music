import { Clock, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { getSearchSuggestions } from '../services/api';
import { loadRecentSearches, saveRecentSearch } from '../services/searchHistory';

interface Props {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialQuery?: string;
}

function highlightMatch(text: string, query: string) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-white font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function SearchBar({
  onSearch,
  placeholder = 'O que você quer ouvir?',
  initialQuery = '',
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const visibleItems = query.trim().length >= 2 ? suggestions : recent;
  const showDropdown = open && visibleItems.length > 0;

  const submit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      saveRecentSearch(trimmed);
      setRecent(loadRecentSearches());
      setQuery(trimmed);
      setOpen(false);
      setActiveIndex(-1);
      onSearch(trimmed);
    },
    [onSearch]
  );

  useEffect(() => {
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const results = await getSearchSuggestions(trimmed);
        if (id === requestId.current) {
          setSuggestions(results);
          setOpen(true);
        }
      } catch {
        if (id === requestId.current) setSuggestions([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && visibleItems[activeIndex]) {
      submit(visibleItems[activeIndex]);
    } else {
      submit(query);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' && query.trim().length < 2 && recent.length > 0) {
        setOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visibleItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl z-50">
      <form onSubmit={handleSubmit}>
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-spotify-light pointer-events-none z-10"
        />
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-white text-black rounded-full py-3 pl-12 pr-10 text-sm font-medium placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-spotify-green"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setActiveIndex(-1);
              setOpen(recent.length > 0);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-black z-10"
            aria-label="Limpar"
          >
            <X size={18} />
          </button>
        )}
      </form>

      {showDropdown && (
        <ul className="absolute left-0 right-0 top-full mt-2 bg-spotify-gray border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
          {query.trim().length < 2 && recent.length > 0 && (
            <li className="px-4 py-2 text-[11px] uppercase tracking-wide text-spotify-light border-b border-white/5">
              Buscas recentes
            </li>
          )}
          {visibleItems.map((item, index) => (
            <li key={`${item}-${index}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(item)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  index === activeIndex ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                {query.trim().length < 2 ? (
                  <Clock size={16} className="text-spotify-light shrink-0" />
                ) : (
                  <Search size={16} className="text-spotify-light shrink-0" />
                )}
                <span className="text-spotify-light truncate">
                  {query.trim().length >= 2 ? highlightMatch(item, query.trim()) : item}
                </span>
              </button>
            </li>
          ))}
          {loading && query.trim().length >= 2 && (
            <li className="px-4 py-2 text-xs text-spotify-light border-t border-white/5">
              Buscando sugestões…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
