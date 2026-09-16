/**
 * Whiteboard DOM adapter — the vanilla renderer.
 *
 * Kept behind its own entry point so `@whiteboard` stays DOM-free. If a product
 * module adopts React, only this adapter is replaced (or mounted through a ref);
 * the core is untouched.
 */
import './adapters/dom/whiteboard.css'

export * from './adapters/dom/index.js'
