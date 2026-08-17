/**
 * A minimal zip reader.
 *
 * Two formats this project ingests are zip containers: a DOCX file and a LinkedIn data
 * export. Reading them needs no dependency — the central directory is a documented,
 * fixed-layout structure and Node ships the one decompressor involved.
 *
 * Node-only: `zlib` is imported dynamically so a bundler tracing the browser entry never
 * pulls it in. Nothing in the browser path reaches this file — the browser reads the
 * *output* of ingestion, never a raw document.
 *
 * @module core/documents/zip
 */

const SIGNATURE = {
  endOfCentralDirectory: 0x06054b50,
  centralDirectory: 0x02014b50,
  localFile: 0x04034b50,
}

/**
 * @typedef {object} ZipEntry
 * @property {string} name
 * @property {number} size          Uncompressed size, as declared by the archive.
 * @property {() => Promise<Buffer|null>} bytes
 * @property {() => Promise<string|null>} text
 */

/**
 * List the entries in a zip archive.
 *
 * Returns an empty array rather than throwing when the buffer is not a zip, because the
 * caller's next move is the same either way: report that the file could not be read.
 *
 * @param {Buffer} buffer
 * @returns {ZipEntry[]}
 */
export function readZip(buffer) {
  if (!buffer || buffer.length < 22) return []

  // The end-of-central-directory record is last, but may be followed by a comment of up to
  // 64 kB, so it is found by scanning backwards for its signature.
  let eocd = -1
  const floor = Math.max(0, buffer.length - 66_000)
  for (let i = buffer.length - 22; i >= floor; i -= 1) {
    if (buffer.readUInt32LE(i) === SIGNATURE.endOfCentralDirectory) { eocd = i; break }
  }
  if (eocd === -1) return []

  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)

  /** @type {ZipEntry[]} */
  const entries = []

  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buffer.length) break
    if (buffer.readUInt32LE(offset) !== SIGNATURE.centralDirectory) break

    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)

    const readBytes = async () => {
      if (localOffset + 30 > buffer.length) return null
      if (buffer.readUInt32LE(localOffset) !== SIGNATURE.localFile) return null

      // The local header repeats the name and extra-field lengths, and they may differ from
      // the central directory's. The local ones are authoritative for locating the data.
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + localNameLength + localExtraLength
      const data = buffer.subarray(start, start + compressedSize)

      if (method === 0) return Buffer.from(data)
      if (method !== 8) return null

      const zlib = await import('node:zlib')
      return new Promise((resolve) => {
        zlib.inflateRaw(data, (err, out) => resolve(err ? null : out))
      })
    }

    entries.push({
      name,
      size: uncompressedSize,
      bytes: readBytes,
      async text() {
        const out = await readBytes()
        return out ? out.toString('utf8') : null
      },
    })

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/**
 * Read one named entry, matched case-insensitively.
 *
 * @param {Buffer} buffer
 * @param {string|RegExp} name
 * @returns {Promise<string|null>}
 */
export async function readZipEntryText(buffer, name) {
  const entries = readZip(buffer)
  const match = typeof name === 'string'
    ? entries.find((e) => e.name.toLowerCase() === name.toLowerCase())
    : entries.find((e) => name.test(e.name))
  return match ? match.text() : null
}
