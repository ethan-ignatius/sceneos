import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Auth0Provider } from "@auth0/auth0-react";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

// Auth0 SPA config — values pulled from Vite env so dev/prod tenants
// can differ. Both fields are public (the Client ID ships in the
// bundle; SPAs use Authorization Code + PKCE so no secret is needed).
// If unset, we mount a passthrough provider that no-ops auth — the app
// still renders, the chrome's auth chip just shows "Auth not
// configured" instead of a Login button. Means a teammate without env
// values can still run the dev server.
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;
const auth0Configured = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function Root() {
  return (
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
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {auth0Configured ? (
      <Auth0Provider
        domain={AUTH0_DOMAIN!}
        clientId={AUTH0_CLIENT_ID!}
        authorizationParams={{ redirect_uri: window.location.origin }}
        // cacheLocation:"localstorage" persists the session across
        // browser refreshes so the user doesn't re-login every reload.
        // Trade-off: tokens live in localStorage (vulnerable to XSS).
        // Acceptable for this product — the API doesn't expose
        // anything destructive without a server-side gate.
        cacheLocation="localstorage"
      >
        <Root />
      </Auth0Provider>
    ) : (
      <Root />
    )}
  </React.StrictMode>,
);
