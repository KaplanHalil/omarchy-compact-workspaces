const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function load(file) {
  const context = {}
  vm.createContext(context)
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/^\.pragma library\s*/, ''),
    context,
    { filename: file })
  return context
}

const Logic = load('WorkspaceLogic.js')
const plain = value => JSON.parse(JSON.stringify(value))

const ws = (id, monitor) => ({ id, monitor })

test('closes a single gap and shifts everything above it down', () => {
  const plan = Logic.planCompaction([
    ws(1, 'DP-1'), ws(2, 'DP-1'), ws(3, 'DP-1'),
    ws(7, 'DP-1'), ws(8, 'DP-1'), ws(9, 'DP-1')
  ])
  assert.deepEqual(plain(plan), [
    { from: 7, to: 4, monitor: 'DP-1' },
    { from: 8, to: 5, monitor: 'DP-1' },
    { from: 9, to: 6, monitor: 'DP-1' }
  ])
})

test('leaves a contiguous sequence untouched', () => {
  const plan = Logic.planCompaction([ws(1, 'DP-1'), ws(2, 'DP-1'), ws(3, 'DP-1')])
  assert.deepEqual(plain(plan), [])
})

test('keeps the lowest id and closes gaps above it', () => {
  const plan = Logic.planCompaction([ws(11, 'DP-1'), ws(12, 'DP-1'), ws(14, 'DP-1')])
  assert.deepEqual(plain(plan), [{ from: 14, to: 13, monitor: 'DP-1' }])
})

test('replans later moves against the compacted sequence, not the old ids', () => {
  const plan = Logic.planCompaction([ws(1, 'DP-1'), ws(5, 'DP-1'), ws(7, 'DP-1')])
  assert.deepEqual(plain(plan), [
    { from: 5, to: 2, monitor: 'DP-1' },
    { from: 7, to: 3, monitor: 'DP-1' }
  ])
})

test('compacts two sequential monitor banks independently', () => {
  const plan = Logic.planCompaction([
    ws(1, 'DP-1'), ws(2, 'DP-1'), ws(4, 'DP-1'),
    ws(11, 'DP-2'), ws(12, 'DP-2'), ws(15, 'DP-2')
  ])
  assert.deepEqual(plain(plan), [
    { from: 4, to: 3, monitor: 'DP-1' },
    { from: 15, to: 13, monitor: 'DP-2' }
  ])
})

test('never steals an id owned by another monitor', () => {
  // Interleaved banks: odds on DP-1, evens on DP-2. Closing the apparent gap
  // on DP-1 would land on 2, which DP-2 already owns.
  const plan = Logic.planCompaction([
    ws(1, 'DP-1'), ws(3, 'DP-1'), ws(5, 'DP-1'),
    ws(2, 'DP-2'), ws(4, 'DP-2'), ws(6, 'DP-2')
  ])
  assert.deepEqual(plain(plan), [])
})

test('stops a monitor bank when its target is occupied elsewhere', () => {
  const plan = Logic.planCompaction([
    ws(1, 'DP-1'), ws(3, 'DP-1'), ws(5, 'DP-1'),
    ws(2, 'DP-2')
  ])
  // 3 would need 2 and 5 would need 3, but 2 belongs to DP-2.
  assert.deepEqual(plain(plan), [])
})

test('ignores special and malformed workspaces', () => {
  const plan = Logic.planCompaction([
    ws(-99, 'DP-1'), { id: 'special:scratchpad', monitor: 'DP-1' },
    { id: 'abc', monitor: 'DP-1' }, { id: null, monitor: 'DP-1' },
    null
  ])
  assert.deepEqual(plain(plan), [])
})

test('handles unsorted input and an onlyMonitor filter', () => {
  const plan = Logic.planCompaction([
    ws(9, 'DP-1'), ws(1, 'DP-1'), ws(3, 'DP-1'),
    ws(12, 'DP-2'), ws(14, 'DP-2')
  ], 'DP-2')
  assert.deepEqual(plain(plan), [{ from: 14, to: 13, monitor: 'DP-2' }])
})

test('does not move when only one workspace exists', () => {
  assert.deepEqual(plain(Logic.planCompaction([ws(7, 'DP-1')])), [])
})
