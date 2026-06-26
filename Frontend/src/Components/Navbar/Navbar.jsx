import { useState, useContext, useEffect } from "react";
import AuthContext from "../../Context/AuthContext";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import {
  Menu, X, Copy, LogOut, User,
  Sun, Moon
} from "lucide-react";
import { useToast } from "../Toast/ToastContext";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [userName, setUserName] = useState("Scholar Account");
  const [userEmail, setUserEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "light";
  });
  const auth = useContext(AuthContext);
  const location = useLocation();
  const toast = useToast();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handleScroll, { passive: true });

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleMediaChange = (e) => {
      setIsMobile(e.matches);
      if (!e.matches) {
        setIsOpen(false);
      }
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleMediaChange);
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!auth.token) {
      setUserName("Scholar Account");
      setUserEmail("");
      return;
    }
    if (auth.name) setUserName(auth.name);
    if (auth.email) setUserEmail(auth.email);
  }, [auth.token, auth.name, auth.email]);

  const handleCopy = async () => {
    if (!auth.refCode) return;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(auth.refCode);
        setCopied(true);
        toast.success("Referral code copied!");
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (err) {
        console.error("Clipboard API failed, trying fallback...", err);
      }
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = auth.refCode;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      textArea.remove();

      if (successful) {
        setCopied(true);
        toast.success("Referral code copied!");
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error("Fallback copy command was unsuccessful");
      }
    } catch (err) {
      console.error("Copy fallback failed", err);
      toast.error("Failed to copy referral code");
    }
  };

  const navLinks = auth.token
    ? [
        { to: "/", label: "DASHBOARD" },
        { to: "/papers", label: "PAPERS" },
        { to: "/upload", label: "UPLOAD" },
        { to: "/subscription", label: "PRICING" },
        { to: "/aboutUs", label: "ABOUT" },
      ]
    : [
        { to: "/", label: "HOME" },
        { to: "/subscription", label: "PRICING" },
        { to: "/aboutUs", label: "ABOUT" },
      ];

  const isActive = (path) => location.pathname === path;

  return (
    <nav className={`top-app-bar ${scrolled ? "scrolled" : ""}`}>
      <div className="navbar-inner">
        {/* Logo */}
        <Link
          to="/"
          className="navbar-logo-link"
        >
          <span className="italic navbar-logo-light">
            Exam
          </span>
          <span className="navbar-logo-bold">
            Repository
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex navbar-desktop-links">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`nav-link${isActive(to) ? " active" : ""}`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right Actions */}
        <div className="navbar-right-actions">
          {/* Theme Toggle */}
          <button
            onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
            className="icon-btn"
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          {auth.token ? (
            <div className="navbar-profile-wrapper">
              {/* Profile Icon (Dropdown Trigger) */}
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="icon-btn"
                title="Profile Menu"
              >
                <User size={20} />
              </button>

              {/* Desktop Dropdown Menu */}
              {!isMobile && isOpen && (
                <div className="animate-slide-in-down navbar-dropdown">
                  {/* Profile Overview */}
                  <div>
                    <div className="navbar-dropdown-profile-row">
                      <div className="navbar-profile-avatar">
                        <User size={18} className="icon-on-primary" />
                      </div>
                      <div>
                        <div className="navbar-profile-name">
                          {userName}
                        </div>
                        <div className="navbar-profile-email">
                          {userEmail || "Active Student"}
                        </div>
                      </div>
                    </div>

                    <div className="navbar-dropdown-divider" />

                    {/* Credits & Referral */}
                    <div className="navbar-dropdown-stats">
                      <div className="navbar-dropdown-stat-row">
                        <span className="navbar-dropdown-stat-label">Credits</span>
                        <span className="navbar-dropdown-stat-val">
                          {auth.credit ?? 0}
                        </span>
                      </div>

                      {auth.refCode && (
                        <div className="navbar-dropdown-stat-row">
                          <span className="navbar-dropdown-stat-label">Referral Code</span>
                          <button
                            onClick={handleCopy}
                            className="copy-badge-btn"
                            style={{
                              background: copied ? "var(--color-success-container)" : "transparent",
                              border: `1px solid ${copied ? "var(--color-success)" : "var(--md-outline)"}`,
                              color: copied ? "var(--color-success)" : "var(--md-primary)",
                            }}
                          >
                            <span>{auth.refCode}</span>
                            <Copy size={10} />
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        auth.logout();
                        setIsOpen(false);
                      }}
                      className="btn-logout"
                    >
                      <LogOut size={14} />
                      <span>LOGOUT</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Mobile Toggle (Hamburger) */}
          {isMobile && (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="icon-btn"
              aria-label="Toggle menu"
              title="Menu"
            >
              {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
        </div>
      </div>

      {/* Backdrop to auto-close dropdown/drawer on click outside */}
      {isOpen && createPortal(
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            top: "var(--navbar-height)",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 49,
            background: isMobile ? "var(--md-scrim)" : "transparent",
          }}
        />,
        document.body
      )}

      {/* Mobile Drawer Menu */}
      {isMobile && isOpen && (
        <div className="animate-slide-in-down navbar-mobile-drawer">
          <div className="vertical-stack-6">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setIsOpen(false)}
                className="navbar-mobile-link"
                style={{
                  color: isActive(to) ? "var(--md-primary)" : "var(--md-on-surface-variant)",
                  background: isActive(to) ? "var(--md-surface-container)" : "transparent",
                }}
              >
                {label}
              </Link>
            ))}

            {auth.token && (
              <>
                <div className="divider-y12" />
                
                {/* Mobile Credits / Ref Code */}
                <div className="navbar-mobile-stats">
                  <div className="navbar-dropdown-stat-row">
                    <span className="navbar-dropdown-stat-label">Credits</span>
                    <span className="navbar-dropdown-stat-val">{auth.credit ?? 0}</span>
                  </div>
                  {auth.refCode && (
                    <div className="navbar-dropdown-stat-row">
                      <span className="navbar-dropdown-stat-label">Referral Code</span>
                      <button
                        onClick={handleCopy}
                        className="copy-badge-btn"
                        style={{
                          background: copied ? "var(--color-success-container)" : "transparent",
                          border: `1px solid ${copied ? "var(--color-success)" : "var(--md-outline)"}`,
                          color: copied ? "var(--color-success)" : "var(--md-primary)",
                        }}
                      >
                        <span>{auth.refCode}</span>
                        <Copy size={10} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="divider-y4-12" />

                <button
                  onClick={() => {
                    auth.logout();
                    setIsOpen(false);
                  }}
                  className="navbar-mobile-logout-btn"
                >
                  <LogOut size={18} /> LOGOUT
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};


