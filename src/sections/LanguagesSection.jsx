/**
 * Spoken languages with a 5-dot proficiency indicator. Manual-only — there is no platform
 * that reports how well someone speaks a language, so unlike skills this never claims
 * evidence it does not have.
 *
 * @param {{languages: import('../core/schema/types.js').LanguageItem[]}} props
 */
export default function LanguagesSection({ languages }) {
  if (!languages || languages.length === 0) return null
  return (
    <div className="languages-list">
      {languages.map((lang) => (
        <div key={lang.name} className="language-item">
          <span>{lang.name}{lang.label ? ` — ${lang.label}` : ''}</span>
          {typeof lang.level === 'number' && (
            <div className="language-dots" aria-label={`${lang.level} out of 5`}>
              {[...Array(5)].map((_, i) => (
                <span key={i} className={`dot ${i < lang.level ? 'filled' : ''}`} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
