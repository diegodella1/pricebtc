interface CurrencyChipsProps {
  value: string;
  onChange: (currency: string) => void;
  currencies: Array<{ code: string; indicative?: boolean }>;
}

export function CurrencyChips({ value, onChange, currencies }: CurrencyChipsProps) {
  const displayCurrencies = ["USD", "ARS", "BRL", "MXN"].filter((code) =>
    currencies.some((c) => c.code === code)
  );

  return (
    <div className="currency-chips" role="radiogroup" aria-label="Select currency">
      {displayCurrencies.map((code) => {
        const isIndicative = currencies.find((c) => c.code === code)?.indicative;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={value === code}
            className={`currency-chip${value === code ? " currency-chip--active" : ""}`}
            onClick={() => onChange(code)}
            title={isIndicative ? `${code} (indicative rate)` : code}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
