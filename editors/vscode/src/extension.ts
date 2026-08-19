import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);
const FALLBACK = ['decision', 'invariant', 'rule', 'good', 'bad', 'goal', 'scope', 'done', 'app', 'lang', 'build', 'dep', 'entity', 'field', 'func', 'arg', 'result', 'flow', 'test'];

type Keyword = { keyword: string; synonyms: string[]; description: string };
type LintFinding = { kind: string; severity: 'finding' | 'info'; hint: string; line?: number; detail: string };

async function vocabulary(folder: vscode.WorkspaceFolder | undefined): Promise<Keyword[]> {
    if (!folder) return FALLBACK.map((keyword) => ({ keyword, synonyms: [], description: '' }));
    try {
        const { stdout } = await execFileAsync('hint', ['author', '--json'], { cwd: folder.uri.fsPath, timeout: 5000 });
        return (JSON.parse(stdout) as { keywords: Keyword[] }).keywords;
    } catch {
        return FALLBACK.map((keyword) => ({ keyword, synonyms: [], description: '' }));
    }
}

export function activate(context: vscode.ExtensionContext): void {
    const selector: vscode.DocumentSelector = { language: 'hint', scheme: 'file' };
    const diagnostics = vscode.languages.createDiagnosticCollection('hint');
    let diagnosticTimer: NodeJS.Timeout | undefined;

    const refreshDiagnostics = async (document: vscode.TextDocument): Promise<void> => {
        if (document.languageId !== 'hint' || document.isDirty || !vscode.workspace.getConfiguration('hint').get('diagnostics.enabled', true)) {
            diagnostics.delete(document.uri);
            return;
        }

        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!folder) return;
        try {
            let stdout: string;
            try {
                ({ stdout } = await execFileAsync('hint', ['lint', '--json', document.uri.fsPath], { cwd: folder.uri.fsPath, timeout: 5000 }));
            } catch (error: unknown) {
                // lint exits 1 when it has findings; its JSON stdout is still the result.
                const output = (error as { stdout?: string }).stdout;
                if (!output) throw error;
                stdout = output;
            }
            const findings = (JSON.parse(stdout) as { findings: LintFinding[] }).findings;
            diagnostics.set(document.uri, findings.filter((finding) => finding.kind === 'vocab').map((finding) => {
                const line = Math.max(0, (finding.line ?? 1) - 1);
                const range = document.lineAt(Math.min(line, document.lineCount - 1)).range;
                return new vscode.Diagnostic(range, finding.detail, finding.severity === 'finding' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
            }));
        } catch {
            // The CLI is optional. Editing, highlighting, fallback completion, and
            // hover remain available when it is absent or the project is not configured.
            diagnostics.delete(document.uri);
        }
    };

    const scheduleDiagnostics = (document: vscode.TextDocument): void => {
        if (diagnosticTimer) clearTimeout(diagnosticTimer);
        diagnosticTimer = setTimeout(() => void refreshDiagnostics(document), 250);
    };

    context.subscriptions.push(
        diagnostics,
        vscode.workspace.onDidOpenTextDocument(scheduleDiagnostics),
        vscode.workspace.onDidSaveTextDocument((document) => void refreshDiagnostics(document)),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('hint.diagnostics.enabled')) {
                for (const document of vscode.workspace.textDocuments) void refreshDiagnostics(document);
            }
        }),
    );
    for (const document of vscode.workspace.textDocuments) scheduleDiagnostics(document);

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, {
        async provideCompletionItems(document, position) {
            if (!/^#{1,6}\s+\S*$/.test(document.lineAt(position.line).text.slice(0, position.character))) return [];
            const folder = vscode.workspace.getWorkspaceFolder(document.uri);
            return (await vocabulary(folder)).map((entry) => {
                const item = new vscode.CompletionItem(entry.keyword, vscode.CompletionItemKind.Keyword);
                item.detail = entry.description;
                return item;
            });
        },
    }, ' '));

    context.subscriptions.push(vscode.languages.registerHoverProvider(selector, {
        async provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            if (!range) return undefined;
            const word = document.getText(range);
            const entry = (await vocabulary(vscode.workspace.getWorkspaceFolder(document.uri))).find((keyword) => keyword.keyword === word || keyword.synonyms.includes(word));
            return entry?.description ? new vscode.Hover(new vscode.MarkdownString(entry.description), range) : undefined;
        },
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hint.showContext', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!folder) return;
        try {
            const { stdout } = await execFileAsync('hint', [editor.document.uri.fsPath], { cwd: folder.uri.fsPath, timeout: 10000 });
            const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: stdout });
            await vscode.window.showTextDocument(document, { preview: true });
        } catch (error: unknown) {
            void vscode.window.showErrorMessage(`HINT: ${error instanceof Error ? error.message : String(error)}`);
        }
    }));
}

export function deactivate(): void {}
