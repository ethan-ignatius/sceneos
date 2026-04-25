import { Routes, Route, Navigate } from "react-router-dom";
import { LandingRoute } from "@/routes/landing-route";
import { CrumpleBridgeRoute } from "@/routes/crumple-bridge-route";
import { CanvasRoute } from "@/routes/canvas-route";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/transition" element={<CrumpleBridgeRoute />} />
      <Route path="/canvas" element={<CanvasRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
