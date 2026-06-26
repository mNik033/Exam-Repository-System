import { useState, useCallback } from "react";

const TOKEN_LIFETIME_MS = 1000 * 60 * 60 * 24;

const getInitialState = () => {
  try {
    const storedData = JSON.parse(localStorage.getItem("userData"));
    if (
      storedData &&
      storedData.token &&
      new Date(storedData.expiration) > new Date()
    ) {
      return {
        token: storedData.token,
        userId: storedData.userId,
        credit: storedData.credit,
        refCode: storedData.refCode,
        name: storedData.name,
        email: storedData.email,
      };
    }
    // Token exists but is expired — clean it up
    if (storedData) {
      localStorage.removeItem("userData");
    }
  } catch (error) {
    console.error("Failed to parse userData from localStorage", error);
    localStorage.removeItem("userData");
  }
  return {
    token: null,
    userId: null,
    credit: null,
    refCode: null,
    name: null,
    email: null,
  };
};

const useAuth = () => {
  const [initialState] = useState(getInitialState);

  const [token, setToken] = useState(initialState.token);
  const [userId, setUserId] = useState(initialState.userId);
  const [credit, setCredit] = useState(initialState.credit);
  const [refCode, setRefCode] = useState(initialState.refCode);
  const [name, setName] = useState(initialState.name);
  const [email, setEmail] = useState(initialState.email);

  const login = useCallback((uid, tok, currentCredit, referralCode, _expirationDate, userName, userEmail) => {
    setToken(tok);
    setUserId(uid);
    setCredit(currentCredit);
    setRefCode(referralCode);
    setName(userName);
    setEmail(userEmail);

    const expiration = new Date(Date.now() + TOKEN_LIFETIME_MS);

    localStorage.setItem(
      "userData",
      JSON.stringify({
        userId: uid,
        token: tok,
        expiration: expiration.toISOString(),
        credit: currentCredit,
        refCode: referralCode,
        name: userName,
        email: userEmail,
      })
    );
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUserId(null);
    setCredit(null);
    setRefCode(null);
    setName(null);
    setEmail(null);
    localStorage.removeItem("userData");
  }, []);

  const updateCredit = useCallback((newCredit) => {
    setCredit(newCredit);
    try {
      const storedData = JSON.parse(localStorage.getItem("userData"));
      if (storedData) {
        storedData.credit = newCredit;
        localStorage.setItem("userData", JSON.stringify(storedData));
      }
    } catch (error) {
      console.error("Failed to update credit in localStorage", error);
    }
  }, []);

  // No client-side auto-logout timer needed.
  // The backend rejects expired tokens with 401, and the API layer
  // handles that by calling logout() (see services/api.js).

  return { token, login, logout, userId, credit, updateCredit, refCode, name, email };
};

export default useAuth;
