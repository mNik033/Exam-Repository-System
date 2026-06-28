/**
 * Centralized API service layer for the Exam Repository frontend.
 * All backend communication goes through here — no hardcoded URLs in components.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Register a callback to be invoked when any API call returns 401.
 * Used by the auth layer to auto-logout on expired tokens.
 */
let _onUnauthorized = null;
export function setOnUnauthorized(callback) {
  _onUnauthorized = callback;
}

/**
 * Core fetch wrapper with auth header injection and error handling.
 */
async function request(endpoint, options = {}) {
  const { token, ...fetchOptions } = options;

  const headers = { ...fetchOptions.headers };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, { ...fetchOptions, headers });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { detail: response.statusText };
    }

    // Intercept size and rate limits globally
    if (response.status === 429) {
      errorData.detail = "You are doing that too fast. Please wait a moment before trying again.";
    } else if (response.status === 413) {
      errorData.detail = `File size is too large. Please upload a file smaller than 10MB.`;
    }

    // Auto-logout on expired/invalid token
    if (response.status === 401 && token && _onUnauthorized) {
      _onUnauthorized();
    }

    throw new ApiError(
      errorData.detail || "An unexpected error occurred",
      response.status,
      errorData
    );
  }

  // Handle 204 No Content
  if (response.status === 204) return null;

  return response.json();
}

// ===== Auth =====

export async function signup({ name, email, password, referral_code, enrolled_courses }) {
  return request("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, referral_code, enrolled_courses }),
  });
}

export async function login({ email, password }) {
  return request("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function getProfile(token) {
  return request("/api/profile", { token });
}

// ===== Notifications =====

export async function getNotifications(token) {
  return request("/api/notifications", { token });
}

// ===== Courses =====

export async function getCourses() {
  return request("/api/courses");
}

// ===== Papers =====

export async function getPapers() {
  return request("/api/getPapers");
}

export async function getPaperDetails(paperId, token) {
  return request(`/api/papers/${encodeURIComponent(paperId)}`, { token });
}

export async function getDashboard(token) {
  return request("/api/dashboard", { token });
}

export async function updateBrowsedCourse(courseId, token) {
  return request("/api/browsedCourse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course_id: courseId }),
    token,
  });
}

// ===== Questions =====

export async function unlockAnswer(questionId, token) {
  return request(`/api/unlockAnswer?question_id=${encodeURIComponent(questionId)}`, {
    method: "POST",
    token,
  });
}

export async function getUnlockedAnswers(paperId, token) {
  return request(`/api/getUnlockedAnswers?paper_id=${encodeURIComponent(paperId)}`, {
    token,
  });
}

export async function getQuestionsIndex() {
  return request("/api/questions/index");
}

// ===== Payments =====

export async function getPlans() {
  return request("/api/plans");
}

export async function makePayment({ amount, currency, receipt }, token) {
  return request("/api/makePayment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency, receipt }),
    token,
  });
}

export async function validatePayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }, token) {
  return request("/api/validatePayment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
    token,
  });
}

// ===== Upload =====

export async function uploadPaper(file, token) {
  const formData = new FormData();
  formData.append("file", file);

  return request("/api/uploadPaper", {
    method: "POST",
    body: formData,
    token,
  });
}

export async function getMyPapers(token) {
  return request("/api/myPapers", { token });
}

// ===== Health =====

export async function healthCheck() {
  return request("/api/health");
}

export async function getConfig() {
  return request("/api/config");
}

export { API_BASE, ApiError };
