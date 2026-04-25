import { Suspense, lazy, useEffect, useState } from "react";

const CommandMenu = lazy(() =>
  import("./command-menu").then((m) => ({ default: m.CommandMenu })),
);

/**
 * Lazy mount for the ⌘K command palette. Listens for the keyboard shortcut
 * at App root; only loads the cmdk + Radix-style chunk on first invocation.
 *
 * Keeps the main bundle under the 200 KB gzipped budget per POLISH_AUDIT §2.
 */
export function CommandMenuMount() {
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActivated(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!activated) return null;
  return (
    <Suspense fallback={null}>
      <CommandMenu />
    </Suspense>
  );
}
