import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import nodemailer from "nodemailer";
import { Resend } from "resend";

let cachedTransporter = null;
let lastSmtpConfig = null;
let cachedResend = null;
let lastResendKey = null;

const getClientUrl = () => {
    const raw = process.env.CLIENT_URL || "http://localhost:5173";
    const first = raw.split(",")[0].trim();
    return first.replace(/\/+$/, "");
};

/**
 * Robustly parses a sender string (e.g. "CollabX <noreply@technonjr.org>" or "noreply@technonjr.org")
 * into a structured { name, email } object for APIs like Brevo.
 */
export const parseSender = (rawStr, defaultName = "CollabX", defaultEmail = "noreply@technonjr.org") => {
    if (!rawStr || typeof rawStr !== "string") {
        return { name: defaultName, email: defaultEmail };
    }
    const trimmed = rawStr.trim();
    const match = trimmed.match(/^(?:["']?([^<"']+)["']?\s*)?<([^>]+)>$/);
    if (match) {
        return {
            name: (match[1] || defaultName).trim(),
            email: match[2].trim().toLowerCase(),
        };
    }
    if (trimmed.includes("@")) {
        return {
            name: defaultName,
            email: trimmed.toLowerCase(),
        };
    }
    return { name: defaultName, email: defaultEmail };
};

export const formatSenderString = ({ name, email }) => {
    return name ? `${name} <${email}>` : email;
};

/**
 * Strict timeout guard to ensure outbound email calls never hang the server.
 */
export const withTimeout = (promise, ms = 7000, errorMsg = "Email request timed out") => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([
        promise.finally(() => clearTimeout(timeoutId)),
        timeoutPromise,
    ]);
};

/**
 * Normalizes email recipients (string, comma-separated, array of strings or objects)
 * into a clean array of email strings.
 */
const normalizeRecipients = (recipients) => {
    if (!recipients) return [];
    if (Array.isArray(recipients)) {
        return recipients
            .map((r) => {
                if (typeof r === "string") return r.trim();
                if (r && typeof r === "object" && r.email) return String(r.email).trim();
                return null;
            })
            .filter(Boolean);
    }
    if (typeof recipients === "string") {
        return recipients
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean);
    }
    return [];
};

/**
 * Brevo (Sendinblue) Transactional REST API Driver
 * POST https://api.brevo.com/v3/smtp/email
 */
const sendViaBrevo = async ({ apiKey, to, subject, html, text, bcc }) => {
    const rawSender = process.env.BREVO_FROM || process.env.EMAIL_FROM || process.env.MAIL_FROM;
    const sender = parseSender(rawSender, "CollabX", "noreply@technonjr.org");

    const toEmails = normalizeRecipients(to);
    const bccEmails = normalizeRecipients(bcc);

    if (toEmails.length === 0 && bccEmails.length === 0) {
        return { sent: false, reason: "No recipient email addresses provided" };
    }

    // Brevo requires at least one address in 'to'.
    // For BCC-only dispatches (e.g. campus announcements), populate 'to' with the sender's address.
    const formattedTo = toEmails.length > 0
        ? toEmails.map((email) => ({ email }))
        : [{ email: sender.email, name: sender.name }];

    const plainText = text || (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

    const payload = {
        sender: { name: sender.name, email: sender.email },
        to: formattedTo,
        subject,
        htmlContent: html,
        textContent: plainText,
    };

    if (bccEmails.length > 0) {
        payload.bcc = bccEmails.map((email) => ({ email }));
    }

    const response = await withTimeout(
        fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "api-key": apiKey,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify(payload),
        }),
        7000,
        "Brevo API request timed out after 7000ms"
    );

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
        return {
            sent: true,
            transport: "brevo",
            messageId: data?.messageId || "brevo-ok",
        };
    }

    const reason = data?.message || data?.error || `Brevo HTTP error ${response.status}: ${response.statusText}`;
    console.warn("[CollabX Brevo Error]", reason);
    return { sent: false, reason };
};

/**
 * Resend Transactional REST API Driver
 */
