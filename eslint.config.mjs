import next from 'eslint-config-next';

const eslintConfig = [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'bin/**', 'data/**'],
  },
];

export default eslintConfig;
