import { describe, expect, it } from 'vitest'
import { arrange, moveBy, moveOnto, readOrder, writeOrder, ORDER_KEY } from './nav-order.js'
import { memoryStorage } from './testing.js'

const m = (id: string) => ({ id })
const ids = (list: readonly { id: string }[]) => list.map((x) => x.id)

const throwing = (): Storage => {
  throw new Error('blocked')
}

describe('arrange', () => {
  it('keeps the manifest order when nothing is saved', () => {
    expect(ids(arrange([m('d'), m('r'), m('t')], []))).toEqual(['d', 'r', 't'])
  })

  it('C4: follows the saved order and puts a module the save does not know at the end', () => {
    expect(ids(arrange([m('d'), m('r'), m('t')], ['r', 'd']))).toEqual(['r', 'd', 't'])
  })

  it('C4: ignores a saved id that is not in the manifest', () => {
    expect(ids(arrange([m('d'), m('r')], ['gone', 'r', 'd']))).toEqual(['r', 'd'])
  })
})

describe('moveOnto', () => {
  it('C1: the dragged module takes the place of the one it is dropped on, going up', () => {
    expect(moveOnto(['d', 'r', 't'], 't', 'd')).toEqual(['t', 'd', 'r'])
  })

  it('C1: the same, going down', () => {
    expect(moveOnto(['d', 'r', 't'], 'd', 't')).toEqual(['r', 't', 'd'])
  })

  it('leaves the order as it was when dropped on itself or on an unknown id', () => {
    expect(moveOnto(['d', 'r'], 'd', 'd')).toEqual(['d', 'r'])
    expect(moveOnto(['d', 'r'], 'x', 'd')).toEqual(['d', 'r'])
  })
})

describe('moveBy', () => {
  it('C3: moves one place up or down', () => {
    expect(moveBy(['d', 'r', 't'], 'r', -1)).toEqual(['r', 'd', 't'])
    expect(moveBy(['d', 'r', 't'], 'r', 1)).toEqual(['d', 't', 'r'])
  })

  it('stops at the ends', () => {
    expect(moveBy(['d', 'r'], 'd', -1)).toEqual(['d', 'r'])
    expect(moveBy(['d', 'r'], 'r', 1)).toEqual(['d', 'r'])
  })
})

describe('readOrder / writeOrder', () => {
  it('C2: reads back what was written', () => {
    const storage = memoryStorage()
    writeOrder(() => storage, ['t', 'd'])
    expect(readOrder(() => storage)).toEqual(['t', 'd'])
  })

  it('C5: an unreadable or malformed value reads as no order', () => {
    expect(readOrder(throwing)).toEqual([])
    expect(readOrder(() => undefined)).toEqual([])
    expect(readOrder(() => memoryStorage({ [ORDER_KEY]: '{' }))).toEqual([])
    expect(readOrder(() => memoryStorage({ [ORDER_KEY]: '{"a":1}' }))).toEqual([])
    expect(readOrder(() => memoryStorage({ [ORDER_KEY]: '["a",2]' }))).toEqual([])
  })

  it('C5: a storage that throws on write does not throw', () => {
    expect(() => writeOrder(throwing, ['d'])).not.toThrow()
  })
})
