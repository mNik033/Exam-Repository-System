import React, { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useToast } from "../Toast/ToastContext";
import FullPageSpinner from "../UI/FullPageSpinner";
import {
  Bell, FileText, ChevronRight, Clock, CheckCircle,
  AlertCircle, Gift, BookOpen, Wallet, ArrowRight,
  Upload, Sparkles, Info,
} from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { getDashboard, getNotifications, getProfile } from "../../services/api";

const NOTIF_STYLES = {
  success: {
    icon: CheckCircle,
    bg: "var(--color-success-container)",
    color: "var(--color-success)",
  },
  error: {
    icon: AlertCircle,
    bg: "var(--md-error-container)",
    color: "var(--md-error)",
  },
  info: {
    icon: Info,
    bg: "var(--md-surface-container)",
    color: "var(--md-primary)",
  },
  referral: {
    icon: Gift,
    bg: "var(--md-secondary-container)",
    color: "var(--md-secondary)",
  },
  default: {
    icon: Bell,
    bg: "var(--md-surface-container)",
    color: "var(--md-primary)",
  },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { token, credit, updateCredit, name } = useContext(AuthContext);
  const navigate = useNavigate();
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashData, notifData, profileData] = await Promise.all([
          getDashboard(token),
          getNotifications(token),
          getProfile(token),
        ]);
        setRecommendations(dashData || []);
        setNotifications(notifData || []);
        updateCredit(profileData.credit);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, updateCredit, toast]);

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return "Just now";
    let normalized = dateStr;
    if (!dateStr.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(dateStr)) {
      normalized = dateStr + "Z";
    }
    const diffMin = Math.floor((new Date() - new Date(normalized)) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  if (loading) {
    return <FullPageSpinner />;
  }

  return (
    <div className="page-wrapper with-navbar dot-pattern-bg">

      {/* Welcome Banner */}
      <section className="dashboard-banner-section">
        <div className="container-1200">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="dashboard-label-row">
              <div className="accent-line" />
              <span className="serif-heading accent-label">
                {getGreeting()}, {name.split(' ')[0]} 👋
              </span>
            </div>

            <h1 className="text-display-small serif-heading dashboard-banner-title">
              Ready to <span className="italic-serif">ace your exams?</span>
            </h1>

            {/* Quick Action Cards */}
            <div className="flex-wrap-row-gap-20">
              {/* Card 1 */}
              <button
                onClick={() => navigate("/papers")}
                className="card-elevated quick-action-btn"
              >
                <div className="quick-action-icon-primary">
                  <BookOpen size={18} className="icon-on-primary" />
                </div>
                <div>
                  <div className="serif-heading dashboard-card-title">Browse Papers</div>
                  <div className="text-body-small">Find past exams</div>
                </div>
              </button>

              {/* Card 2 */}
              <button
                onClick={() => navigate("/upload")}
                className="card-elevated quick-action-btn"
              >
                <div className="quick-action-icon-secondary">
                  <Upload size={18} className="icon-on-secondary" />
                </div>
                <div>
                  <div className="serif-heading dashboard-card-title">Upload Paper</div>
                  <div className="text-body-small">Earn credits</div>
                </div>
              </button>

              {/* Card 3 */}
              <div className="card-elevated quick-action-badge">
                <div className="quick-action-icon-outline">
                  <Wallet size={18} className="icon-primary" />
                </div>
                <div>
                  <div className="text-label-medium credits-label">Available Credits</div>
                  <div className="serif-heading credits-value">{credit ?? 0}</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Content */}
      <section className="page-content">
        <div className="dashboard-grid-layout lg:grid-cols-[1fr_380px]">
          {/* Recommended Papers */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="dashboard-section-header">
              <div className="dashboard-section-title-wrap">
                <Sparkles size={20} className="icon-secondary" />
                <h2 className="text-headline-medium serif-heading dashboard-section-title">
                  Recommended for You
                </h2>
              </div>
              <button
                className="btn-outlined dashboard-header-btn"
                onClick={() => navigate("/papers")}
              >
                View All <ChevronRight size={14} />
              </button>
            </div>

            {recommendations.length === 0 ? (
              <div className="card-elevated dashboard-empty-card">
                <FileText size={44} className="dashboard-empty-icon" />
                <p className="text-body-large dashboard-empty-text">
                  No recommendations yet. Start browsing to get personalized suggestions!
                </p>
                <button className="btn-filled" onClick={() => navigate("/papers")}>
                  Browse Papers <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div className="recommendations-grid stagger-children">
                {recommendations.map((paper) => (
                  <div
                    key={paper._id}
                    className="card-elevated dashboard-item-card"
                    onClick={() => navigate(`/paper/${paper._id}`)}
                  >
                    <h3 className="serif-heading recommended-paper-title">
                      {paper.title || "Untitled Paper"}
                    </h3>
                    <div className="card-tags-row">
                      <span className="badge badge-primary">{paper.session} {paper.session_year}</span>
                      <span className="badge">{paper.exam_type}</span>
                    </div>
                    <div className="text-body-small card-date-row">
                      <Clock size={14} />
                      {new Date(paper.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Notifications */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="dashboard-section-header">
              <div className="dashboard-section-title-wrap">
                <Bell size={20} className="icon-primary" />
                <h2 className="text-headline-medium serif-heading dashboard-section-title">
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <span className="badge badge-secondary unread-badge">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>

            <div className="card-outlined hide-scrollbar notifications-list-container">
              {notifications.length === 0 ? (
                <div className="notifications-empty-container">
                  <Bell size={36} className="notifications-empty-icon" />
                  <p className="text-body-medium">
                    No notifications yet
                  </p>
                </div>
              ) : (
                <div>
                  {notifications.map((n, idx) => {
                    const style = NOTIF_STYLES[n.type] || NOTIF_STYLES.default;
                    const Icon = style.icon;

                    return (
                      <div
                        key={idx}
                        onClick={() => n.paper_id ? navigate(`/paper/${n.paper_id}`) : navigate("/upload")}
                        className="list-item-hoverable notification-item"
                      >
                        <div
                          className="notification-icon-wrapper"
                          style={{
                            background: style.bg,
                            border: `1px solid ${style.color}`,
                          }}
                        >
                          <Icon size={16} style={{ color: style.color }} />
                        </div>
                        <div className="notification-content-wrapper">
                          <p className="text-body-medium notification-message">
                            {n.message}
                          </p>
                          <span className="text-body-small notification-time">
                            {formatTimeAgo(n.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};
