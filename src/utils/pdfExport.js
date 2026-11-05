import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Rasterizes `node` and places it on a single A4 page, shrinking to fit if the content
// would otherwise overflow — used for the COA, which must always be exactly one page
// (previously relied on the browser's print dialog, which has no such guarantee and
// could silently spill onto a second page depending on content length/zoom/printer).
export async function nodeToSinglePagePdf(node) {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let widthMm = pageWidth;
  let heightMm = (canvas.height * widthMm) / canvas.width;
  if (heightMm > pageHeight) {
    heightMm = pageHeight;
    widthMm = (canvas.width * heightMm) / canvas.height;
  }
  const xOffset = (pageWidth - widthMm) / 2;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", xOffset, 0, widthMm, heightMm);
  return pdf;
}

// Rasterizes `node` and slices it across as many A4 pages as the content actually
// needs — used for Reports, which can legitimately run to any number of result rows
// and shouldn't be force-shrunk to illegibility the way the COA is.
export async function nodeToMultiPagePdf(node) {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pxPerMm = canvas.width / pageWidth;
  const pageHeightPx = Math.floor(pageHeight * pxPerMm);

  let renderedPx = 0;
  let pageIndex = 0;
  const sliceCanvas = document.createElement("canvas");
  const sliceCtx = sliceCanvas.getContext("2d");
  sliceCanvas.width = canvas.width;

  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
    sliceCanvas.height = sliceHeightPx;
    sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceCtx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 0, 0, pageWidth, sliceHeightPx / pxPerMm);
    renderedPx += sliceHeightPx;
    pageIndex += 1;
  }
  return pdf;
}
