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
      videoType: "trailer",
      setMasterPrompt: (masterPrompt) => set({ masterPrompt }),
      setVideoType: (videoType) => set({ videoType }),
      reset: () => set({ masterPrompt: "", videoType: "trailer" }),
    }),
    { name: "sceneos:prompt" },
  ),
);
