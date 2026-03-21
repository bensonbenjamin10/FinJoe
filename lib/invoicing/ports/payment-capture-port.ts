import type { PaymentCaptureResult } from "./types.js";

export interface PaymentCapturePort {
  provider: string;
  verifyAndNormalize(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<PaymentCaptureResult>;
}
