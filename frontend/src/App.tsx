import { Routes, Route, Navigate } from "react-router-dom";
import { LandingRoute } from "@/routes/landing-route";
import { CrumpleBridgeRoute } from "@/routes/crumple-bridge-route";
import { CanvasRoute } from "@/routes/canvas-route";
import { EditorRoute } from "@/routes/editor-route";
import { FinalDeliveryRoute } from "@/routes/final-delivery-route";
import { ProjectsRoute } from "@/routes/projects-route";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { CinematicCursor } from "@/components/ui/cinematic-cursor";
import { CommandMenuMount } from "@/components/ui/command-menu-mount";
import { NarrationBar } from "@/components/narration/narration-bar";
import { ManifestAutoSync } from "@/components/manifest-autosync";
import { useLenis } from "@/lib/use-lenis";

export default function App() {
  // Lenis at App root → smooth-scroll on every route except canvas (which is
  // overflow-hidden so Lenis no-ops there). Skipped under reduced-motion.
  useLenis();

  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/transition" element={<CrumpleBridgeRoute />} />
        <Route path="/canvas" element={<CanvasRoute />} />
        <Route path="/edit" element={<EditorRoute />} />
        <Route path="/final" element={<FinalDeliveryRoute />} />
        <Route path="/projects" element={<ProjectsRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Mounted outside <Routes> so they survive route navigation. */}
      <CinematicCursor />
      <CommandMenuMount />
      <NarrationBar />
      <ManifestAutoSync />
    </AppErrorBoundary>
  );
}
