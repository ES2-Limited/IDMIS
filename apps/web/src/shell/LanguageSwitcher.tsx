import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { cn } from '@idmis/ui';

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English (NG)', nativeName: 'English', flag: '🇳🇬' },
  { code: 'ha', name: 'Hausa', nativeName: 'Harshen Hausa', flag: '🇳🇬' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Èdè Yorùbá', flag: '🇳🇬' },
  { code: 'ig', name: 'Igbo', nativeName: 'Asụsụ Igbo', flag: '🇳🇬' },
];

export interface LanguageSwitcherProps {
  variant?: 'light' | 'dark';
  className?: string;
}

export function LanguageSwitcher({ variant = 'light', className }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Normalize current language to root code
  const currentLangCode = i18n.language?.startsWith('ha')
    ? 'ha'
    : i18n.language?.startsWith('yo')
      ? 'yo'
      : i18n.language?.startsWith('ig')
        ? 'ig'
        : 'en';

  const currentOption =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLangCode) || SUPPORTED_LANGUAGES[0];

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code === 'en' ? 'en-NG' : code);
    setIsOpen(false);
  };

  const isDark = variant === 'dark';

  return (
    <div className={cn('relative inline-block text-left', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select national language"
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer border',
          isDark
            ? 'bg-slate-800/90 hover:bg-slate-700/90 text-teal-300 border-teal-500/40 hover:border-teal-400'
            : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 hover:border-slate-400 hover:text-slate-950',
        )}
      >
        <Globe
          className={cn('h-3.5 w-3.5 shrink-0', isDark ? 'text-teal-400' : 'text-teal-700')}
          aria-hidden="true"
        />
        <span className="text-[11px] font-extrabold uppercase tracking-wider">
          {currentOption.code}
        </span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="National Languages"
          className={cn(
            'absolute right-0 z-50 mt-1.5 w-52 rounded-xl p-1.5 shadow-xl border backdrop-blur-md animate-in fade-in zoom-in-95 duration-100',
            isDark
              ? 'bg-slate-900/95 border-teal-500/40 text-slate-100'
              : 'bg-white/95 border-slate-200 text-slate-900',
          )}
        >
          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 border-b border-slate-200/60 dark:border-slate-800 mb-1">
            National Languages (TRIMING)
          </div>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang.code === currentLangCode;
            return (
              <button
                key={lang.code}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(lang.code)}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-left',
                  isSelected
                    ? isDark
                      ? 'bg-teal-500/20 text-teal-300 font-extrabold'
                      : 'bg-teal-50 text-teal-900 font-extrabold'
                    : isDark
                      ? 'text-slate-200 hover:bg-slate-800 hover:text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm" aria-hidden="true">
                    {lang.flag}
                  </span>
                  <div>
                    <div className="font-extrabold">{lang.nativeName}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{lang.name}</div>
                  </div>
                </div>
                {isSelected && (
                  <Check
                    className={cn('h-4 w-4 shrink-0', isDark ? 'text-teal-400' : 'text-teal-700')}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
