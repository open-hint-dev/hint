import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, defineProject } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        projects: [
            'applications',
            'integrations',
            'packages',
            'presets',
            'sites',
        ].map((path) =>
            defineProject({
                test: {
                    root,
                    globals: true,
                    include: [`${path}/**/*_test.{ts,tsx}`],
                },
            }),
        ),
    },
});
