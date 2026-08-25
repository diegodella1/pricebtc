import type { CurrencyInfo } from "../../shared/contracts.js";

interface CurrencySelectProps {
  currencies: CurrencyInfo[];
  value: string;
  onChange: (currency: string) => void;
  id: string;
  label?: string;
  compact?: boolean;
}

export function CurrencySelect({
  currencies,
  value,
  onChange,
  id,
  label = "Display currency",
  compact = false,
}: CurrencySelectProps) {
  return (
    <label className={`currency-field${compact ? " currency-field--compact" : ""}`} htmlFor={id}>
      <span className="currency-field__label">{label}</span>
      <span className="currency-field__control">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
              {currency.indicative ? " (indicative)" : ""}
            </option>
          ))}
        </select>
        <span aria-hidden="true">⌄</span>
      </span>
    </label>
  );
}
