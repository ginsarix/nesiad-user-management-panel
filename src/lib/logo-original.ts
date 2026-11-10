/** "PDF" or "SVG": what a stored logo original is, for labels */
export function logoOriginalKind(filename: string) {
  return filename.toLowerCase().endsWith(".svg") ? "SVG" : "PDF";
}
