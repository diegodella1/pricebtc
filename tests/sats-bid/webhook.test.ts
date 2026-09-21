import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhook } from "../../src/server/sats-bid/provider.js";
import { bidConfig } from "../../src/server/sats-bid/config.js";
const raw = Buffer.from(
  '{ "deliveryId":"a", "type":"InvoiceSettled", "storeId":"store", "invoiceId":"invoice" }',
);
const secret = "test-webhook-secret";
const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
describe("Webhook authentication", () => {
  it("authenticates original bytes", () =>
    expect(verifyWebhook(raw, signature, secret).invoiceId).toBe("invoice"));
  it.each(["", "sha256=1", "sha256=" + "0".repeat(64)])(
    "rejects signature %s",
    (value) => expect(() => verifyWebhook(raw, value, secret)).toThrow(),
  );
  it("rejects reserialized or altered JSON", () =>
    expect(() =>
      verifyWebhook(
        Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),
        signature,
        secret,
      ),
    ).toThrow());
  it("rejects wrong secret", () =>
    expect(() => verifyWebhook(raw, signature, "wrong")).toThrow());
  it("rejects production simulation", () =>
    expect(() =>
      bidConfig({
        APP_ENV: "production",
        SATS_BID_ENABLED: "true",
        MOCK_PAYMENTS_ENABLED: "true",
      }),
    ).toThrow());
});
