/**
 * A deliberately small YAML reader.
 *
 * Handles what a profile document actually uses: nested maps, lists of scalars, and lists
 * of maps. It returns `null` on anything it does not understand rather than producing a
 * silently wrong object — a mangled import is worse than a refused one, because the user
 * would have no way to tell it had happened.
 *
 * A full YAML parser is a large dependency for one optional import path. If a document
 * needs one, the honest answer is to convert it, and the importer says so.
 *
 * @module core/documents/yaml
 */

/**
 * @param {string} text
 * @returns {any|null}
 */
export function parseSimpleYaml(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  // Anchors, aliases, merge keys and block scalars all change the meaning of what follows,
  // so a reader that ignored them would produce confidently wrong output. An anchor sits in
  // *value* position — `key: &name` — not at the start of a line, which is why this matches
  // after a colon or a list dash as well as at the margin.
  if (/(^|:\s+|-\s+)[&*]\S/m.test(text)) return null
  if (/<<\s*:/.test(text)) return null
  if (/:\s*[|>][-+]?\s*$/m.test(text)) return null

  const root = {}
  /** @type {{indent: number, value: any}[]} */
  const stack = [{ indent: -1, value: root }]

  const lines = text.split(/\r?\n/)

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i]
    const line = rawLine.replace(/\s+#.*$/, '')
    if (!line.trim() || line.trim().startsWith('#') || line.trim() === '---') continue

    const indent = line.length - line.trimStart().length
    const content = line.trim()

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const parent = stack[stack.length - 1].value

    const item = /^-\s*(.*)$/.exec(content)
    if (item) {
      if (!Array.isArray(parent)) return null
      const inner = item[1]
      const pair = /^([\w.$-]+):\s*(.*)$/.exec(inner)
      if (pair) {
        const entry = {}
        parent.push(entry)
        stack.push({ indent, value: entry })
        if (pair[2]) {
          entry[pair[1]] = scalar(pair[2])
        } else {
          const child = nextIsList(lines, i) ? [] : {}
          entry[pair[1]] = child
          stack.push({ indent: indent + 1, value: child })
        }
      } else if (inner) {
        parent.push(scalar(inner))
      }
      continue
    }

    const pair = /^([\w.$-]+):\s*(.*)$/.exec(content)
    if (!pair) return null
    const [, key, value] = pair
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue

    if (value) {
      parent[key] = scalar(value)
    } else {
      // A key with no value opens either a map or a list, and which one is only knowable
      // from the next non-blank line.
      const container = nextIsList(lines, i) ? [] : {}
      parent[key] = container
      stack.push({ indent, value: container })
    }
  }

  return root
}

/**
 * Whether the next meaningful line begins a list.
 *
 * Scans forward by index rather than searching the text for the current line, which would
 * find the wrong occurrence whenever two lines happen to be identical — common in a
 * document with repeated keys.
 *
 * @param {string[]} lines
 * @param {number} from
 */
function nextIsList(lines, from) {
  for (let i = from + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) continue
    return /^\s*-\s/.test(line)
  }
  return false
}

/** @param {string} raw */
function scalar(raw) {
  const value = raw.trim().replace(/^["'](.*)["']$/, '$1')
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '~') return null
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}
