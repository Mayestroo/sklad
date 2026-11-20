import * as fs from 'fs';
import * as path from 'path';

/**
 * A Prisma `include: { createdBy: true }` returns the whole User row,
 * passwordHash included, straight into the JSON response. Relations to User
 * must use `{ select: { ... } }` with the fields the response needs.
 */
const USER_RELATIONS = [
  'user',
  'createdBy',
  'postedBy',
  'approvedBy',
  'assignedTo',
  'assignedUser',
  'assignedSeller',
  'responsible',
  'custodian',
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !/\.(int-)?spec\.ts$/.test(entry.name)
      ? [full]
      : [];
  });
}

describe('User relations are never included whole', () => {
  it('has no `<userRelation>: true` include in production code', () => {
    const pattern = new RegExp(`\\b(${USER_RELATIONS.join('|')}): true\\b`);
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(__dirname, '..', '..'))) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (pattern.test(line) && !/select\s*:/.test(line)) {
            offenders.push(
              `${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`,
            );
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
