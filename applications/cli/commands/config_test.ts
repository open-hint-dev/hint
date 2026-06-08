/// <reference types="node" />
/// <reference types="vitest/globals" />

import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ErrorCode, is } from '@openhint/transpiler';

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...actual,
        stat: vi.fn(actual.stat),
        readFile: vi.fn(actual.readFile),
        writeFile: vi.fn(actual.writeFile),
    };
});

import { readFile, stat, writeFile } from 'node:fs/promises';

import { CONFIG_INSTRUCTION, executeConfig } from './config';

let actualFs: typeof import('node:fs/promises');
let tmpRoot: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
    actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
});

beforeEach(async () => {
    tmpRoot = await actualFs.mkdtemp(join(tmpdir(), 'hint-config-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpRoot);
});

afterEach(async () => {
    cwdSpy.mockRestore();
    vi.resetAllMocks();
    await actualFs.rm(tmpRoot, { recursive: true, force: true });
});

describe('findProjectRoot (via executeConfig without explicit root)', () => {
    it('finds root when hint.yml is a file in cwd', async () => {
        await actualFs.writeFile(join(tmpRoot, 'hint.yml'), '', 'utf8');
        await executeConfig();
        const content = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(content).toContain('## HINT');
    });

    it('finds root when hint.yaml is a file in cwd', async () => {
        await actualFs.writeFile(join(tmpRoot, 'hint.yaml'), '', 'utf8');
        await executeConfig();
        const content = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(content).toContain('## HINT');
    });

    it('traverses upward from a subdirectory to find hint.yml', async () => {
        await actualFs.writeFile(join(tmpRoot, 'hint.yml'), '', 'utf8');
        await actualFs.mkdir(join(tmpRoot, 'deep', 'nested'), { recursive: true });
        cwdSpy.mockReturnValue(join(tmpRoot, 'deep', 'nested'));
        await executeConfig();
        const content = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(content).toContain('## HINT');
    });

    it('treats a hint.yml that is a directory (non-file) as absent', async () => {
        await actualFs.mkdir(join(tmpRoot, 'hint.yml'));
        vi.mocked(stat).mockImplementation(async (path) => {
            const s = await actualFs.stat(String(path));
            return s;
        });
        await expect(executeConfig()).rejects.toSatisfy(
            (e: unknown) =>
                is(e, ErrorCode.IO_ERROR) && (e as Error).message.includes('No hint.yml found'),
        );
    });

    it('throws IO_ERROR with exact message when no marker file is found', async () => {
        vi.mocked(stat).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        await expect(executeConfig()).rejects.toSatisfy(
            (e: unknown) =>
                is(e, ErrorCode.IO_ERROR) &&
                (e as Error).message === 'No hint.yml found — not inside a HINT project',
        );
    });

    it('wraps non-ENOENT stat errors with IO_ERROR and correct message', async () => {
        vi.mocked(stat).mockRejectedValue(
            Object.assign(new Error('permission denied'), { code: 'EACCES' }),
        );
        await expect(executeConfig()).rejects.toSatisfy(
            (e: unknown) =>
                is(e, ErrorCode.IO_ERROR) &&
                (e as Error).message.includes('Failed to inspect') &&
                (e as Error).message.includes('permission denied'),
        );
    });
});

describe('executeConfig with explicit projectRoot', () => {
    it('resolves a relative projectRoot against process.cwd()', async () => {
        const subName = 'project';
        await actualFs.mkdir(join(tmpRoot, subName));
        await executeConfig(subName);
        const content = await actualFs.readFile(join(tmpRoot, subName, 'AGENTS.md'), 'utf8');
        expect(content).toBe(CONFIG_INSTRUCTION);
    });

    it('accepts an absolute projectRoot without calling findProjectRoot', async () => {
        await executeConfig(tmpRoot);
        const content = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(content).toBe(CONFIG_INSTRUCTION);
        expect(stat).not.toHaveBeenCalledWith(
            expect.stringMatching(/hint\.ya?ml$/),
        );
    });
});

describe('appendInstruction', () => {
    beforeEach(async () => {
        await actualFs.writeFile(join(tmpRoot, 'hint.yml'), '', 'utf8');
    });

    it('creates AGENTS.md with CONFIG_INSTRUCTION when the file does not exist', async () => {
        await executeConfig();
        const content = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(content).toBe(CONFIG_INSTRUCTION);
    });

    it('creates CLAUDE.md with CONFIG_INSTRUCTION when the file does not exist', async () => {
        await executeConfig();
        const content = await actualFs.readFile(join(tmpRoot, 'CLAUDE.md'), 'utf8');
        expect(content).toBe(CONFIG_INSTRUCTION);
    });

    it('appends CONFIG_INSTRUCTION to an existing AGENTS.md without ## HINT', async () => {
        await actualFs.writeFile(join(tmpRoot, 'AGENTS.md'), 'existing content', 'utf8');
        await executeConfig();
        const content = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(content).toBe('existing content\n\n' + CONFIG_INSTRUCTION);
    });

    it('does not modify AGENTS.md that already contains ## HINT', async () => {
        const original = 'existing ## HINT section';
        await actualFs.writeFile(join(tmpRoot, 'AGENTS.md'), original, 'utf8');
        await executeConfig();
        const content = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(content).toBe(original);
    });

    it('does not modify CLAUDE.md that already contains ## HINT', async () => {
        const original = 'has ## HINT already';
        await actualFs.writeFile(join(tmpRoot, 'CLAUDE.md'), original, 'utf8');
        await executeConfig();
        const content = await actualFs.readFile(join(tmpRoot, 'CLAUDE.md'), 'utf8');
        expect(content).toBe(original);
    });

    it('is idempotent: running twice leaves files unchanged', async () => {
        await executeConfig();
        const after1 = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        await executeConfig();
        const after2 = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(after1).toBe(after2);
    });

    it('is non-transactional: AGENTS.md is kept when CLAUDE.md write fails', async () => {
        await actualFs.writeFile(join(tmpRoot, 'AGENTS.md'), 'agents', 'utf8');
        vi.mocked(writeFile).mockImplementation(async (path, data, opts) => {
            if (String(path).endsWith('CLAUDE.md')) {
                throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
            }
            return actualFs.writeFile(path as string, data as any, opts as any);
        });
        await expect(executeConfig()).rejects.toSatisfy((e: unknown) => is(e, ErrorCode.IO_ERROR));
        const agentsContent = await actualFs.readFile(join(tmpRoot, 'AGENTS.md'), 'utf8');
        expect(agentsContent).toContain(CONFIG_INSTRUCTION);
    });

    it('wraps non-ENOENT read errors with IO_ERROR and correct message', async () => {
        vi.mocked(readFile).mockRejectedValue(
            Object.assign(new Error('permission denied'), { code: 'EACCES' }),
        );
        await expect(executeConfig()).rejects.toSatisfy(
            (e: unknown) =>
                is(e, ErrorCode.IO_ERROR) &&
                (e as Error).message.includes('Failed to read') &&
                (e as Error).message.includes('permission denied'),
        );
    });

    it('wraps write errors for new files with IO_ERROR and correct message', async () => {
        vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        vi.mocked(writeFile).mockRejectedValue(
            Object.assign(new Error('disk full'), { code: 'ENOSPC' }),
        );
        await expect(executeConfig()).rejects.toSatisfy(
            (e: unknown) =>
                is(e, ErrorCode.IO_ERROR) &&
                (e as Error).message.includes('Failed to write') &&
                (e as Error).message.includes('disk full'),
        );
    });

    it('wraps write errors when appending with IO_ERROR and correct message', async () => {
        vi.mocked(writeFile).mockRejectedValue(
            Object.assign(new Error('disk full'), { code: 'ENOSPC' }),
        );
        await expect(executeConfig()).rejects.toSatisfy(
            (e: unknown) =>
                is(e, ErrorCode.IO_ERROR) &&
                (e as Error).message.includes('Failed to write') &&
                (e as Error).message.includes('disk full'),
        );
    });
});
