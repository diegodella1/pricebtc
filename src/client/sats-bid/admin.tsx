import { useEffect, useState } from "react";
import { bidApi } from "./api.js";
import { MetricsPanel, type Metrics } from "./metrics.js";
import { BidShell } from "./components.js";
type Item = Record<string, string | number | boolean | null>;
export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("rounds");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [filters, setFilters] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  async function load(selected = tab, next?: string, query = filters) {
    try {
      if (selected === "analytics")
        setMetrics(await bidApi("/admin/analytics?days=7"));
      else {
        const data = await bidApi<{
          items: Item[];
          next_cursor: string | null;
        }>(`/admin/${selected}?${query}${next ? `&cursor=${next}` : ""}`);
        setItems((old) => (next ? [...old, ...data.items] : data.items));
        setCursor(data.next_cursor);
      }
      setAuthenticated(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    // Each document mounts with one initial route; subsequent loads are user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function action(path: string, method: string, body?: unknown) {
    try {
      await bidApi(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <BidShell title="ROUND CONTROL." eyebrow="SATS BID / OPERATOR">
      <p className="bid-caption">
        Settlement, competitive credit and public visibility are separate
        states.
      </p>
      {!authenticated ? (
        <form
          className="bid-form bid-login"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await bidApi("/admin/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
              });
              setPassword("");
              await load();
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="bid-button">Sign in</button>
        </form>
      ) : (
        <>
          <div className="bid-admin-toolbar">
            <button
              onClick={() =>
                void action("/admin/settings", "PATCH", { paused: true })
              }
            >
              Pause new invoices
            </button>
            <button
              onClick={() =>
                void action("/admin/settings", "PATCH", { paused: false })
              }
            >
              Resume invoices
            </button>
            <button
              onClick={async () => {
                try {
                  await bidApi("/admin/logout", { method: "POST" });
                  setAuthenticated(false);
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              Sign out
            </button>
          </div>
          <nav className="bid-admin-tabs" aria-label="Admin sections">
            {[
              "rounds",
              "participants",
              "payments",
              "incidents",
              "blocked-domains",
              "analytics",
            ].map((name) => (
              <button
                key={name}
                aria-pressed={tab === name}
                onClick={() => {
                  setTab(name);
                  setItems([]);
                  setFilters("");
                  void load(name, undefined, "");
                }}
              >
                {name.replaceAll("-", " ")}
              </button>
            ))}
          </nav>
          {["participants", "payments", "rounds"].includes(tab) && (
            <form
              className="bid-admin-filters"
              onSubmit={(event) => {
                event.preventDefault();
                const params = new URLSearchParams();
                for (const [key, value] of new FormData(event.currentTarget))
                  if (typeof value === "string" && value)
                    params.set(key, value);
                setFilters(params.toString());
                void load(tab, undefined, params.toString());
              }}
              key={tab}
            >
              <label>
                From
                <input name="from" type="date" />
              </label>
              <label>
                Through
                <input name="to" type="date" />
              </label>
              {tab === "participants" && (
                <>
                  <label>
                    Domain
                    <input name="domain" placeholder="example.com" />
                  </label>
                  <label>
                    Moderation
                    <select name="moderation_status">
                      <option value="">All</option>
                      <option>approved</option>
                      <option>pending</option>
                      <option>rejected</option>
                    </select>
                  </label>
                </>
              )}
              {tab === "payments" && (
                <>
                  <label>
                    Participant ID
                    <input name="participant_id" />
                  </label>
                  <label>
                    Invoice ID
                    <input name="invoice_id" />
                  </label>
                  <label>
                    Credit
                    <select name="credit_status">
                      <option value="">All</option>
                      <option>credited</option>
                      <option>uncredited</option>
                      <option>review</option>
                      <option>excluded</option>
                    </select>
                  </label>
                </>
              )}
              <button>Apply filters</button>
            </form>
          )}
          {tab === "analytics" ? (
            <>
              <div className="bid-actions">
                {[1, 7, 30].map((days) => (
                  <button
                    key={days}
                    onClick={() =>
                      void bidApi<Metrics>(
                        `/admin/analytics?days=${days}`,
                      ).then(setMetrics)
                    }
                  >
                    {days} day{days > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
              {metrics && <MetricsPanel metrics={metrics} />}
            </>
          ) : (
            <div className="bid-admin-list">
              {items.map((item, index) => (
                <article key={String(item.id ?? index)}>
                  <h3>
                    {String(
                      item.name ??
                        item.date ??
                        item.normalized_domain ??
                        item.id ??
                        "Invoice reference",
                    )}
                  </h3>
                  <dl>
                    {Object.entries(item)
                      .filter(
                        ([key]) =>
                          !["snapshot", "session_id", "id", "name"].includes(
                            key,
                          ),
                      )
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{key.replaceAll("_", " ")}</dt>
                          <dd>
                            {typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value ?? "—")}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {tab === "participants" && (
                    <div className="bid-actions">
                      {["approve", "reject", "hide", "unhide", "edit"].map(
                        (kind) => (
                          <button
                            key={kind}
                            onClick={() => {
                              const reason = window.prompt(
                                "Reason for this audited change",
                              );
                              if (!reason) return;
                              const edit =
                                kind === "edit"
                                  ? {
                                      name:
                                        window.prompt(
                                          "Name",
                                          String(item.name),
                                        ) ?? item.name,
                                      description:
                                        window.prompt(
                                          "Description",
                                          String(item.description),
                                        ) ?? item.description,
                                      url:
                                        window.prompt(
                                          "HTTPS URL",
                                          String(item.url),
                                        ) ?? item.url,
                                    }
                                  : {};
                              void action(
                                `/admin/participants/${item.id}`,
                                "PATCH",
                                {
                                  action: kind,
                                  reason,
                                  version: item.version,
                                  ...edit,
                                },
                              );
                            }}
                          >
                            {kind}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                  {tab === "payments" && (
                    <div className="bid-actions">
                      <button
                        onClick={() =>
                          void action(
                            `/admin/payments/${item.id}/reconcile`,
                            "POST",
                          )
                        }
                      >
                        Recheck evidence
                      </button>
                      {item.credit_status === "review" && (
                        <button
                          onClick={() => {
                            const reason = window.prompt(
                              "Reason to resolve without competitive credit",
                            );
                            if (reason)
                              void action(
                                `/admin/payments/${item.id}/resolve`,
                                "POST",
                                { reason },
                              );
                          }}
                        >
                          Resolve without credit
                        </button>
                      )}
                      <details>
                        <summary>Sanitized provider evidence</summary>
                        <pre>{JSON.stringify(item.snapshot, null, 2)}</pre>
                      </details>
                    </div>
                  )}
                  {tab === "blocked-domains" && !item.disabled_at && (
                    <button
                      onClick={() =>
                        void action(
                          `/admin/blocked-domains/${item.id}`,
                          "DELETE",
                        )
                      }
                    >
                      Disable block
                    </button>
                  )}
                </article>
              ))}
              {!items.length && <p>No records in this view.</p>}
              {cursor && (
                <button onClick={() => void load(tab, cursor)}>
                  Load more
                </button>
              )}
            </div>
          )}
          {tab === "blocked-domains" && (
            <form
              className="bid-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void action("/admin/blocked-domains", "POST", {
                  domain: form.get("domain"),
                  reason: form.get("reason"),
                  include_subdomains: form.get("subdomains") === "on",
                });
              }}
            >
              <label>
                Domain
                <input name="domain" required placeholder="example.com" />
              </label>
              <label>
                Reason
                <input name="reason" required />
              </label>
              <label className="bid-agreement">
                <input name="subdomains" type="checkbox" defaultChecked />
                Include subdomains
              </label>
              <button>Block domain</button>
            </form>
          )}
          {tab === "incidents" && (
            <form
              className="bid-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void action("/admin/reconcile", "POST", {
                  from: form.get("from"),
                  to: form.get("to"),
                });
              }}
            >
              <label>
                Audit from
                <input name="from" type="date" required />
              </label>
              <label>
                Through
                <input name="to" type="date" required />
              </label>
              <button>Queue audit</button>
            </form>
          )}
        </>
      )}
      {error && (
        <p className="bid-alert" role="alert">
          {error}
        </p>
      )}
    </BidShell>
  );
}
