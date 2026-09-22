# Embed seeds (A2) — verified 2026-09-22

Traffic distribution seeds. Renderers allow `frame-ancestors *`.

## 1. Website widget (seed)

```html
<iframe src="https://priceb.tc/embed?currency=USD" title="Bitcoin price in USD" width="480" height="240" loading="lazy"></iframe>
```

LatAm display:

```html
<iframe src="https://priceb.tc/embed?currency=ARS" title="Bitcoin price in ARS" width="480" height="240" loading="lazy"></iframe>
```

## 2. OBS overlay (seed)

Browser Source URL (configure further in Studio):

`https://priceb.tc/overlay?currency=USD`

Studio: https://priceb.tc/studio?mode=overlay

## 3. Share / OG (seed)

`https://priceb.tc/?currency=ARS` — dynamic OG title/image verified in prod.

## Drop checklist
- [ ] Paste widget on one live page (diegodella.ar or ally)
- [ ] Add overlay Browser Source once (test recording OK)
- [ ] One public share of ARS (or BRL/MXN) OG URL

Distribot: snippets verified via HTTP 200 + CSP. Placement on third-party sites still needs Diego/ally once.
