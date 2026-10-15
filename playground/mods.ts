// Where the bench finds the mods' surface modules (a `Client`'s `module`): every
// file under `mods/<mod>/hooks/`, loaded on demand. zen's bench knows no mods of
// its own, so the playground and Storybook hand it this with
// `configureClients({ resolve: modsResolver })`.
// (`configureClients` merges, so a later call that sets only `from` or `post` keeps it.)
import { resolverFrom } from '@bench/client'
import type { ClientResolver } from '@bench/client'

/** Every module under a mod's hooks folder, loaded on demand. */
export const modsResolver: ClientResolver = resolverFrom(import.meta.glob(['../mods/*/hooks/**/*.{tsx,ts,jsx,js,mjs}', '!**/*.test.{tsx,ts,jsx,js,mjs}']))
