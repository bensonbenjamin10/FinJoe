import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  
  const verifyMutation = useMutation({
    mutationFn: async () => {
      const paymentId = urlParams.get("razorpay_payment_id");
      const orderId = urlParams.get("razorpay_order_id");
      const signature = urlParams.get("razorpay_signature");
      
      if (!paymentId || !orderId || !signature) {
        throw new Error("Missing payment parameters");
      }

      return apiRequest("POST", "/api/payments/verify", {
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        razorpaySignature: signature,
      });
    },
    onSuccess: () => {
      setLocation("/thank-you?type=payment");
    },
    onError: () => {
      setLocation("/thank-you?type=payment&status=failed");
    },
  });

  useEffect(() => {
    verifyMutation.mutate();
  }, []);

  return (
    <div className="flex flex-col min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Verifying Payment...</h2>
        <p className="text-muted-foreground">Please wait while we confirm your payment.</p>
      </div>
    </div>
  );
}
