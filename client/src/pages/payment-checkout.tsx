import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PaymentData {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export default function PaymentCheckout() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get("orderId");

    if (!orderId) {
      setError("Invalid payment parameters");
      setIsLoading(false);
      return;
    }

    // Fetch payment details then load Razorpay script
    fetchPaymentDetailsAndInitialize(orderId);
  }, []);

  const fetchPaymentDetailsAndInitialize = async (orderId: string) => {
    try {
      // Fetch payment details from backend
      const response = await fetch(`/api/payments/order/${orderId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch payment details");
      }

      const paymentData: PaymentData = await response.json();

      // Load Razorpay script
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => initializePayment(paymentData);
      script.onerror = () => {
        setError("Failed to load payment gateway");
        setIsLoading(false);
      };
      document.body.appendChild(script);

      return () => {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      };
    } catch (err) {
      console.error("Error fetching payment details:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch payment details");
      setIsLoading(false);
    }
  };

  const initializePayment = async (paymentData: PaymentData) => {
    try {
      setIsLoading(false);
      
      const options = {
        key: paymentData.keyId,
        order_id: paymentData.orderId,
        amount: paymentData.amount * 100, // Convert rupees to paise (Razorpay expects paise)
        currency: paymentData.currency,
        name: "MedPG",
        description: "Program Registration Fee",
        image: "/favicon.png",
        handler: function (response: any) {
          // Redirect to payment success page with payment details
          const params = new URLSearchParams({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });
          window.location.href = `/payment-success?${params.toString()}`;
        },
        prefill: {
          name: "",
          email: "",
          contact: "",
        },
        theme: {
          color: "#0066FF",
        },
        modal: {
          ondismiss: function () {
            setLocation("/contact");
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err) {
      console.error("Error initializing payment:", err);
      setError("Failed to initialize payment");
    }
  };

  if (error) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <a href="/contact" className="text-primary hover:underline">
              Return to Contact Page
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Loading Payment Gateway...</h2>
        <p className="text-muted-foreground">Please wait</p>
      </div>
    </div>
  );
}
