/**
 * Intent-based Router
 * 
 * Routes user requests to the correct generator based on detected intent.
 * This is a pure routing layer that does not manage state or render UI.
 */

import { classifyIntent } from "./intent";
import { generateCreateUI } from "./create";
import { generateModifyUI } from "./modify";
import type { AIResponse } from "../ai-contract/types";
import type { LayoutNode } from "../../shared/schema";

/**
 * Route request to correct generator based on intent.
 * Uses AI SDK Core (generateText) via create/modify; no LLM client parameter.
 */
export async function routeRequest({
  userPrompt,
  currentUI,
}: {
  userPrompt: string;
  currentUI?: LayoutNode | null;
}): Promise<AIResponse> {
  const intent = classifyIntent(userPrompt, Boolean(currentUI));

  switch (intent) {
    case "create":
      return generateCreateUI(userPrompt, null);

    case "modify":
    case "add":
    case "remove":
      if (!currentUI) {
        console.warn("[ROUTER] Modify/add/remove intent but no UI exists, falling back to create");
        return generateCreateUI(userPrompt, null);
      }
      return generateModifyUI(userPrompt, currentUI);

    default:
      throw new Error(`Unhandled intent: ${intent satisfies never}`);
  }
}
