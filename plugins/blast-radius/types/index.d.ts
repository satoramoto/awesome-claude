// The state contract: what blast-radius keeps in `$.state`. The held call itself
// lives in the hooks module; only the person's view setting is state.

/** Whether a wide app pane flows the report's lines into columns (the footer's switch); on until flipped. */
export type ColumnsView = boolean

declare module 'claude-code' {
  interface PluginState {
    'blast-radius': {
      columns: ColumnsView
    }
  }
}
