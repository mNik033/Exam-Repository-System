import React, { useContext, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { GraduationCap, ArrowRight } from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import { useToast } from "../Toast/ToastContext";
import { login as loginApi } from "../../services/api";
import AuthSidebar from "./AuthSidebar";
import Input from "../UI/Input";
import Button from "../UI/Button";

export default function Login() {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const toast = useToast();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await loginApi({
        email: formData.email,
        password: formData.password,
      });
      auth.login(data.userId, data.token, data.credit, data.ref_code, null, data.name, data.email);
      toast.success("Welcome back!");
      navigate("/");
    } catch (error) {
      toast.error(error.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      {/* ── Left Form Panel ── */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="auth-form-panel"
      >
        <div className="auth-form-container">
          {/* Header */}
          <GraduationCap size={32} className="auth-logo" />
          <h1 className="serif-heading auth-title">
            Access the <span style={{ fontWeight: 700 }}>Archive</span>
          </h1>
          <p className="text-body-medium auth-subtitle">
            Sign in to access your account and study materials.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="vertical-stack-24">
            {/* Email */}
            <Input
              id="login-email"
              name="email"
              type="email"
              label="EMAIL ADDRESS"
              value={formData.email}
              placeholder="jane.doe@university.edu"
              onChange={handleChange}
              required
            />

            {/* Password */}
            <Input
              id="login-password"
              name="password"
              type="password"
              label="PASSWORD"
              labelRight={
                <Link
                  to="#"
                  className="auth-forgot-link"
                  onClick={() => toast.info("Password recovery is handled by your administrator.")}
                >
                  FORGOT?
                </Link>
              }
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />

            {/* Submit */}
            <Button type="submit" loading={loading}>
              <span>Sign In</span>
              <ArrowRight size={14} />
            </Button>
          </form>

          {/* Footnote */}
          <p className="auth-footnote">
            Don&apos;t have access?{" "}
            <Link to="/signup" className="auth-footnote-link">
              Sign Up
            </Link>
          </p>
        </div>
      </motion.div>

      {/* ── Right Info Panel ── */}
      <AuthSidebar />
    </div>
  );
}
