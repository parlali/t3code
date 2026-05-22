import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatElapsedDurationLabel,
  formatExpiresInLabel,
  formatMessageTimestamp,
  formatRelativeTimeUntilLabel,
  getTimestampFormatOptions,
  isSameLocalCalendarDay,
} from "./timestampFormat";

describe("getTimestampFormatOptions", () => {
  it("omits hour12 when locale formatting is requested", () => {
    expect(getTimestampFormatOptions("locale", true)).toEqual({
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  });

  it("builds a 12-hour formatter with seconds when requested", () => {
    expect(getTimestampFormatOptions("12-hour", true)).toEqual({
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  });

  it("builds a 24-hour formatter without seconds when requested", () => {
    expect(getTimestampFormatOptions("24-hour", false)).toEqual({
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    });
  });
});

describe("isSameLocalCalendarDay", () => {
  it("returns true for the same local calendar day", () => {
    const now = new Date();
    const sameDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    expect(isSameLocalCalendarDay(sameDay.toISOString(), now.getTime())).toBe(true);
  });

  it("returns false for a different local calendar day", () => {
    const now = new Date();
    const previousDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    expect(isSameLocalCalendarDay(previousDay.toISOString(), now.getTime())).toBe(false);
  });
});

describe("formatMessageTimestamp", () => {
  it("shows time only for messages from today", () => {
    const now = new Date();
    const sameDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30, 0);
    const formatted = formatMessageTimestamp(sameDay.toISOString(), "24-hour", now.getTime());
    expect(formatted).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(formatted).not.toContain(String(now.getFullYear()));
  });

  it("includes the date for messages from another day in the same year", () => {
    const now = new Date();
    const previousDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 8, 30, 0);
    const formatted = formatMessageTimestamp(previousDay.toISOString(), "24-hour", now.getTime());
    expect(formatted).toContain(String(previousDay.getDate()));
    expect(formatted).toMatch(/,/);
  });

  it("includes the year for messages from another year", () => {
    const now = new Date();
    const previousYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 8, 30, 0);
    const formatted = formatMessageTimestamp(previousYear.toISOString(), "24-hour", now.getTime());
    expect(formatted).toContain(String(previousYear.getFullYear()));
  });
});

describe("formatRelativeTimeUntilLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Expired when the instant is in the past", () => {
    expect(formatRelativeTimeUntilLabel("2026-04-07T11:59:00.000Z")).toBe("Expired");
  });

  it("formats seconds remaining", () => {
    expect(formatRelativeTimeUntilLabel("2026-04-07T12:00:45.000Z")).toBe("45s left");
  });

  it("formats minutes remaining", () => {
    expect(formatRelativeTimeUntilLabel("2026-04-07T12:15:00.000Z")).toBe("15m left");
  });

  it("formats hours remaining", () => {
    expect(formatRelativeTimeUntilLabel("2026-04-07T18:00:00.000Z")).toBe("6h left");
  });
});

describe("formatExpiresInLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Expired when the instant is in the past", () => {
    expect(formatExpiresInLabel("2026-04-07T11:59:00.000Z")).toBe("Expired");
  });

  it("uses sub-minute second count", () => {
    expect(formatExpiresInLabel("2026-04-07T12:00:45.000Z")).toBe("Expires in 45s");
  });

  it("uses minutes and seconds under one hour", () => {
    expect(formatExpiresInLabel("2026-04-07T12:04:12.000Z")).toBe("Expires in 4m 12s");
    expect(formatExpiresInLabel("2026-04-07T12:15:00.000Z")).toBe("Expires in 15m");
  });

  it("uses hours with minute and second remainder", () => {
    expect(formatExpiresInLabel("2026-04-07T14:02:03.000Z")).toBe("Expires in 2h 2m 3s");
    expect(formatExpiresInLabel("2026-04-07T18:00:00.000Z")).toBe("Expires in 6h");
  });
});

describe("formatElapsedDurationLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns just now when the instant is current or in the future", () => {
    expect(formatElapsedDurationLabel("2026-04-07T12:00:00.000Z")).toBe("just now");
    expect(formatElapsedDurationLabel("2026-04-07T12:01:00.000Z")).toBe("just now");
  });

  it("formats seconds, minutes, hours, and days", () => {
    expect(formatElapsedDurationLabel("2026-04-07T11:59:45.000Z")).toBe("15s");
    expect(formatElapsedDurationLabel("2026-04-07T11:45:00.000Z")).toBe("15m");
    expect(formatElapsedDurationLabel("2026-04-07T06:00:00.000Z")).toBe("6h");
    expect(formatElapsedDurationLabel("2026-04-03T12:00:00.000Z")).toBe("4d");
  });
});
