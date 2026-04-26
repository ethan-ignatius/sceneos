import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Auth0Provider } from "@auth0/auth0-react";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const tree = (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "var(--color-bg-elev-1)",
              border: "1px solid var(--color-fg-tertiary)",
              color: "var(--color-fg-primary)",
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  auth0Domain && auth0ClientId ? (
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{ redirect_uri: window.location.origin }}
    >
      {tree}
    </Auth0Provider>
  ) : (
    tree
  ),
);
