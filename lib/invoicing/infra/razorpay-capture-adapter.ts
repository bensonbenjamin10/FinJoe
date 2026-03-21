import type { PaymentCapturePort } from "../ports/payment-capture-port.js";
import type { PaymentCaptureResult } from "../ports/types.js";
import {
  verifyRazorpaySignature,
  razorpayFetchPayment,
} from "../../../server/razorpay-api.js";

export class RazorpayCaptureAdapter implements PaymentCapturePort {
  provider = "razorpay" as const;

  async verifyAndNormalize(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<PaymentCaptureResult> {
    const valid = verifyRazorpaySignature(params.orderId, params.paymentId, params.signature);
    if (!valid) throw new Error("Invalid payment signature");

    const payment = await razorpayFetchPayment(params.paymentId);
    if (payment.status !== "authorized" && payment.status !== "captured") {
      throw new Error(`Payment not successful (status: ${payment.status})`);
    }
    if (payment.order_id && payment.order_id !== params.orderId) {
      throw new Error("Payment does not match order");
    }

    return {
      provider: this.provider,
      externalPaymentId: params.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      metadata: { orderId: params.orderId, status: payment.status },
    };
  }
}
