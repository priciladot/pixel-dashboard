declare module "pdf-parse" {
  interface PdfData {
    text: string;
    numpages: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfData>;
  export = pdfParse;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfData {
    text: string;
    numpages: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfData>;
  export = pdfParse;
}
