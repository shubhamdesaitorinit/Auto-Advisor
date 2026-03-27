import sgMail from "@sendgrid/mail";
import { logger } from "./logger";

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? "advisor@autoadvisor.ca";
const FROM_NAME = process.env.SENDGRID_FROM_NAME ?? "Auto Advisor";
const DEALERSHIP_EMAIL = process.env.DEALERSHIP_EMAIL ?? "sales@autoadvisor.ca";

function initSendGrid(): boolean {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    logger.info("SendGrid API key not set — emails will be logged only");
    return false;
  }
  sgMail.setApiKey(key);
  return true;
}

async function sendEmail(msg: sgMail.MailDataRequired): Promise<{ success: boolean; messageId?: string }> {
  const configured = initSendGrid();

  if (!configured) {
    logger.info({ to: msg.to, subject: msg.subject }, "Email (logged, not sent — SendGrid not configured)");
    return { success: true, messageId: `logged-${Date.now()}` };
  }

  try {
    const [res] = await sgMail.send(msg);
    return { success: true, messageId: res.headers["x-message-id"] as string };
  } catch (err) {
    logger.error({ err, to: msg.to, subject: msg.subject }, "SendGrid email failed");
    return { success: false };
  }
}

// ── Booking Confirmation ──────────────────────────────────────────

export async function sendBookingConfirmation(params: {
  to: string;
  customerName: string;
  vehicleName: string;
  vehicleVariant: string;
  date: string;
  time: string;
  location: string;
  calendarLink?: string;
}) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 20px; color: #10b981; margin: 0;">Auto Advisor</h1>
      </div>
      <h2 style="font-size: 22px; color: #1f2937; margin-bottom: 8px;">Your Test Drive is Confirmed!</h2>
      <p style="color: #6b7280; font-size: 15px;">Hi ${params.customerName}, your test drive is all set.</p>

      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
        <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">Vehicle</p>
        <p style="margin: 0 0 16px; font-size: 17px; font-weight: 600; color: #111827;">${params.vehicleName} ${params.vehicleVariant}</p>
        <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">Date & Time</p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #111827;">${params.date} at ${params.time}</p>
        <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">Location</p>
        <p style="margin: 0; font-size: 15px; color: #111827;">${params.location}</p>
      </div>

      <div style="background: #ecfdf5; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; font-size: 14px; color: #065f46;"><strong>What to bring:</strong> Valid driver's license. If you have a trade-in vehicle, please bring it along for a quick appraisal.</p>
      </div>

      ${params.calendarLink ? `<p style="font-size: 14px;"><a href="${params.calendarLink}" style="color: #10b981;">Add to Google Calendar</a></p>` : ""}

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="font-size: 13px; color: #9ca3af;">Need to reschedule? Reply to this email or chat with us again at any time.</p>
      <p style="font-size: 13px; color: #9ca3af;">Auto Advisor — 123 Auto Drive, Toronto, ON M5V 1A1</p>
    </div>
  `;

  return sendEmail({
    to: params.to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Test Drive Confirmed — ${params.vehicleName}`,
    html,
  });
}

// ── Vehicle Info Email ────────────────────────────────────────────

