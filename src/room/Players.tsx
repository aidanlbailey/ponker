import { useEffect, useState } from "react";
import { Dialog } from "../components/Dialog";
import { RatingBadge } from "../components/RatingBadge";
import { call } from "../lib/account";
import { Avatar } from "../game/Pieces";
import type { RoomView } from "./useRoom";

// stack and unpaid come off the stage, the server's numbers already have the pot in them before it's been paid
type Props = {
  view: RoomView;
  artOf: (i: number) => string | null;
  stack: (i: number) => number;
  unpaid: (i: number) => number;
  onClose: () => void;
};

const pct = (n: number, of: number) =>
  of ? `${Math.round((n / of) * 100)}%` : "-";
const signed = (n: number) =>
  n > 0
    ? `+${n.toLocaleString("en-US")}`
    : n < 0
      ? `−${(-n).toLocaleString("en-US")}`
      : "0";

// Everyone sitting, best net first. Their numbers run from when they sat down. Ratings get asked for once a look,
// they only move every hundred hands so there's nothing to keep fresh
export function Players({ view, artOf, stack, unpaid, onClose }: Props) {
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const rows = view.seats
    .flatMap((s, i) => {
      if (!s) return [];
      const id = view.table.seats[i]?.id ?? "";
      const who = s.user ? `u:${s.user}` : s.bot ? id : null;
      const m = s.match ?? { hands: 0, net: 0, vpip: 0, pfr: 0 };
      return [{ i, s, id, who, m: { ...m, net: m.net - unpaid(i) } }];
    })
    .sort((a, b) => b.m.net - a.m.net);
  const ids = rows.flatMap((r) => (r.who ? [r.who] : [])).join(",");

  useEffect(() => {
    if (ids)
      call<Record<string, number | null>>(`/ratings?ids=${ids}`).then(
        setRatings,
        () => {},
      );
  }, [ids]);

  return (
    <Dialog title="Players" className="room-players" onClose={onClose}>
      <div className="room-players-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col" title="Chips in front of them now">
                Stack
              </th>
              <th scope="col" title="Chips won or lost since they sat down">
                Net
              </th>
              <th
                scope="col"
                title="Hands they've been dealt since they sat down"
              >
                Hands
              </th>
              <th
                scope="col"
                title="How often they chose to put money in before the flop"
              >
                VPIP
              </th>
              <th scope="col" title="How often they raised before the flop">
                PFR
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, s, id, who, m }) => (
              <tr key={i} className={i === view.me ? "me" : undefined}>
                <td>
                  <span className="room-player">
                    <Avatar id={id} art={artOf(i)} />
                    <span className="room-player-name">
                      <b>{s.name}</b>
                      {who ? (
                        who in ratings && <RatingBadge rating={ratings[who]!} />
                      ) : (
                        <span className="room-guest">GUEST</span>
                      )}
                    </span>
                  </span>
                </td>
                <td>{stack(i).toLocaleString("en-US")}</td>
                <td
                  className={m.net > 0 ? "up" : m.net < 0 ? "down" : undefined}
                >
                  {signed(m.net)}
                </td>
                <td>{m.hands}</td>
                <td>{pct(m.vpip, m.hands)}</td>
                <td>{pct(m.pfr, m.hands)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
