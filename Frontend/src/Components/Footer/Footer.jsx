import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer-container">
      <div className="footer-inner">
        {/* Brand Logo & Copyright */}
        <div>
          <Link
            to="/"
            className="footer-logo-link"
          >
            <span className="italic footer-logo-text-light">
              Exam
            </span>
            <span className="footer-logo-text-bold">
              Repository
            </span>
          </Link>
          <p className="footer-copyright">
            &copy; {new Date().getFullYear()} Exam Repository. Curated past exam papers with AI generated solutions.
          </p>
        </div>

        {/* Footer Navigation */}
        <div className="footer-nav">
          {[
            { to: "#", label: "Privacy Policy" },
            { to: "#", label: "Terms of Service" },
          ].map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className="footer-link"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
};
