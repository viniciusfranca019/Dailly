import { describe, expect, it } from 'vitest'
import { CommentRequiredError, normalizeCommentBody } from './comment.js'

describe('the comment body (#45 C2, C3)', () => {
  it('keeps the markdown, trimmed at the ends', () => {
    expect(normalizeCommentBody('\n ele vem **quinta**\n\n')).toBe('ele vem **quinta**')
    expect(normalizeCommentBody('- um\n- dois')).toBe('- um\n- dois')
  })

  it('is required: empty, spaces and blank lines count as empty', () => {
    for (const body of ['', '   ', '\n\n  \n', '\t']) {
      expect(() => normalizeCommentBody(body)).toThrow(CommentRequiredError)
    }
    expect(() => normalizeCommentBody(' ')).toThrow('o comentário é obrigatório')
  })
})
