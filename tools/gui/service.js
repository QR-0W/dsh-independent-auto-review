import { randomInt } from 'node:crypto';
import { reviewMutation } from './domain.js';

function reviewerValue(value) {
  return Object.fromEntries(reviewMutation({ ...value, timeoutMs: value?.timeoutMs ?? 60000 })
    .filter(op => op.op === 'set').map(op => [op.path[1], op.value]));
}

export const REVIEW_ENTRY = 'include:independent-auto-review';

/** One reload-safe operation shared by the UI and tool. */
export class ReviewSettingsStore {
  constructor(configEditor, initialRevision = randomInt(0, 2 ** 40)) {
    this.editor = configEditor;
    this.revision = initialRevision;
    this.key = undefined;
    this.tail = Promise.resolve();
  }
  row() {
    const row = this.editor.configuration().find(item => item.entry.id === REVIEW_ENTRY);
    if (!row || !row.entry.fiber?.config?.reviewer) throw new Error('Review component is not active.');
    return row;
  }
  fingerprint(raw, inherited) { return JSON.stringify({ raw, inherited }); }
  read() {
    const row = this.row();
    const key = this.fingerprint(row.entry.options.config ?? {}, row.inherited);
    if (this.key !== undefined && key !== this.key) this.revision++;
    this.key = key;
    const r = reviewerValue(row.entry.fiber.config.reviewer);
    return { namespace: REVIEW_ENTRY, revision: this.revision, reviewer: { ...r } };
  }
  save(input) {
    const run = this.tail.then(() => this.performSave(input));
    this.tail = run.catch(() => {});
    return run;
  }
  async performSave(input) {
    if (!input || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('revision');
    const current = this.read();
    if (current.revision !== input.expectedRevision) throw new Error('refused');
    const expectedKey = this.key;
    const operations = reviewMutation(input.reviewer);
    const row = this.row();
    await this.editor.edit(row.entry, (raw, inherited) => {
      if (this.fingerprint(raw, inherited) !== expectedKey) throw new Error('refused');
      const next = structuredClone(raw);
      const r = { ...(next.reviewer ?? {}) };
      for (const operation of operations) {
        const field = operation.path[1];
        if (operation.op === 'unset') {
          if (Object.hasOwn(inherited.reviewer ?? {}, field)) r[field] = structuredClone(inherited.reviewer[field]);
          else delete r[field];
        } else r[field] = operation.value;
      }
      next.reviewer = r;
      reviewerValue({ ...inherited.reviewer, ...r });
      return next;
    });
    return { ...this.read(), saved: true, autoMayRequireReselection: true };
  }
}
