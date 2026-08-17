/**
 * Markdown and plain text.
 *
 * The most reliable text route, because Markdown states its headings rather than leaving
 * them to be guessed from capitalisation and line length.
 *
 * @module core/documents/importers/text
 */

import { parseResumeLines } from '../resume-text.js'

/** @type {import('../types.js').DocumentImporter} */
const textImporter = {
  id: 'text',
  name: 'Markdown / plain text',
  extensions: ['.md', '.markdown', '.txt', '.text', ''],
  method: 'markup',
  limits:
    'Read by its headings. A résumé without headings such as "Experience" or "Education" '
    + 'yields little beyond the name and contact details.',

  extract(input, ctx) {
    const text = input.text ?? decode(input.bytes)
    if (!text?.trim()) {
      return { ok: false, reason: 'The file is empty.' }
    }

    const lines = text.split(/\r?\n/).map((raw, index) => {
      const trimmed = raw.trim()
      const atx = /^(#{1,6})\s+(.*)$/.exec(trimmed)
      return {
        text: atx ? atx[2] : trimmed,
        index,
        heading: Boolean(atx),
        ...(atx ? { level: atx[1].length } : {}),
      }
    })

    // Setext headings — a line underlined with === or --- — are common in exported résumés
    // and would otherwise read as content followed by punctuation noise.
    for (let i = 1; i < lines.length; i += 1) {
      if (/^(=|-){3,}$/.test(lines[i].text) && lines[i - 1].text) {
        lines[i - 1].heading = true
        lines[i - 1].level = lines[i].text.startsWith('=') ? 1 : 2
        lines[i].text = ''
      }
    }

    const { profile, evidence, warnings } = parseResumeLines(lines, {
      documentId: ctx.documentId,
      filename: input.filename,
    })

    return {
      ok: true,
      document: {
        meta: {
          id: ctx.documentId,
          filename: input.filename,
          type: ctx.type,
          mediaType: /\.md|\.markdown$/i.test(input.filename) ? 'text/markdown' : 'text/plain',
          importedAt: new Date(ctx.now).toISOString(),
          extraction: 'markup',
          extractor: 'text@1.0',
          bytes: input.bytes?.length,
        },
        profile,
        evidence,
        warnings,
      },
    }
  },
}

/** @param {Uint8Array|undefined} bytes */
function decode(bytes) {
  if (!bytes) return ''
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')
}

export default textImporter
