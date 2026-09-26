/**
 * Structured logging: one JSON object per line on stdout, which Docker and any log shipper can
 * parse. Deliberately never includes client IP addresses: the site keeps no tracking data.
 */

/** How serious a log entry is. */
export type LogLevel = "info" | "warn" | "error";

/** Extra fields on a log entry. */
export type LogFields = Readonly<Record<string, string | number | boolean | undefined>>;

/** Writes one log entry. */
export type Logger = (level: LogLevel, message: string, fields?: LogFields) => void;

/** A logger that writes JSON lines through `write` (stdout by default). */
export function createLogger(
  write: (line: string) => void = (line) => process.stdout.write(line),
  clock: () => Date = () => new Date(),
): Logger {
  return (level, message, fields = {}) => {
    write(`${JSON.stringify({ time: clock().toISOString(), level, message, ...fields })}\n`);
  };
}

/** Turns an unknown thrown value into loggable fields. */
export function errorFields(error: unknown): LogFields {
  return error instanceof Error
    ? { error: error.message, stack: error.stack }
    : { error: String(error) };
}
