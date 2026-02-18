export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function getExtension(fileName: string): string {
  const lowered = fileName.toLowerCase();
  const index = lowered.lastIndexOf('.');
  if (index < 0) {
    return '';
  }
  return lowered.slice(index);
}

export function isImageFile(file: File, extension: string): boolean {
  return file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(extension);
}

export async function readTextWithEncodingFallback(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
