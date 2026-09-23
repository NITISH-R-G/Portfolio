import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PATHS } from '../../scripts/lib/portfolio.mjs'

/**
 * Give this test process its own `portfolio.config.js`, and point the config writers at it.
 *
 * Two suites save through the real writers — `patchConfigFile` directly, and the admin sidecar
 * over HTTP — and until this existed both did it to the repository's own config, restoring a
 * snapshot afterwards. Node runs test files in parallel processes, so the two overlapped in CI:
 * one planted a deliberately broken file while the other was reading, each restored the other's
 * half-written state, and three assertions failed. Worse, the same race could pass and leave
 * the checkout's config altered, which the deploy would then have built.
 *
 * So each process gets a copy in a directory of its own. The writers read `PATHS.config` at call
 * time, which is why repointing it here reaches them — including through the sidecar, which runs
 * in this process. Everything is still real: a real file on a real disk, written by the real
 * functions, read back from disk by the assertions.
 *
 * The copy has to be importable exactly like the original, because `readUserConfig` imports it.
 * The config's first line is `import { defineConfig } from './src/core/config/types.js'`, so the
 * one module it needs is copied beside it. `types.js` imports nothing, which keeps that to a
 * single file rather than a mirror of `src/`.
 *
 * @returns {{path: string, restore: () => void}}
 */
export function isolateConfig() {
  const real = PATHS.config
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-config-'))
  const copy = path.join(dir, 'portfolio.config.js')

  // The repository's package.json is what makes the original an ES module. The copy lives
  // outside it, so the same scope is declared here rather than left to syntax detection —
  // which Node only enables by default from 22.7, while `engines` admits any 22.x.
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n')

  fs.copyFileSync(real, copy)
  const types = path.join(dir, 'src', 'core', 'config', 'types.js')
  fs.mkdirSync(path.dirname(types), { recursive: true })
  fs.copyFileSync(path.join(PATHS.root, 'src', 'core', 'config', 'types.js'), types)

  PATHS.config = copy

  return {
    path: copy,
    restore() {
      PATHS.config = real
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}
