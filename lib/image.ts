// Browser-side photo compression to roughly 200 KB (JPEG). Lowers quality first, then dimensions.
export async function compressImage(file: File, maxBytes = 200_000, maxEdge = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let edge = Math.min(maxEdge, Math.max(bitmap.width, bitmap.height));
  let blob: Blob = new Blob();

  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.8; quality >= 0.5; quality -= 0.1) {
      blob = await toBlob(canvas, quality);
      if (blob.size <= maxBytes) { bitmap.close?.(); return blob; }
    }
    edge = Math.round(edge * 0.75);
  }
  bitmap.close?.();
  return blob;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read photo"))), "image/jpeg", quality),
  );
}
