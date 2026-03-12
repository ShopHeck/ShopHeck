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

interface TimerContextValue {
  signal: TimerSignal;
  setSignal: React.Dispatch<React.SetStateAction<TimerSignal>>;
}

const defaultSignal: TimerSignal = {
  isRunning: false,
  phase: 'idle',
  currentRound: 1,
  rounds: 12,
  timeLeft: 0,
  flashColor: null,
};

const TimerContext = createContext<TimerContextValue>({
  signal: defaultSignal,
  setSignal: () => {},
});

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [signal, setSignal] = useState<TimerSignal>(defaultSignal);
  return (
    <TimerContext.Provider value={{ signal, setSignal }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimerContext() {
  return useContext(TimerContext);
}
