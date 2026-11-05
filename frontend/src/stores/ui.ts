import { create } from "zustand";

interface UiState {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  compareId: string | null;
  setCompareId: (id: string | null) => void;
}

/** Only what crosses pages. Server data stays in TanStack Query. */
export const useUi = create<UiState>((set) => ({
  navOpen: false,
  setNavOpen: (navOpen) => set({ navOpen }),
  compareId: null,
  setCompareId: (compareId) => set({ compareId }),
}));
