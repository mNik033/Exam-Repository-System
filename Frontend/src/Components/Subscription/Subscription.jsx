import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Check, ShieldCheck, Wallet, ArrowRight } from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { ConfigContext } from "../../Context/ConfigContext";
import { getPlans, makePayment, validatePayment } from "../../services/api";
import { useToast } from "../Toast/ToastContext";
import FullPageSpinner from "../UI/FullPageSpinner";
import PageHeader from "../UI/PageHeader";

const PLAN_THEMES = [
  {
    name: "Starter Pack",
    desc: "Perfect for quick revision sessions",
    popular: false,
    accent: "var(--md-outline)",
  },
  {
    name: "Standard Pack",
    desc: "Great value for mid-term exams",
    popular: false,
    accent: "var(--md-secondary)",
  },
  {
    name: "Elite Scholar Pack",
    desc: "Unrestricted access for peak prep",
    popular: true,
    accent: "var(--md-primary)",
  },
];

export default function Subscription() {
  const auth = useContext(AuthContext);
  const { unlockCost } = useContext(ConfigContext);
  const navigate = useNavigate();
  const toast = useToast();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingPlanId, setPayingPlanId] = useState(null);

  useEffect(() => {
    getPlans()
      .then((data) => setPlans((data || []).sort((a, b) => a.amount - b.amount)))
      .catch(() => toast.error("Failed to fetch plans"))
      .finally(() => setLoading(false));
  }, [toast]);

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      if (document.getElementById("razorpay-checkout-script")) return resolve(true);
      
      const script = document.createElement("script");
      script.id = "razorpay-checkout-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handlePurchase = async (plan) => {
    toast.info("Payments are temporarily disabled while we transition to live mode.");
    return;

    if (!auth.isLoggedIn || !auth.token) {
      toast.warning("Please sign in to purchase credits.");
      navigate("/login");
      return;
    }
    setPayingPlanId(plan.amount);
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      toast.error("Razorpay SDK failed to load. Are you offline?");
      setPayingPlanId(null);
      return;
    }
    try {
      const receiptId = `receipt_${Date.now()}_${auth.userId?.substring(0, 5)}`;
      const order = await makePayment({ amount: plan.amount, currency: "INR", receipt: receiptId }, auth.token);
      const rzpKey = import.meta.env.VITE_RAZORPAY_TEST;
      const options = {
        key: rzpKey,
        amount: plan.amount,
        currency: "INR",
        name: "Exam Repository",
        description: `Purchase ${plan.credits} Credits`,
        order_id: order.id,
        theme: { color: getComputedStyle(document.documentElement).getPropertyValue('--md-primary').trim() },
        handler: async (response) => {
          try {
            toast.info("Verifying transaction…");
            const validateRes = await validatePayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }, auth.token);
            auth.updateCredit(validateRes.credit);
            toast.success(`Successfully added ${plan.credits} credits!`);
            navigate("/");
          } catch (error) {
            toast.error(error.message || "Payment verification failed");
          }
        },
        prefill: { name: auth.name || "", email: auth.email || "" },
        modal: { ondismiss: () => setPayingPlanId(null) },
      };
      const rzp1 = new window.Razorpay(options);
      rzp1.on("payment.failed", (response) => {
        toast.error(`Payment failed: ${response.error.description}`);
        setPayingPlanId(null);
      });
      rzp1.open();
    } catch (error) {
      toast.error(error.message || "Failed to initiate payment");
      setPayingPlanId(null);
    }
  };

  if (loading) {
    return <FullPageSpinner />;
  }

  return (
    <div className="page-wrapper with-navbar dot-pattern-bg">
      <div className="page-content">
        {/* Header */}
        <PageHeader
          label="Pricing Packs"
          title={<>Power Your Learning with <span className="italic-serif">Credits</span></>}
          description="Use credits to unlock step-by-step solutions forever. No subscriptions, just one-time top-ups when you need them."
          style={{ marginBottom: auth.isLoggedIn ? 24 : 48 }}
        />

        {auth.isLoggedIn && (
          <div className="sub-balance-row">
            <div className="sub-balance-badge">
              <Wallet size={14} className="icon-primary" />
              <span className="text-body-medium sub-balance-text">
                Balance: {auth.credit ?? 0} Credits
              </span>
            </div>
          </div>
        )}

        {/* Plans Grid */}
        <div className="sub-plans-grid">
          {plans.map((plan, index) => {
            const theme = PLAN_THEMES[index] || {
              name: `Tier ${index + 1}`, desc: "Add credits", popular: false,
              accent: "var(--md-primary)",
            };
            const priceInRupees = plan.amount / 100;

            const totalQuestions = unlockCost ? Math.floor(plan.credits / unlockCost) : "...";
            const standardPapers = unlockCost ? Math.round(totalQuestions / 7) : "...";
            const quizPapers = unlockCost ? Math.floor(totalQuestions / 10) : "...";

            return (
              <motion.div
                key={plan.amount}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="card-elevated sub-plan-card"
                style={{
                  border: theme.popular ? `2px solid ${theme.accent}` : "1px solid var(--md-outline-variant)",
                }}
              >
                {/* Colored Top Strip */}
                <div className="sub-plan-top-strip" style={{ background: theme.accent }} />

                {theme.popular && (
                  <div className="sub-popular-tag-container">
                    <span
                      className="sub-popular-tag"
                      style={{
                        background: theme.accent,
                        border: `1px solid ${theme.accent}`,
                      }}
                    >
                      ★ Best Value
                    </span>
                  </div>
                )}

                <div className="sub-plan-body">
                  <h3 className="serif-heading sub-plan-title">
                    {theme.name}
                  </h3>
                  <p className="text-body-small sub-plan-desc">
                    {theme.desc}
                  </p>

                  <div className="sub-plan-price-wrap">
                    <span className="serif-heading sub-plan-price-val">
                      ₹{priceInRupees}
                    </span>
                    <span className="text-body-medium sub-plan-price-suffix">
                      one-time
                    </span>
                  </div>

                  <div className="sub-plan-divider" />

                  <ul className="sub-plan-features">
                    <li className="sub-plan-feature-item">
                      <div className="sub-feature-icon-wrapper">
                        <Check size={10} className="icon-success" />
                      </div>
                      <span className="text-body-medium sub-feature-text">
                        {plan.credits} Credits added to account
                      </span>
                    </li>
                    <li className="sub-plan-feature-item">
                      <div className="sub-feature-icon-wrapper">
                        <Check size={10} className="icon-success" />
                      </div>
                      <span className="text-body-medium sub-feature-text">
                        Unlocks ~{totalQuestions} questions
                      </span>
                    </li>
                    <li className="sub-plan-feature-item">
                      <div className="sub-feature-icon-wrapper">
                        <Check size={10} className="icon-success" />
                      </div>
                      <span className="text-body-medium sub-feature-text">
                        Unlocks ~{standardPapers} papers*
                      </span>
                    </li>
                    <li className="sub-plan-feature-item">
                      <div className="sub-feature-icon-wrapper">
                        <Check size={10} className="icon-success" />
                      </div>
                      <span className="text-body-medium sub-feature-text">
                        Unlocks ~{quizPapers} quiz papers*
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="sub-plan-footer">
                  <button
                    disabled={payingPlanId !== null}
                    className={`${theme.popular ? "btn-filled" : "btn-outlined"} sub-plan-action-btn`}
                    onClick={() => handlePurchase(plan, index)}
                  >
                    {payingPlanId === plan.amount ? (
                      <>
                        <div className="spinner" style={{ width: 14, height: 14, borderTopColor: theme.popular ? "white" : "var(--md-primary)" }} />
                        <span>Securing Checkout…</span>
                      </>
                    ) : (
                      <>Select Plan <ArrowRight size={14} /></>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="sub-footnote">
          *Estimates based on an average of 6–7 questions per paper and 10 questions per quiz paper ({unlockCost || "..."} credits per question).
        </div>

        {/* Trust Badge */}
        <div className="card-elevated sub-trust-card">
          <div className="sub-trust-icon-box">
            <ShieldCheck size={22} className="icon-primary" />
          </div>
          <p className="text-body-medium sub-trust-text">
            Payments are handled securely via Razorpay with industry-leading encryption. We do not store card details or payment credentials on our servers. For support or invoice questions, please contact our team.
          </p>
        </div>
      </div>
    </div>
  );
}
