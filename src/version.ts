// The one place the CLI learns its own version.
//
// `__PRAXIS_VERSION__` is substituted at build time by tsup from
// package.json. `typeof` guards the case where there was no build -- tests
// and `tsx src/cli/index.ts` run the source directly, where the identifier
// was never defined -- and reading an undeclared name through `typeof` is
// the one form that does not throw.

declare const __PRAXIS_VERSION__: string | undefined;

export const VERSION: string =
  typeof __PRAXIS_VERSION__ === 'string' ? __PRAXIS_VERSION__ : '0.0.0-dev';
