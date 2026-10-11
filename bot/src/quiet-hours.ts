/** Whether the bot must keep quiet: between 20:00 and 08:00 where the Recruiter is. */
export function isQuietHours(now: Date, timezone: string): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(now),
  );
  return hour >= 20 || hour < 8;
}
