export function SponsorInventory() {
  return <div className="sponsor-inventory" aria-label="Sponsor placements">
    {[
      { number: "01", name: "Beside the Bitcoin price", text: "A dedicated space on the homepage, visible on desktop and mobile.", place: "PRICEB.TC homepage", future: false, kind: "header" },
      { number: "02", name: "On a livestream", text: "A future sponsor placement inside OBS overlays. Not included in current widgets.", place: "OBS overlay concept", future: true, kind: "stream" },
      { number: "03", name: "On a website", text: "A future sponsor placement inside website widgets. Not included in current embeds.", place: "Website widget concept", future: true, kind: "web" },
    ].map(item => <article className="inventory-row" key={item.number}>
      <div className="inventory-copy"><span className="section-kicker">Placement {item.number}</span><h3>{item.name}</h3><p>{item.text}</p><span className="placement-state">{item.future ? "Future placement · Coming soon" : "Homepage sponsor space"}</span></div>
      <div className={`inventory-example inventory-example--${item.kind}`} aria-label={`${item.place}, example preview`}><span className="example-label">Example preview · {item.place}</span><div className="example-context"><span>₿ Bitcoin price</span><div className="example-brand"><span aria-hidden="true">Y</span><div><small>Sponsor</small><strong>Your brand</strong></div></div></div></div>
    </article>)}
  </div>;
}
