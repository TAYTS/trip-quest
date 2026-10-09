// Turns the Trip Wrapped slides into a PDF, entirely on the phone (nothing is uploaded).
// Loaded only when "Download PDF" is tapped, so the two libraries don't slow down the game.
import { getFontEmbedCSS, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

/** Page size in PDF points: a phone-shaped 9:16 page. */
const W = 405;
const H = 720;

export async function slidesToPdf(nodes: HTMLElement[], filename: string): Promise<void> {
  if (!nodes.length) throw new Error('No slides to save.');
  // Fonts are read once and reused for every slide.
  const fontEmbedCSS = await getFontEmbedCSS(nodes[0]).catch(() => '');
  const pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: 'portrait', compress: true });
  for (let i = 0; i < nodes.length; i++) {
    const img = await toJpeg(nodes[i], {
      quality: 0.85,
      pixelRatio: 2,
      width: W,
      height: H,
      fontEmbedCSS,
      skipAutoScale: true,
    });
    if (i > 0) pdf.addPage([W, H], 'portrait');
    pdf.addImage(img, 'JPEG', 0, 0, W, H);
  }
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
