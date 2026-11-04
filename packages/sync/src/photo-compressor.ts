/**
 * Client-side image compression utility for field collectors.
 * Resizes captured photos (camera / file) to ~1600px max dimension,
 * preserving aspect ratio and compressing to JPEG/WebP.
 */

export interface CompressPhotoOptions {
  maxDimension?: number; // Default: 1600 px
  quality?: number; // Default: 0.82
  mimeType?: string; // Default: image/jpeg
}

export interface CompressedPhotoResult {
  blob: Blob;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export async function compressFieldPhoto(
  fileOrBlob: Blob | File,
  options: CompressPhotoOptions = {},
): Promise<CompressedPhotoResult> {
  const maxDim = options.maxDimension ?? 1600;
  const quality = options.quality ?? 0.82;
  const mimeType = options.mimeType ?? 'image/jpeg';

  // In Node / non-DOM environments, fallback to original blob
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      blob: fileOrBlob,
      width: maxDim,
      height: maxDim,
      sizeBytes: fileOrBlob.size,
      mimeType: fileOrBlob.type || mimeType,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to encode compressed image blob'));
            return;
          }

          resolve({
            blob,
            width,
            height,
            sizeBytes: blob.size,
            mimeType,
          });
        },
        mimeType,
        quality,
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image for compression: ${String(err)}`));
    };

    img.src = objectUrl;
  });
}
