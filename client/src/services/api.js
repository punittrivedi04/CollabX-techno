
import axios from "axios";

// Centralized Source of Truth for CollabX API & Socket.IO URLs
export const API_BASE_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).trim().replace(/\/+$/, "");

export const SOCKET_BASE_URL = (
    import.meta.env.VITE_SOCKET_URL || API_BASE_URL.replace(/\/api\/?$/, "")
).trim().replace(/\/+$/, "");

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        "Content-Type": "application/json",
    },
});

// Attach JWT
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("collabx_token");

        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

// Handle unauthorized requests
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const requestUrl = error.config?.url || "";

        const isAuthRequest = requestUrl.includes("/auth/");

        if (status === 401 && !isAuthRequest) {
            localStorage.removeItem("collabx_token");
            localStorage.removeItem("collabx_user");

            if (
                window.location.pathname !== "/login" &&
                window.location.pathname !== "/register"
            ) {
                window.location.replace("/login");
            }
        }

        if (!error.response && (error.code === "ECONNABORTED" || error.message === "Network Error")) {
            error.message = "Unable to connect to CollabX servers. The server may be waking up from sleep; please try again in a moment.";
        }

        return Promise.reject(error);
    }
);

export default api;
