/** Small DOM helpers shared by the renderers. */

export interface ElementOptions {
  readonly className?: string
  readonly text?: string
  readonly attrs?: Readonly<Record<string, string>>
  readonly children?: readonly Node[]
}

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  if (options.className) node.className = options.className
  if (options.text !== undefined) node.textContent = options.text
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value)
  }
  for (const child of options.children ?? []) node.appendChild(child)
  return node
}
