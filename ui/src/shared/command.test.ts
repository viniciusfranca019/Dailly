// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { blockedByFocus, matchesShortcut } from './command.js'

const press = (key: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key, ...init })

describe('matchesShortcut', () => {
  it('takes Ctrl or Meta for a shortcut with the modifier, in any case of the key', () => {
    const shortcut = { key: 'k', mod: true }
    expect(matchesShortcut(press('k', { ctrlKey: true }), shortcut)).toBe(true)
    expect(matchesShortcut(press('K', { metaKey: true }), shortcut)).toBe(true)
    expect(matchesShortcut(press('k'), shortcut)).toBe(false)
    expect(matchesShortcut(press('k', { ctrlKey: true, altKey: true }), shortcut)).toBe(false)
  })

  it('takes the bare key for a shortcut without it, and not with Ctrl', () => {
    const shortcut = { key: 'c' }
    expect(matchesShortcut(press('c'), shortcut)).toBe(true)
    expect(matchesShortcut(press('c', { ctrlKey: true }), shortcut)).toBe(false)
  })
})

describe('blockedByFocus (RN15)', () => {
  const inside = (html: string) => {
    document.body.innerHTML = html
    return document.body.firstElementChild!
  }

  it('lets a shortcut with Ctrl/Meta through anywhere', () => {
    expect(blockedByFocus({ key: 'k', mod: true }, inside('<input>'))).toBe(false)
  })

  it('stops a bare shortcut in an input, a textarea, a select or an editable block', () => {
    for (const html of ['<input>', '<textarea></textarea>', '<select></select>', '<div contenteditable="true"></div>']) {
      expect(blockedByFocus({ key: 'c' }, inside(html))).toBe(true)
    }
    expect(blockedByFocus({ key: 'c' }, inside('<button></button>'))).toBe(false)
    expect(blockedByFocus({ key: 'c' }, null)).toBe(false)
  })
})
