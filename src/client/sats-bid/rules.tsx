import { BidShell } from "./components.js";
import rules from "../../shared/sponsor-rules.json";
export default function RulesPage() {
  return <BidShell title="THE RULES. NO GUESSWORK."><div className="bid-rules">
    {rules.map(section => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph.includes("contact@foreign.rodeo") ? <>Contact <a href="mailto:contact@foreign.rodeo">contact@foreign.rodeo</a>{paragraph.split("contact@foreign.rodeo")[1]}</> : paragraph}</p>)}</section>)}
  </div></BidShell>;
}
