/**
 * Shared types for AI SDK UI chat (Phase 2+3).
 * Used by backend POST /api/chat and frontend useChat so message.parts is typed.
 */

/** Chat mode: planner (show steps + Build) or agent (stream JSON directly) */
export type ChatMode = 'planner' | 'agent';

/** Step info for plan display (id, description, intent) */
export interface ChatPlanStepInfo {
  id: string;
  description: string;
  intent?: string;
}

/** Per-step failure when execution continues after a step error */
export interface ChatStepFailureInfo {
  stepIndex: number;
  stepId: string;
  error: string;
}

/**
 * Data part types for UI Builder chat stream.
 * Keys become data-<key> in the stream (e.g. data-plan_steps, data-complete).
 * Extends Record<string, unknown> to satisfy AI SDK UIDataTypes constraint.
 */
export interface UIBuilderDataParts extends Record<string, unknown> {
  plan_steps: { steps: ChatPlanStepInfo[] };
  step_started: { stepIndex: number; stepId: string };
  step_chunk: { stepIndex: number; stepId: string; content: string };
  step_preview: { stepIndex: number; stepId: string; ui: unknown };
  step_completed: { stepIndex: number; stepId: string; ui: unknown };
  step_error: { stepIndex: number; stepId: string; error: string };
  json_delta: { chunk: string };
  json_reset: Record<string, never>;
  complete: {
    ui?: unknown;
    planOnly?: boolean;
    steps?: ChatPlanStepInfo[];
    failedSteps?: ChatStepFailureInfo[];
  };
}
