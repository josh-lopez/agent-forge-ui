// Pure logic for resolving the deployment base path.
//
// The deployment target is GitHub Pages (project site), which serves the app
// from a sub-path: https://<owner>.github.io/<repo>/. The build is configured
// via the VITE_BASE environment variable; locally we fall back to "/".
//
// This helper isolates that decision so it can be unit-tested independently of
// Vite's config evaluation and of any DOM/runtime side effects.

/**
 * Resolve the base path Vite should use for asset URLs.
 *
 * @param viteBase - The raw VITE_BASE value (typically `process.env.VITE_BASE`).
 *                   May be `undefined`, empty, or a path like "/agent-forge-ui/".
 * @returns A normalised base path that always starts and ends with "/".
 */
export function resolveBasePath(viteBase: string | undefined | null): string {
  if (viteBase == null) {
    return '/';
  }

  const trimmed = viteBase.trim();
  if (trimmed === '') {
    return '/';
  }

  let result = trimmed;
  if (!result.startsWith('/')) {
    result = '/' + result;
  }
  if (!result.endsWith('/')) {
    result = result + '/';
  }
  return result;
}
