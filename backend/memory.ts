/**
 * Memory System for Conversation History
 *
 * Tracks conversation history and UI state changes (no LangChain).
 */

import type { LayoutNode } from "../shared/schema";

export interface ConversationTurn {
  userPrompt: string;
  aiResponse: string;
  uiBefore?: LayoutNode;
  uiAfter: LayoutNode;
  timestamp: Date;
  intent: "create" | "modify";
  mode: "generator" | "planner";
}

/**
 * Simple memory with UI state tracking
 */
export class UIBuilderMemory {
  private conversationHistory: ConversationTurn[] = [];
  private maxTurns: number;

  constructor(maxTurns: number = 10) {
    this.maxTurns = maxTurns;
  }

  async addTurn(turn: ConversationTurn): Promise<void> {
    this.conversationHistory.push(turn);
    if (this.conversationHistory.length > this.maxTurns) {
      this.conversationHistory.shift();
    }
  }

  getRecentHistory(count: number = 5): ConversationTurn[] {
    return this.conversationHistory.slice(-count);
  }

  getAllHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }

  getContextString(count: number = 3): string {
    const recent = this.getRecentHistory(count);
    if (recent.length === 0) return "No previous conversation.";
    return recent
      .map(
        (turn, i) =>
          `Turn ${i + 1}:\nUser: ${turn.userPrompt}\nAI: ${turn.aiResponse}\nIntent: ${turn.intent}, Mode: ${turn.mode}`
      )
      .join("\n\n");
  }

  async clear(): Promise<void> {
    this.conversationHistory = [];
  }

  getStats() {
    return {
      totalTurns: this.conversationHistory.length,
      createCount: this.conversationHistory.filter((t) => t.intent === "create").length,
      modifyCount: this.conversationHistory.filter((t) => t.intent === "modify").length,
      generatorCount: this.conversationHistory.filter((t) => t.mode === "generator").length,
      plannerCount: this.conversationHistory.filter((t) => t.mode === "planner").length,
    };
  }
}

export const globalMemory = new UIBuilderMemory(20);
