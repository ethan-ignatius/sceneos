import { useAuth0 } from "@auth0/auth0-react";
import { LogIn, LogOut, User as UserIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Auth chrome chip — shows a Login button when logged out, a small
 * avatar + dropdown with Logout when logged in. Sits in the top-right
 * chrome of the routes that care about identity (landing, /projects,
 * /final). Same rounded-pill register the FolderClock "Projects" chrome
 * already uses, so the chrome reads as one chrome system.
 *
 * Render-safe when Auth0 isn't configured: useAuth0 falls back to a
 * stub via the no-op provider tree (see main.tsx) — the chip simply
 * doesn't render.
 */
export function AuthChip({ className }: { className?: string }) {
  const { isLoading, isAuthenticated, user, loginWithRedirect, logout } = useAuth0();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click. The avatar pill is the toggle;
  // anywhere else closes.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (isLoading) {
    return (
      <div className={cn("h-9 w-20 rounded-full bg-bg-elev-1/40", className)} aria-hidden="true" />
    );
  }

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={() =>
          loginWithRedirect({
            authorizationParams: { redirect_uri: window.location.origin },
          })
        }
        aria-label="Sign in"
        title="Sign in"
        className={cn(
          "group inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-fg-tertiary/18 bg-bg-elev-1/70 px-3 py-1.5 backdrop-blur-xl",
          "transition-[border-color,background-color,color] duration-200",
          "hover:border-fg-tertiary/40 hover:bg-bg-elev-1/85",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
          className,
        )}
      >
        <LogIn
          size={11}
          strokeWidth={1.5}
          aria-hidden="true"
          className="text-fg-tertiary transition-colors group-hover:text-fg-secondary"
        />
        <span className="font-body text-pill font-medium text-fg-tertiary transition-colors group-hover:text-fg-secondary">
          Sign in
        </span>
      </button>
    );
  }

  // Pull a short label from the profile. Auth0 may return name OR email;
  // fall back to "Account" if neither is present (rare but possible with
  // some social providers).
  const displayName = (user?.given_name || user?.name || user?.email || "Account").toString();
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${displayName}`}
        className={cn(
          "group inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-fg-tertiary/18 bg-bg-elev-1/70 px-2.5 py-1 backdrop-blur-xl",
          "transition-[border-color,background-color,color] duration-200",
          "hover:border-fg-tertiary/40 hover:bg-bg-elev-1/85",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
        )}
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
            className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-brand-ember/15 font-body text-pill font-semibold text-brand-ember"
          >
            {initial}
          </span>
        )}
        <span className="hidden font-body text-pill font-medium text-fg-tertiary transition-colors group-hover:text-fg-secondary sm:inline">
          {displayName.length > 18 ? `${displayName.slice(0, 18)}…` : displayName}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[14rem] overflow-hidden rounded-md border border-fg-tertiary/18 bg-bg-elev-1/95 shadow-(--shadow-panel) backdrop-blur-xl"
        >
          <div className="border-b border-fg-tertiary/15 px-3 py-2.5">
            <div className="flex items-center gap-2 font-body text-pill font-medium text-fg-secondary">
              <UserIcon size={11} strokeWidth={1.5} aria-hidden="true" className="text-fg-tertiary" />
              <span className="truncate">{displayName}</span>
            </div>
            {user?.email && user.email !== displayName ? (
              <div className="mt-1 truncate font-mono text-micro text-fg-tertiary">
                {user.email}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout({ logoutParams: { returnTo: window.location.origin } });
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left font-body text-pill text-fg-secondary transition-colors hover:bg-bg-elev-2/65 hover:text-fg-primary focus-visible:outline-none focus-visible:bg-bg-elev-2/65"
          >
            <LogOut size={11} strokeWidth={1.5} aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
