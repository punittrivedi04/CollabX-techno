import { io } from "socket.io-client";
import { SOCKET_BASE_URL } from "./api";

let socket = null;

const attachNotificationBridge = (socketInstance) => {
    if (socketInstance.notificationBridgeAttached) return;

    socketInstance.notificationBridgeAttached = true;

    socketInstance.on("notification:new", (notification) => {
        window.dispatchEvent(
            new CustomEvent("collabx_notification_received", {
                detail: { notification },
            })
        );
    });
};

export const connectSocket = (token) => {
    if (!token) {
        console.error("Socket connection failed: No token provided.");
        return null;
    }

    if (socket?.connected) {
        attachNotificationBridge(socket);
        return socket;
    }

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    socket = io(SOCKET_BASE_URL, {
        auth: (cb) => {
            const currentToken =
                localStorage.getItem("collabx_token") || token;
            cb({ token: currentToken });
        },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
        transports: ["websocket", "polling"],
    });

    attachNotificationBridge(socket);

    socket.on("connect", () => {
        console.log("Socket connected:", socket.id);
    });

    socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error.message);
    });

    socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
    });

    return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
    if (socket) {
        try {
            socket.removeAllListeners();
            socket.disconnect();
        } catch (err) {
            console.error("Error disconnecting socket:", err);
        }
        socket = null;
    }
};

export const reconnectSocket = (token = null) => {
    disconnectSocket();

    const currentToken =
        token || localStorage.getItem("collabx_token");
    if (!currentToken) {
        console.warn("Socket reconnection skipped: No auth token found.");
        return null;
    }

    return connectSocket(currentToken);
};