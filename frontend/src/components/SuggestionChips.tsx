interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}

/** Clickable AI-generated follow-up prompts shown under a reply. */
export function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="suggestions" role="group" aria-label="Suggested follow-up prompts">
      <span className="muted small" id="explore-label">Explore</span>
      <div className="suggestion-row" aria-labelledby="explore-label">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            className="suggestion-chip"
            disabled={disabled}
            onClick={() => onSelect(text)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