export async function sendVehicleInfoEmail(params: {
  to: string;
  customerName?: string;
  vehicles: Array<{
    name: string;
    variant: string;
    price: number;
    fuelEconomy: string;
    keyFeatures: string[];
  }>;
  personalNote?: string;
}) {
  const greeting = params.customerName ? `Hi ${params.customerName}` : "Hi there";
  const vehicleCards = params.vehicles
    .map(
      (v) => `
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 12px 0; border: 1px solid #e5e7eb;">
        <h3 style="margin: 0 0 4px; font-size: 17px; color: #111827;">${v.name}</h3>
        <p style="margin: 0 0 12px; font-size: 13px; color: #6b7280;">${v.variant}</p>
        <p style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #10b981;">$${v.price.toLocaleString("en-CA")}</p>
        <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">Fuel: ${v.fuelEconomy}</p>
        <ul style="margin: 0; padding-left: 16px; font-size: 14px; color: #374151;">
          ${v.keyFeatures.map((f) => `<li style="margin: 4px 0;">${f}</li>`).join("")}
        </ul>
      </div>
    `,
    )
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 20px; color: #10b981; margin: 0;">Auto Advisor</h1>
      </div>
      <h2 style="font-size: 22px; color: #1f2937; margin-bottom: 8px;">Here's What We Discussed</h2>
      <p style="color: #6b7280; font-size: 15px;">${greeting}, here are the vehicles you showed interest in:</p>
      ${vehicleCards}
      ${params.personalNote ? `<div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;"><p style="margin: 0; font-size: 14px; color: #166534;">${params.personalNote}</p></div>` : ""}
      <p style="font-size: 15px; color: #374151; margin-top: 24px;">Ready for a test drive? Reply to this email and we'll get you booked in.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="font-size: 13px; color: #9ca3af;">Auto Advisor — 123 Auto Drive, Toronto, ON M5V 1A1</p>
    </div>
  `;

  return sendEmail({
    to: params.to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Your Vehicle Summary — ${params.vehicles.map((v) => v.name).join(" & ")}`,
    html,
  });
}

// ── Lead Notification (Internal) ──────────────────────────────────

export async function sendLeadNotification(params: {
  leadScore: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  vehiclesInterested: string[];
  conversationSummary: string;
  budgetRange?: { min?: number; max?: number };
}) {
  const badge =
    params.leadScore === "hot"
      ? "🔥 HOT LEAD"
      : params.leadScore === "warm"
        ? "WARM LEAD"
        : "Lead";

  const action =
    params.leadScore === "hot"
      ? "Call within 1 hour"
      : params.leadScore === "warm"
        ? "Send follow-up email within 24 hours"
        : "Add to nurture campaign";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: ${params.leadScore === "hot" ? "#fef2f2" : params.leadScore === "warm" ? "#fffbeb" : "#f9fafb"}; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 20px; border: 1px solid ${params.leadScore === "hot" ? "#fecaca" : params.leadScore === "warm" ? "#fde68a" : "#e5e7eb"};">
        <h2 style="margin: 0; font-size: 24px;">${badge}</h2>
      </div>

      <h3 style="margin: 0 0 12px; color: #1f2937;">Customer Details</h3>
      <table style="font-size: 14px; color: #374151; margin-bottom: 20px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Name:</td><td>${params.customerName ?? "Not provided"}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Email:</td><td>${params.customerEmail ?? "Not provided"}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Phone:</td><td>${params.customerPhone ?? "Not provided"}</td></tr>
        ${params.budgetRange ? `<tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Budget:</td><td>$${params.budgetRange.min?.toLocaleString("en-CA") ?? "?"} - $${params.budgetRange.max?.toLocaleString("en-CA") ?? "?"}</td></tr>` : ""}
      </table>

      <h3 style="margin: 0 0 8px; color: #1f2937;">Vehicles of Interest</h3>
      <ul style="font-size: 14px; color: #374151; padding-left: 16px;">
        ${params.vehiclesInterested.map((v) => `<li style="margin: 4px 0;">${v}</li>`).join("")}
      </ul>

      <h3 style="margin: 16px 0 8px; color: #1f2937;">Conversation Summary</h3>
      <p style="font-size: 14px; color: #374151; line-height: 1.6;">${params.conversationSummary}</p>

      <div style="background: #ecfdf5; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px; color: #065f46;"><strong>Suggested Action:</strong> ${action}</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: DEALERSHIP_EMAIL,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `${badge}: ${params.customerName ?? "Anonymous"} — ${params.vehiclesInterested[0] ?? "Vehicle inquiry"}`,
    html,
  });
}
