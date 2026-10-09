import { z } from 'zod';

export const GUI_PACKAGE = '@local/dsh-independent-auto-review-settings';
export const SETTINGS_SERVICE = 'independentAutoReviewSettings';
const reviewer = z.object({ provider: z.string().min(1), model: z.string().min(1), reasoningEffort: z.string().optional(), timeoutMs: z.number().int().min(1).max(300000) }).strict();
const result = z.object({ namespace: z.literal('include:independent-auto-review'), revision: z.number().int().nonnegative(), reviewer, saved: z.boolean().optional(), autoMayRequireReselection: z.boolean().optional() }).strict();
const request = z.object({ expectedRevision: z.number().int().nonnegative(), reviewer }).strict();
const codec = (name, schema) => ({ mode: 'strict', typeSymbol: `${GUI_PACKAGE}#${name}`, create: () => schema });
export function createDescriptors() {
  return ['read', 'save'].map(method => ({
    id: `${GUI_PACKAGE}#${SETTINGS_SERVICE}/${method}`, service: SETTINGS_SERVICE,
    namespace: SETTINGS_SERVICE, method, implementation: method, invocation: { kind: 'direct' },
    parameters: method === 'save' ? [{ name: 'request', wire: 'request', source: 'json', codec: codec('SaveRequest', request) }] : [],
    result: codec('SettingsResult', result),
  }));
}
export function hostContribution() {
  return { package: GUI_PACKAGE, face: 'host', schemas: [], model: { services: [{ key: SETTINGS_SERVICE, exportName: 'ReviewSettingsRemote', tags: [], description: 'Read and save independent Auto Review settings through the normal configuration lifecycle.', members: [{ kind: 'method', name: 'read', signature: 'read(): ReviewSettingsSnapshot' }, { kind: 'method', name: 'save', signature: 'save(request: SaveReviewSettings): Promise<ReviewSettingsSnapshot>' }], types: [] }], events: [], objects: [] }, invocations: createDescriptors() };
}
export function clientContribution() { return { package: GUI_PACKAGE, descriptors: createDescriptors() }; }
