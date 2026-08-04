import React, { createContext, useContext, useState } from 'react';

export type TimerPhase = 'idle' | 'prep' | 'work' | 'rest' | 'done';

export interface TimerSignal {
  isRunning: boolean;
  phase: TimerPhase;
  currentRound: number;
  rounds: number;
  timeLeft: number;
  flashColor: string | null;
}

type SetSignal = React.Dispatch<React.SetStateAction<TimerSignal>>;

const defaultSignal: TimerSignal = {
  isRunning: false,
  phase: 'idle',
  currentRound: 1,
  rounds: 12,
  timeLeft: 0,
  flashColor: null,
};

// Two contexts, not one.
//
// The signal ticks once a second for the whole length of a session. Handing out
// `{ signal, setSignal }` as a single object literal meant that object was new
// on every tick, so every consumer re-rendered every second — including the
// producer, `useRoundTimer`, which only ever needs the setter and was being
// re-rendered by its own writes.
//
// Split, the setter side is a `useState` setter (stable for the lifetime of the
// provider), so writers subscribe to nothing and only genuine readers of the
// countdown re-render.
const TimerSignalContext = createContext<TimerSignal>(defaultSignal);
const TimerSetterContext = createContext<SetSignal>(() => {});

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [signal, setSignal] = useState<TimerSignal>(defaultSignal);
  return (
    <TimerSetterContext.Provider value={setSignal}>
      <TimerSignalContext.Provider value={signal}>
        {children}
      </TimerSignalContext.Provider>
    </TimerSetterContext.Provider>
  );
}

/** Read the live timer signal. Re-renders once a second while a session runs. */
export function useTimerSignal(): TimerSignal {
  return useContext(TimerSignalContext);
}

/** Write the timer signal. Stable — subscribing to this never causes a render. */
export function useTimerSignalSetter(): SetSignal {
  return useContext(TimerSetterContext);
}
