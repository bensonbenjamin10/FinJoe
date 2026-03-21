import { createHmac, timingSafeEqual } from "crypto";

const RAZORPAY_ORDERS = "https://api.razorpay.com/v1/orders";
const RAZORPAY_PAYMENTS = "https://api.razorpay.com/v1/payments";

function basicAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export function getRazorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID?.trim() || null;
}

export function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
}

export async function razorpayCreateOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const receipt = params.receipt.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || `r_${Date.now()}`;
  const res = await fetch(RAZORPAY_ORDERS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(),
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt,
      notes: params.notes ?? {},
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const desc = typeof data.error === "object" && data.error && typeof (data.error as { description?: string }).description === "string"
      ? (data.error as { description: string }).description
      : JSON.stringify(data);
    throw new Error(`Razorpay order failed: ${desc}`);
  }
  const id = data.id as string;
  const amount = Number(data.amount);
  const currency = String(data.currency ?? "INR");
  if (!id || !Number.isFinite(amount)) {
    throw new Error("Razorpay order response missing id or amount");
  }
  return { id, amount, currency };
}

export async function razorpayFetchPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  amount: number;
  currency: string;
  order_id?: string;
}> {
  const res = await fetch(`${RAZORPAY_PAYMENTS}/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: basicAuthHeader() },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const desc = typeof data.error === "object" && data.error && typeof (data.error as { description?: string }).description === "string"
      ? (data.error as { description: string }).description
      : JSON.stringify(data);
    throw new Error(`Razorpay payment fetch failed: ${desc}`);
  }
  return {
    id: String(data.id),
    status: String(data.status ?? ""),
    amount: Number(data.amount),
    currency: String(data.currency ?? "INR"),
    order_id: data.order_id != null ? String(data.order_id) : undefined,
  };
}

export function verifyRazorpaySignature(orderId: string, razorpayPaymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${razorpayPaymentId}`).digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
