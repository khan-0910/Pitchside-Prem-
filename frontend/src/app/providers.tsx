import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { acquireLenis } from "@/animations/lenis";
import { ApiError } from "@/services/api";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Retrying a 404 or a 503 only delays the honest message.
        retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 600),
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  useEffect(() => acquireLenis(), []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
