import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AuthContext from "./Context/AuthContext";
import useAuth from "./Hooks/AuthHook";
import { setOnUnauthorized } from "./services/api";

// Providers
import { ToastProvider } from "./Components/Toast/Toast";
import { ConfirmProvider } from "./Components/ConfirmModal/ConfirmModal";
import { ConfigProvider } from "./Context/ConfigContext";

// Components
import Navbar from "./Components/Navbar/Navbar";
import Signup from "./Components/Signup/Signup";
import Login from "./Components/Login/Login";
import Footer from "./Components/Footer/Footer";
import Hero from "./Components/Hero/Hero";
import Upload from "./Components/Upload/Upload";
import Subscription from "./Components/Subscription/Subscription";
import Dashboard from "./Components/Dashboard/Dashboard";
import PapersList from "./Components/Papers/PapersList";
import PaperDetail from "./Components/Papers/PaperDetail";
import AboutUs from "./Components/AboutUs/AboutUs";
import ErrorBoundary from "./Components/UI/ErrorBoundary";

const ProtectedRoute = ({ children }) => {
  const auth = React.useContext(AuthContext);
  if (!auth.isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  return children;
};
export default function App() {
  const { token, login, logout, userId, credit, updateCredit, refCode, name, email } = useAuth();

  useEffect(() => {
    setOnUnauthorized(logout);
    return () => setOnUnauthorized(null);
  }, [logout]);

  const isLoggedIn = !!token && !!userId;

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        token,
        userId,
        login,
        logout,
        credit,
        refCode,
        updateCredit,
        name,
        email,
      }}
    >
      <ConfigProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Router>
              <div
                className="flex flex-col min-h-screen"
                style={{
                  backgroundColor: "var(--md-background)",
                  color: "var(--md-on-background)",
                }}
              >
                <Navbar />
                <main className="flex-grow">
                  <ErrorBoundary>
                    <Routes>
                      {!isLoggedIn ? (
                        <>
                          <Route path="/" element={<Hero />} />
                          <Route path="/signup" element={<Signup />} />
                          <Route path="/login" element={<Login />} />
                          <Route path="/subscription" element={<Subscription />} />
                          <Route path="/aboutUs" element={<AboutUs />} />
                          {/* Catch-all redirects to home hero page */}
                          <Route path="/*" element={<Navigate to="/" replace />} />
                        </>
                      ) : (
                        <>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/upload" element={<Upload />} />
                          <Route path="/subscription" element={<Subscription />} />
                          <Route path="/papers" element={<PapersList />} />
                          <Route path="/paper/:id" element={<PaperDetail />} />
                          <Route path="/aboutUs" element={<AboutUs />} />
                          {/* Catch-all redirects to dashboard */}
                          <Route path="/*" element={<Navigate to="/" replace />} />
                        </>
                      )}
                    </Routes>
                  </ErrorBoundary>
                </main>
                <Footer />
              </div>
            </Router>
          </ConfirmProvider>
        </ToastProvider>
      </ConfigProvider>
    </AuthContext.Provider>
  );
}
