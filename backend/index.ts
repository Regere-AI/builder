/**
 * Express Server for UI Builder Chat Interface
 * 
 * Provides API endpoints for creating and modifying UI layouts
 */

// Load .env from project root first (so OPENAI_API_KEY etc. work when run from backend/)
import "./env";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { isOpenAIConfigured, getResolvedDefaultModelId } from "./llm/models";
import { preloadModels } from "./llm/preloader";
import { SYSTEM_PROMPT } from "./prompts";
import { validateLayoutNodeDirect } from "./agent/validator";
import { classifyIntent } from "./agent/intent";
import { routeRequest } from "./agent/router";
import { generatePlan } from "./agent/planner";
import { normalizePlan } from "./agent/plan-order";
import { executePlan, executeStepFromRawResponse } from "./agent/executor";
import { UnfulfillableModifyError } from "./agent/errors";
import { buildPatchModifyPrompt } from "./prompts/patchPrompt";
import { streamExecutorStep } from "./llm/ai-sdk-stream";
import { MINIMAL_INITIAL_UI } from "./agent/layout-utils";
import { applyPatch } from "./agent/patch-applier";
import type { PatchOperation } from "./agent/patch-schema";
import { uiState } from "./state/uiState";
import type { LayoutNode } from "../shared/schema";
import { globalMemory } from "./memory";
import { createUIMessageStream, pipeUIMessageStreamToResponse } from "ai";
import type { UIBuilderDataParts } from "../shared/chat-types";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({
  limit: "2mb",
  verify: (req: express.Request, _res, buf: Buffer) => {
    (req as any).rawBody = buf;
  },
}));

// Serve static files from public directory (for built React app; backend can run standalone or with any frontend)
app.use(express.static(path.join(__dirname, "..", "public")));

/**
 * Health check endpoint (OpenAI provider).
 */
