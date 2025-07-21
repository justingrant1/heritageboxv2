
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { sendEmailToHeritageBox } from '@/utils/emailUtils';

const EmailPopup = () => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Check if the user has seen the popup before
    const hasSeenPopup = localStorage.getItem('hasSeenEmailPopup');
    
    if (!hasSeenPopup) {
      // Wait a moment before showing the popup
      const timer = setTimeout(() => {
        setOpen(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Send email to info@heritagebox.com using our utility function
      await sendEmailToHeritageBox({ 
        email, 
        referrer: document.referrer,
        pageUrl: window.location.href
      }, 'welcome-popup');
      
      // Mark that the user has seen the popup
      localStorage.setItem('hasSeenEmailPopup', 'true');
      
      // Show success message
      toast.success("Thank you! Your 15% discount code has been sent to your email.");
      
      // Close the dialog
      setOpen(false);
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(`Problem sending your request: ${error instanceof Error ? error.message : 'Please try again'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-[9999998]"
          onClick={() => {
            localStorage.setItem('hasSeenEmailPopup', 'true');
            setOpen(false);
          }}
        />
      )}
      
      {/* Popup Content */}
      {open && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto relative">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('hasSeenEmailPopup', 'true');
                setOpen(false);
              }}
              className="absolute right-3 top-3 rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 z-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close popup"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-6 pr-12">
              <h2 className="text-xl sm:text-2xl font-serif text-primary leading-tight mb-2">
                Save 15% on Your First Order
              </h2>
              <p className="text-base sm:text-lg text-gray-600 leading-relaxed mb-6">
                Sign up for updates and receive a 15% discount code for your first order.
              </p>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="popup-email">Email</Label>
                  <Input 
                    id="popup-email"
                    type="email" 
                    placeholder="Enter your email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full"
                    disabled={isSubmitting}
                  />
                </div>
                
                <div className="flex flex-col space-y-2">
                  <Button 
                    type="submit" 
                    className="w-full bg-secondary text-primary hover:bg-secondary-light"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Submitting..." : "Get My 15% Off"}
                  </Button>
                  <button 
                    type="button"
                    onClick={() => {
                      localStorage.setItem('hasSeenEmailPopup', 'true');
                      setOpen(false);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 mt-2"
                    disabled={isSubmitting}
                  >
                    No thanks, I'll pay full price
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EmailPopup;
