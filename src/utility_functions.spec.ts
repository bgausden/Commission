import * as utility_functions from './utility_functions.js'
import { afterAll, beforeAll, suite, test, expect, vi } from 'vitest'
import { fs, vol } from 'memfs'
import assert from 'node:assert'

const BASEDIR = '/src/__tests__/fixtures'

vi.mock('./utility_functions.js')

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
  //test('non-empty test directory should contain files', () => {
  let dir1 = `${BASEDIR}/non_empty_directory`
  let count = 3
  let result1 = fs.readdirSync(dir1)
  assert(result1.length > 0, 'Directory should contain files')
  //})
  //test('empty test directory should not contain files', () => {
  let dir2 = `${BASEDIR}/empty_directory`
  let result2 = fs.readdirSync(dir2)
  assert.strictEqual(result2.length, 0, 'Directory should be empty')
  //})
}

function afterTest() {
  vol.reset()
}

suite('getMostRecentlyModifiedFiles', () => {
  beforeAll(beforeTest)
  afterAll(afterTest)
  test('should return the most recently modified files in the directory', () => {
    const dir = `${BASEDIR}/non_empty_directory`
    const count = 3
    const result = utility_functions.getMostRecentlyModifiedFiles(dir, count)
    expect(result.sort()).deep.equal(
      ['file2.txt', 'file3.txt', 'file4.txt'],
      'Result should be the ${count} most recently modified files'
    )

    /* assert.deepStrictEqual(result.sort(), [
      'file2.txt',
      'file3.txt',
      'file4.txt',
    ]) */
  })

  test('should return an empty array if the directory is empty', () => {
    const dir = `${BASEDIR}/empty_directory`
    const count = 3
    const result = utility_functions.getMostRecentlyModifiedFiles(dir, count)
    assert.deepStrictEqual(result, [], 'Result should be an empty array')
  })
  test('should return an empty array if the count is 0', () => {
    const dir = `${BASEDIR}/non_empty_directory`
    const count = 0
    const result = utility_functions.getMostRecentlyModifiedFiles(dir, count)
    assert.deepStrictEqual(result, [], 'Result should be 0 if count is 0')
  })
})
