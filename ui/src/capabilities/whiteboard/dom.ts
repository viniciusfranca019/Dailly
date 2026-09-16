/**
 * Whiteboard DOM adapter — the vanilla renderer.
 *
 * Kept behind its own entry point so a consumer that brings its own renderer
 * never pulls DOM code into its bundle. The model it renders is
 * `@dailly/whiteboard-core`; when the renderer becomes Vue this adapter is
 * mounted into a ref'd element, not rewritten (ADR 0008 §2).
 */
import './adapters/dom/whiteboard.css'

export * from './adapters/dom/index.js'
