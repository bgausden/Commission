import { getMostRecentlyModifiedFiles } from '../src/utility_functions.js'
import fs, { Dirent } from 'fs'
describe('getMostRecentlyModifiedFiles', () => {
  it('should return the most recently modified files in the directory', () => {
    const dir = '/path/to/directory'
    const count = 3
    // Mock the fs.readdirSync and fs.statSync functions

    jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue([
        { name: 'file1.txt' } as Dirent,
        { name: 'file2.txt' } as Dirent,
        { name: 'file3.txt' } as Dirent,
      ])
    jest
      .spyOn(fs, 'statSync')
      .mockReturnValueOnce({ mtime: new Date('2022-01-01') } as fs.Stats)
      .mockReturnValueOnce({ mtime: new Date('2022-01-03') } as fs.Stats)
      .mockReturnValueOnce({ mtime: new Date('2022-01-02') } as fs.Stats)
    const result = getMostRecentlyModifiedFiles(dir, count)
    expect(result).toEqual(['file2.txt', 'file3.txt', 'file1.txt'])
  })
  it('should return an empty array if the directory is empty', () => {
    const dir = '../tests/fixtures/empty-directory'
    const count = 3
    jest.spyOn(fs, 'readdirSync').mockReturnValue([])
    const result = getMostRecentlyModifiedFiles(dir, count)
    expect(result).toEqual([])
  })
  it('should return an empty array if the count is 0', () => {
    const dir = 'non_empty_directory'
    const count = 0
    const result = getMostRecentlyModifiedFiles(dir, count)
    expect(result).toEqual([])
  })
  it('non-empty test directory should contain files', () => {
    jest.spyOn(fs, 'readdirSync').mockRestore()
    const dir = '../tests/fixtures/non-empty-directory'
    const count = 3
    const result = fs.readdirSync(dir)
    expect(result.length).toBeGreaterThan(0)
  })
  it('empty test directory should not contain files', () => {
    jest.spyOn(fs, 'readdirSync').mockRestore()
    const dir = '../tests/fixtures/empty-directory'
    const result = fs.readdirSync(dir)
    expect(result.length).toBe(0)
  })
})
//# sourceMappingURL=utility_functions.test.js.map
