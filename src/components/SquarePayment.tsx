
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CreditCard as CardIcon, ShieldCheck } from 'lucide-react';
import styles from './SquarePayment.module.css';

// Define types for the Square SDK
interface Square {
  payments: (applicationId: string, locationId: string, options?: any) => SquarePayments;
}

interface SquarePayments {
  card: (options?: CardOptions) => Promise<SquareCard>;
}

interface CardOptions {
  style?: {
    '.input-container'?: {
      borderRadius?: string;
      borderColor?: string;
      borderWidth?: string;
    };
    '.input-container.is-focus'?: {
      borderColor?: string;
    };
    '.input-container.is-error'?: {
      borderColor?: string;
    };
  };
}

interface SquareCard {
  attach: (selector: string, options?: any) => Promise<void>;
  tokenize: () => Promise<{
    status: string;
    token?: string;
    details?: {
      card?: {
        brand: string;
        last4: string;
        expMonth: number;
        expYear: number;
      };
    };
  }>;
  destroy?: () => void;
}

interface SquarePaymentProps {
  onSuccess: (paymentResponse: any) => void;
  buttonColorClass: string;
  isProcessing: boolean;
  amount: number;
  orderDetails: any;
  onPaymentAttempt?: () => void;
  onError: (error: any) => void;
}

declare global {
  interface Window { Square: Square; }
}

// Environment-aware configuration
const getSquareConfig = () => {
  const squareEnv = import.meta.env.VITE_SQUARE_ENVIRONMENT || 'sandbox';
  const isProduction = squareEnv === 'production';

  const appId = import.meta.env.VITE_SQUARE_APP_ID;
  const locationId = import.meta.env.VITE_SQUARE_LOCATION_ID;

  if (!appId || !locationId) {
    console.error("Square configuration is missing. Ensure VITE_SQUARE_APP_ID and VITE_SQUARE_LOCATION_ID are set in your .env file.");
    return { appId: '', locationId: '', jsUrl: '' };
  }

  const jsUrl = isProduction 
    ? 'https://web.squarecdn.com/v1/square.js' 
    : 'https://sandbox.web.squarecdn.com/v1/square.js';
  
  console.log('Square Config:', { 
    appId, 
    locationId, 
    environment: squareEnv,
    jsUrl 
  });
  
  return {
    appId,
    locationId,
    jsUrl
  };
};

// Mobile detection utility
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.innerWidth <= 768);
};

