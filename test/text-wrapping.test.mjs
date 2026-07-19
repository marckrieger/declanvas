import assert from 'node:assert/strict'
import test from 'node:test'

import { createCanvas } from '../dist/index.js'

function installCanvas(widthPerCharacter = 10) {
  const fillTextCalls = []

  const context = {
    canvas: undefined,
    fillStyle: '',
    font: '',
    drawImage() {},
    fillRect() {},
    fillText(text, x, y) {
      fillTextCalls.push({ text, x, y })
    },
    measureText(text) {
      return {
        width: text.length * widthPerCharacter,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }
    },
    restore() {},
    save() {},
  }

  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas')
      const canvas = {
        width: 0,
        height: 0,
        getContext(kind) {
          assert.equal(kind, '2d')
          return context
        },
      }
      context.canvas = canvas
      return canvas
    },
  }

  return fillTextCalls
}

test('wraps text within the canvas and container padding', async () => {
  const calls = installCanvas()

  await createCanvas({
    width: 100,
    height: 100,
    elements: [{
      kind: 'container',
      padding: 10,
      children: [
        { kind: 'text', text: 'one two x', fontSize: 10 },
        { kind: 'text', text: 'after', fontSize: 10 },
      ],
    }],
  })

  assert.deepEqual(calls.map(({ text }) => text), ['one two', 'x', 'after'])
  assert.deepEqual(calls.map(({ x, y }) => ({ x, y })), [
    { x: 10, y: 20 },
    { x: 10, y: 30 },
    { x: 10, y: 40 },
  ])
})

test('preserves explicit line breaks', async () => {
  const calls = installCanvas()

  await createCanvas({
    width: 200,
    height: 100,
    elements: [{
      kind: 'container',
      children: [{ kind: 'text', text: 'first\nsecond', fontSize: 10 }],
    }],
  })

  assert.deepEqual(calls.map(({ text }) => text), ['first', 'second'])
})

test('splits a word that is wider than the available space', async () => {
  const calls = installCanvas()

  await createCanvas({
    width: 50,
    height: 100,
    elements: [{
      kind: 'container',
      children: [{ kind: 'text', text: 'abcdefgh', fontSize: 10 }],
    }],
  })

  assert.deepEqual(calls.map(({ text }) => text), ['abcde', 'fgh'])
})
