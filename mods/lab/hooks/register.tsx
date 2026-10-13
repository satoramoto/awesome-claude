import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { flow, flowColumns, holdButtons, kit } from '@kit/ui'

import { GROUPS, byId, experiments, galleryExperiments } from './experiments'
import type { Experiment } from './experiments'

const INDEX = 'lab'
const PREFIX = 'lab-'
const GALLERY = 'lab-gallery'

/** Whether a wide app pane flows the index's groups and the gallery into columns; the footer's switch flips it. */
const columns = atom({ plugin: 'lab', key: 'columns' } as const, true)

/** The column view's switch for a render: as the state holds it, and a press that flips it. */
const flowSwitch = async ($: EngineInterface) => ({
  on: await read($, columns),
  toggle: () => void update($, columns, was => !was).catch(() => undefined),
})

/** Every experiment the desktop accepts, in one pane, for checking paint by eye. */
const openGallery = ($: EngineInterface) => $.ui.open({ id: GALLERY, title: 'Lab: gallery' })

const openExperiment = ($: EngineInterface, id: string) => {
  const x = byId(id)
  return $.ui.open({ id: PREFIX + id, title: x ? `Lab: ${x.title}` : id })
}

/**
 * The elements each surface's table declares (the types' `Elements`). The
 * table `$.ui.resolve` hands back answers every name on every surface: one a
 * surface lacks is a stand-in that draws an empty column Box, so asking it
 * says nothing, and this list is how the pane tells.
 */
const TABLES: Record<string, string[]> = {
  terminal: ['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code', 'Markdown', 'Client', 'Raster', 'Image'],
  desktop: ['Box', 'Text', 'Button', 'Input', 'Select', 'Svg', 'Link', 'Code', 'Markdown', 'Client'],
  vscode: ['Box', 'Text', 'Button', 'Input', 'Select', 'Svg', 'Link', 'Code', 'Markdown'],
  mobile: ['Box', 'Text', 'Button', 'Svg', 'Link', 'Code', 'Markdown'],
}

/**
 * The surface's elements, noting each one the experiment asked for that the
 * surface's table does not declare. For an element with no constructor at all
 * it hands the bare tag name, so the engine names it in its refusal rather
 * than the hook failing on an undefined constructor.
 */
