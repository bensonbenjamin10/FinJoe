export interface InvoiceDocumentPort {
  generateHtml(invoiceId: string): Promise<string>;
}

export class StubInvoiceDocument implements InvoiceDocumentPort {
  async generateHtml(_invoiceId: string): Promise<string> {
    return "<p>PDF generation not yet configured.</p>";
  }
}
