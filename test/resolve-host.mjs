import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let requireHost;
export function initialize({ root }) {
  requireHost = createRequire(join(root, 'package.json'));
}
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('@deepseek-ai/')) throw error;
    return { url: pathToFileURL(requireHost.resolve(specifier)).href, shortCircuit: true };
  }
}
