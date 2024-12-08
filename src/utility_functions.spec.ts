import { getMostRecentlyModifiedFiles } from './utility_functions.js'
import { afterAll, beforeAll, suite, test, expect, vi } from 'vitest'
import { fs, vol } from 'memfs'
import assert from 'node:assert'

const BASEDIR = '/test'

vi.hoisted(() => {
  import('log4js')
    .then((log4js) => {
      log4js.getLogger('log4js').level = 'error'
    })
    .catch((err) => {
      console.error(err)
    })
})

vi.mock('node:fs')
vi.mock('node:fs/promises')

/* vi.mock('staffHurdles.js', () => ({
  default: {},
  loadStaffHurdles: vi.fn(() => ({
    bozo: 'the clown',
  })),
})) */

function beforeTest() {
  vol.fromJSON(
    {
      './non_empty_directory/file1.txt': 'file1 content',
      './non_empty_directory/file2.txt': 'file2 content',
      './non_empty_directory/file3.txt': 'file3 content',
      './non_empty_directory/file4.txt': 'file4 content',
      './empty_directory/': null,
    },
    BASEDIR
  )

  // Set different mtimes for the files
  const now = new Date()
  fs.utimesSync(
    `${BASEDIR}/non_empty_directory/file1.txt`,
    now,
    new Date('2022-01-01')
  )
  fs.utimesSync(
    `${BASEDIR}/non_empty_directory/file2.txt`,
    now,
    new Date('2022-01-03')
  )
  fs.utimesSync(
    `${BASEDIR}/non_empty_directory/file3.txt`,
    now,
    new Date('2022-01-02')
  )
  fs.utimesSync(
    `${BASEDIR}/non_empty_directory/file4.txt`,
    now,
    new Date('2022-01-04')
  )
}

function afterTest() {
  vol.reset()
}

suite('check setup', () => {
  beforeAll(beforeTest)
  afterAll(afterTest)
  test('non-empty test directory should contain files', () => {
    let dir1 = `${BASEDIR}/non_empty_directory`
    let count = 3
    let result1 = fs.readdirSync(dir1)
    expect(
      result1.length,
      'expect > 0 files in non-empty directory'
    ).toBeGreaterThan(0)
  })
  test('empty test directory should not contain files', () => {
    let dir2 = `${BASEDIR}/empty_directory`
    let result2 = fs.readdirSync(dir2)
    expect(result2.length, 'expect 0 files in empty directory').toBe(0)
  })
})

suite('getMostRecentlyModifiedFiles', () => {
  beforeAll(beforeTest)
  afterAll(afterTest)
  test('should return the most recently modified files in the directory', () => {
    const dir = `${BASEDIR}/non_empty_directory`
    const count = 3
    const result = getMostRecentlyModifiedFiles(dir, count)
    expect(
      result.sort(),
      `Result should be the ${count} most recently modified files`
    ).deep.equal(['file2.txt', 'file3.txt', 'file4.txt'])
  })

  test('should return an empty array if the directory is empty', () => {
    const dir = `${BASEDIR}/empty_directory`
    const count = 3
    const result = getMostRecentlyModifiedFiles(dir, count)
    expect(
      result,
      `expect array of ${count} recently modified files to be empty if directory empty`
    ).deep.equal([])
  })
  test('should return an empty array if the count is 0', () => {
    const dir = `${BASEDIR}/non_empty_directory`
    const count = 0
    const result = getMostRecentlyModifiedFiles(dir, count)
    expect(
      result,
      `expect array of ${count} recently modified files to be empty if count is 0`
    ).deep.equal([])
  })
  test('should return available files if count is greater than the number of files', () => {
    const dir = `${BASEDIR}/non_empty_directory`
    const count = 5
    const result = getMostRecentlyModifiedFiles(dir, count)
    expect(
      result.sort(),
      `Result should be all files if count ${count} is greater than the number of files in the directory ${result.length}`
    ).deep.equal(['file1.txt', 'file2.txt', 'file3.txt', 'file4.txt'])
  })
})
