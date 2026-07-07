import React, { useContext, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { GraduationCap, ArrowRight } from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import AuthSidebar from "../Login/AuthSidebar";
import { useToast } from "../Toast/ToastContext";
import { signup as signupApi, getCourses, sendOtp } from "../../services/api";
import Input from "../UI/Input";
import Button from "../UI/Button";

export default function Signup() {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "", email: "", password: "", referral_code: "",
  });
  const [selectedCourses, setSelectedCourses] = useState([""]);
  const [coursesData, setCoursesData] = useState([]);

  const [step, setStep] = useState("form");
  const [otpValues, setOtpValues] = useState(Array(6).fill(""));
  const [otpLoading, setOtpLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function handleSendOtp(e) {
    if (e) e.preventDefault();
    if (!formData.email) {
      toast.error("Please enter your email address.");
      return;
    }
    setOtpLoading(true);
    try {
      await sendOtp(formData.email);
      toast.success("Verification code sent to your email!");
      setStep("otp");
      setCountdown(30);
      setOtpValues(Array(6).fill(""));
    } catch (error) {
      toast.error(error.message || "Failed to send OTP.");
    } finally {
      setOtpLoading(false);
    }
  }

  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      const pastedData = value.replace(/[^0-9]/g, "").slice(0, 6).split("");
      const newOtp = [...otpValues];
      for (let i = 0; i < pastedData.length; i++) {
        if (index + i < 6) newOtp[index + i] = pastedData[i];
      }
      setOtpValues(newOtp);
      const nextIndex = Math.min(index + pastedData.length, 5);
      const nextInput = document.getElementById(`otp-input-${nextIndex}`);
      if (nextInput) nextInput.focus();
      return;
    }

    const newOtp = [...otpValues];
    newOtp[index] = value;
    setOtpValues(newOtp);

    if (value !== "" && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  useEffect(() => {
    getCourses()
      .then((data) => setCoursesData(data))
      .catch(() => { toast.error("Failed to load courses."); });
  }, [toast]);

  function handleChange(e) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const handleCourseChange = (index, e) => {
    const courseId = e.target.value;
    const newCourses = [...selectedCourses];
    newCourses[index] = courseId;
    setSelectedCourses(newCourses);
    if (courseId && index === newCourses.length - 1 && newCourses.length < 5) {
      setSelectedCourses((prev) => [...prev, ""]);
    }
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await signupApi({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        referral_code: formData.referral_code || null,
        enrolled_courses: [...new Set(selectedCourses.filter(Boolean))],
        otp_code: otpValues.join(""),
      });
      auth.login(data.userId, data.token, data.credit, data.ref_code, null, data.name, data.email);
      toast.success("Welcome to the archive!");
      navigate("/");
    } catch (error) {
      toast.error(error.message || "Failed to create account.");
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
            Join the <span style={{ fontWeight: 700 }}>Archive</span>
          </h1>
          <p className="text-body-medium auth-subtitle">
            Create an account to browse exam papers and unlock solutions.
          </p>

          {/* Form */}
          {step === "form" ? (
            <form onSubmit={handleSendOtp} className="vertical-stack-24">
              {/* Name */}
              <Input
                id="signup-name" name="name" type="text"
                label="FULL NAME"
                value={formData.name} onChange={handleChange}
                placeholder="Jane Doe" required
              />

              {/* Email */}
              <Input
                id="signup-email" name="email" type="email"
                label="EMAIL ADDRESS"
                value={formData.email} onChange={handleChange}
                placeholder="jane.doe@university.edu" required
              />

              {/* Password */}
              <Input
                id="signup-password" name="password" type="password"
                label="PASSWORD"
                value={formData.password} onChange={handleChange}
                placeholder="••••••••" required minLength={6}
              />

              {/* Courses select */}
              <div>
                <label className="input-label" style={{ display: "block", marginBottom: 8 }}>
                  ENROLLED COURSES
                </label>
                {selectedCourses.map((courseId, index) => (
                  <select
                    key={index}
                    id={`signup-course-${index}`}
                    value={courseId}
                    onChange={(e) => handleCourseChange(index, e)}
                    className="input-field signup-course-select"
                    style={{
                      color: courseId ? "var(--md-on-background)" : "var(--md-on-surface-variant)",
                    }}
                  >
                    <option value="">Select Course</option>
                    {coursesData.map((c) => {
                      const isSelectedElsewhere = selectedCourses.includes(c._id) && c._id !== courseId;
                      return (
                        <option key={c._id} value={c._id} disabled={isSelectedElsewhere}>
                          {c.code} — {c.name}
                        </option>
                      );
                    })}
                  </select>
                ))}
              </div>

              {/* Referral code */}
              {!refOpen ? (
                <button
                  type="button"
                  onClick={() => setRefOpen(true)}
                  className="add-referral-btn"
                >
                  + ADD REFERRAL CODE
                </button>
              ) : (
                <Input
                  id="signup-referral" name="referral_code" type="text"
                  label="REFERRAL CODE (OPTIONAL)"
                  value={formData.referral_code} onChange={handleChange}
                  placeholder="Referral code"
                />
              )}

              {/* Submit */}
              <Button type="submit" loading={otpLoading}>
                <span>Create Account</span>
                <ArrowRight size={14} />
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="vertical-stack-24">
              <div>
                <label className="input-label" style={{ display: "block", marginBottom: 8 }}>
                  VERIFICATION CODE
                </label>
                <p className="text-body-medium" style={{ margin: 0 }}>
                  Enter the 6-digit code sent to <strong>{formData.email}</strong>
                </p>
              </div>

              <div>
                <div style={{ display: "flex", gap: "10px" }}>
                  {otpValues.map((val, index) => (
                    <input
                      key={index}
                      id={`otp-input-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={val}
                      onChange={(e) => handleOtpChange(index, e.target.value.replace(/[^0-9]/g, ""))}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="input-field"
                      style={{
                        width: "48px",
                        height: "52px",
                        textAlign: "center",
                        fontSize: "1.25rem",
                        fontWeight: 600,
                        padding: 0,
                        flex: "0 0 48px",
                      }}
                      autoFocus={index === 0}
                      required
                    />
                  ))}
                </div>
                <p className="text-body-small" style={{ marginTop: 16, marginBottom: 0 }}>
                  {countdown > 0 ? (
                    <>Resend in 00:{String(countdown).padStart(2, "0")}</>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={otpLoading}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "var(--md-primary)",
                        fontWeight: 600,
                        fontSize: "inherit",
                        cursor: otpLoading ? "wait" : "pointer",
                        textDecoration: "none",
                        opacity: otpLoading ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                      onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                    >
                      {otpLoading ? "Sending..." : "Resend Code"}
                    </button>
                  )}
                </p>
              </div>

              <Button type="submit" loading={loading} disabled={otpValues.join("").length !== 6}>
                <span>Verify & Create Account</span>
                <ArrowRight size={14} />
              </Button>
            </form>
          )}

          {/* Footnote */}
          <p className="auth-footnote">
            Already have access?{" "}
            <Link to="/login" className="auth-footnote-link">
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>

      {/* ── Right Info Panel ── */}
      <AuthSidebar />
    </div>
  );
}
