// src/shared/file/utils.ts
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function getExtension(fileName) {
  const lowered = fileName.toLowerCase();
  const index = lowered.lastIndexOf(".");
  if (index < 0) {
    return "";
  }
  return lowered.slice(index);
}
function isImageFile(file, extension) {
  return file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(extension);
}
async function readTextWithEncodingFallback(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export {
  escapeHtml,
  getExtension,
  isImageFile,
  readTextWithEncodingFallback
};
