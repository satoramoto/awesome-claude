/** One entry of `.claude/launch.json`'s `configurations`, as the desktop app reads it. */
export type LaunchConfig = {
  name: string
  runtimeExecutable: string
  runtimeArgs: string[]
  port: number
  /** Relative to the project root (the folder holding `.claude/`); absent, the root. */
  cwd?: string
  env?: Record<string, string>
  /** When the port is taken, run on the next free one instead. */
  autoPort?: boolean
}

/** The project's `.claude/launch.json`, as last read. */
export type LaunchFile = {
  /** The folder holding `.claude/launch.json`; empty when none was found. */
  root: string
  configs: LaunchConfig[]
  /** Why there's nothing to show (no file, unreadable JSON). */
  note?: string
  /** When it was read (ms since epoch). */
  at: number
}

/**
 * - `stopped`: nothing answers on its port;
 * - `starting`: started from this session, its port not answering yet;
 * - `running`: started from this session and answering;
 * - `elsewhere`: something this session didn't start answers on its port;
 * - `failed`: started from this session and exited on its own with an error.
 */
export type Status = 'stopped' | 'starting' | 'running' | 'elsewhere' | 'failed'

/** One configuration's server as the pane draws it. */
export type Server = {
  status: Status
  /** The port it runs on: the configuration's, or the free one `autoPort` picked. */
  port: number
  /** The last lines it wrote, oldest first (at most 200). */
  log: string[]
  /** How it last ended: its exit code, null for a signal or while it runs. */
  code: number | null
  /** When this session started it (ms since epoch); 0 when it didn't. */
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    launcher: {
      file: LaunchFile | null
      /** By configuration name. */
      servers: Record<string, Server>
      /** Configurations whose details and output are unfolded, by name. */
      open: string[]
    }
  }
}
