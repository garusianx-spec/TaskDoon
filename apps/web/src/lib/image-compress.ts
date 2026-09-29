/**
 * Photos sent in a chat are re-encoded in the browser before they are uploaded (a picture sent
 * "as a file" is not: it keeps its original bytes).
 */

/** Raster formats a canvas redraws faithfully. GIFs would lose their animation, SVGs their vectors. */
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);
/** The longest side a photo keeps. */
export const PHOTO_MAX_EDGE = 2560;
/** Below this, re-encoding saves next to nothing and only costs quality. */
const SMALL_BYTES = 100 * 1024;
const QUALITY = 0.82;

export const isImageFile = (file: Blob): boolean => file.type.startsWith('image/');

/**
 * `file` redrawn on a canvas as WebP (JPEG where the browser cannot write WebP), its longest side
 * at most {@link PHOTO_MAX_EDGE}. The original comes back instead when it is already small, is not
 * a format the canvas redraws faithfully, cannot be decoded, or the new copy is no smaller.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || file.size <= SMALL_BYTES || typeof document === 'undefined') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    const blob = (await encode(canvas, context, bitmap, 'image/webp')) ?? (await encode(canvas, context, bitmap, 'image/jpeg'));
    if (!blob || blob.size >= file.size) return file;
    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${baseName(file.name)}.${extension}`, { type: blob.type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

async function encode(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, bitmap: ImageBitmap, type: 'image/webp' | 'image/jpeg'): Promise<Blob | null> {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (type === 'image/jpeg') {
    // JPEG has no transparency: see-through areas turn white rather than black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  // A browser that cannot write the type hands back a PNG instead.
  return blob && blob.type === type ? blob : null;
}

const baseName = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name || 'photo';
};
