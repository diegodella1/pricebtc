interface BrandProps {
  compact?: boolean;
  inverse?: boolean;
}

export function Brand({ compact = false, inverse = false }: BrandProps) {
  return (
    <a className={`brand${compact ? " brand--compact" : ""}${inverse ? " brand--inverse" : ""}`} href="/">
      <span className="brand__mark" aria-hidden="true">
        ₿
      </span>
      <span className="brand__word">PRICEB.TC</span>
      {!compact ? <span className="brand__tag">LIVE SIGNAL</span> : null}
    </a>
  );
}
