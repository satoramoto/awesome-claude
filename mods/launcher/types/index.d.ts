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
 * - `running`: started from this session (or taken over) and answering;
 * - `elsewhere`: something this session didn't start answers on its port, and
 *   it is this configuration's server (its command line or working directory
 *   match), or there's no telling whose it is;
 * - `taken`: the process on its port is another one's (another configuration's
 *   on the same port, or another program);
 * - `failed`: started from this session and exited on its own with an error.
 */
export type Status = 'stopped' | 'starting' | 'running' | 'elsewhere' | 'taken' | 'failed'

/** A server this session didn't start but took over: Stop signals its process. */
export type Adopted = {
  pid: number
  port: number
  /**
   * When it started and its command line, as ps said when it was taken over:
   * Stop signals the pid only while ps still says both (not a later process
   * given the same pid).
   */
  start: string
  command: string
  /** When it was taken over (ms since epoch). */
  at: number
}

/** A Kill pressed once, waiting for the second press that confirms it. */
export type KillConfirm = {
  name: string
  /** The process the first press found on `port`, and who it was (as in Adopted): the second press signals it only if it's still that. */
  pid: number
  port: number
  start: string
  command: string
  /** When the confirm lapses (ms since epoch, the engine's clock). */
  until: number
}

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
  /**
   * While it answers: the CPU (percent of one core) of the process listening on
   * its port, one sample a tick while the pane is shown, oldest first (at most 60).
   * Absent when it can't be measured (no lsof or ps).
   */
  cpu?: number[]
  /** While it answers: that process's resident memory, in bytes, at the last sample. */
  rss?: number
  /** The process listening on its port when this session didn't start it (lsof), and its command line (ps). */
  pid?: number
  command?: string
  /** Running because it was taken over: its output isn't the launcher's to show. */
  adopted?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    launcher: {
      file: LaunchFile | null
      /** By configuration name. */
      servers: Record<string, Server>
      /** Configurations whose details and output are unfolded, by name. */
      open: string[]
      /** Servers taken over from elsewhere, by configuration name. */
      adopted: Record<string, Adopted>
      /** The row whose Kill waits for its confirming press, if any. */
      confirm: KillConfirm | null
      /** Whether a wide app pane flows its rows into columns (the footer's switch); on until flipped. */
      columns: boolean
    }
  }
}
