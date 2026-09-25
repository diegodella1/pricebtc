import { useCallback, useEffect, useRef, useState } from "react";
import { BID_API, bidApi } from "./api.js";
import QRCode from "qrcode";
import siteContent from "../../shared/site-content.json";
import { GA4Events } from "../lib/ga4.js";

interface AssetConfig {
  type: string;
  address: string;
  label: string;
  network: string;
  minUsd: number;
  confirmations: number;
  warningMessage: string;
  confirmationWaitMessage: string;
}

interface CryptoConfig {
  enabled: boolean;
  btcPriceUsd: string;
  assets: AssetConfig[];
}

interface ProfileData {
  name: string;
  description: string;
  url: string;
  logoAssetId: string | null;
}

type ClaimStep = "asset" | "payment" | "watching" | "profile";

interface PaymentStatus {
  id: string;
  asset_type: string;
  tx_hash: string | null;
  amount_usd: string;
  validation_status: "watching" | "pending" | "validating" | "confirmed" | "rejected" | "failed";
  confirmations: number;
  required_confirmations: number;
  validation_error: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export function CryptoClaimFlow({ onComplete }: { onComplete?: () => void }) {
  const [config, setConfig] = useState<CryptoConfig | null>(null);
  const [step, setStep] = useState<ClaimStep>("asset");
  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    description: "",
    url: "",
    logoAssetId: null,
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetConfig | null>(null);
  const [txHash, setTxHash] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const pollInterval = useRef<number | null>(null);

  const resumePayment = useCallback(async (paymentId: string, cfg: CryptoConfig | null) => {
    try {
      const status = await bidApi<PaymentStatus & { name: string; description: string; url: string; logo_asset_id: string | null }>(`/crypto-sponsors/payments/${paymentId}`, { method: "GET" });
      setPaymentStatus(status);
      
      if (status.name && status.description && status.url) {
        setProfile({
          name: status.name,
          description: status.description,
          url: status.url,
          logoAssetId: status.logo_asset_id,
        });
        setProfileSaved(true);
      }
      
      if (cfg) {
        const asset = cfg.assets.find((a) => a.type === status.asset_type);
        if (asset) {
          setSelectedAsset(asset);
          try {
            const code = await QRCode.toDataURL(asset.address, {
              width: 256,
              margin: 2,
              color: { dark: "#0d1012", light: "#fdf6e3" },
            });
            setQrCode(code);
          } catch {
            console.error("Failed to regenerate QR code");
          }
        }
      }
      
      if (status.validation_status === "confirmed" && status.name) {
        setStep("profile");
      } else {
        setStep("watching");
      }
    } catch {
      localStorage.removeItem("crypto_payment_id");
    }
  }, []);

  const startPolling = useCallback((id: string) => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    const poll = async () => {
      try {
        const status = await bidApi<PaymentStatus>(
          `/crypto-sponsors/payments/${id}`,
          { method: "GET" },
        );
        setPaymentStatus(status);

        if (status.validation_status === "confirmed") {
          GA4Events.depositConfirmed(status.asset_type, status.amount_usd);
          if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
          }
          if (profileSaved && onComplete) {
            setTimeout(onComplete, 2000);
          }
        } else if (status.validation_status === "rejected" || status.validation_status === "failed") {
          if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
          }
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    };

    void poll();
    pollInterval.current = window.setInterval(poll, 10000);
  }, [onComplete, profileSaved]);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const data = await bidApi<CryptoConfig>("/crypto-sponsors/config", { method: "GET" });
        setConfig(data);

        const urlParams = new URLSearchParams(window.location.search);
        const paymentId = urlParams.get("payment") || localStorage.getItem("crypto_payment_id");
        
