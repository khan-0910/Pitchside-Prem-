import "@fontsource/big-shoulders-display/700";
import "@fontsource/big-shoulders-display/900";
import "@fontsource/barlow/400";
import "@fontsource/barlow/500";
import "@fontsource/barlow/600";
import "lenis/dist/lenis.css";
import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { Providers } from "./app/providers";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Providers>
  </StrictMode>,
);
