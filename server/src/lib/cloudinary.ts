import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { env, cloudinaryEnabled } from "../config/env";
import { HttpError } from "./errors";

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function assertEnabled() {
  if (!cloudinaryEnabled) {
    throw new HttpError(503, "Cloudinary is not configured on the server", "CLOUDINARY_DISABLED");
  }
}

/**
 * Parameters for a signed, direct browser -> Cloudinary upload.
 * The browser never sees the API secret; it posts the file plus these params to Cloudinary.
 */
export function createUploadSignature(lotId?: string) {
  assertEnabled();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = lotId ? `${env.CLOUDINARY_UPLOAD_FOLDER}/${lotId}` : env.CLOUDINARY_UPLOAD_FOLDER;
  // Eager derivatives are generated at upload time so the first gallery view is instant.
  const eager = "c_limit,w_1600,q_auto,f_auto|c_fill,w_600,h_600,g_auto,q_auto,f_auto";
  const paramsToSign = { timestamp, folder, eager, eager_async: true };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    timestamp,
    folder,
    eager,
    eager_async: true,
    signature,
  };
}

/** Confirms a client-reported upload really exists in our account before we store it. */
export async function verifyUploadedAsset(publicId: string) {
  assertEnabled();
  if (!publicId.startsWith(env.CLOUDINARY_UPLOAD_FOLDER)) {
    throw new HttpError(400, "Asset is outside the permitted upload folder", "INVALID_ASSET");
  }
  try {
    const res = await cloudinary.api.resource(publicId);
    return { publicId: res.public_id as string, url: res.secure_url as string, width: res.width as number, height: res.height as number };
  } catch {
    throw new HttpError(400, "Uploaded asset could not be verified", "INVALID_ASSET");
  }
}

/** Server-side upload (multipart from admin UI, or remote URL from the seed script). */
export function uploadImage(source: Buffer | string, folder: string): Promise<UploadApiResponse> {
  assertEnabled();
  const options = { folder, resource_type: "image" as const, overwrite: false, unique_filename: true };
  if (typeof source === "string") return cloudinary.uploader.upload(source, options);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err || !result) return reject(err ?? new Error("Upload failed"));
      resolve(result);
    });
    stream.end(source);
  });
}

export async function destroyImage(publicId: string) {
  if (!cloudinaryEnabled) return;
  await cloudinary.uploader.destroy(publicId).catch(() => undefined);
}
