import { google } from "googleapis";
import { logger } from "./logger";

const TIMEZONE = process.env.TIMEZONE ?? "America/Toronto";
const BUSINESS_HOURS = { start: 9, end: 18 }; // 9 AM - 6 PM
const SLOT_DURATION = 30; // minutes
const CLOSED_DAYS = [0]; // Sunday

export interface TimeSlot {
  start: string;
  end: string;
  label: string;
  available: boolean;
}

function getCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!email || !key || !calendarId) {
    return null;
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return { calendar: google.calendar({ version: "v3", auth }), calendarId };
}

function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

/**
 * Get available time slots for a given date.
 * Returns slots during business hours that don't conflict with existing events.
 */
export async function getAvailableSlots(
  date: string,
  durationMinutes = SLOT_DURATION,
): Promise<TimeSlot[]> {
  // Parse date parts directly to avoid timezone issues
  const [year, month, day] = date.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day); // local time

  // Check if it's a closed day
  if (CLOSED_DAYS.includes(dateObj.getDay())) {
    return [];
  }

  // Check if date is in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateObj < today) {
    return [];
  }

  // Generate all possible slots during business hours
  const allSlots: TimeSlot[] = [];
  for (let h = BUSINESS_HOURS.start; h < BUSINESS_HOURS.end; h++) {
    for (let m = 0; m < 60; m += durationMinutes) {
      if (h === BUSINESS_HOURS.end - 1 && m + durationMinutes > 60) break;
      const startTime = formatTime(h, m);
      const endMinute = m + durationMinutes;
      const endHour = endMinute >= 60 ? h + 1 : h;
      const endMin = endMinute >= 60 ? endMinute - 60 : endMinute;
      const endTime = formatTime(endHour, endMin);

      allSlots.push({
        start: startTime,
        end: endTime,
        label: `${formatTimeLabel(startTime)} - ${formatTimeLabel(endTime)}`,
        available: true,
      });
    }
  }

  // Try to check Google Calendar for conflicts
  const client = getCalendarClient();
  if (!client) {
    logger.info("Google Calendar not configured — returning all slots as available");
    return allSlots;
  }

  try {
    const res = await client.calendar.events.list({
      calendarId: client.calendarId,
      timeMin: `${date}T${formatTime(BUSINESS_HOURS.start, 0)}:00-05:00`,
      timeMax: `${date}T${formatTime(BUSINESS_HOURS.end, 0)}:00-05:00`,
      singleEvents: true,
      orderBy: "startTime",
      timeZone: TIMEZONE,
    });

    const busyPeriods = (res.data.items ?? []).map((e) => ({
      start: e.start?.dateTime?.split("T")[1]?.slice(0, 5) ?? "",
      end: e.end?.dateTime?.split("T")[1]?.slice(0, 5) ?? "",
    }));

    // Mark slots as unavailable if they overlap with busy periods
    for (const slot of allSlots) {
      for (const busy of busyPeriods) {
        if (slot.start < busy.end && slot.end > busy.start) {
          slot.available = false;
          break;
        }
      }
    }

    return allSlots.filter((s) => s.available);
  } catch (err) {
    logger.warn({ err }, "Failed to check Google Calendar — returning all slots");
    return allSlots;
  }
}

/**
 * Create a Google Calendar event for a test drive booking.
 * Falls back gracefully if Google Calendar is unavailable.
 */
export async function createCalendarEvent(params: {
  date: string;
  startTime: string;
  endTime: string;
  customerName: string;
  customerEmail: string;
  vehicleName: string;
  notes?: string;
}): Promise<{ eventId: string; htmlLink: string } | null> {
  const client = getCalendarClient();
  if (!client) {
    logger.info("Google Calendar not configured — skipping event creation");
    return null;
  }

  try {
    const res = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        summary: `Test Drive — ${params.vehicleName} — ${params.customerName}`,
        description: [
          `Customer: ${params.customerName}`,
          `Email: ${params.customerEmail}`,
          `Vehicle: ${params.vehicleName}`,
          params.notes ? `Notes: ${params.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        start: {
          dateTime: `${params.date}T${params.startTime}:00`,
          timeZone: TIMEZONE,
        },
        end: {
          dateTime: `${params.date}T${params.endTime}:00`,
          timeZone: TIMEZONE,
        },
        // Note: Attendees require Domain-Wide Delegation for service accounts.
        // Customer is notified via SendGrid confirmation email instead.
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 60 },
            { method: "popup", minutes: 1440 },
          ],
        },
      },
    });

    return {
      eventId: res.data.id ?? "",
      htmlLink: res.data.htmlLink ?? "",
    };
  } catch (err) {
    logger.error({ err }, "Failed to create Google Calendar event");
    return null;
  }
}

/**
 * Cancel a Google Calendar event.
 */
export async function cancelCalendarEvent(eventId: string): Promise<boolean> {
  const client = getCalendarClient();
  if (!client) return false;

  try {
    await client.calendar.events.delete({
      calendarId: client.calendarId,
      eventId,
    });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to cancel Google Calendar event");
    return false;
  }
}

/**
 * Reschedule a Google Calendar event.
 */
export async function rescheduleCalendarEvent(params: {
  eventId: string;
  newDate: string;
  newStartTime: string;
  newEndTime: string;
}): Promise<{ eventId: string; htmlLink: string } | null> {
  const client = getCalendarClient();
  if (!client) return null;

  try {
    const res = await client.calendar.events.patch({
      calendarId: client.calendarId,
      eventId: params.eventId,
      requestBody: {
        start: {
          dateTime: `${params.newDate}T${params.newStartTime}:00`,
          timeZone: TIMEZONE,
        },
        end: {
          dateTime: `${params.newDate}T${params.newEndTime}:00`,
          timeZone: TIMEZONE,
        },
      },
    });

    return {
      eventId: res.data.id ?? params.eventId,
      htmlLink: res.data.htmlLink ?? "",
    };
  } catch (err) {
    logger.error({ err }, "Failed to reschedule Google Calendar event");
    return null;
  }
}
