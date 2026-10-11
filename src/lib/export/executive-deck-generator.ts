/**
 * Client-side executive report. Builds one slide list, then draws it as a
 * PDF or a PowerPoint file. The heavy libraries load only when the user
 * clicks Export, so they cost nothing on an ordinary page view.
 *
 * Every figure comes from the same analytics functions the screen already
 * uses. Nothing is recalculated here.
 */

import { auDate, fileSafe } from "@/src/lib/export/report-format";
import type { BuiltReport } from "@/src/lib/export/report-project";
import {
  buildProjectReport,
  type ProjectReportInput,
} from "@/src/lib/export/report-project";
import {
  buildPortfolioReport,
  type PortfolioReportInput,
} from "@/src/lib/export/report-portfolio";
import type { Measure } from "@/src/lib/export/slide-kit";

export type ExportFormat = "pdf" | "pptx";

export type GeneratedReport = {
  blob: Blob;
  filename: string;
  mime: string;
  slideCount: number;
};

function stamp(report: BuiltReport, when: Date, format: ExportFormat): string {
  const day = auDate(when.toISOString().slice(0, 10)).replace(/\//g, "-");
  const ext = format === "pdf" ? "pdf" : "pptx";
  return `${fileSafe(report.reportName)} - ${fileSafe(report.fileLabel)} - ${day}.${ext}`;
}

async function measureForPdf(): Promise<{
  measure: Measure;
  jspdf: typeof import("jspdf");
}> {
  const [jspdf, { createPdfMeasure }] = await Promise.all([
    import("jspdf"),
    import("@/src/lib/export/render-pdf"),
  ]);
  return { measure: createPdfMeasure(jspdf), jspdf };
}

async function render(
  report: BuiltReport,
  format: ExportFormat,
  jspdf: typeof import("jspdf"),
  exportedBy: string,
): Promise<Blob> {
  const meta = {
    title: report.title,
    author: exportedBy,
    subject: report.scopeLabel,
  };
  if (format === "pdf") {
    const { renderPdf } = await import("@/src/lib/export/render-pdf");
    return renderPdf(report.slides, jspdf, meta);
  }
  const [{ renderPptx }, pptx] = await Promise.all([
    import("@/src/lib/export/render-pptx"),
    import("pptxgenjs"),
  ]);
  const written = await renderPptx(
    report.slides,
    { default: pptx.default ?? (pptx as unknown as typeof import("pptxgenjs").default) },
    meta,
    "blob",
  );
  return written as Blob;
}

export async function generateProjectDeck(
  input: ProjectReportInput,
  format: ExportFormat,
): Promise<GeneratedReport> {
  const { measure, jspdf } = await measureForPdf();
  const report = buildProjectReport(input, measure);
  const blob = await render(report, format, jspdf, input.exportedBy);
  return {
    blob,
    filename: stamp(report, input.exportedAt, format),
    mime:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    slideCount: report.slides.length,
  };
}

export async function generatePortfolioDeck(
  input: PortfolioReportInput,
  format: ExportFormat,
): Promise<GeneratedReport> {
  const { measure, jspdf } = await measureForPdf();
  const report = buildPortfolioReport(input, measure);
  const blob = await render(report, format, jspdf, input.exportedBy);
  return {
    blob,
    filename: stamp(report, input.exportedAt, format),
    mime:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    slideCount: report.slides.length,
  };
}

export function downloadGeneratedReport(file: GeneratedReport): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}
