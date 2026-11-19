import { Resend } from "resend";

export const sendOtpEmail = async ({ to, name = "CollabX User", otp, purpose = "signup" }) => {
    try {
        if (process.env.NODE_ENV !== "production") {
            console.log(`[CollabX Dev OTP] (${purpose}) ${to} -> ${otp}`);
        }
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            console.warn("RESEND_API_KEY missing in .env - email skipped in dev");
            return { sent: false, reason: "API key missing" };
        }

        const resend = new Resend(apiKey);
        const isReset = purpose === "reset_password";
        const subject = isReset
            ? `CollabX Password Reset Code: ${otp}`
            : `CollabX Email Verification Code: ${otp}`;

        const headline = isReset ? "Password Reset Request" : "Verify Your Email";
        const subheadline = isReset
            ? "Use the verification code below to securely reset your password."
            : "Welcome to CollabX! Use the verification code below to activate your account.";

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 10px;">
        <tr>
            <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #141417; border: 1px solid #27272a; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 35px 30px 20px; background: linear-gradient(180deg, #1c1917 0%, #141417 100%); border-bottom: 1px solid #27272a;">
                            <div style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 8px 18px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;">
                                COLLABX
                            </div>
                            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">${headline}</h1>
                            <p style="margin: 6px 0 0; font-size: 12px; color: #a1a1aa;">Techno NJR Institute of Technology</p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 32px 30px;">
                            <p style="margin: 0 0 16px; font-size: 14px; line-height: 22px; color: #d4d4d8;">
                                Hello <strong style="color: #ffffff;">${name}</strong>,
                            </p>
                            <p style="margin: 0 0 24px; font-size: 14px; line-height: 22px; color: #a1a1aa;">
                                ${subheadline}
                            </p>

                            <!-- OTP Box -->
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
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 30px; background-color: #0c0a09; border-top: 1px solid #27272a; text-align: center;">
                            <p style="margin: 0; font-size: 11px; color: #52525b;">
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

        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM || "CollabX <onboarding@resend.dev>",
            to: [to],
            subject,
            html,
        });

        if (error) {
            console.warn("Resend API returned notice:", error.message);
            return { sent: false, reason: error.message };
        }

        return { sent: true, emailId: data?.id };
    } catch (err) {
        console.warn("sendOtpEmail notice:", err.message);
        return { sent: false, reason: err.message };
    }
};

export default sendOtpEmail;
