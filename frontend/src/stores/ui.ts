import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
  defaultIterations: number;
  setDefaultIterations: (value: number) => void;
}

/** Only what crosses pages. Server data stays in TanStack Query. */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      navOpen: false,
      setNavOpen: (navOpen) => set({ navOpen }),
      reduceMotion: false,
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      defaultIterations: 10_000,
      setDefaultIterations: (defaultIterations) => set({ defaultIterations }),
    }),
    {
      name: "pitchside.settings",
      partialize: ({ reduceMotion, defaultIterations }) => ({ reduceMotion, defaultIterations }),
    },
  ),
);
