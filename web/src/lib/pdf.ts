/**
 * Turn the on-screen estimate into a real PDF file (letter size) that can be
 * attached to an email or shared from the phone. Pages break between sections
 * or table rows, never through the middle of a line of text.
 */
export async function elementToPdf(el: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const scale = 2;
  const canvas = await html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false });

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 28; // ~10mm
  const pageW = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageH = pdf.internal.pageSize.getHeight() - margin * 2;
  const pxPerPt = canvas.width / pageW;
  const pagePx = Math.floor(pageH * pxPerPt);

  // Safe places to break: tops of sections and table rows.
  const top = el.getBoundingClientRect().top;
  const breaks = [...el.querySelectorAll<HTMLElement>('[data-break], tr')]
    .map((n) => Math.round((n.getBoundingClientRect().top - top) * scale))
    .filter((y) => y > 0)
    .sort((a, b) => a - b);

  let y = 0;
  let first = true;
  while (y < canvas.height - 1) {
    let end = Math.min(y + pagePx, canvas.height);
    if (end < canvas.height) {
      const candidate = breaks.filter((b) => b > y + pagePx * 0.4 && b <= end).pop();
      if (candidate) end = candidate;
    }
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = end - y;
    slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pageW, (end - y) / pxPerPt);
    first = false;
    y = end;
  }
  return pdf.output('blob');
}

/** Share the PDF from the phone (Messages, Mail, Files…), or download it on a computer. */
export async function shareOrDownload(blob: Blob, filename: string, text: string) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
