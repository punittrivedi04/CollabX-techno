import pool from "../config/db.js";
import { safeUser, escapeLikePattern, pickAllowedFields } from "../utils/formatters.js";
import { invalidateUserCache } from "../utils/microCache.js";

// GET USER PROFILE
export const getUserProfile = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { rows } = await pool.query(
            "SELECT id, name, email, roll_no, role, is_verified, is_active, created_at FROM users WHERE id = $1",
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            user: safeUser(rows[0]),
            data: safeUser(rows[0]),
        });
    } catch (error) {
        next(error);
    }
};

// UPDATE USER PROFILE
export const updateUserProfile = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        // Strict field allowlist: ignore any injected role, is_verified, is_active, email, password_hash, etc.
        const { name, roll_no } = pickAllowedFields(req.body, ["name", "roll_no"]);

        const { rows: currentRows } = await pool.query(
            "SELECT id, name, email, roll_no, role, is_verified, is_active, created_at FROM users WHERE id = $1",
            [userId]
        );

        if (currentRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const current = currentRows[0];

        let newName = current.name;
        if (name !== undefined) {
            if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Name must contain 2 to 100 characters",
                });
            }
            newName = name.trim();
        }

        const userRole = String(current.role || "").toLowerCase().trim();
        const isStudentOrMentor = userRole === "student" || userRole === "mentor" || userRole === "faculty";
        const isMentorUser = userRole === "mentor" || userRole === "faculty";

        let newRollNo = current.roll_no;
        if (roll_no !== undefined && isStudentOrMentor) {
            if (roll_no === null || roll_no === "") {
                newRollNo = null;
            } else {
                const cleanRoll = String(roll_no).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
                if (cleanRoll) {
                    if (!/^[A-Z0-9]+$/.test(cleanRoll)) {
                        return res.status(400).json({
                            success: false,
                            message: isMentorUser
                                ? "Enrollment number must be alphanumeric (uppercase letters and numbers only)"
                                : "Roll number must be alphanumeric (uppercase letters and numbers only)",
                        });
                    }
                    if (cleanRoll.length > 50) {
                        return res.status(400).json({
                            success: false,
                            message: isMentorUser
                                ? "Enrollment number cannot exceed 50 characters"
                                : "Roll number cannot exceed 50 characters",
                        });
                    }
                    newRollNo = cleanRoll;
                } else {
                    newRollNo = null;
                }
            }
        }

        const updateRes = await pool.query(`
            UPDATE users
            SET name = $1,
                roll_no = $2
            WHERE id = $3
            RETURNING id, name, email, roll_no, role, is_verified, is_active, created_at;
        `, [newName, newRollNo, userId]);

        const updated = updateRes.rows[0];
        invalidateUserCache();

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: safeUser(updated),
            data: safeUser(updated),
        });
    } catch (error) {
        next(error);
    }
};

// GET ALL USERS (for team member & mentor selection)
export const getUsers = async (req, res, next) => {
    try {
        const { search, role } = req.query;
        const conditions = ["COALESCE(is_active, TRUE) = TRUE", "LOWER(COALESCE(role, '')) != 'director'"];
        const params = [];

        if (typeof role === "string" && role.trim()) {
            const normalizedRole = role.trim().toLowerCase();
            if (normalizedRole === "mentor" || normalizedRole === "faculty") {
                conditions.push("LOWER(COALESCE(role, '')) IN ('mentor', 'faculty')");
            } else if (normalizedRole === "student") {
                conditions.push("LOWER(COALESCE(role, 'student')) = 'student'");
            }
        }

        if (typeof search === "string" && search.trim()) {
            const safeSearch = escapeLikePattern(search.trim().slice(0, 100));
            params.push(`%${safeSearch}%`);
            const idx = params.length;
            conditions.push(`(name ILIKE $${idx} ESCAPE '\\' OR email ILIKE $${idx} ESCAPE '\\' OR COALESCE(roll_no, '') ILIKE $${idx} ESCAPE '\\')`);
        }

        const query = `SELECT id, name, email, roll_no, role FROM users WHERE ${conditions.join(" AND ")} ORDER BY name ASC LIMIT 250;`;

        const { rows } = await pool.query(query, params);
        const formatted = rows.map((u) => ({
            id: u.id,
            _id: u.id,
            name: u.name,
            email: u.email,
            roll_no: u.roll_no || "",
            role: u.role || "student",
        }));

        return res.status(200).json({
            success: true,
            count: formatted.length,
            users: formatted,
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};
