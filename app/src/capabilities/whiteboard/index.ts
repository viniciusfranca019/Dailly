/**
 * Whiteboard — a capability, not a product module.
 *
 * Markdown in, interactive block tree out, markdown back. It knows nothing
 * about Entry, persistence or ports: product modules (`src/modules/*`) consume
 * it, never the reverse. This entry point is **DOM-free** — the rendering
 * adapter lives behind `@whiteboard/dom`, so a consumer that brings its own
 * renderer never pulls DOM code into its bundle.
 *
 * The seam with the product is markdown, and it already exists:
 *
 *   const body = doc.toMarkdown()   // persist
 *   doc.setMarkdown(entry.body)     // restore
 */
export * from './core/index.js'
