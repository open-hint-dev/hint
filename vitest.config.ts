import { defineConfig, defineProject } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            'applications',
            'packages',
            'presets',
            'sites',
        ].map((path) =>
            defineProject({
                test: {
                    globals: true,
                    include: [`${path}/**/*_test.{ts,tsx}`],
                },
            }),
        ),
    },
});
