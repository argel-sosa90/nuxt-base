// @ts-check
import prettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // Promessa esquecida em rota de servidor vira 500 sem rastro.
      'require-await': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // No servidor e nos scripts, o console é o canal de observação legítimo.
    files: ['server/**/*.ts', 'test/**/*.ts', 'scripts/**/*.{ts,mjs,js}'],
    rules: { 'no-console': 'off' },
  },
  // Por último: desliga as regras que conflitam com o Prettier.
  prettier,
)
