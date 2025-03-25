// @ts-check
import nodecfdiConfig from '@nodecfdi/eslint-config';

const { defineConfig } = nodecfdiConfig(import.meta.dirname, { vitest: true, sonarjs: true });

export default defineConfig({
  files: ['src/file_cookie_store.ts'],
  rules: {
    'unicorn/no-useless-undefined': 'off',
    '@typescript-eslint/consistent-indexed-object-style': 'off',
  },
});