const getResendClient = (apiKey) => {
    if (!apiKey) return null;
    if (cachedResend && lastResendKey === apiKey) {
        return cachedResend;
    }
    try {
        cachedResend = new Resend(apiKey);
        lastResendKey = apiKey;
        return cachedResend;
    } catch (e) {
        console.warn("[getResendClient error]", e.message);
        return null;
    }
};

const sendViaResend = async ({ apiKey, to, subject, html, text, bcc }) => {
    const resendClient = getResendClient(apiKey);
    if (!resendClient) {
        return { sent: false, reason: "Failed to initialize Resend client" };
    }

    const rawSender = process.env.RESEND_FROM || process.env.EMAIL_FROM || process.env.MAIL_FROM;
    const defaultSender = "CollabX <onboarding@resend.dev>";
    let sendFrom = rawSender?.trim() || defaultSender;

    const toEmails = normalizeRecipients(to);
    const bccEmails = normalizeRecipients(bcc);

    if (toEmails.length === 0 && bccEmails.length === 0) {
        return { sent: false, reason: "No recipient email addresses provided" };
    }

    const plainText = text || (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");
    const toList = toEmails.length > 0 ? toEmails : [sendFrom];
    const bccList = bccEmails.length > 0 ? bccEmails : undefined;

    let resendResponse;
    try {
        resendResponse = await withTimeout(
            resendClient.emails.send({
                from: sendFrom,
                to: toList,
                bcc: bccList,
                subject,
                html,
                text: plainText,
            }),
            7000,
            "Resend API request timed out after 7000ms"
        );
    } catch (timeoutOrErr) {
        console.warn("[CollabX Resend Exception]", timeoutOrErr.message);
        resendResponse = { error: timeoutOrErr };
    }

    // Auto-heal: If custom domain unverified and wasn't already default sandbox sender, retry once
    if (
        resendResponse?.error &&
        sendFrom !== defaultSender &&
        (resendResponse.error.message?.includes("domain is not verified") ||
         resendResponse.error.message?.includes("validation_error") ||
         resendResponse.error.message?.includes("not verified"))
    ) {
        console.warn(`[CollabX Resend] Domain "${sendFrom}" unverified. Retrying with sandbox sender "${defaultSender}"...`);
        try {
            resendResponse = await withTimeout(
                resendClient.emails.send({
                    from: defaultSender,
                    to: toEmails.length > 0 ? toEmails : [defaultSender],
                    bcc: bccList,
                    subject,
                    html,
                    text: plainText,
                }),
                7000,
                "Resend API retry timed out after 7000ms"
            );
        } catch (retryErr) {
            resendResponse = { error: retryErr };
        }
    }

    if (!resendResponse?.error && resendResponse?.data) {
        return {
            sent: true,
            transport: "resend",
            emailId: resendResponse.data.id,
        };
    }

    const reason = resendResponse?.error?.message || "Resend email delivery failed";
    console.warn("[CollabX Resend Failure]", reason);
    return { sent: false, reason };
};

/**
 * Nodemailer SMTP Driver with short timeouts for cloud host compatibility
 */
const getSmtpTransporter = () => {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const secure = process.env.SMTP_SECURE === "true" || port === 465;

    const currentConfigKey = `${host}:${port}:${user}:${secure}`;
    if (cachedTransporter && lastSmtpConfig === currentConfigKey) {
        return cachedTransporter;
    }

    cachedTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
        connectionTimeout: 5000, // 5s max connect timeout
        greetingTimeout: 5000,   // 5s max greeting timeout
        socketTimeout: 7000,     // 7s max socket inactivity timeout
    });
    lastSmtpConfig = currentConfigKey;
    return cachedTransporter;
};

