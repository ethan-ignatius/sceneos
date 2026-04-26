import { useAuth0 } from "@auth0/auth0-react";
import { Loader2, LogIn, LogOut, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Auth0 login / signup / logout chip. Mounted only when both
 * VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID are set (see main.tsx) —
 * if Auth0 isn't configured, the surrounding tree omits this entirely
 * so calling useAuth0() outside of an Auth0Provider can't crash.
 */
export function AuthButtons() {
  const { isLoading, isAuthenticated, error, loginWithRedirect, logout, user } =
    useAuth0();

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-2 font-body text-pill text-fg-tertiary">
        <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
        Signing in
      </span>
    );
  }

  if (error) {
    return (
      <span
        role="alert"
        className="font-body text-pill text-state-error"
        title={error.message}
      >
        Auth error
      </span>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="inline-flex items-center gap-3">
        <span className="font-body text-pill text-fg-secondary" title={user?.email}>
          {user?.email ?? user?.name ?? "Signed in"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            logout({ logoutParams: { returnTo: window.location.origin } })
          }
          aria-label="Log out of SceneOS"
        >
          <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
          Log out
        </Button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          loginWithRedirect({
            authorizationParams: { screen_hint: "signup" },
          })
        }
        aria-label="Create a SceneOS account"
      >
        <UserPlus size={14} strokeWidth={1.5} aria-hidden="true" />
        Sign up
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={() => loginWithRedirect()}
        aria-label="Log into SceneOS"
      >
        <LogIn size={14} strokeWidth={1.5} aria-hidden="true" />
        Log in
      </Button>
    </div>
  );
}
