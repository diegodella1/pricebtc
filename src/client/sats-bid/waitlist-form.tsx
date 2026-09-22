import { useState, useTransition, type FormEvent } from "react";
import siteContent from "../../shared/site-content.json";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "success" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !email.includes("@")) {
      setEmailError(true);
      return;
    }

    setEmailError(false);
    startTransition(async () => {
      try {
        const response = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email: email.trim(), 
            xHandle: xHandle.trim() || undefined 
          }),
        });

        if (response.ok) {
          setSubmitState("success");
          setEmail("");
          setXHandle("");
        } else {
          setSubmitState("error");
        }
      } catch {
        setSubmitState("error");
      }
    });
  };

  return (
    <div className="bid-waitlist" id="waitlist">
      <h2 className="bid-waitlist-heading">Get notified when sponsorship launches</h2>
      <p className="bid-waitlist-intro">
        Be among the first to claim a Top 21 spot. Lightning payments open soon.
      </p>
      
      {submitState === "success" ? (
        <div className="bid-waitlist-success">
          <p className="bid-waitlist-success-message">
            <strong>You're on the list.</strong>
          </p>
          <p className="bid-waitlist-success-detail">
            We'll email you once when Lightning payments open.
          </p>
        </div>
      ) : (
        <form className="bid-waitlist-form" onSubmit={handleSubmit} noValidate>
          <div className="bid-waitlist-fields">
            <label>
              <span>EMAIL (REQUIRED)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(false);
                  setSubmitState("idle");
                }}
                placeholder="you@example.com"
                required
                aria-invalid={emailError}
                disabled={isPending}
              />
              {emailError && (
                <span className="bid-field-error">Enter a valid email.</span>
              )}
            </label>
            <label>
              <span>X HANDLE (OPTIONAL)</span>
              <input
                type="text"
                value={xHandle}
                onChange={(e) => {
                  setXHandle(e.target.value);
                  setSubmitState("idle");
                }}
                placeholder="@yourhandle"
                disabled={isPending}
              />
            </label>
          </div>

          {submitState === "error" && (
            <p className="bid-waitlist-error">
              Failed to submit. Please try again.
            </p>
          )}

          <button 
            type="submit" 
            className="bid-waitlist-submit"
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? "Submitting…" : "Join the waitlist"}
          </button>

          <p className="bid-waitlist-privacy">
            We'll only use this for waitlist updates.{" "}
            <a href="/privacy">Privacy policy</a>
          </p>
        </form>
      )}

      <div className="bid-waitlist-secondary">
        <p>Or reach out directly:</p>
        <div className="bid-waitlist-links">
          <a 
            href={`mailto:${siteContent.contactEmail}?subject=Sponsor%20Waitlist`}
            className="bid-link-secondary"
          >
            Email us
          </a>
          <span>·</span>
          <a 
            href="https://x.com/intent/post?text=@pricebtc%20I%20want%20to%20join%20the%20sponsor%20waitlist"
            target="_blank"
            rel="noopener noreferrer"
            className="bid-link-secondary"
          >
            Post on X
          </a>
        </div>
      </div>
    </div>
  );
}
