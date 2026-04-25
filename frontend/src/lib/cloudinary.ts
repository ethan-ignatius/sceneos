import { Cloudinary } from "@cloudinary/url-gen";

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

if (!cloudName) {
  console.warn(
    "[cloudinary] VITE_CLOUDINARY_CLOUD_NAME is not set. Set it in frontend/.env to enable media transforms.",
  );
}

export const cloudinary = new Cloudinary({
  cloud: {
    cloudName: cloudName ?? "demo",
  },
  url: {
    secure: true,
  },
});

export const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

// Re-export the richer helpers from cloudinary-transforms.ts so all
// existing imports from "@/lib/cloudinary" keep working.
export {
  buildSpliceUrl,
  buildSpliceUrlSegments,
  buildClipUrl,
  buildThumbnailUrl,
  colorGradeFor,
  moodAccentColor,
  withCaption,
} from "./cloudinary-transforms";
