import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/bolt11.json";
import { BTCPayPaymentProvider } from "../../src/server/sats-bid/provider.js";
import { bidConfig } from "../../src/server/sats-bid/config.js";
const now = 1788780000;
const bolt11 = fixture.invoice;
const config = bidConfig({
  PAYMENT_PROVIDER: "btcpay",
  BTCPAY_URL: "https://btcpay.example.com",
  BTCPAY_STORE_ID: "store",
  BTCPAY_NETWORK: "mainnet",
});
const invoice = {
  id: "invoice",
  storeId: "store",
  status: "Settled",
  additionalStatus: "None",
  amount: "0.00010000",
  currency: "BTC",
  expirationTime: now + 600,
  metadata: { bid_id: "bid", participant_id: "participant", round_id: "round" },
};
const method = {
  paymentMethodId: "BTC-LN",
  activated: true,
  destination: bolt11,
  currency: "BTC",
  payments: [
    {
      id: "receipt-1",
      value: "0.00010000",
      receivedDate: now + 20,
      status: "Settled",
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
describe("Greenfield model compatibility (synthetic fixtures, not live verification)", () => {
  it("reads destination, store, exact BTC receipt and provider timestamp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("payment-methods") ? [method] : invoice,
            ),
          ),
      ),
    );
    const snapshot = await new BTCPayPaymentProvider(config).getInvoice(
      "invoice",
    );
    expect(snapshot.requestedSats).toBe("10000");
    expect(snapshot.receivedSats).toBe("10000");
    expect(snapshot.verifiedPaymentIds).toEqual(["receipt-1"]);
    expect(snapshot.receivedAt).toBe(new Date((now + 20) * 1000).toISOString());
    expect(snapshot.storeId).toBe("store");
    expect(snapshot.bolt11).toBe(bolt11);
  });
  it("does not invent settled receipts for a manual mark", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("payment-methods")
                ? [{ ...method, payments: [] }]
                : { ...invoice, additionalStatus: "Marked" },
            ),
          ),
      ),
    );
    const snapshot = await new BTCPayPaymentProvider(config).getInvoice(
      "invoice",
    );
    expect(snapshot.manuallyMarked).toBe(true);
    expect(snapshot.receivedSats).toBe("0");
    expect(snapshot.verifiedPaymentIds).toEqual([]);
  });
  it("rejects unknown provider states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("payment-methods")
                ? [method]
                : { ...invoice, status: "FutureState" },
            ),
          ),
      ),
    );
    await expect(
      new BTCPayPaymentProvider(config).getInvoice("invoice"),
    ).rejects.toThrow("Unknown provider state");
  });
});
