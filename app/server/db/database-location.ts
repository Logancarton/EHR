import path from "node:path";

/**
 * Where the clinical database lives.
 *
 * Development defaults to `data/ehr.db` under the working directory, which is what
 * every test and local run expects. Production must say explicitly, because the
 * default resolves relative to whatever directory the process happened to start in
 * — on a deployment that is a database that silently moves, or is created empty,
 * when the service is restarted from elsewhere. A clinical record store is not
 * something to locate by accident.
 */

export const DATABASE_PATH_VAR = "EHR_DATABASE_PATH";

export class DatabaseLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseLocationError";
  }
}

export type DatabaseLocationInput = {
  configuredPath?: string;
  nodeEnv?: string;
  cwd: string;
};

export type DatabaseLocation = {
  directory: string;
  file: string;
  /** True when the path came from configuration rather than the development default. */
  explicit: boolean;
};

export function resolveDatabaseLocation(input: DatabaseLocationInput): DatabaseLocation {
  const configured = input.configuredPath?.trim();
  const isProduction = input.nodeEnv === "production";

  if (configured) {
    // A relative path in production is the same accident as no path at all: it
    // still depends on the working directory the service was started from.
    if (isProduction && !path.isAbsolute(configured)) {
      throw new DatabaseLocationError(
        `${DATABASE_PATH_VAR} must be an absolute path in production; received "${configured}".`,
      );
    }
    const file = path.resolve(input.cwd, configured);
    return { directory: path.dirname(file), file, explicit: true };
  }

  if (isProduction) {
    throw new DatabaseLocationError(
      `${DATABASE_PATH_VAR} must be set in production. Refusing to place clinical records at a path derived from the working directory.`,
    );
  }

  const directory = path.join(input.cwd, "data");
  return { directory, file: path.join(directory, "ehr.db"), explicit: false };
}
