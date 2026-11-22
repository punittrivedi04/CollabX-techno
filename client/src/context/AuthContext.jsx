import { createContext, useContext, useEffect, useState } from "react";

import api from "../services/api";
import { connectSocket, disconnectSocket } from "../services/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("collabx_user")) || null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);

  // Verify existing login session on page refresh
  useEffect(() => {
    const verifyUser = async () => {
      const token = localStorage.getItem("collabx_token");

      if (!token) {
        disconnectSocket();
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const response = await api.get("/auth/me");

        setUser(response.data.user);

        localStorage.setItem(
          "collabx_user",
          JSON.stringify(response.data.user),
        );

        // Connect socket only after successful verification
        connectSocket(token);
      } catch (error) {
        disconnectSocket();

        localStorage.removeItem("collabx_token");
        localStorage.removeItem("collabx_user");

        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifyUser();

    return () => {
      disconnectSocket();
    };
  }, []);

  // Save login/register session
  const saveSession = (data) => {
    localStorage.setItem("collabx_token", data.token);

    localStorage.setItem("collabx_user", JSON.stringify(data.user));

    setUser(data.user);

    // Connect authenticated socket
    connectSocket(data.token);
  };

  // Login
  const login = async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    saveSession(response.data);

    return response.data;
  };

  // Register (step 1: sends OTP to email)
  const register = async (name, email, password, roll_no) => {
    const payload =
      typeof name === "object" && name !== null
        ? name
        : { name, email, password, roll_no };
    const response = await api.post("/auth/register", payload);
    return response.data;
  };

  // Verify OTP (step 2 for signup: activates user and returns session)
  const verifyOtp = async (email, otp, otpToken) => {
    const response = await api.post("/auth/verify-otp", {
      email,
      otp,
      otpToken,
    });

    if (response.data?.token && response.data?.user) {
      saveSession(response.data);
    }

    return response.data;
  };

  // Resend OTP
  const resendOtp = async (email, purpose = "signup") => {
    const response = await api.post("/auth/resend-otp", {
      email,
      purpose,
    });
    return response.data;
  };

  // Forgot password (sends reset OTP)
  const forgotPassword = async (email) => {
    const response = await api.post("/auth/forgot-password", {
      email,
    });
    return response.data;
  };

  // Reset password (verifies OTP and sets new password)
  const resetPassword = async (email, otp, otpToken, newPassword) => {
    const response = await api.post("/auth/reset-password", {
      email,
      otp,
      otpToken,
      newPassword,
    });
    return response.data;
  };

  // Logout
  const logout = () => {
    disconnectSocket();

    localStorage.removeItem("collabx_token");
    localStorage.removeItem("collabx_user");

    setUser(null);
  };

  // Update logged-in user state and cache
  const updateUser = (updatedUser) => {
    setUser((prev) => {
      const merged = { ...prev, ...updatedUser };
      localStorage.setItem("collabx_user", JSON.stringify(merged));
      return merged;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        verifyOtp,
        resendOtp,
        forgotPassword,
        resetPassword,
        saveSession,
        logout,
        updateUser,
        isAuthenticated: Boolean(user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
