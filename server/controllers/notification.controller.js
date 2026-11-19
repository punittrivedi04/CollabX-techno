import pool from "../config/db.js";
import { formatNotification, parsePositiveInt } from "../utils/formatters.js";

// 1. GET NOTIFICATIONS
export const getNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const { rows: notifications } = await pool.query(`
            SELECT id, user_id, title, message, type, is_read, created_at
            FROM notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 100;
        `, [userId]);

        const countRes = await pool.query(`
            SELECT COUNT(*) AS unread_count
            FROM notifications
            WHERE user_id = $1 AND is_read = FALSE;
        `, [userId]);

        const unreadCount = Number(countRes.rows[0]?.unread_count || 0);
        const formatted = notifications.map(formatNotification);

        return res.status(200).json({
            success: true,
            count: formatted.length,
            unreadCount,
            notifications: formatted,
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};

// 2. MARK NOTIFICATION AS READ
export const markNotificationRead = async (req, res, next) => {
    try {
        const notificationId = parsePositiveInt(req.params.id);
        const userId = req.user.id;

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: "Valid notification ID is required",
            });
        }

        const updateRes = await pool.query(`
            UPDATE notifications
            SET is_read = TRUE
            WHERE id = $1 AND user_id = $2
            RETURNING *;
        `, [notificationId, userId]);

        if (updateRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification marked as read",
            notification: formatNotification(updateRes.rows[0]),
        });
    } catch (error) {
        next(error);
    }
};

// 3. MARK ALL NOTIFICATIONS AS READ
export const markAllNotificationsRead = async (req, res, next) => {
    try {
        const userId = req.user.id;

        await pool.query(`
            UPDATE notifications
            SET is_read = TRUE
            WHERE user_id = $1 AND is_read = FALSE;
        `, [userId]);

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read",
        });
    } catch (error) {
        next(error);
    }
};

// 4. DELETE NOTIFICATION
export const deleteNotification = async (req, res, next) => {
    try {
        const notificationId = parsePositiveInt(req.params.id);
        const userId = req.user.id;

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: "Valid notification ID is required",
            });
        }

        const deleteRes = await pool.query(`
            DELETE FROM notifications
            WHERE id = $1 AND user_id = $2
            RETURNING id;
        `, [notificationId, userId]);

        if (deleteRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};
