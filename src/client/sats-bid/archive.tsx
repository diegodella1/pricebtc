import { useCallback, useEffect, useState } from "react";
import { bidApi, type Board, type CurrentRound, sats } from "./api.js";
import { ComingSoonPage } from "./coming-soon.js";
import { BidShell, Ranking } from "./components.js";
export default function ArchivePage() {
  const date = window.location.pathname.startsWith("/day/")
    ? window.location.pathname.slice(5)
    : undefined;
  const history = window.location.pathname === "/history";
  const [board, setBoard] = useState<Board | null>(null);
  const [rounds, setRounds] = useState<
    {
      date: string;
      winner: string | null;
      total_sats: string;
      status: string;
      result_revision: number;
    }[]
  >([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);
  const load = useCallback(
    async (next?: string) => {
      try {
        const current = await bidApi<CurrentRound>("/round/current");
        setComingSoon(!!current.coming_soon);
        if (current.coming_soon) return;
        if (history) {
          const data = await bidApi<{
            rounds: typeof rounds;
            next_cursor: string | null;
          }>(`/history${next ? `?cursor=${next}` : ""}`);
          setRounds((old) => (next ? [...old, ...data.rounds] : data.rounds));
          setCursor(data.next_cursor);
        } else {
          const data = await bidApi<Board>(
            `${date ? `/history/${date}` : "/leaderboard"}${next ? `?cursor=${next}` : ""}`,
          );
          setBoard((old) =>
            next && old
              ? {
                  ...data,
                  participants: [...old.participants, ...data.participants],
                }
              : data,
          );
          setCursor(data.next_cursor);
        }
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [date, history],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (history || expanded) return;
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, history, expanded]);
  if (comingSoon) return <ComingSoonPage archive={history || !!date} />;
  return (
    <BidShell
      title={
        history
          ? "HISTORY"
          : date
            ? `SNAPSHOT / ${date}`
            : "TOP 21 LEADERBOARD"
      }
    >
      {error && (
        <p className="bid-alert" role="alert">
          {error}
        </p>
      )}
      {history ? (
        <div className="bid-archive">
          {rounds.length ? (
            rounds.map((round) => (
              <a href={`/day/${round.date}`} key={round.date}>
                <span>
                  {round.date} UTC
                  <small>
                    {round.result_revision
                      ? "Result corrected"
                      : round.status === "closed"
                        ? "Final"
                        : "Provisional — confirming payments"}
                  </small>
                </span>
                <strong>{round.winner ?? "No eligible participants"}</strong>
                <span>{sats(round.total_sats)} sats ↗</span>
              </a>
            ))
          ) : (
            <p>
              No history yet. The leaderboard is building.
            </p>
          )}
        </div>
      ) : (
        board && (
          <>
            <p className="bid-intro">
              {board.round.result_revision
                ? "Result corrected"
                : board.round.status === "closed"
                  ? "Final result"
                  : date
                    ? "Provisional — confirming payments"
                    : "Paid participation. Positions can change."}
            </p>
            <Ranking entries={board.participants} />
            <p className="bid-caption">
              {sats(board.total_sats)} sats · All confirmed participation
              payments, including moderated entries.
            </p>
          </>
        )
      )}
      {cursor && (
        <button
          className="bid-button"
          onClick={() => {
            setExpanded(true);
            void load(cursor);
          }}
        >
          Load more ↓
        </button>
      )}
      {expanded && !history && (
        <p className="bid-caption">
          Updates paused while viewing more entries.{" "}
          <button
            onClick={() => {
              setExpanded(false);
              void load();
            }}
          >
            Refresh leaderboard
          </button>
        </p>
      )}
      <a className="bid-text-button" href="/sponsors">
        Claim your spot ↗
      </a>
    </BidShell>
  );
}
