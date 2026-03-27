import { streamText, stepCountIs, type ModelMessage } from "ai";
import { tool } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { getLLM } from "@/lib/llm";
import { BOOKING_SYSTEM_PROMPT } from "@/prompts/booking";
import {
  getAvailableSlots,
  createCalendarEvent,
} from "@/lib/google-calendar";
import { saveBooking, updateBookingStatus, resolveVehicle } from "@/tools/booking-db";
import { sendBookingConfirmation } from "@/lib/email";
import type { Logger } from "pino";
import { logger as rootLogger } from "@/lib/logger";

const bookingTools = (sessionId: string, log: Logger) => ({
  check_available_slots: tool({
    description: "Check available time slots for a test drive on a given date. ALWAYS call this before suggesting times.",
    inputSchema: z.object({
      date: z.string().describe("Date in YYYY-MM-DD format"),
    }),
    execute: async (params) => {
      log.info({ tool: "check_available_slots", date: params.date }, "Checking available slots");

      // Parse date parts directly to avoid timezone issues
      const [year, month, day] = params.date.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);

      if (dateObj.getDay() === 0) {
        return { available: false, message: "We're closed on Sundays. How about Saturday or Monday?", slots: [] };
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateObj < today) {
        return { available: false, message: "That date has passed. Would you like to look at upcoming dates?", slots: [] };
      }

      const slots = await getAvailableSlots(params.date);
      log.info({ tool: "check_available_slots", slotCount: slots.length }, "Slots found");

      return {
        available: slots.length > 0,
        date: params.date,
        dayOfWeek: dateObj.toLocaleDateString("en-CA", { weekday: "long" }),
        slots: slots.slice(0, 8).map((s) => ({ time: s.label, start: s.start, end: s.end })),
        totalAvailable: slots.length,
      };
    },
  }),

  book_test_drive: tool({
    description: "Create a test drive booking. Requires vehicle (name or ID), date, time, customer name, and email.",
    inputSchema: z.object({
      vehicle_id: z.string().describe("Vehicle UUID or name (e.g., 'Tucson Ultimate AWD' or a UUID). The system will resolve names to IDs automatically."),
      date: z.string().describe("Date in YYYY-MM-DD format"),
      start_time: z.string().describe("Start time in HH:MM format (e.g., '10:00')"),
      end_time: z.string().describe("End time in HH:MM format (e.g., '10:30')"),
      customer_name: z.string().describe("Customer's full name"),
      customer_email: z.string().describe("Customer's email address"),
      customer_phone: z.string().optional().describe("Customer's phone number"),
      notes: z.string().optional().describe("Any special requests or notes"),
    }),
    execute: async (params) => {
      log.info({ tool: "book_test_drive", vehicleInput: params.vehicle_id, date: params.date, time: params.start_time }, "Booking test drive");

      // Resolve vehicle — accepts UUID or name (e.g., "Tucson Ultimate AWD")
      const resolved = await resolveVehicle(params.vehicle_id);
      if (!resolved) {
        return { error: `Could not find vehicle "${params.vehicle_id}" in our inventory. Please specify a vehicle from our catalog.` };
      }

      const vehicleId = resolved.id;
      const vehicleName = resolved.name;
      log.info({ tool: "book_test_drive", resolvedId: vehicleId, vehicleName }, "Vehicle resolved");

      // Create Google Calendar event
      const calendarResult = await createCalendarEvent({
        date: params.date,
        startTime: params.start_time,
        endTime: params.end_time,
        customerName: params.customer_name,
        customerEmail: params.customer_email,
        vehicleName,
        notes: params.notes,
      });

      // Save to DB
      const bookingId = await saveBooking({
        sessionId,
        vehicleId,
        customerName: params.customer_name,
        customerEmail: params.customer_email,
        customerPhone: params.customer_phone,
        preferredDate: params.date,
        preferredTime: params.start_time,
        calendarEventId: calendarResult?.eventId,
        vehicleInfo: { name: vehicleName },
        notes: params.notes,
      });

      // Send confirmation email
      const [yr, mo, dy] = params.date.split("-").map(Number);
      const dateFormatted = new Date(yr, mo - 1, dy).toLocaleDateString("en-CA", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const startLabel = formatTimeLabel(params.start_time);
      const endLabel = formatTimeLabel(params.end_time);

      await sendBookingConfirmation({
        to: params.customer_email,
        customerName: params.customer_name,
        vehicleName,
        vehicleVariant: resolved.name !== vehicleName ? resolved.name : "",
        date: dateFormatted,
        time: `${startLabel} - ${endLabel}`,
        location: "123 Auto Drive, Toronto, ON M5V 1A1",
        calendarLink: calendarResult?.htmlLink,
      });

      log.info({ tool: "book_test_drive", bookingId, calendarCreated: !!calendarResult }, "Booking created");

      return {
        bookingId,
        vehicleName,
        date: dateFormatted,
        time: `${startLabel} - ${endLabel}`,
        location: "123 Auto Drive, Toronto, ON M5V 1A1",
        calendarInviteSent: !!calendarResult,
        confirmationEmailSent: true,
      };
    },
  }),

  cancel_test_drive: tool({
    description: "Cancel an existing test drive booking.",
    inputSchema: z.object({
      booking_id: z.string().describe("The booking ID to cancel"),
    }),
    execute: async (params) => {
      log.info({ tool: "cancel_test_drive", bookingId: params.booking_id }, "Cancelling booking");
      await updateBookingStatus(params.booking_id, "cancelled");
      return { cancelled: true, message: "Your test drive has been cancelled. Would you like to reschedule for another time?" };
    },
  }),

  reschedule_test_drive: tool({
    description: "Reschedule an existing test drive to a new date/time.",
    inputSchema: z.object({
      booking_id: z.string().describe("The booking ID to reschedule"),
      new_date: z.string().describe("New date in YYYY-MM-DD format"),
      new_start_time: z.string().describe("New start time in HH:MM format"),
      new_end_time: z.string().describe("New end time in HH:MM format"),
    }),
    execute: async (params) => {
      log.info({ tool: "reschedule_test_drive", bookingId: params.booking_id, newDate: params.new_date }, "Rescheduling");
      await updateBookingStatus(params.booking_id, "rescheduled");

      const dateFormatted = new Date(`${params.new_date}T12:00:00`).toLocaleDateString("en-CA", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      return {
        rescheduled: true,
        newDate: dateFormatted,
        newTime: `${formatTimeLabel(params.new_start_time)} - ${formatTimeLabel(params.new_end_time)}`,
      };
    },
  }),
});

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

export function runBookingAgent(
  messages: ModelMessage[],
  sessionId: string,
  log?: Logger,
  onFinish?: (event: { text: string }) => void,
) {
  return streamText({
    model: getLLM(),
    system: BOOKING_SYSTEM_PROMPT,
    messages,
    tools: bookingTools(sessionId, log ?? rootLogger),
    stopWhen: stepCountIs(5),
    onFinish,
  });
}
