import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Layer boundaries from docs/design.md ("Code organisation").
 * Each entry lists the src/ layers a layer must NOT import from.
 */
const layers = {
	engine: ['backend', 'transport', 'session', 'widgets', 'roles', 'app'],
	protocol: ['engine', 'backend', 'transport', 'session', 'widgets', 'roles', 'app'],
	backend: ['engine', 'transport', 'session', 'widgets', 'roles', 'app'],
	transport: ['engine', 'backend', 'session', 'widgets', 'roles', 'app'],
	session: ['engine', 'backend', 'widgets', 'roles', 'app'],
	widgets: ['engine', 'backend', 'transport', 'session', 'roles', 'app'],
	lib: ['engine', 'protocol', 'backend', 'transport', 'session', 'widgets', 'roles', 'app'],
};

const boundaryConfigs = Object.entries(layers).map(([layer, forbidden]) => ({
	files: [`src/${layer}/**/*.{ts,tsx}`],
	rules: {
		'no-restricted-imports': [
			'error',
			{
				patterns: forbidden.map((target) => ({
					group: [`**/${target}`, `**/${target}/**`],
					message: `The ${layer} layer must not import from ${target} (see docs/design.md).`,
				})),
			},
		],
	},
}));

/** The engine is pure: no ambient time, randomness or browser APIs. */
const enginePurity = {
	files: ['src/engine/**/*.ts', 'src/protocol/**/*.ts'],
	ignores: ['**/*.test.ts'],
	languageOptions: { globals: {} },
	rules: {
		'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'fetch', 'setTimeout'],
		'no-restricted-properties': [
			'error',
			{ object: 'Date', property: 'now', message: 'Use ctx.now from the reducer context.' },
			{ object: 'Math', property: 'random', message: 'Use ctx.random from the reducer context.' },
			{ object: 'performance', property: 'now', message: 'Use ctx.now from the reducer context.' },
		],
	},
};

export default defineConfig(
	{ ignores: ['dist', 'node_modules'] },
	js.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	{
		languageOptions: {
			ecmaVersion: 2023,
			globals: globals.browser,
			parserOptions: {
				projectService: { allowDefaultProject: ['eslint.config.js'] },
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: { 'react-hooks': reactHooks },
		rules: {
			...reactHooks.configs.recommended.rules,
			'@typescript-eslint/switch-exhaustiveness-check': 'error',
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
		},
	},
	{
		files: ['*.js', '*.config.ts'],
		languageOptions: { globals: globals.node },
	},
	{
		// Root JS config files aren't part of a tsconfig; lint them without type info.
		files: ['*.js'],
		extends: [tseslint.configs.disableTypeChecked],
	},
	...boundaryConfigs,
	enginePurity,
);
