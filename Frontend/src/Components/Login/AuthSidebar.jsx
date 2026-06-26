import React from "react";
import { motion } from "motion/react";
import { BookOpen, Sparkles, Coins } from "lucide-react";

export default function AuthSidebar() {
  return (
    <motion.div
      className="hidden lg:flex auth-sidebar"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
    >
      <div className="auth-sidebar-inner">
        <h2 className="serif-heading auth-sidebar-title">
          Optimize Your<br />
          Preparation
        </h2>

        <div className="auth-sidebar-divider" style={{ marginBottom: 40 }} />

        {/* Timeline Feed */}
        <div className="auth-sidebar-timeline">
          {/* Step 1 */}
          <div className="auth-sidebar-step">
            <div className="auth-sidebar-step-col">
              <div className="auth-sidebar-icon-box">
                <BookOpen size={16} />
              </div>
              <div className="auth-sidebar-connector" />
            </div>
            <div>
              <h4 className="serif-heading auth-sidebar-step-title">Previous Year Papers</h4>
              <p className="auth-sidebar-step-desc">
                A comprehensive library of archived examination papers organized by course and session.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="auth-sidebar-step">
            <div className="auth-sidebar-step-col">
              <div className="auth-sidebar-icon-box">
                <Sparkles size={16} />
              </div>
              <div className="auth-sidebar-connector" />
            </div>
            <div>
              <h4 className="serif-heading auth-sidebar-step-title">AI-Powered Solving</h4>
              <p className="auth-sidebar-step-desc">
                Automated question parsing, course tagging, and detailed step-by-step conceptual solving.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="auth-sidebar-step">
            <div className="auth-sidebar-step-col">
              <div className="auth-sidebar-icon-box">
                <Coins size={16} />
              </div>
            </div>
            <div>
              <h4 className="serif-heading auth-sidebar-step-title">Pay-As-You-Go Credits</h4>
              <p className="auth-sidebar-step-desc">
                Unlock step-by-step solutions forever with credits. No subscriptions, just simple one-time top-ups when you need them.
              </p>
            </div>
          </div>
        </div>

        <div className="auth-sidebar-divider" style={{ marginTop: 40, marginBottom: 40 }} />

        {/* Metrics Grid */}
        <div className="auth-sidebar-metrics">
          <div>
            <div className="serif-heading auth-sidebar-metric-value">100+</div>
            <div className="auth-sidebar-metric-label">DOCUMENTS</div>
          </div>
          <div>
            <div className="serif-heading auth-sidebar-metric-value">1</div>
            <div className="auth-sidebar-metric-label">ARCHIVE</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