const elementsOf = (table: object, surface: string, absent: Set<string>): any => {
  const listed = new Set(TABLES[surface] ?? Object.keys(table))
  return new Proxy(table, {
    get: (t: any, k) => {
      if (typeof k !== 'string') return t[k]
      if (!listed.has(k)) absent.add(k)
      return t[k] ?? k
    },
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lab',
      description: 'Open the rendering lab: experiments on what the engine draws (/lab <id> opens one)',
      argumentHint: '[experiment id]',
    })
    void $.ui.open({ id: INDEX, title: 'Lab' })
    return next(e)
  })

  on('command.run', { command: 'lab' }, async ($, e) => {
    const id = e.args.trim()
    if (!id) {
      await $.ui.open({ id: INDEX, title: 'Lab' })
      return { text: `Lab opened: ${experiments.length} experiments.` }
    }
    if (id === 'gallery') {
      await openGallery($)
      return { text: `Lab gallery opened: ${galleryExperiments().length} experiments the desktop accepts.` }
    }
    if (!byId(id)) return { text: `No experiment "${id}". Run /lab for the list.` }
    await openExperiment($, id)
    return { text: `Lab experiment ${id} opened.` }
  })

  // The index: every experiment by group, a row each that opens its pane.
  on('ui.render', { component: 'Pane', requestId: INDEX }, async ($, e) => {
    const sw = await flowSwitch($)
    // Buttons keep their press handles across redraws, so a click made just before one still lands.
    const table = holdButtons($.ui.resolve(e), e)
    const { Box, Button, Text } = table
    // The kit draws the footer with the column view's switch (wide app panes only).
    const k = kit(table as never, e.surface, e.props.bodyColumns, { flow: sw })
    return (
      <Box flexDirection="column" gap={1}>
        <Button key="gallery" variant="primary" label="Gallery" onPress={() => void openGallery($)} />
        <Text dimColor>
          {experiments.length} experiments on what the {e.surface} surface draws. Each opens in a pane of its own.
        </Text>
        {/* The groups in columns when the desktop pane is wide; one stack otherwise. */}
        {flow(Box, e.surface, e.props.bodyColumns, 'groups', GROUPS.map(group => (
          <Box key={`group-${group}`} flexDirection="column">
            <Text bold>{group}</Text>
            {experiments
              .filter(x => x.group === group)
              .map(x => {
                const note = `${x.id}${x.surfaces.length ? ` · ${x.surfaces.join(', ')}` : ' · expected refusal'}`
                // The desktop draws a Button's label alone, never a dim child Text: there the
                // title is the label and the note a dim Text beside it.
                return e.surface === 'terminal' ? (
                  <Button key={`open-${x.id}`} plain onPress={() => void openExperiment($, x.id)}>
                    {x.title}{' '}
                    <Text dimColor>{note}</Text>
                  </Button>
                ) : (
                  <Box key={`row-${x.id}`} flexDirection="row" gap={1}>
                    <Button key={`open-${x.id}`} plain label={x.title} onPress={() => void openExperiment($, x.id)} />
                    <Text dimColor wrap="truncate">
                      {note}
                    </Text>
                  </Box>
                )
              })}
          </Box>
        )), { gap: 1, single: !sw.on })}
        {k.footer()}
      </Box>
    )
  })

  // One pane per experiment, and the gallery, all drawn by this hook.
  on('ui.render', { component: 'Pane', requestId: /^lab-/ }, async ($, e) => {
    // One table for the whole render, the experiment's included, its Buttons keeping their press handles.
    const table = holdButtons($.ui.resolve(e), e)
    const { Box, Button, Text } = table
    const absent = new Set<string>()
    const els = elementsOf(table, e.surface, absent)
    // An element constructor may refuse its props as it is called (a bad
    // hotkey): that is a verdict too, drawn in place of the experiment.
    const drawBody = (x: Experiment) => {
      try {
        return x.draw(els, e.surface)
      } catch (err) {
        return <Text color="error">{`draw threw: ${String((err as Error)?.message ?? err)}`}</Text>
      }
    }
    if (e.requestId === GALLERY) {
      const sw = await flowSwitch($)
      const k = kit(table as never, e.surface, e.props.bodyColumns, { flow: sw })
      return (
        <Box flexDirection="column" gap={1}>
          {/* The experiments in columns when the desktop pane is wide, each clipped to its column; one stack otherwise. */}
          {flow(
            Box,
            e.surface,
            e.props.bodyColumns,
            'gallery',
            galleryExperiments().map((x, _i, all) => (
              <Box
                key={`x-${x.id}`}
                flexDirection="column"
                {...(flowColumns(e.surface, e.props.bodyColumns, all.length, { single: !sw.on }).count > 1 ? { minWidth: 0, overflow: 'hidden' } : {})}
              >
                <Text dimColor wrap="truncate-end">{`${x.id} — ${x.question}`}</Text>
                {drawBody(x)}
              </Box>
            )),
            { gap: 1, single: !sw.on },
          )}
          {k.footer()}
        </Box>
      )
    }
    const x = byId(e.requestId.slice(PREFIX.length))
    if (!x) return <Text dimColor>No such experiment.</Text>
    const body = drawBody(x)
    const listed = x.surfaces.includes(e.surface)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{x.title}</Text>
          <Text dimColor>{x.question}</Text>
          <Text dimColor>
            {x.group} · {x.id} ·{' '}
            {listed ? `meant for ${x.surfaces.join(', ')}` : x.surfaces.length ? `not meant for ${e.surface}` : 'expected refusal'}
          </Text>
          {absent.size > 0 && (
            <Text color="warning">
              {`absent from the ${e.surface} table: ${[...absent].join(', ')}`}
            </Text>
          )}
          <Button key="index" plain dimColor label="All experiments" onPress={() => void $.ui.open({ id: INDEX, title: 'Lab' })} />
        </Box>
        {body}
      </Box>
    )
  })

  // The Client round trip: the echo module posts a ping, this answers its next props.
  on('ui.message', { element: 'echo' }, async (_$, e) => {
    const data = e.data as { ping?: number } | null
    return { props: { pong: data?.ping ?? 0, via: e.surface } }
  })
}
