import { parseInline } from '@dailly/whiteboard-core'

/**
 * The default inline renderer: the block's raw text with its code, bold, italic
 * and links formatted, and the markers gone (LAB-5). It only draws; the model
 * keeps the raw text, so the markdown that is saved never changes.
 */
export function renderInlineMarkdown(text: string, doc: Document): Node {
  const fragment = doc.createDocumentFragment()
  for (const segment of parseInline(text)) {
    let node: Node = doc.createTextNode(segment.text)
    if (segment.marks.has('code')) node = wrap(doc, 'code', node, 'wb-code')
    if (segment.marks.has('italic')) node = wrap(doc, 'em', node)
    if (segment.marks.has('bold')) node = wrap(doc, 'strong', node)
    if (segment.href !== undefined) {
      const link = wrap(doc, 'a', node, 'wb-link')
      link.setAttribute('href', segment.href)
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
      node = link
    }
    fragment.appendChild(node)
  }
  return fragment
}

function wrap(doc: Document, tag: string, child: Node, className?: string): HTMLElement {
  const element = doc.createElement(tag)
  if (className) element.className = className
  element.appendChild(child)
  return element
}
