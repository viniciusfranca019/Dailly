import { UTC, isSupportedTimeZone, type TimeZone } from '@dailly/periods'

/**
 * Everything the server needs to boot, resolved once.
 *
 * The zone is the interesting one. [ADR 0007](../../docs/adrs/0007-api-local-e-tempo.md)
 * made it an **environment variable of this process**, defaulting to `UTC`,
 * and wrote down the limit of that choice: env is per process, not per session.
 * While the API serves one person it is correct; the day it serves two, the
 * zone becomes a column.
 */
export interface ServerConfig {
  /** SQLite file, or `:memory:` for a database that dies with the process. */
  readonly databaseFile: string
  readonly zone: TimeZone
  /**
   * Required on every request when set.
   *
   * ADR 0008 put this in Fase 1 rather than later: the API listens on
   * `127.0.0.1`, which every other process on the machine can reach, so without
   * it any program running as this user can read the diary. Absent in tests
   * that are not about auth.
   */
  readonly token?: string
  readonly host: string
  /** `0` asks the OS for a free port — which is what a desktop app should do. */
  readonly port: number
}

export class InvalidTimeZoneError extends Error {
  override readonly name = 'InvalidTimeZoneError'
  constructor(zone: string) {
    super(
      `DAILLY_TZ=${zone} não é um fuso conhecido. ` +
        'Use um nome IANA, como America/Sao_Paulo, ou deixe em branco para UTC.',
    )
  }
}

export interface ConfigInput {
  readonly databaseFile: string
  readonly zone?: string
  readonly token?: string
  readonly host?: string
  readonly port?: number
}

/**
 * Fails here, at boot, rather than on the first entry someone writes: a typo in
 * the zone is a startup error with a message, not a 500 next Tuesday.
 */
export function resolveConfig(input: ConfigInput): ServerConfig {
  const zone = input.zone?.trim() || UTC
  if (!isSupportedTimeZone(zone)) throw new InvalidTimeZoneError(zone)

  return {
    databaseFile: input.databaseFile,
    zone,
    ...(input.token ? { token: input.token } : {}),
    // Bind to loopback only. Not a default worth inheriting from anywhere:
    // `0.0.0.0` would put a personal diary on the local network.
    host: input.host ?? '127.0.0.1',
    port: input.port ?? 0,
  }
}
