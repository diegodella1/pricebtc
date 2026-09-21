import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { bidApi, type PaymentView, recordEvent, sats } from "./api.js";
import { Countdown } from "./components.js";
export function PaymentDialog({
  id,
  onClose,
  onCredited,
}: {
  id: string;
  onClose: () => void;
  onCredited: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const onCreditedRef = useRef(onCredited);
  onCreditedRef.current = onCredited;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    recordEvent("invoice_displayed");
    return () => element?.close();
  }, []);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    let notified = false;
    async function refresh() {
      try {
        const next = await bidApi<PaymentView>(`/payments/${id}`);
        if (stop) return;
        setPayment(next);
        setClockOffset(new Date(next.server_time).getTime() - Date.now());
        setError("");
        delay = 2000;
        if (next.credit_status === "credited" && !notified) {
          notified = true;
          onCreditedRef.current();
        }
      } catch (e) {
        if (!stop) setError((e as Error).message);
        delay = Math.min(delay * 2, 10000);
      }
      if (!stop) timer = setTimeout(() => void refresh(), delay);
    }
    void refresh();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [id]);
  useEffect(() => {
    let stop = false;
    if (payment?.bolt11)
      void QRCode.toDataURL(payment.bolt11, {
        width: 280,
        margin: 4,
        errorCorrectionLevel: "M",
      })
        .then((value) => {
          if (!stop) setQr(value);
        })
        .catch(() => {
          if (!stop)
            setError("QR unavailable. Copy the invoice or open your wallet.");
        });
    else setQr("");
    return () => {
      stop = true;
    };
  }, [payment?.bolt11]);
  const expired = payment?.expires_at
    ? new Date(payment.expires_at).getTime() <= now + clockOffset
    : false;
  const credited = payment?.credit_status === "credited";
  const canPay =
    payment?.creation_status === "ready" &&
    payment.credit_status === "uncredited" &&
    payment.settlement_status === "pending" &&
    !expired;
  const state = credited
    ? "Payment credited"
    : payment?.credit_status === "excluded"
      ? "Payment not eligible for ranking"
      : payment?.credit_status === "review"
        ? "Payment requires review"
        : expired || payment?.settlement_status === "expired"
          ? "Invoice expired"
          : payment?.creation_status === "creation_unknown"
            ? "Confirming invoice creation"
            : payment?.creation_status === "creating"
              ? "Creating your invoice"
              : payment?.settlement_status === "processing"
                ? "Payment received — verifying"
                : payment?.settlement_status === "invalid"
                  ? "Invoice invalid"
                  : "Waiting for payment";
  return (
    <dialog ref={dialog} className="bid-dialog" onCancel={onClose}>
      <button
        className="bid-close"
        type="button"
        onClick={onClose}
        aria-label="Close payment"
      >
        ×
      </button>
      <p className="bid-eyebrow">
        {payment?.provider === "mock"
          ? "DEMO PAYMENT — NO REAL SATS"
          : "LIGHTNING PAYMENT"}
      </p>
      <h2>
        {payment ? `${sats(payment.amount_sats)} sats` : "Opening invoice…"}
      </h2>
      <p role="status">{state}</p>
      {payment && (
        <p className="bid-caption">UTC round: {payment.round_date}</p>
      )}
      {error && (
        <p role="alert" className="bid-alert">
          {error}
        </p>
      )}
      {canPay && payment?.bolt11 && (
        <>
          <img
            className="bid-qr"
            src={qr || undefined}
            alt="Lightning invoice QR code"
            width={280}
            height={280}
          />
          <textarea
            aria-label="Lightning invoice"
            readOnly
            value={payment.bolt11}
          />
          <div className="bid-actions">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(payment.bolt11!);
                  setCopied(true);
                  recordEvent("invoice_copied");
                } catch {
                  setError("Copy the invoice text manually.");
                }
              }}
            >
              {copied ? "Copied" : "Copy invoice"}
            </button>
            <a
              className="bid-button"
              href={`lightning:${payment.bolt11}`}
              onClick={() => recordEvent("wallet_open_clicked")}
            >
              Open wallet ↗
            </a>
          </div>
        </>
      )}
      {canPay && payment?.provider === "mock" && (
        <div className="bid-demo">
          <span aria-hidden="true">⚡</span>
          <p>No wallet needed. This invoice only tests the payment flow.</p>
          <button
            className="bid-button"
            type="button"
            onClick={async () => {
              try {
                await bidApi(`/dev/payments/${id}/simulate`, {
                  method: "POST",
                  body: JSON.stringify({ scenario: "settle" }),
                });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            SIMULATE PAYMENT
          </button>
        </div>
      )}
      {payment?.expires_at && !credited && (
        <p>
          Invoice expires in{" "}
          <Countdown
            endsAt={payment.expires_at}
            serverTime={payment.server_time}
          />
        </p>
      )}
      {credited && (
        <div className="bid-success">
          <span>✓</span>
          <p>Your sats count toward this UTC round.</p>
          <a href="/leaderboard" className="bid-button">
            View leaderboard ↗
          </a>
        </div>
      )}
      <p className="bid-caption">
        The server verifies payment. Closing this window does not cancel an
        invoice. Reopen it from this browser.
      </p>
    </dialog>
  );
}
