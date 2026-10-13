// The state contract: what the lab keeps in `$.state`.

/** Whether a wide app pane flows the index's groups and the gallery into columns (the footer's switch); on until flipped. */
export type ColumnsView = boolean

declare module 'claude-code' {
  interface PluginState {
    lab: {
      columns: ColumnsView
    }
  }
}
