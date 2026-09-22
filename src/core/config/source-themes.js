/**
 * The theme names his registry ships.
 *
 * Generated from `src/app/(preview)/lib/shadcn.ts` by `scripts/sync-source-themes.mjs`, not
 * hand-written. The config resolver runs under plain Node — in `doctor`, in the build scripts
 * and in the tests — where his TypeScript module cannot be imported, so the list is mirrored
 * here as data and a test asserts the two agree. That check is the point: it makes it
 * impossible for the admin to offer a theme his implementation has no variables for.
 *
 * @module core/config/source-themes
 */

/** @type {readonly string[]} */
export const SOURCE_THEME_NAMES = [
  'neutral', 'stone', 'zinc', 'mauve', 'olive', 'mist', 'taupe',
  'amber', 'blue', 'cyan', 'emerald', 'fuchsia', 'green', 'indigo',
  'lime', 'orange', 'pink', 'purple', 'red', 'rose', 'sky', 'teal',
  'violet', 'yellow',
]
