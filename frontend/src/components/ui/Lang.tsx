import { useLang } from '../../i18n';

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-rim bg-surface2">
      <button
        onClick={() => setLang('en')}
        className={`cursor-pointer border-none px-2.5 py-1.5 font-mono text-[11px] font-bold transition-colors ${
          lang === 'en' ? 'bg-accent text-black' : 'bg-transparent text-muted hover:text-ink'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLang('ru')}
        className={`cursor-pointer border-none px-2.5 py-1.5 font-mono text-[11px] font-bold transition-colors ${
          lang === 'ru' ? 'bg-accent text-black' : 'bg-transparent text-muted hover:text-ink'
        }`}
      >
        RU
      </button>
    </div>
  );
}
