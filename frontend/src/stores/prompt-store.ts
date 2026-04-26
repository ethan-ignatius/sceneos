import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VideoType } from "@/types/manifest";

interface PromptState {
  masterPrompt: string;
  videoType: VideoType;
  setMasterPrompt: (prompt: string) => void;
  setVideoType: (type: VideoType) => void;
  reset: () => void;
}

export const usePromptStore = create<PromptState>()(
  persist(
    (set) => ({
      masterPrompt: "",
      // Default to the chip labeled "Trailer" (videoType "short" = 3 beats).
      // Shortest tier = demo-safe pick + matches the user's phrasing of
      // "default to trailer" (referring to the chip label, not the
      // internal videoType id which confusingly is named "trailer" but
      // labeled "Short film").
      videoType: "short",
      setMasterPrompt: (masterPrompt) => set({ masterPrompt }),
      setVideoType: (videoType) => set({ videoType }),
      reset: () => set({ masterPrompt: "", videoType: "short" }),
    }),
    { name: "sceneos:prompt" },
  ),
);