const SquarePayment = ({ onSuccess, buttonColorClass, isProcessing, amount, orderDetails, onPaymentAttempt, onError }: SquarePaymentProps) => {
  const [loaded, setLoaded] = useState(false);
  const [card, setCard] = useState<SquareCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile] = useState(isMobileDevice());
  const [config] = useState(getSquareConfig());

  // Cleanup function to destroy card instance
  const cleanupCard = () => {
    if (card && typeof card.destroy === 'function') {
      try {
        card.destroy();
      } catch (e) {
        console.warn("Error destroying card instance:", e);
      }
    }
  };

  useEffect(() => {
    // Clean up any previous script instances to prevent conflicts
    const existingScript = document.getElementById('square-script');
    if (existingScript) {
      document.body.removeChild(existingScript);
    }

    // Load the Square Web Payments SDK
    const script = document.createElement('script');
    script.id = 'square-script';
    script.src = config.jsUrl;
    script.async = true;
    script.onload = () => {
      console.log("Square SDK loaded successfully");
      setLoaded(true);
    };
    script.onerror = (e) => {
      console.error("Failed to load Square SDK:", e);
      setError("Failed to load payment processor");
      toast.error("Failed to load payment processor", {
        description: "Please refresh the page and try again",
      });
    };
    document.body.appendChild(script);

    return () => {
      cleanupCard();
      const scriptToRemove = document.getElementById('square-script');
      if (scriptToRemove) {
        try {
          document.body.removeChild(scriptToRemove);
        } catch (e) {
          console.warn("Script already removed:", e);
        }
      }
    };
  }, [config.jsUrl]);

  useEffect(() => {
    if (!loaded || card) return;

    async function initializeCard() {
      if (!config.appId || !config.locationId) {
        const errorMessage = "Payment provider is not configured. Please contact support.";
        console.error(errorMessage);
        setError(errorMessage);
        toast.error("Payment Error", {
          description: errorMessage,
        });
        return;
      }
      
      if (!window.Square) {
        console.error("Square SDK not available");
        setError("Payment processor not available");
        toast.error("Payment processor not available", {
          description: "Please refresh the page and try again",
        });
        return;
      }

      try {
        setCardLoading(true);
        console.log("Initializing Square Payments:", config);

        // Wait for container to be in DOM before proceeding
        const waitForContainer = () => {
          return new Promise((resolve, reject) => {
            const checkContainer = () => {
              const container = document.getElementById('card-container');
              if (container) {
                resolve(container);
              } else {
                setTimeout(checkContainer, 100);
              }
            };
            checkContainer();
            
            // Timeout after 5 seconds to avoid infinite waiting
            setTimeout(() => reject(new Error('Container timeout')), 5000);
          });
        };

        await waitForContainer();

        // Initialize with environment-aware configuration
        const payments = window.Square.payments(config.appId, config.locationId);

        console.log("Creating card instance with mobile optimization");
        
        // Minimal card configuration with only confirmed valid Square SDK styles
        const cardOptions: CardOptions = {
          style: {
            '.input-container': {
              borderRadius: '8px',
              borderColor: '#D1D5DB',
              borderWidth: '1px'
            },
            '.input-container.is-focus': {
              borderColor: '#3B82F6'
            },
            '.input-container.is-error': {
              borderColor: '#EF4444'
            }
          }
        };

        const cardInstance = await payments.card(cardOptions);

        // Double-check container is still available
        const container = document.getElementById('card-container');
        if (!container) {
          throw new Error('Card container not found in DOM');
        }

        // Add mobile-specific attributes to container
        if (isMobile) {
          container.style.minHeight = '120px';
          container.setAttribute('data-mobile', 'true');
        }

        console.log("Attaching card to container with mobile support");
        await cardInstance.attach('#card-container');
        console.log("Card attached successfully");

        setCard(cardInstance);
        setError(null);
      } catch (e) {
        console.error("Square initialization error:", e);
        setError("Failed to initialize payment form");
        toast.error("Failed to initialize payment form", {
          description: "Please try again or use a different payment method",
        });
      } finally {
        setCardLoading(false);
      }
    }

    // Small delay to ensure DOM is ready
    setTimeout(initializeCard, 100);
  }, [loaded, card, config, isMobile]);

  const handlePaymentSubmit = async () => {
    onPaymentAttempt?.();
    
    if (!card) {
      toast.error("Payment form not ready");
      return;
    }

    try {
      const result = await card.tokenize();
      if (result.status !== 'OK' || !result.token) {
        toast.error("Card tokenization failed. Please check your card details.");
        return;
      }

      const response = await fetch('/api/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: result.token,
          amount,
          orderDetails,
        }),
      });

      const paymentResult = await response.json();

      if (paymentResult.success && paymentResult.payment.status === 'COMPLETED') {
        toast.success("Payment successful!");
        onSuccess(paymentResult);
      } else if (paymentResult.success) {
        // Poll for completion
        const pollPaymentStatus = async (paymentId: string) => {
          const poll = async (retries: number): Promise<any> => {
            if (retries === 0) {
              throw new Error("Payment confirmation timed out.");
            }

            const statusResponse = await fetch(`/api/payment-status?paymentId=${paymentId}`);
            const statusResult = await statusResponse.json();

            if (statusResult.success && statusResult.payment.status === 'COMPLETED') {
              return statusResult;
            } else {
              await new Promise(resolve => setTimeout(resolve, 2000));
              return poll(retries - 1);
            }
          };
          return poll(10); // Poll for 20 seconds
        };

        try {
          const finalPaymentResult = await pollPaymentStatus(paymentResult.payment.id);
          toast.success("Payment confirmed!");
          onSuccess(finalPaymentResult);
        } catch (pollError) {
          toast.error(pollError.message || "Payment confirmation failed.");
          onError(pollError);
        }
      } else {
        toast.error(paymentResult.error || "Payment failed");
        onError(paymentResult.error);
      }
    } catch (e) {
      console.error("Payment processing error:", e);
      toast.error("An unexpected error occurred during payment.");
      onError(e);
    }
  };

  const renderCardContainer = () => {
    const showLoadingState = (cardLoading && !card) || !loaded;
    const showErrorState = error && !cardLoading;
    
    return (
      <div className="space-y-3">
        {/* Always render the card container for Square to attach to */}
        <div 
          id="card-container" 
          className={`${styles.cardContainer} relative`}
          data-mobile={isMobile ? 'true' : 'false'}
          style={{
            // Hide the container when showing loading or error states
            display: showLoadingState || showErrorState ? 'none' : 'block',
            // Additional mobile optimizations
            ...(isMobile && {
              touchAction: 'manipulation',
              WebkitUserSelect: 'text',
              userSelect: 'text'
            })
          }}
        />
        
        {/* Loading state overlay */}
        {showLoadingState && (
          <div className={`${styles.cardContainer} ${isMobile ? styles.mobileLoadingContainer : ''} flex items-center justify-center`}>
            <Loader2 className={`h-6 w-6 animate-spin text-gray-500 ${styles.loadingSpinner}`} />
            <span className="ml-2 text-gray-500">
              {isMobile ? 'Loading secure payment...' : 'Loading payment form...'}
            </span>
          </div>
        )}

        {/* Error state overlay */}
        {showErrorState && (
          <div className={`${styles.errorContainer} ${styles.cardContainer} flex flex-col items-center justify-center`}>
            <p className="font-medium">{error}</p>
            <p className="text-sm mt-2 text-center">
              {isMobile 
                ? "Please refresh the page or try a different browser" 
                : "Please refresh the page or try a different browser"
              }
            </p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="mt-4"
            >
              Refresh Page
            </Button>
          </div>
        )}

        {/* Success state info */}
        {loaded && !showLoadingState && !showErrorState && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center">
                <CardIcon size={14} className="mr-1" />
                <span>All major credit cards accepted</span>
              </div>
            </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${styles.squarePaymentContainer} bg-white p-8 rounded-2xl shadow-lg border border-gray-100`}>
      {/* Enhanced Card Information Header */}
      <div className="flex flex-col items-center justify-center mb-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 text-white flex items-center justify-center rounded-xl shadow-md">
            <CardIcon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Card Information</h3>
            <p className="text-sm text-gray-500">Enter your card details below</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3">
          <img src="/Mastercard_2019_logo.svg" alt="Mastercard" className="h-5" />
          <img src="/Visa_Inc._logo.svg" alt="Visa" className="h-5" />
          <img src="/amex.svg" alt="Amex" className="h-5" />
        </div>
      </div>
      
      {/* Card Input Container */}
      <div className="mb-6">
        {renderCardContainer()}
      </div>
      
      {/* Pay Button */}
      <Button
        onClick={handlePaymentSubmit}
        className={`w-full h-16 ${buttonColorClass} text-white font-bold text-xl rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 group`}
        disabled={isProcessing || !card || !!error}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <span>Pay ${amount.toFixed(2)}</span>
            <ShieldCheck className="w-6 h-6 opacity-80 group-hover:opacity-100 transition-opacity" />
          </>
        )}
      </Button>
      
      {/* Trust Badges */}
      <div className="grid grid-cols-3 gap-4 mt-6 text-center">
        <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
          <ShieldCheck size={16} className="text-green-600" />
          <span>SSL Secured</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
          <ShieldCheck size={16} className="text-green-600" />
          <span>Powered by Square</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
          <ShieldCheck size={16} className="text-green-600" />
          <span>PCI Compliant</span>
        </div>
      </div>
    </div>
  );
};

export default SquarePayment;
