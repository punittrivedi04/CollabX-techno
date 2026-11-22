import cron from "node-cron";
import pool from "../config/db.js";

let isRunning = false;
let scheduledTask = null;

export const checkTaskReminders = async (io) => {
    if (isRunning) return;
    isRunning = true;

    try {
        // Find tasks due within 24 hours that are not completed
        const { rows: dueTasks } = await pool.query(`
            SELECT t.id, t.title, t.due_date, t.assigned_to, t.created_by, t.project_id,
                   p.title as project_title
            FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE t.status != 'Completed'
              AND t.due_date IS NOT NULL
              AND t.due_date <= NOW() + INTERVAL '24 hours'
              AND t.due_date >= NOW()
            LIMIT 50;
        `);

        for (const task of dueTasks) {
            const recipientId = task.assigned_to || task.created_by;
            if (!recipientId) continue;

            const message = `Task "${task.title}" is due soon (${new Date(task.due_date).toLocaleDateString()}).`;

            // Check if reminder was already sent today
            const existingNotif = await pool.query(`
                SELECT 1 FROM notifications
                WHERE user_id = $1 AND message = $2 AND created_at >= NOW() - INTERVAL '24 hours'
            `, [recipientId, message]);

            if (existingNotif.rows.length === 0) {
                const insertRes = await pool.query(`
                    INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                    VALUES ($1, 'Task Reminder', $2, 'reminder', FALSE, NOW())
                    RETURNING *;
                `, [recipientId, message]);

                if (io) {
                    io.to(`user:${recipientId}`).emit("collabx_notification_received", {
                        notification: {
                            id: insertRes.rows[0].id,
                            _id: insertRes.rows[0].id,
                            message,
                            type: "reminder",
                            isRead: false,
                            createdAt: insertRes.rows[0].created_at,
                        },
                    });
                }
            }
        }
    } catch (error) {
        console.error("Task Reminder Job Error:", error.message);
    } finally {
        isRunning = false;
    }
};

export const startTaskReminderJob = (io) => {
    if (scheduledTask) return scheduledTask;

    // Run every hour
    scheduledTask = cron.schedule("0 * * * *", () => {
        checkTaskReminders(io);
    });
    return scheduledTask;
};
