import next from 'eslint-config-next';

const eslintConfig = [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
  },
];

export default eslintConfig;
