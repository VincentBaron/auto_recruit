export interface LocalTime {
  /** `YYYY-MM-DD` where the Recruiter is. */
  date: string;
  /** Minutes since midnight there. */
  minutes: number;
  /** 0 is Sunday, 1 is Monday. */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The date, time and weekday of `now` in an IANA timezone: the Recruiter's day, never the server's. */
export function localTime(now: Date, timezone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
    weekday: WEEKDAYS.indexOf(part("weekday")),
  };
}
