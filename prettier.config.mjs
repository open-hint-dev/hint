const PROJECT_NAME = 'hint';

const nestjsRegExp = '^(@nestjs\\/)(.*)$';
const remixRegExp = '^(@remix)(.*)$';
const projectRegExp = `^(@${PROJECT_NAME}(\\-[a-z]*)?\\/)(.*)((?<!\\.scss))$`;
const parentRegExp = '^(\\.\\.\\/.*)((?<!\\.scss))$';
const childRegExp = '^(\\.\\/.*)((?<!\\.scss))$';
const projectStylesRegExp = `^(@${PROJECT_NAME}(\\-[a-z]*)?\\/)(.*)\\.scss$`;
const parentStylesRegExp = '^(\\.\\.\\/.*)\\.scss$';
const childStylesRegExp = '^(\\.\\/.*)\\.scss$';

/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import('prettier').Config}
 */
const config = {
    plugins: [
        '@ianvs/prettier-plugin-sort-imports',
        'prettier-plugin-multiline-arrays',
        'prettier-plugin-packagejson',
        'prettier-plugin-astro',
    ],
    overrides: [
        {
            files: '*.astro',
            options: {
                parser: 'astro',
            },
        },
    ],
    printWidth: 150,
    singleQuote: true,
    tabWidth: 4,
    semi: true,
    trailingComma: 'all',
    useTabs: false,
    singleAttributePerLine: true,
    arrowParens: 'always',
    bracketSameLine: false,
    bracketSpacing: true,
    endOfLine: 'lf',
    importOrder: [
        '<TYPES>^(node:)',
        '<BUILTIN_MODULES>',
        '',
        '<TYPES>',
        '<THIRD_PARTY_MODULES>',
        '',
        '<TYPES>' + nestjsRegExp,
        nestjsRegExp,
        '<TYPES>' + remixRegExp,
        remixRegExp,
        '',
        '<TYPES>' + projectRegExp,
        projectRegExp,
        '',
        '<TYPES>' + parentRegExp,
        parentRegExp,
        '<TYPES>' + childRegExp,
        childRegExp,
        '',
        projectStylesRegExp,
        parentStylesRegExp,
        childStylesRegExp,
    ],
    importOrderTypeScriptVersion: '5.0.0',
    importOrderParserPlugins: [
        'typescript',
        'jsx',
        'classProperties',
        'decorators-legacy',
        '["importAttributes", { "deprecatedAssertSyntax": true }]',
    ],
    multilineArraysWrapThreshold: 1,
};

export default config;