app.get("/api/health", async (req, res) => {
  try {
    const configured = isOpenAIConfigured();
    res.json({
      status: configured ? "ok" : "error",
      provider: "openai",
      model: getResolvedDefaultModelId(),
      configured,
      hint: configured
        ? undefined
        : "Set OPENAI_API_KEY and OPENAI_MODEL in .env",
    });
  } catch (error) {
    console.error("[HEALTH] Health check failed:", error);
    res.status(500).json({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/** Get prompt from AI SDK UI messages (last user message text). */
function getPromptFromUIMessages(messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "user" && Array.isArray(msg.parts)) {
      const text = (msg.parts as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text" && p.text != null)
        .map((p) => p.text)
        .join("");
      if (text.trim()) return text.trim();
    }
  }
  return "";
}

/**
 * POST /api/chat — AI SDK UI chat endpoint.
 * Body: { messages: UIMessage[], currentUI?, planOnly?, executePlan?, steps? }
 * Returns UI Message Stream with custom data parts (plan_steps, step_*, complete).
 */
app.post("/api/chat", async (req, res) => {
  try {
    const body = req.body || {};
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Missing or empty messages array" });
    }
    const prompt = getPromptFromUIMessages(messages);
    if (!prompt) {
      return res.status(400).json({ error: "Could not get prompt from messages (no user text)" });
    }
    const currentUIFromBody = body.currentUI;
    const planOnly = body.planOnly === true;
    const executePlan = body.executePlan === true;
    const agentMode = body.agentMode === true;
    const clientSteps = Array.isArray(body.steps) ? body.steps : undefined;

    const baseUI: LayoutNode | null = currentUIFromBody ?? (uiState.getCurrentUI() as LayoutNode | null);
    const options: PlanProgressOptions = {
      planOnly,
      executePlan,
      steps: clientSteps,
    };

    type UIBuilderUIMessage = import("ai").UIMessage<unknown, UIBuilderDataParts>;
    const stream = createUIMessageStream<UIBuilderUIMessage>({
      execute: async ({ writer }) => {
        const send = (data: Record<string, unknown>) => {
          const t = data.type as string;
          if (t === "plan_created") {
            writer.write({ type: "data-plan_steps", data: { steps: data.steps } });
          } else if (t === "complete") {
            writer.write({
              type: "data-complete",
              data: {
                ui: data.ui,
                planOnly: data.planOnly,
                steps: data.steps,
                failedSteps: data.failedSteps,
              },
            });
          } else if (t === "step_started") {
            writer.write({
              type: "data-step_started",
              data: { stepIndex: data.stepIndex, stepId: data.stepId },
            });
          } else if (t === "step_chunk") {
            // Omit: avoid streaming partial patch JSON in chat; use data parts for plan + preview only
          } else if (t === "step_preview") {
            writer.write({
              type: "data-step_preview",
              data: { stepIndex: data.stepIndex, stepId: data.stepId, ui: data.ui },
            });
          } else if (t === "step_completed") {
            writer.write({
              type: "data-step_completed",
              data: { stepIndex: data.stepIndex, stepId: data.stepId, ui: data.ui },
            });
          } else if (t === "step_error") {
            writer.write({
              type: "data-step_error",
              data: { stepIndex: data.stepIndex, stepId: data.stepId, error: data.error },
            });
          } else if (t === "error") {
            writer.write({ type: "error", errorText: String(data.error ?? "Unknown error") });
          } else if (t === "json_delta") {
            writer.write({ type: "data-json_delta", data: { chunk: data.chunk } });
          } else if (t === "json_reset") {
            writer.write({ type: "data-json_reset", data: {} });
          } else if (t === "final_status") {
            writer.write({ type: "text-delta", id: textId, delta: "\n" + (data.delta ?? "UI generated successfully.") });
          }
        };

        writer.write({ type: "start" });
        const textId = "status";
        const writeTextDelta = (chunk: string) =>
          writer.write({ type: "text-delta", id: textId, delta: chunk });
        writer.write({ type: "text-start", id: textId });
        writer.write({
          type: "text-delta",
          id: textId,
          delta: agentMode ? "Generating UI...\n" : options.planOnly ? "Generating plan...\n" : "Executing plan...\n",
        });
        try {
          if (agentMode) {
            send({ type: "json_delta", chunk: INITIAL_JSON_STRUCTURE });
            const result = await routeRequest({ userPrompt: prompt, currentUI: baseUI });
            const ui = result?.ui ?? null;
            if (ui) {
              uiState.setCurrentUI(ui, result.intent, prompt);
              await streamUIAsJsonViaData(ui, send, writeTextDelta);
            }
            send({ type: "complete", ui, planOnly: false });
            send({ type: "final_status", delta: "UI generated successfully." });
          } else {
            await handleStreamingPlanProgressLogic(prompt, options, baseUI, send, textId, writeTextDelta);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          writer.write({ type: "error", errorText: msg });
        }
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish" });
      },
    });

    pipeUIMessageStreamToResponse({ response: res, stream });
  } catch (err) {
    console.error("[CHAT] Error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

const JSON_CHUNK_DELAY_MS = 50;
const JSON_CHUNK_SIZE = 120;

const INITIAL_JSON_STRUCTURE = '{\n  "type": "container",\n  "props": {},\n  "children": []\n}';

/**
 * Stream UI as JSON: data-json_delta for the JSON panel, and optional text-delta so the chat message shows the stream.
 * When writeTextDelta is provided, each chunk is also sent as text-delta so the assistant message streams the JSON; when
 * stream completes, the frontend collapses that message to "UI GENERATED SUCCESSFULLY".
 */
async function streamUIAsJsonViaData(
  ui: unknown,
  sendFn: (data: Record<string, unknown>) => void,
  writeTextDelta?: (chunk: string) => void
): Promise<void> {
  sendFn({ type: "json_reset" });
  const s = JSON.stringify(ui, null, 2);
  for (let i = 0; i < s.length; i += JSON_CHUNK_SIZE) {
    const chunk = s.slice(i, i + JSON_CHUNK_SIZE);
    sendFn({ type: "json_delta", chunk });
    if (writeTextDelta) writeTextDelta(chunk);
    if (i + JSON_CHUNK_SIZE < s.length) {
      await new Promise((r) => setTimeout(r, JSON_CHUNK_DELAY_MS));
    }
  }
}

/**
 * Core plan-progress logic: shared by SSE (/api/generate with planProgress) and UI stream (/api/chat).
 */
async function handleStreamingPlanProgressLogic(
  prompt: string,
  options: PlanProgressOptions,
  initialBaseUI: LayoutNode | null,
  send: (data: Record<string, unknown>) => void,
  textId: string,
  writeTextDelta: (chunk: string) => void
): Promise<void> {
  let baseUI: LayoutNode | null = initialBaseUI;
  const { planOnly, executePlan, steps: clientSteps } = options;

  let plan: { steps: Array<{ id: string; description: string; intent: "modify" | "add" | "remove"; dependsOn?: number[] }> };
  let stepsForChat: Array<{ id: string; description: string; intent?: string }>;

  if (executePlan && clientSteps && clientSteps.length > 0) {
    // Only skip the placeholder "Creating initial UI" step; keep all real steps (including step-0)
    const stepsToExecute = clientSteps.filter(
      (s: { id?: string; description?: string }) => (s.description?.trim() ?? "") !== "Creating initial UI"
    );
    const rawPlan = {
      steps: stepsToExecute.map((s: { description: string; intent?: string }) => ({
        description: s.description,
        intent: (s.intent === "modify" || s.intent === "remove" ? s.intent : "add") as "modify" | "add" | "remove",
        dependsOnIndices: [] as number[],
      })),
    };
    if (rawPlan.steps.length === 0) {
      // Fallback: regenerate plan or use single-step from prompt (e.g. client sent only placeholder)
      try {
        const fallbackRaw = await generatePlan(prompt, baseUI ?? null);
        plan = normalizePlan(fallbackRaw);
      } catch {
        plan = normalizePlan({
          steps: [{ description: prompt, intent: "add" as const, dependsOnIndices: [] }],
        });
      }
    } else {
      plan = normalizePlan(rawPlan);
    }
    stepsForChat =
      !baseUI || !baseUI.type
        ? [
            { id: "step-0", description: "Creating initial UI", intent: undefined },
            ...plan.steps.map((s) => ({ id: s.id, description: s.description, intent: s.intent })),
          ]
        : plan.steps.map((s) => ({ id: s.id, description: s.description, intent: s.intent }));
  } else {
    let rawPlan: { steps: Array<{ description: string; intent: "modify" | "add" | "remove"; dependsOnIndices?: number[] }> };
    try {
      rawPlan = await generatePlan(prompt, baseUI ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("at least one step") || msg.includes("Invalid plan structure")) {
        rawPlan = { steps: [{ description: prompt, intent: "add", dependsOnIndices: [] }] };
      } else {
        throw err;
      }
    }
    if (!rawPlan.steps || rawPlan.steps.length === 0) {
      rawPlan = { steps: [{ description: prompt, intent: "add", dependsOnIndices: [] }] };
    }
    plan = normalizePlan(rawPlan);
    stepsForChat =
      !baseUI || !baseUI.type
        ? [
            { id: "step-0", description: "Creating initial UI", intent: undefined },
            ...plan.steps.map((s) => ({ id: s.id, description: s.description, intent: s.intent })),
          ]
        : plan.steps.map((s) => ({ id: s.id, description: s.description, intent: s.intent }));
  }

  send({ type: "plan_created", steps: stepsForChat });

  if (planOnly) {
    send({ type: "complete", planOnly: true, steps: stepsForChat });
    send({ type: "final_status", delta: "Plan ready. Click Build to execute." });
    return;
  }
  send({ type: "json_delta", chunk: INITIAL_JSON_STRUCTURE });

  const runCreateFirst = !baseUI || !baseUI.type;
  if (runCreateFirst) {
    send({ type: "step_started", stepIndex: 0, stepId: "step-0" });
    baseUI = JSON.parse(JSON.stringify(MINIMAL_INITIAL_UI)) as LayoutNode;
    uiState.setCurrentUI(baseUI, "create", prompt);
    send({ type: "step_completed", stepIndex: 0, stepId: "step-0", ui: baseUI });
  }

  if (!baseUI || !baseUI.type) {
    send({ type: "error", error: "No UI available after initial step" });
    return;
  }
  let currentUI: LayoutNode = baseUI;
  const stepLoopStart = runCreateFirst ? 1 : 0;
  const stepLoopEnd = runCreateFirst ? stepsForChat.length : plan.steps.length;
  const failedSteps: { stepIndex: number; stepId: string; error: string }[] = [];
  const PREVIEW_THROTTLE_MS = 120;

  for (let i = stepLoopStart; i < stepLoopEnd; i++) {
    const step = plan.steps[runCreateFirst ? i - 1 : i];
    const stepId = stepsForChat[i].id;
    send({ type: "step_started", stepIndex: i, stepId });

    let stepBuffer = "";
    let lastPreviewTime = 0;

    try {
      const stepPrompt = buildPatchModifyPrompt(currentUI, step.description, {
        isPlanStep: true,
        stepIntent: step.intent ?? "modify",
      });
      const fullResponse = await streamExecutorStep(
        { prompt: stepPrompt, system: SYSTEM_PROMPT, temperature: 0.1 },
        (chunk) => {
          stepBuffer += chunk;
          send({ type: "step_chunk", stepIndex: i, stepId, content: chunk });
          const now = Date.now();
          if (now - lastPreviewTime >= PREVIEW_THROTTLE_MS && stepBuffer.trim().length > 20) {
            lastPreviewTime = now;
            const previewUI = tryPreviewFromStream(stepBuffer, currentUI);
            if (previewUI) send({ type: "step_preview", stepIndex: i, stepId, ui: previewUI });
          }
        }
      );
      const result = executeStepFromRawResponse(fullResponse, step, currentUI);
      currentUI = result.ui;
      uiState.setCurrentUI(currentUI, "modify", prompt);
      send({ type: "step_completed", stepIndex: i, stepId, ui: currentUI });
    } catch (stepError) {
      const msg = stepError instanceof Error ? stepError.message : String(stepError);
      failedSteps.push({ stepIndex: i, stepId, error: msg });
      send({ type: "step_error", stepIndex: i, stepId, error: msg });
    }
  }

  await streamUIAsJsonViaData(currentUI, send, writeTextDelta);
  send({ type: "complete", ui: currentUI, failedSteps: failedSteps.length > 0 ? failedSteps : undefined });
  send({ type: "final_status", delta: "UI generated successfully." });
}

/**
 * Try to produce a preview UI from partial streamed patch JSON (best-effort).
 * Extracts JSON from accumulated string, parses patches, applies ops one-by-one; returns last valid UI or null.
 */
function tryPreviewFromStream(accumulated: string, currentUI: LayoutNode): LayoutNode | null {
  let s = accumulated.trim();
  if (!s || s.length < 10) return null;
  const firstBrace = s.indexOf("{");
  if (firstBrace === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";
  for (let i = firstBrace; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        s = s.slice(firstBrace, i + 1);
        break;
      }
    }
  }
  if (depth > 0) {
    const open = (s.match(/\{/g) || []).length;
    const close = (s.match(/\}/g) || []).length;
    const openSq = (s.match(/\[/g) || []).length;
    const closeSq = (s.match(/\]/g) || []).length;
    for (let j = 0; j < Math.max(0, openSq - closeSq); j++) s += "]";
    for (let j = 0; j < Math.max(0, open - close); j++) s += "}";
  }
  let parsed: any;
  try {
    parsed = JSON.parse(s);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.patches)) return null;
  const patches = parsed.patches as PatchOperation[];
  if (patches.length === 0) return JSON.parse(JSON.stringify(currentUI)) as LayoutNode;
  let preview = JSON.parse(JSON.stringify(currentUI)) as LayoutNode;
  for (let i = 0; i < patches.length; i++) {
    const result = applyPatch(preview, [patches[i]]);
    if (!result.success || !result.modifiedUI) break;
    preview = result.modifiedUI;
  }
  return preview;
}

/** Options for plan-progress (used by /api/chat only). */
interface PlanProgressOptions {
  planOnly?: boolean;
  executePlan?: boolean;
  steps?: Array<{ id?: string; description: string; intent?: string }>;
}

/**
 * Modify UI endpoint
 * 
 * Uses the agent layer: routeRequest() → generateModifyUI()
 * Architecture: User Prompt → UI Agent (intent + validation) → Generative UI Engine → JSON UI State
 */
app.post("/api/modify", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'prompt' field",
      });
    }

    // Read current UI from state (single source of truth)
    const existingUI = uiState.getCurrentUI();

    if (!existingUI) {
      return res.status(400).json({
        success: false,
        error: "No existing UI to modify. Please create a UI first.",
      });
    }

    // Validate existing UI from state before passing to agent
    const existingValidation = validateLayoutNodeDirect(existingUI);
    if (!existingValidation.valid) {
      return res.status(400).json({
        success: false,
        error: "Invalid existingUI structure in state",
        validationErrors: existingValidation.errors || ["Unknown validation error"],
      });
    }

    try {
      // Route through agent layer: intent classification + routing + generation + validation
      const aiResponse = await routeRequest({
        userPrompt: prompt,
        currentUI: existingUI,
      });

      // Agent layer has already validated the response
      // Update state after successful MODIFY and validation
      uiState.setCurrentUI(aiResponse.ui, "modify", prompt);

      // Return UI from state (single source of truth)
      const stateUI = uiState.getCurrentUI();

      // Get detected intent for response
      const detectedIntent = classifyIntent(prompt, true);

      // Success - Return ONLY the pure LayoutNode structure
      res.json(stateUI);
    } catch (agentError) {
      if (agentError instanceof UnfulfillableModifyError) {
        return res.status(200).json({
          success: false,
          error: "unfulfillable",
          message: agentError.reason,
        });
      }
      console.error("[MODIFY] Agent layer error:", agentError);
      const errorMessage = agentError instanceof Error ? agentError.message : String(agentError);
      
      return res.status(500).json({
        success: false,
        error: "UI modification failed",
        message: errorMessage,
      });
    }
  } catch (error) {
    console.error("[MODIFY] Unexpected error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Goal-based UI agent endpoint
 * 
 * Uses the full agent layer: Planner → Executor
 * Architecture: User Goal → UI Agent (planning + execution + validation) → Generative UI Engine → JSON UI State
 * 
 * This endpoint handles high-level goals by:
 * 1. Planning: Breaking goal into ordered steps
 * 2. Execution: Executing steps sequentially with recovery
 * 3. Validation: Validating after each step
 * 4. State: Updating UI state after each successful step
 */
app.post("/api/goal", async (req, res) => {
  try {
    const { goal } = req.body;

    if (!goal || typeof goal !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'goal' field",
      });
    }

    // Read current UI from state (required for goal-based modifications)
    const existingUI = uiState.getCurrentUI();

    if (!existingUI) {
      return res.status(400).json({
        success: false,
        error: "No existing UI to modify. Please create a UI first.",
      });
    }

    // Validate existing UI from state
    const existingValidation = validateLayoutNodeDirect(existingUI);
    if (!existingValidation.valid) {
      return res.status(400).json({
        success: false,
        error: "Invalid existingUI structure in state",
        validationErrors: existingValidation.errors || ["Unknown validation error"],
      });
    }

    try {
      // Step 1: Generate raw plan from goal, then normalize (ids + dependency/resource order)
      console.log(`[GOAL] Generating plan for goal: "${goal}"`);
      const rawPlan = await generatePlan(goal, existingUI);
      const plan = normalizePlan(rawPlan);
      console.log(`[GOAL] Plan generated with ${plan.steps.length} steps`);

      console.log(`[GOAL] Executing plan...`);
      const executionResult = await executePlan(plan, existingUI, goal);

      if (!executionResult.success) {
        // Execution failed - return error with last valid UI
        const lastValidUI = executionResult.finalUI;
        if (lastValidUI) {
          // Update state with last valid UI
          uiState.setCurrentUI(lastValidUI, "modify", goal);
        }

        return res.status(500).json({
          success: false,
          error: executionResult.error || "Plan execution failed",
          stepsExecuted: executionResult.stepsExecuted,
          totalSteps: executionResult.totalSteps,
          failedStep: executionResult.failedStep,
          failedStepIndex: executionResult.failedStepIndex,
          finalUI: lastValidUI,
          validationResults: executionResult.validationResults,
        });
      }

      // Execution succeeded - update state with final UI
      uiState.setCurrentUI(executionResult.finalUI, "modify", goal);
      const stateUI = uiState.getCurrentUI();

      // Success
      res.json({
        success: true,
        data: {
          intent: "modify",
          ui: stateUI,
          explanation: `Successfully executed plan with ${executionResult.stepsExecuted} steps`,
        },
        ui: stateUI,
        intent: "modify",
        explanation: `Successfully executed plan with ${executionResult.stepsExecuted} steps`,
        plan: {
          totalSteps: executionResult.totalSteps,
          stepsExecuted: executionResult.stepsExecuted,
        },
        validationResults: executionResult.validationResults,
      });
    } catch (agentError) {
      console.error("[GOAL] Agent layer error:", agentError);
      const errorMessage = agentError instanceof Error ? agentError.message : String(agentError);
      
      return res.status(500).json({
        success: false,
        error: "Goal-based agent failed",
        message: errorMessage,
      });
    }
  } catch (error) {
    console.error("[GOAL] Unexpected error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get memory/conversation history endpoint
 */
app.get("/api/memory", (req, res) => {
  const history = globalMemory.getAllHistory();
  const stats = globalMemory.getStats();
  const context = globalMemory.getContextString(5);

  res.json({
    success: true,
    history,
    stats,
    context,
  });
});

/**
 * Clear memory endpoint
 */
app.post("/api/memory/clear", async (req, res) => {
  await globalMemory.clear();
  res.json({
    success: true,
    message: "Memory cleared",
  });
});

/**
 * Get current UI state endpoint
 * Allow frontend to read current state
 */
app.get("/api/state", (req, res) => {
  const currentUI = uiState.getCurrentUI();
  const currentVersion = uiState.getCurrentVersion();
  res.json({
    success: true,
    hasUI: uiState.hasCurrentUI(),
    ui: currentUI,
    version: currentVersion,
    versionCount: uiState.getVersionCount(),
  });
});

/**
 * Get UI state history endpoint
 * Phase 4, Step 4.3: Get all versions
 */
app.get("/api/state/history", (req, res) => {
  const history = uiState.getHistory();
  res.json({
    success: true,
    history: history,
    count: history.length,
  });
});

/**
 * Get specific version endpoint
 * Get version by ID
 */
app.get("/api/state/version/:versionId", (req, res) => {
  const { versionId } = req.params;
  const version = uiState.getVersion(versionId);
  
  if (!version) {
    return res.status(404).json({
      success: false,
      error: "Version not found",
    });
  }

  res.json({
    success: true,
    version: version,
  });
});

/**
 * Rollback to version endpoint
 * Restore exact prior UI
 */
app.post("/api/state/rollback", (req, res) => {
  const { versionId } = req.body;

  if (!versionId || typeof versionId !== "string") {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid 'versionId' field",
    });
  }

  const success = uiState.rollbackTo(versionId);

  if (!success) {
    return res.status(404).json({
      success: false,
      error: "Version not found",
    });
  }

  const currentUI = uiState.getCurrentUI();
  const currentVersion = uiState.getCurrentVersion();

  res.json({
    success: true,
    message: "Rolled back to version",
    versionId: versionId,
    ui: currentUI,
    version: currentVersion,
  });
});

/**
 * Compare versions endpoint
 * Diff/debug support for comparing versions
 */
app.post("/api/state/compare", (req, res) => {
  const { versionId1, versionId2 } = req.body;

  const comparison = uiState.compareVersions(
    versionId1 || null,
    versionId2 || null
  );

  if (!comparison) {
    return res.status(400).json({
      success: false,
      error: "One or both versions not found",
    });
  }

  res.json({
    success: true,
    comparison: {
      version1: {
        versionId: comparison.version1?.versionId,
        timestamp: comparison.version1?.timestamp,
        action: comparison.version1?.action,
        userInstruction: comparison.version1?.userInstruction,
      },
      version2: {
        versionId: comparison.version2?.versionId,
        timestamp: comparison.version2?.timestamp,
        action: comparison.version2?.action,
        userInstruction: comparison.version2?.userInstruction,
      },
      hasDifferences: comparison.uiDiff,
    },
  });
});

/**
 * Clear/reset UI state endpoint
 * Allow explicit state reset
 */
app.post("/api/state/clear", (req, res) => {
  uiState.clearCurrentUI();
  res.json({
    success: true,
    message: "UI state cleared",
  });
});

/**
 * Update UI state from JSON endpoint
 * Allows frontend to directly update UI state from edited JSON
 * Validates the JSON before updating state
 */
app.post("/api/state/update", (req, res) => {
  try {
    const { ui } = req.body;

    if (!ui) {
      return res.status(400).json({
        success: false,
        error: "Missing 'ui' field in request body",
      });
    }

    // Validate the UI structure before updating state
    const validation = validateLayoutNodeDirect(ui);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: "Invalid UI structure",
        validationErrors: validation.errors || ["Unknown validation error"],
      });
    }

    // Update state with validated UI
    // Use "modify" action since this is a manual edit
    uiState.setCurrentUI(ui, "modify", "Manual JSON edit");

    // Return updated UI from state (single source of truth)
    const stateUI = uiState.getCurrentUI();
    const currentVersion = uiState.getCurrentVersion();

    res.json({
      success: true,
      ui: stateUI,
      version: currentVersion ? {
        versionId: currentVersion.versionId,
        timestamp: currentVersion.timestamp,
        action: currentVersion.action,
        userInstruction: currentVersion.userInstruction,
      } : null,
    });
  } catch (error) {
    console.error("[STATE/UPDATE] Unexpected error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Serve React app for all non-API routes (SPA fallback)
// This MUST be after all API routes
app.get('*', (req, res) => {
  // Skip API routes - they should have been handled above
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: `API endpoint not found: ${req.path}`
    });
  }
  
  // Check if the built frontend exists
  const indexPath = path.join(__dirname, "../public/index.html");
  
  if (!fs.existsSync(indexPath)) {
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>UI Builder - Frontend Not Built</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #d32f2f; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1>Frontend Not Built</h1>
          <p>The frontend application has not been built yet. Please run:</p>
          <p><code>npm run build:frontend</code></p>
          <p>Then restart the server.</p>
          <hr>
          <p><small>API endpoints are still available at <code>/api/*</code></small></p>
        </body>
      </html>
    `);
  }
  
  // Serve the built React app's index.html
  res.sendFile(indexPath);
});

// Start server
app.listen(PORT, async () => {
  console.log(`[OK] UI Builder server running on http://localhost:${PORT}`);
  console.log(`[OK] Open http://localhost:${PORT} in your browser`);
  
  // Preload models in background to avoid cold start delays
  console.log(`[STARTUP] Starting model preloading...`);
  preloadModels().catch(error => {
    console.warn(`[STARTUP] Model preloading failed:`, error instanceof Error ? error.message : String(error));
  });
});
