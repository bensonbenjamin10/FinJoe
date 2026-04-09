/** Whether API responses should hide internal error details from clients. */
export const isProductionApi = process.env.NODE_ENV === "production";

/** Message safe to return to browsers when status is 5xx. */
export function internalErrorMessage(): string {
  return "Internal Server Error";
}

/** JSON body for 5xx responses — never forwards exception text in production. */
export function jsonInternalError(): { error: string } {
  return { error: internalErrorMessage() };
}

/** Express error-handler style: hide 5xx messages in production; keep 4xx as-is when present. */
export function expressErrorClientMessage(err: { message?: string; status?: number }): string {
  const status = err.status ?? 500;
  const msg = err.message || internalErrorMessage();
  if (isProductionApi && status >= 500) return internalErrorMessage();
  return msg;
}