const sendViaSmtp = async ({ to, subject, html, text, bcc }) => {
    const transporter = getSmtpTransporter();
    const from = (process.env.EMAIL_FROM || process.env.MAIL_FROM || "CollabX <noreply@technonjr.org>").trim();
    const plainText = text || (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

    const toEmails = normalizeRecipients(to);
    const bccEmails = normalizeRecipients(bcc);

    if (toEmails.length === 0 && bccEmails.length === 0) {
        return { sent: false, reason: "No recipient email addresses provided" };
    }

    const mailOptions = {
        from,
        to: toEmails.length > 0 ? toEmails.join(", ") : from,
        bcc: bccEmails.length > 0 ? bccEmails.join(", ") : undefined,
        subject,
        html,
        text: plainText,
    };

    const info = await withTimeout(
        transporter.sendMail(mailOptions),
        7000,
        "SMTP dispatch timed out after 7000ms"
    );

    return {
        sent: true,
        transport: "smtp",
        messageId: info?.messageId,
    };
};

const renderEmailShell = ({
    headline,
    subheadline = "Techno NJR Institute of Technology",
    bodyContent,
    badge = "COLLABX",
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${headline}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 10px;">
        <tr>
            <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #141417; border: 1px solid #27272a; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 35px 30px 20px; background: linear-gradient(180deg, #1c1917 0%, #141417 100%); border-bottom: 1px solid #27272a;">
                            <div style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 8px 18px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;">
                                ${badge}
                            </div>
                            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">${headline}</h1>
                            <p style="margin: 6px 0 0; font-size: 12px; color: #a1a1aa;">${subheadline}</p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 32px 30px;">
                            ${bodyContent}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 30px; background-color: #0c0a09; border-top: 1px solid #27272a; text-align: center;">
                            <p style="margin: 0; font-size: 11px; color: #52525b; line-height: 18px;">
                                © 2026 CollabX · Plan · Build · Achieve<br/>Techno NJR Institute of Technology
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

/**
- Universal core email sender.
- Tries Resend API first if RESEND_API_KEY / EMAIL_API_KEY is set.
- Otherwise uses SMTP if SMTP_HOST & SMTP_USER & SMTP_PASS are set.
- If neither is configured, logs non-blocking dev notice and returns gracefully.
 */
export const sendEmail = async ({ to, subject, html, text, bcc }) => {
    try {
        const brevoKey = (process.env.BREVO_API_KEY || process.env.BREVO_KEY || process.env.SENDINBLUE_API_KEY)?.trim();
        const resendKey = (process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY)?.trim();
        const hasSmtp = Boolean(
            process.env.SMTP_HOST?.trim() &&
            process.env.SMTP_USER?.trim() &&
            process.env.SMTP_PASS?.trim()
        );

        // 1. Primary: Brevo REST API (POST https://api.brevo.com/v3/smtp/email)
        if (brevoKey) {
            return await sendViaBrevo({ apiKey: brevoKey, to, subject, html, text, bcc });
        }

        // 2. Secondary: Resend REST API (POST https://api.resend.com/emails)
        if (resendKey) {
            return await sendViaResend({ apiKey: resendKey, to, subject, html, text, bcc });
        }

        // 3. Tertiary: Nodemailer SMTP with short timeouts
        if (hasSmtp) {
            return await sendViaSmtp({ to, subject, html, text, bcc });
        }

        // Universal Fallback: Gracefully report unconfigured transport
        if (process.env.NODE_ENV !== "production") {
            const recipients = Array.isArray(to) ? to.join(", ") : to || (Array.isArray(bcc) ? bcc.join(", ") : bcc);
            console.log(`[CollabX Dev Mailer] (No Brevo/Resend/SMTP configured) Recipient: ${recipients} | Subject: "${subject}"`);
        }
        return {
            sent: false,
            reason: "No email transport configured in environment (set BREVO_API_KEY, RESEND_API_KEY, or SMTP_*)",
        };
    } catch (err) {
        console.warn("[CollabX Universal Mailer Exception]", err.message);
        return { sent: false, reason: err.message };
    }
};

/**
- 1. OTP Verification Email (Signup, Password Reset, Email Verification)
 */
export const sendOtpEmail = async ({ to, name = "CollabX User", otp, purpose = "signup" }) => {
    try {
        if (process.env.NODE_ENV !== "production") {
            console.log(`[CollabX Dev OTP] (${purpose}) ${to} -> ${otp}`);
        }

        const isReset = purpose === "reset_password";
        const subject = isReset
            ? `CollabX Password Reset Code: ${otp}`
            : `CollabX Verification Code: ${otp}`;

        const headline = isReset ? "Password Reset Request" : "Verify Your Email";
        const subheadline = isReset
            ? "Use the verification code below to securely reset your password."
            : "Welcome to CollabX! Use the verification code below to activate your account.";

        const bodyContent = `
            <p style="margin: 0 0 16px; font-size: 14px; line-height: 22px; color: #d4d4d8;">
                Hello <strong style="color: #ffffff;">${name}</strong>,
            </p>
            <p style="margin: 0 0 24px; font-size: 14px; line-height: 22px; color: #a1a1aa;">
                ${subheadline}
            </p>

            <!-- OTP Display Card -->
            <div style="background-color: #1c1917; border: 1px solid #3f3f46; border-radius: 14px; padding: 22px 20px; text-align: center; margin: 25px 0;">
                <span style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #f43f5e; margin-bottom: 8px;">
                    One-Time Verification Code
                </span>
                <div style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #ffffff; font-family: monospace; padding-left: 10px;">
                    ${otp}
                </div>
                <span style="display: inline-block; margin-top: 10px; font-size: 12px; color: #fb7185; background-color: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.2); padding: 4px 12px; border-radius: 9999px;">
                    ⏱ Valid for 2 minutes only
                </span>
            </div>

            <p style="margin: 20px 0 0; font-size: 12px; line-height: 18px; color: #71717a; text-align: center;">
                If you did not request this verification code, you can safely ignore this email. Someone may have entered your email address by mistake.
            </p>
        `;

        const html = renderEmailShell({
            headline,
            subheadline: "Techno NJR Institute of Technology",
            bodyContent,
        });

        return await sendEmail({ to, subject, html });
    } catch (err) {
        console.warn("[sendOtpEmail notice]", err.message);
        return { sent: false, reason: err.message };
    }
};

/**
- 2. Welcome Email on Account Creation
 */
export const sendWelcomeEmail = async ({ to, name = "CollabX User", role = "student" }) => {
    try {
        if (process.env.NODE_ENV !== "production") {
            console.log(`[CollabX Dev Welcome Email] to: ${to}, name: ${name}, role: ${role}`);
        }

        const clientUrl = getClientUrl();
        const roleLabel = role ? role.toUpperCase() : "STUDENT";
        const subject = "Welcome to CollabX!";
        const headline = `Welcome to CollabX, ${name}!`;

        const bodyContent = `
            <p style="margin: 0 0 16px; font-size: 14px; line-height: 22px; color: #d4d4d8;">
                Your account at <strong style="color: #ffffff;">Techno NJR Institute of Technology</strong> has been created with role <span style="background-color: #27272a; color: #38bdf8; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700;">${roleLabel}</span>.
            </p>
            <p style="margin: 0 0 24px; font-size: 14px; line-height: 22px; color: #a1a1aa;">
                You have access to engineering project sprints, squad collaboration, mentor guidance, and real-time team channels.
            </p>

            <div style="background-color: #1c1917; border: 1px solid #27272a; border-radius: 12px; padding: 18px 20px; margin: 20px 0;">
                <h4 style="margin: 0 0 10px; color: #ffffff; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">What you can do on CollabX:</h4>
                <ul style="margin: 0; padding-left: 20px; color: #a1a1aa; font-size: 13px; line-height: 20px;">
                    <li style="margin-bottom: 6px;">Manage project deliverables and milestone tasks</li>
                    <li style="margin-bottom: 6px;">Collaborate with squad peers and receive mentor reviews</li>
                    <li style="margin-bottom: 6px;">Participate in campus-wide engineering leaderboards</li>
                    <li>Stay updated with instant team announcements & notifications</li>
                </ul>
            </div>

            <div style="text-align: center; margin: 30px 0 10px;">
                <a href="${clientUrl}/login" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px;">
                    Open CollabX Workspace →
                </a>
            </div>
        `;

        const html = renderEmailShell({
            headline,
            subheadline: "Engineering Collaboration Platform",
            bodyContent,
        });

        return await sendEmail({ to, subject, html });
    } catch (err) {
        console.warn("[sendWelcomeEmail notice]", err.message);
        return { sent: false, reason: err.message };
    }
};

/**
- 3. Account Approved & Activated Email (Sent after Admin reviews & classifies account)
 */
export const sendAccountApprovalEmail = async ({ to, name = "CollabX User", role = "student" }) => {
    try {
        if (process.env.NODE_ENV !== "production") {
            console.log(`[CollabX Dev Approval Email] to: ${to}, name: ${name}, role: ${role}`);
        }

        const clientUrl = getClientUrl();
        const roleLabel = role ? role.toUpperCase() : "STUDENT";
        const subject = "Your CollabX Account Has Been Approved!";
        const headline = "Account Approved & Activated";

        const bodyContent = `
            <p style="margin: 0 0 16px; font-size: 14px; line-height: 22px; color: #d4d4d8;">
                Hello <strong style="color: #ffffff;">${name}</strong>,
            </p>
            <p style="margin: 0 0 20px; font-size: 14px; line-height: 22px; color: #a1a1aa;">
                Great news! Your CollabX registration has been reviewed, approved, and officially classified by an administrator.
            </p>

            <div style="background-color: #1c1917; border: 1px solid #22c55e; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0;">
                <span style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #4ade80; margin-bottom: 6px;">
                    Assigned Portal Role
                </span>
                <div style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: 1px;">
                    ${roleLabel}
                </div>
                <p style="margin: 8px 0 0; font-size: 12px; color: #a1a1aa;">
                    Your account is now fully active. You can log in using your registered credentials.
                </p>
            </div>

            <div style="text-align: center; margin: 30px 0 15px;">
                <a href="${clientUrl}/login" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-size: 14px; font-weight: 700;">
                    Log In to CollabX →
                </a>
            </div>
        `;

        const html = renderEmailShell({
            headline,
            subheadline: "CollabX Account Notification",
            bodyContent,
        });

        return await sendEmail({ to, subject, html });
    } catch (err) {
        console.warn("[sendAccountApprovalEmail notice]", err.message);
        return { sent: false, reason: err.message };
    }
};

/**
- 4. Announcement Email (Campus / Team Announcements)
- Supports single email or an array of recipient emails.
- When multiple recipients are specified, batches them safely via BCC so user emails are never disclosed.
 */
export const sendAnnouncementEmail = async ({
    to,
    title,
    content,
    authorName = "CollabX Administration",
    authorRole = "Admin",
    projectTitle = null,
}) => {
    try {
        const clientUrl = getClientUrl();
        const subject = projectTitle
            ? `[CollabX Team Announcement] ${title}`
            : `[CollabX Announcement] ${title}`;

        const headline = projectTitle
            ? `Team Announcement: ${projectTitle}`
            : "CollabX Campus Announcement";

        const subheadline = projectTitle
            ? `Posted by ${authorName} (${authorRole})`
            : `Published by ${authorName} (${authorRole})`;

        const cleanContent = String(content || "").replace(/\n/g, "<br/>");

        const bodyContent = `
            <div style="margin-bottom: 20px;">
                <h2 style="margin: 0 0 12px; font-size: 18px; color: #ffffff; font-weight: 700;">
                    ${title}
                </h2>
                <div style="background-color: #1c1917; border-left: 4px solid #dc2626; border-radius: 0 10px 10px 0; padding: 16px 20px; margin: 16px 0; color: #e4e4e7; font-size: 14px; line-height: 24px;">
                    ${cleanContent}
                </div>
            </div>

            <p style="margin: 16px 0 0; font-size: 12px; color: #71717a;">
                Published by <strong style="color: #a1a1aa;">${authorName}</strong> · ${authorRole}
                ${projectTitle ? ` · Project: <strong style="color: #a1a1aa;">${projectTitle}</strong>` : ""}
            </p>

            <div style="text-align: center; margin: 28px 0 10px;">
                <a href="${clientUrl}/dashboard" style="display: inline-block; background-color: #27272a; border: 1px solid #3f3f46; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 600;">
                    Open CollabX Dashboard →
                </a>
            </div>
        `;

        const html = renderEmailShell({
            headline,
            subheadline,
            bodyContent,
            badge: projectTitle ? "TEAM ANNOUNCEMENT" : "ANNOUNCEMENT",
        });

        // If 'to' is an array of recipients, chunk into batches of 40 and use BCC for privacy
        if (Array.isArray(to)) {
            const rawList = to.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
            const uniqueRecipients = [...new Set(rawList)];

            if (uniqueRecipients.length === 0) {
                return { sent: false, reason: "No recipient emails provided" };
            }

            if (uniqueRecipients.length === 1) {
                return await sendEmail({ to: uniqueRecipients[0], subject, html });
            }

            const BATCH_SIZE = 40;
            let successCount = 0;

            for (let i = 0; i < uniqueRecipients.length; i += BATCH_SIZE) {
                const chunk = uniqueRecipients.slice(i, i + BATCH_SIZE);
                const res = await sendEmail({ bcc: chunk, subject, html });
                if (res?.sent) successCount += chunk.length;
            }

            return { sent: true, count: successCount, total: uniqueRecipients.length };
        }

        return await sendEmail({ to, subject, html });
    } catch (err) {
        console.warn("[sendAnnouncementEmail notice]", err.message);
        return { sent: false, reason: err.message };
    }
};

/**
- 5. General Notification Email
 */
export const sendNotificationEmail = async ({
    to,
    subject = "CollabX System Notification",
    headline = "System Notification",
    message,
    link,
    linkText = "View Details",
}) => {
    try {
        const bodyContent = `
            <p style="margin: 0 0 20px; font-size: 14px; line-height: 24px; color: #d4d4d8;">
                ${String(message || "").replace(/\n/g, "<br/>")}
            </p>
            ${link ? `
            <div style="text-align: center; margin: 25px 0 10px;">
                <a href="${link}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 700;">
                    ${linkText} →
                </a>
            </div>
            ` : ""}
        `;

        const html = renderEmailShell({
            headline,
            subheadline: "CollabX Notification",
            bodyContent,
        });

        return await sendEmail({ to, subject, html });
    } catch (err) {
        console.warn("[sendNotificationEmail notice]", err.message);
        return { sent: false, reason: err.message };
    }
};

/**
- 6. Team & Mentor Invitation Email
 */
export const sendInvitationEmail = async ({
    to,
    inviterName = "A team leader",
    projectName = "Engineering Project",
    invitationUrl,
    role = "member",
}) => {
    try {
        const isMentor = role === "mentor";
        const subject = isMentor
            ? `Invitation to Mentor Project: "${projectName}" on CollabX`
            : `You're invited to join squad "${projectName}" on CollabX`;

        const headline = isMentor ? "Mentor Project Invitation" : "Squad Team Invitation";
        const roleLabel = isMentor ? "Faculty Mentor" : "Squad Member";

        const bodyContent = `
            <p style="margin: 0 0 16px; font-size: 14px; line-height: 22px; color: #d4d4d8;">
                Hello,
            </p>
            <p style="margin: 0 0 20px; font-size: 14px; line-height: 22px; color: #a1a1aa;">
                <strong style="color: #ffffff;">${inviterName}</strong> has invited you to join the project <strong style="color: #ffffff;">"${projectName}"</strong> as a <span style="background-color: #27272a; color: #38bdf8; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700;">${roleLabel}</span> on CollabX.
            </p>

            <div style="background-color: #1c1917; border: 1px solid #3f3f46; border-radius: 12px; padding: 18px 20px; margin: 24px 0; text-align: center;">
                <span style="display: inline-block; font-size: 12px; color: #fbbf24; background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">
                    ⏳ Invitation link valid for 48 hours only
                </span>
                <p style="margin: 0; font-size: 13px; color: #a1a1aa;">
                    Click the button below to review and accept the team invitation:
                </p>
            </div>

            <div style="text-align: center; margin: 28px 0 15px;">
                <a href="${invitationUrl}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-size: 14px; font-weight: 700;">
                    Accept Invitation & Join →
                </a>
            </div>

            <p style="margin: 20px 0 0; font-size: 11px; color: #71717a; text-align: center; word-break: break-all;">
                Or copy and paste this link in your browser:<br/>
                <a href="${invitationUrl}" style="color: #94a3b8; text-decoration: underline;">${invitationUrl}</a>
            </p>
        `;

        const html = renderEmailShell({
            headline,
            subheadline: "Project Squad Collaboration",
            bodyContent,
            badge: "INVITATION",
        });

        return await sendEmail({ to, subject, html });
    } catch (err) {
        console.warn("[sendInvitationEmail notice]", err.message);
        return { sent: false, reason: err.message };
    }
};

export default sendOtpEmail;
