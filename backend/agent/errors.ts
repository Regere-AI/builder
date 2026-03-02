/**
 * Agent error types for structured handling (e.g. unfulfillable modify requests)
 */

/**
 * Thrown when a modify request cannot be fulfilled (e.g. referenced element/label does not exist).
 * Carries a user-facing reason to show in the API response.
 */
export class UnfulfillableModifyError extends Error {
  /** User-facing message (e.g. "No button with label 'Save' found in the current UI.") */
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "UnfulfillableModifyError";
    this.reason = reason;
    Object.setPrototypeOf(this, UnfulfillableModifyError.prototype);
  }
}
