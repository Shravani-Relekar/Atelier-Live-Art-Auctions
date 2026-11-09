import { useEffect, useState } from "react";
import { onClockOffset, serverNow } from "@/lib/socket";

export interface Countdown {
  ms: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function compute(target: number): Countdown {
  const ms = Math.max(0, target - serverNow());
  const s = Math.floor(ms / 1000);
  return { ms, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, done: ms <= 0 };
}

/** Countdown driven by the server-synchronised clock, ticking on whole-second boundaries. */
export function useCountdown(targetIso: string | null | undefined): Countdown {
  const target = targetIso ? new Date(targetIso).getTime() : 0;
  const [state, setState] = useState(() => compute(target));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      const next = compute(target);
      setState(next);
      if (!next.done) timer = setTimeout(tick, (next.ms % 1000) + 5);
    };
    tick();
    const off = onClockOffset(tick);
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [target]);

  return state;
}
