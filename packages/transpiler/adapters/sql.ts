// The built-in SQL adapter — and the one here with a limitation worth stating before anything else.
//
// SQL has no single grammar. Postgres, MySQL and SQLite disagree about enough of DDL that no one
// parser reads all three, and none of them ships a parser this can reach without an install. What is
// reachable is SQLite's, through Python's standard-library `sqlite3`: the DDL is applied to a
// throwaway in-memory database, and the resulting tables are read back from the catalogue. Those are
// real columns with real types, established by a real parser — not a regex over `CREATE TABLE`.
//
// **So this reads SQLite-dialect DDL.** A Postgres-only construct makes SQLite refuse the statement,
// and the adapter reports that refusal rather than a partial reading. That is the safe direction: a
// stated failure sends you to an external adapter for your dialect, a partial reading would quietly
// under-report the columns a spec is checked against. For any other dialect, declare a `symbols`
// command on the emit pack.
//
// Only `CREATE` statements are executed. Everything else in the file is skipped — this is a reader,
// and it should not be running somebody's `INSERT` even against a database that is thrown away.

import type { AdapterReading } from './contract.js';
import { runAdapter } from './run.js';

const SCRIPT = `
import json, sqlite3, sys

source = open(sys.argv[1], encoding='utf-8').read()

# sqlite3's own statement splitter, so a semicolon inside a string literal does not split anything.
statements = []
current = ''

for line in source.splitlines(True):
    current += line
    if sqlite3.complete_statement(current):
        statements.append(current.strip())
        current = ''

if current.strip():
    statements.append(current.strip())

def leading_keyword(statement):
    # A statement may open with comments or blank lines, and testing the raw text for 'CREATE' would
    # skip every table in a file that documents itself.
    #
    # Written without a regex on purpose: this script is embedded in a JavaScript template literal,
    # where a backslash is consumed before Python ever sees it. Keeping the script backslash-free
    # means what is read in the file is what runs.
    body = statement

    while body.lstrip().startswith('/*'):
        body = body.lstrip()[2:]
        end = body.find('*/')
        if end == -1:
            return ''
        body = body[end + 2:]

    for line in body.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('--'):
            continue
        return stripped.split(None, 1)[0].upper()

    return ''

db = sqlite3.connect(':memory:')

for statement in statements:
    if leading_keyword(statement) != 'CREATE':
        continue
    try:
        db.execute(statement)
    except sqlite3.Error as error:
        sys.stderr.write(str(error))
        sys.exit(2)

symbols = []

for name, kind in db.execute("select name, type from sqlite_master where type in ('table', 'view')"):
    fields = [
        {'name': row[1], 'type': row[2] or None}
        for row in db.execute('PRAGMA table_info("%s")' % name.replace('"', '""'))
    ]
    symbols.append({'kind': kind, 'name': name, 'fields': fields})

json.dump({'symbols': symbols}, sys.stdout)
`;

export async function sqlSymbols(projectRootPath: string, file: string): Promise<AdapterReading> {
    return runAdapter(
        'python3',
        [
            '-c',
            SCRIPT,
            file,
        ],
        projectRootPath,
    );
}