        if (paymentId) {
          void resumePayment(paymentId, data).then(() => {
            startPolling(paymentId);
          });
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
    void fetchConfig();
  }, [resumePayment, startPolling]);


  const handleLogoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setLogo(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setLogoPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setLogoPreview(null);
    }
  }, []);

  const uploadLogo = async (): Promise<string | null> => {
    if (!logo) return null;
    const form = new FormData();
    form.append("logo", logo);
    const response = await fetch(`${BID_API}/assets/logo`, {
      method: "POST",
      headers: { "X-Sats-Bid-Csrf": "1" },
      body: form,
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error?.message ?? "Logo upload failed.");
    }
    const result = await response.json();
    return result.id;
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentStatus) return;
    
    setBusy(true);
    setError("");
    try {
      const logoId = await uploadLogo();
      
      await bidApi(`/crypto-sponsors/payments/${paymentStatus.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name: profile.name,
          description: profile.description,
          url: profile.url,
          logo_asset_id: logoId,
        }),
      });
      
      setProfile({ ...profile, logoAssetId: logoId });
      setProfileSaved(true);
      GA4Events.profileSave();
      
      if (paymentStatus.validation_status === "confirmed" && onComplete) {
        setTimeout(onComplete, 1500);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAssetSelect = async (asset: AssetConfig) => {
    setSelectedAsset(asset);
    try {
      const code = await QRCode.toDataURL(asset.address, {
        width: 256,
        margin: 2,
        color: { dark: "#0d1012", light: "#fdf6e3" },
      });
      setQrCode(code);
      setStep("payment");
    } catch {
      setError("Failed to generate QR code");
    }
  };

  const copyAddress = () => {
    if (selectedAsset) {
      void navigator.clipboard.writeText(selectedAsset.address);
    }
  };

  const handleStartWatching = async () => {
    if (!selectedAsset) return;

    setBusy(true);
    setError("");
    try {
      const result = await bidApi<{ id: string; validation_status: string }>(
        "/crypto-sponsors/payments",
        {
          method: "POST",
          body: JSON.stringify({
            asset_type: selectedAsset.type,
          }),
        },
      );

      GA4Events.watchingIntent(selectedAsset.type);

      localStorage.setItem("crypto_payment_id", result.id);
      window.history.replaceState({}, "", `?payment=${result.id}`);

      setPaymentStatus({
        id: result.id,
        asset_type: selectedAsset.type,
        tx_hash: null,
        amount_usd: "0.00",
        validation_status: result.validation_status as PaymentStatus["validation_status"],
        confirmations: 0,
        required_confirmations: selectedAsset.confirmations,
        validation_error: null,
        created_at: new Date().toISOString(),
        confirmed_at: null,
      });
      
      setStep("watching");
      startPolling(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

    setBusy(true);
    setError("");
    try {
      const result = await bidApi<{ id: string; validation_status: string }>(
        "/crypto-sponsors/payments",
        {
          method: "POST",
          body: JSON.stringify({
            asset_type: selectedAsset.type,
            tx_hash: txHash,
          }),
        },
      );

      GA4Events.watchingIntent(selectedAsset.type);

      localStorage.setItem("crypto_payment_id", result.id);
      window.history.replaceState({}, "", `?payment=${result.id}`);

      setPaymentStatus({
        id: result.id,
        asset_type: selectedAsset.type,
        tx_hash: txHash,
        amount_usd: "0.00",
        validation_status: result.validation_status as PaymentStatus["validation_status"],
        confirmations: 0,
        required_confirmations: selectedAsset.confirmations,
        validation_error: null,
        created_at: new Date().toISOString(),
        confirmed_at: null,
      });
      
      setStep("watching");
      startPolling(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };


  useEffect(() => {
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, []);

  if (!config) {
    return <div className="crypto-claim-loading">Loading...</div>;
  }

  if (!config.enabled || config.assets.length === 0) {
    return (
      <div className="crypto-claim-unavailable">
        <p className="crypto-unavailable-message">Crypto payments are opening soon.</p>
        <a href="#waitlist" className="crypto-cta-button">
          Join the waitlist →
        </a>
      </div>
    );
  }

  return (
    <div className="crypto-claim-container">
      <ol className="crypto-claim-steps" aria-label="Claim steps">
        <li className={`crypto-step-indicator ${step === "asset" ? "active" : ""} ${["payment", "watching", "profile"].includes(step) ? "completed" : ""}`} data-step="asset">
          Asset
        </li>
        <li className={`crypto-step-indicator ${step === "payment" ? "active" : ""} ${["watching", "profile"].includes(step) ? "completed" : ""}`} data-step="payment">
          Pay
        </li>
        <li className={`crypto-step-indicator ${step === "watching" ? "active" : ""} ${step === "profile" ? "completed" : ""}`} data-step="watching">
          Watch
        </li>
        <li className={`crypto-step-indicator ${step === "profile" ? "active" : ""}`} data-step="profile">
          Profile
        </li>
      </ol>

      {step === "asset" && (
        <div className="crypto-asset-selection">
          <h2>Choose payment asset</h2>
          <p className="crypto-asset-helper">Minimums and confirmations shown after you pick.</p>
          <div className="crypto-asset-grid">
            {config.assets.map((asset) => (
              <button
                key={asset.type}
                className="crypto-asset-card"
                onClick={() => void handleAssetSelect(asset)}
              >
                <div className="crypto-asset-label">{asset.label}</div>
                <div className="crypto-asset-network">{asset.network}</div>
                <div className="crypto-asset-min">Min: ${asset.minUsd.toFixed(2)} USD</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "payment" && selectedAsset && (
        <div className="crypto-payment-details">
          <a href="#board" className="bid-back-link">
            ← Top 21 leaderboard
          </a>
          <h2>Send payment</h2>
          <div className="crypto-payment-warning">{selectedAsset.warningMessage}</div>
          
          <div className="crypto-payment-info">
            <div className="crypto-info-section">
              <label>Network</label>
              <p className="crypto-amount">{selectedAsset.network}</p>
            </div>

            <div className="crypto-info-section">
              <label>Minimum USD</label>
              <p className="crypto-amount">
                ${selectedAsset.minUsd.toFixed(2)} USD
                <small>
                  {selectedAsset.type === "BTC" && config && (
                    <>≈ {Math.ceil((selectedAsset.minUsd / parseFloat(config.btcPriceUsd)) * 100_000_000).toLocaleString()} sats @ ${parseFloat(config.btcPriceUsd).toLocaleString()}/BTC</>
                  )}
                  {selectedAsset.type === "USDT_TRC20" && <>≈ {selectedAsset.minUsd.toFixed(2)} USDT</>}
                  {selectedAsset.type === "USDC_SOL" && <>≈ {selectedAsset.minUsd.toFixed(2)} USDC</>}
                </small>
              </p>
            </div>

            <div className="crypto-info-section">
              <label>Deposit Address</label>
              <div className="crypto-address-container">
                <code className="crypto-address">{selectedAsset.address}</code>
                <button type="button" className="crypto-copy-button" onClick={copyAddress}>
                  Copy
                </button>
              </div>
            </div>

            {qrCode && (
              <div className="crypto-qr-container">
                <img src={qrCode} alt="Deposit address QR code" className="crypto-qr-code" />
                <small>Scan to pay</small>
              </div>
            )}
          </div>

          <div className="crypto-watch-section">
            <p className="crypto-watch-info">
              We're watching this address — send the payment; no need to paste a transaction ID.
            </p>
            
            {error && <p className="crypto-error">{error}</p>}

            <div className="crypto-form-actions">
              <button
                type="button"
                className="crypto-back-button"
                onClick={() => {
                  setStep("asset");
                  setSelectedAsset(null);
                  setQrCode(null);
                  setTxHash("");
                  setShowAdvanced(false);
                }}
              >
                ← Change asset
              </button>
              <button 
                type="button" 
                className="crypto-cta-button" 
                onClick={() => void handleStartWatching()}
                disabled={busy}
              >
                {busy ? "Starting..." : "I've sent the payment →"}
              </button>
            </div>

            <details className="crypto-advanced-toggle">
              <summary onClick={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}>
                Advanced: Paste transaction ID
              </summary>
              {showAdvanced && (
                <form onSubmit={handlePaymentSubmit} className="crypto-tx-form">
                  <label>
                    Transaction Hash
                    <input
                      required
                      type="text"
                      placeholder="Enter transaction hash"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value.trim())}
                      className="crypto-tx-input"
                    />
                    <small>
                      Check your wallet for the transaction hash
                    </small>
                  </label>
                  <button type="submit" className="crypto-cta-button" disabled={busy || !txHash}>
                    {busy ? "Submitting..." : "Submit transaction →"}
                  </button>
                </form>
              )}
            </details>
          </div>
        </div>
      )}

      {step === "watching" && paymentStatus && selectedAsset && (
        <div className="crypto-status-container">
          <a href="#board" className="bid-back-link">
            ← Top 21 leaderboard
          </a>
          <h2>Payment status</h2>
          
          <div className="crypto-payment-info">
            <div className="crypto-info-section">
              <label>Deposit Address</label>
              <div className="crypto-address-container">
                <code className="crypto-address">{selectedAsset.address}</code>
                <button type="button" className="crypto-copy-button" onClick={copyAddress}>
                  Copy
                </button>
              </div>
            </div>

            {qrCode && (
              <div className="crypto-qr-container">
                <img src={qrCode} alt="Deposit address QR code" className="crypto-qr-code" />
                <small>Scan to pay</small>
              </div>
            )}
          </div>

          <div className={`crypto-status-badge crypto-status-${paymentStatus.validation_status}`}>
            {paymentStatus.validation_status === "watching" && "👀 Watching for your transaction..."}
            {paymentStatus.validation_status === "pending" && paymentStatus.confirmations === 0 && "⏳ Waiting for first confirmation..."}
            {paymentStatus.validation_status === "pending" && paymentStatus.confirmations > 0 && `⏳ ${paymentStatus.confirmations} of ${paymentStatus.required_confirmations} confirmations...`}
            {paymentStatus.validation_status === "validating" && "🔍 Validating transaction..."}
            {paymentStatus.validation_status === "confirmed" && "✅ Confirmed!"}
            {paymentStatus.validation_status === "rejected" && "❌ Rejected"}
            {paymentStatus.validation_status === "failed" && "⚠️ Validation failed"}
          </div>

          <p className="crypto-watch-info">
            Keep this tab open if you can. Ranking uses credited USD after confirmation.
          </p>

          {(paymentStatus.validation_status === "rejected" || paymentStatus.validation_status === "failed") && paymentStatus.validation_error && (
            <div className="crypto-error">{paymentStatus.validation_error}</div>
          )}

          {(paymentStatus.validation_status === "watching" || paymentStatus.validation_status === "pending" || paymentStatus.validation_status === "validating" || paymentStatus.validation_status === "confirmed") && !profileSaved && (
            <button 
              type="button" 
              className="crypto-cta-button" 
              onClick={() => setStep("profile")}
            >
              Add how you'll appear →
            </button>
          )}

          {(paymentStatus.validation_status === "rejected" || paymentStatus.validation_status === "failed") && (
            <div className="crypto-form-actions">
              <button
                type="button"
                className="crypto-back-button"
                onClick={() => {
                  setStep("payment");
                  setPaymentStatus(null);
                  if (pollInterval.current) {
                    clearInterval(pollInterval.current);
                    pollInterval.current = null;
                  }
                }}
              >
                ← Try again
              </button>
              <a href={`mailto:${siteContent.contactEmail}?subject=Sponsor%20Payment%20Issue&body=Payment%20ID:%20${paymentStatus.id}`} className="crypto-cta-button">
                Contact support →
              </a>
            </div>
          )}
        </div>
      )}

      {step === "profile" && paymentStatus && (
        <div className="crypto-profile-form-container">
          <a href="#board" className="bid-back-link">
            ← Top 21 leaderboard
          </a>
          
          <aside className="crypto-payment-status-strip" aria-live="polite">
            <span className={`badge crypto-status-${paymentStatus.validation_status}`}>
              {paymentStatus.validation_status === "watching" && "Watching…"}
              {paymentStatus.validation_status === "pending" && "Confirming…"}
              {paymentStatus.validation_status === "validating" && "Validating…"}
              {paymentStatus.validation_status === "confirmed" && "Confirmed"}
              {paymentStatus.validation_status === "rejected" && "Rejected"}
              {paymentStatus.validation_status === "failed" && "Failed"}
            </span>
            <span className="asset-label">{selectedAsset?.label} {selectedAsset?.network}</span>
            <p className="strip-note">
              {paymentStatus.validation_status === "confirmed" 
                ? "Payment confirmed. Add your name to appear on Top 21 and home slots."
                : "Your payment is still being detected. You are not on the Top 21 yet."}
            </p>
            {selectedAsset && (
              <div className="strip-address">
                <code>{selectedAsset.address.slice(0, 12)}...{selectedAsset.address.slice(-8)}</code>
                <button type="button" className="crypto-copy-button-small" onClick={copyAddress}>
                  Copy
                </button>
              </div>
            )}
          </aside>

          <form className="crypto-identity-form" onSubmit={handleProfileSubmit}>
            <h2>Your public profile</h2>
            <label>
              Display name *
              <input
                required
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: [...e.target.value.normalize("NFC")].slice(0, 40).join("") })}
                autoComplete="organization"
                placeholder="Your project name"
              />
            </label>
            <label>
              Website *
              <input
                required
                type="url"
                maxLength={2048}
                placeholder="https://your-project.com"
                value={profile.url}
                onChange={(e) => setProfile({ ...profile, url: e.target.value })}
              />
            </label>
            <label>
              One-line description *
              <input
                required
                value={profile.description}
                onChange={(e) => setProfile({ ...profile, description: [...e.target.value.normalize("NFC")].slice(0, 100).join("") })}
                placeholder="What makes your project unique"
              />
              <small>100 characters. Make them count.</small>
            </label>
            <label>
              Logo <small>PNG, JPEG, WebP · 2 MiB max · Optional</small>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoChange}
              />
            </label>
            {logoPreview && (
              <div className="crypto-profile-preview">
                <img src={logoPreview} alt="Logo preview" className="crypto-logo-preview" />
                <div>
                  <strong>{profile.name || "Your project"}</strong>
                  {profile.description && <p>{profile.description}</p>}
                </div>
              </div>
            )}
            <p className="crypto-profile-helper">
              Shown on Top 21 and home slots only after your payment confirms. This form does not change your rank.
            </p>
            {error && <p className="crypto-error">{error}</p>}
            <div className="crypto-form-actions">
              <button
                type="button"
                className="crypto-back-button"
                onClick={() => setStep("watching")}
              >
                ← Back
              </button>
              <button type="submit" className="crypto-cta-button" disabled={busy}>
                {busy ? "Saving..." : "Save & continue"}
              </button>
            </div>
          </form>

          {profileSaved && paymentStatus.validation_status === "confirmed" && (
            <div className="crypto-success-actions">
              <h3>You're on the Top 21</h3>
              <a href="#board" className="crypto-cta-button">
                View leaderboard →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
