# Embed seeds (A2) — verified 2026-09-22

Traffic distribution seeds. Renderers allow `frame-ancestors *`.

## Status
| Surface | Code | Prod live iframe |
|---|---|---|
| diegodella.ar | Merged ARS compact footer widget | Pending deploy (card link only as of check) |
| xposter.diegodella.ar | Merged footer embed + CSP | Pending deploy |
| audience.diegodella.ar | In progress | Not yet |

## 1. Website widget (seed)

```html
<iframe src="https://priceb.tc/embed?currency=USD" title="Bitcoin price in USD" width="480" height="240" loading="lazy"></iframe>
```

LatAm / site footer (as shipped in diegodella/xposter):

```html
<iframe src="https://priceb.tc/embed?currency=ARS&layout=compact&theme=dark&showChange=1" title="Live Bitcoin price — PRICEB.TC" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
```

## 2. OBS overlay (seed)

`https://priceb.tc/overlay?currency=USD`  
Studio: https://priceb.tc/studio?mode=overlay

## 3. Share / OG (seed)

`https://priceb.tc/?currency=ARS`

## Drop checklist
- [x] diegodella + xposter PRs merged
- [ ] Confirm iframe on prod after deploy
- [ ] audience embed when PR lands
- [ ] Optional OBS test recording
