import assert from 'node:assert/strict'
import test from 'node:test'
import { hasMathToken, hasRichPreviewToken } from '../src/lib/math.ts'

test('hasMathToken detects inline and block math', () => {
  assert.equal(hasMathToken('plain text'), false)
  assert.equal(hasMathToken('solve $x+y$ first'), true)
  assert.equal(hasMathToken('$$x^2$$'), true)
})

test('hasRichPreviewToken stays off for plain multiline text and Chinese numbered notes', () => {
  assert.equal(hasRichPreviewToken('聚焦三件事\n1、科研+学习技能\n2、外包一次\n3、身体健康'), false)
  assert.equal(hasRichPreviewToken('just a plain paragraph\nwrapped to the next line'), false)
})

test('hasRichPreviewToken turns on for markdown and math constructs', () => {
  assert.equal(hasRichPreviewToken('1. first\n2. second'), true)
  assert.equal(hasRichPreviewToken('- item one\n- item two'), true)
  assert.equal(hasRichPreviewToken('see [repo](https://example.com)'), true)
  assert.equal(hasRichPreviewToken('![图片](task-image:abc)'), true)
  assert.equal(hasRichPreviewToken('inline `code` sample'), true)
  assert.equal(hasRichPreviewToken('equation $x^2$'), true)
})
