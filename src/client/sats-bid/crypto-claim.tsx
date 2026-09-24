import { useCallback, useEffect, useRef, useState } from "react";
import { BID_API, bidApi } from "./api.js";
import QRCode from "qrcode";
import siteContent from "../../shared/site-content.json";

interface AssetConfig {
  type: string;
  address: string;
  label: string;
  network: string;
  minUsd: number;
  confirmations: number;
  warningMessage: string;
}

interface CryptoConfig {
  enabled: boolean;
  assets: AssetConfig[];
}

interface ProfileData {
  name: string;
  description: string;
  url: string;
  logoAssetId: string | null;
}

type ClaimStep = "identity" | "asset" | "payment" | "live";

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
  const [step, setStep] = useState<ClaimStep>("identity");
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
  const pollInterval = useRef<number | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const data = await bidApi<CryptoConfig>("/crypto-sponsors/config", { method: "GET" });
        setConfig(data);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    void fetchConfig();
  }, []);

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

  const handleIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const logoId = await uploadLogo();
      setProfile({ ...profile, logoAssetId: logoId });
      setStep("asset");
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
            name: profile.name,
            description: profile.description,
            url: profile.url,
            logo_asset_id: profile.logoAssetId,
            asset_type: selectedAsset.type,
          }),
        },
      );

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
      
      setStep("live");
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
            name: profile.name,
            description: profile.description,
            url: profile.url,
            logo_asset_id: profile.logoAssetId,
            asset_type: selectedAsset.type,
            tx_hash: txHash,
          }),
        },
      );

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
      
      setStep("live");
      startPolling(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startPolling = (id: string) => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    const poll = async () => {
      try {
        const status = await bidApi<PaymentStatus>(
          `/crypto-sponsors/payments/${id}`,
          { method: "GET" },
        );
        setPaymentStatus(status);

        if (status.validation_status === "confirmed") {
          if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
          }
          if (onComplete) {
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
      <div className="crypto-claim-steps">
        <div className={`crypto-step-indicator ${step === "identity" ? "active" : ""} ${["asset", "payment", "live"].includes(step) ? "completed" : ""}`}>
          01 / Identity
        </div>
        <div className={`crypto-step-indicator ${step === "asset" ? "active" : ""} ${["payment", "live"].includes(step) ? "completed" : ""}`}>
          02 / Choose Asset
        </div>
        <div className={`crypto-step-indicator ${step === "payment" ? "active" : ""} ${step === "live" ? "completed" : ""}`}>
          03 / Pay
        </div>
        <div className={`crypto-step-indicator ${step === "live" ? "active" : ""}`}>
          04 / Live
        </div>
      </div>

      {step === "identity" && (
        <form className="crypto-identity-form" onSubmit={handleIdentitySubmit}>
          <h2>Your Public Profile</h2>
          <label>
            Name
            <input
              required
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: [...e.target.value.normalize("NFC")].slice(0, 40).join("") })}
              autoComplete="organization"
              placeholder="Your project name"
            />
          </label>
          <label>
            Website
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
            One-line description
            <input
              required
              value={profile.description}
              onChange={(e) => setProfile({ ...profile, description: [...e.target.value.normalize("NFC")].slice(0, 100).join("") })}
              placeholder="What makes your project unique"
            />
            <small>100 characters. Make them count.</small>
          </label>
          <label>
            Logo <small>PNG, JPEG, WebP · 2 MiB max</small>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
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
          {error && <p className="crypto-error">{error}</p>}
          <button type="submit" className="crypto-cta-button" disabled={busy}>
            {busy ? "Uploading..." : "Continue to payment →"}
          </button>
        </form>
      )}

      {step === "asset" && (
        <div className="crypto-asset-selection">
          <h2>Choose Payment Method</h2>
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
          <button
            className="crypto-back-button"
            onClick={() => setStep("identity")}
          >
            ← Back to identity
          </button>
        </div>
      )}

      {step === "payment" && selectedAsset && (
        <div className="crypto-payment-details">
          <h2>Send {selectedAsset.label} Payment</h2>
          <div className="crypto-payment-warning">{selectedAsset.warningMessage}</div>
          
          <div className="crypto-payment-info">
            <div className="crypto-info-section">
              <label>Amount</label>
              <p className="crypto-amount">
                Minimum ${selectedAsset.minUsd.toFixed(2)} USD
                <small>in {selectedAsset.label}</small>
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
              We're watching this address. Send your payment — no need to paste a transaction ID.
            </p>
            <p className="crypto-watch-details">
              Your transaction will be automatically detected and confirmed after {selectedAsset.confirmations} confirmations.
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

      {step === "live" && paymentStatus && (
        <div className="crypto-status-container">
          <h2>Payment Status</h2>
          
          <div className={`crypto-status-badge crypto-status-${paymentStatus.validation_status}`}>
            {paymentStatus.validation_status === "watching" && "👀 Watching for your transaction..."}
            {paymentStatus.validation_status === "pending" && paymentStatus.confirmations === 0 && "⏳ Waiting for first confirmation..."}
            {paymentStatus.validation_status === "pending" && paymentStatus.confirmations > 0 && `⏳ ${paymentStatus.confirmations} of ${paymentStatus.required_confirmations} confirmations...`}
            {paymentStatus.validation_status === "validating" && "🔍 Validating transaction..."}
            {paymentStatus.validation_status === "confirmed" && "✅ Confirmed!"}
            {paymentStatus.validation_status === "rejected" && "❌ Rejected"}
            {paymentStatus.validation_status === "failed" && "⚠️ Validation failed"}
          </div>

          <div className="crypto-status-details">
            <div className="crypto-detail-row">
              <span>Confirmations</span>
              <strong>
                {paymentStatus.confirmations} / {paymentStatus.required_confirmations}
              </strong>
            </div>
            
            {paymentStatus.amount_usd !== "0" && (
              <div className="crypto-detail-row">
                <span>Amount</span>
                <strong>${Number(paymentStatus.amount_usd).toFixed(2)} USD</strong>
              </div>
            )}

            {paymentStatus.validation_error && (
              <div className="crypto-error">{paymentStatus.validation_error}</div>
            )}
          </div>

          {paymentStatus.validation_status === "confirmed" && (
            <div className="crypto-success-actions">
              <div className="crypto-success-chip">
                <img src={logoPreview || undefined} alt="" className="crypto-chip-logo" />
                <div>
                  <strong>{profile.name}</strong>
                  <small>{profile.description}</small>
                </div>
              </div>
              <a href="/sponsors" className="crypto-cta-button">
                View leaderboard →
              </a>
            </div>
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
              <a href={`mailto:${siteContent.contactEmail}?subject=Sponsor%20Payment%20Issue&body=Transaction%20hash:%20${txHash}`} className="crypto-cta-button">
                Contact support →
              </a>
            </div>
          )}

          {(paymentStatus.validation_status === "watching" || paymentStatus.validation_status === "pending" || paymentStatus.validation_status === "validating") && (
            <p className="crypto-status-note">
              {paymentStatus.validation_status === "watching" 
                ? "Send your payment to the address above. We'll detect it automatically within a few seconds."
                : paymentStatus.confirmations === 0 
                  ? "Waiting for your transaction to appear on the blockchain. This usually takes a few seconds."
                  : "This page updates automatically as confirmations increase. Keep this tab open."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
