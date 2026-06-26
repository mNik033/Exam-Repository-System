import React, { useContext, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { GraduationCap, ArrowRight } from "lucide-react";
import AuthContext from "../../Context/AuthContext";
import AuthSidebar from "../Login/AuthSidebar";
import { useToast } from "../Toast/ToastContext";
import { signup as signupApi, getCourses } from "../../services/api";
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
          <form onSubmit={handleSubmit} className="vertical-stack-24">
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
            <Button type="submit" loading={loading}>
              <span>Create Account</span>
              <ArrowRight size={14} />
            </Button>
          </form>

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
