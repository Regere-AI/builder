/**
 * json-render streaming (SpecStream) helpers.
 *
 * - SpecStream: JSONL format where each line is an RFC 6902 JSON patch (op, path, value).
 * - createSpecStreamCompiler: low-level compiler; push chunks and read result for progressive UI.
 * - compileSpecStream: one-shot compile of full JSONL string.
 *
 * React hooks (from @json-render/react):
 * - useUIStream({ api }): call a single-prompt generate endpoint; spec updates as the stream arrives.
 * - useChatUI({ api }): full chat with mixed text + spec per message (alternative to useChat + useJsonRenderMessage).
 * - useJsonRenderMessage(parts): extract spec + text from AI SDK message.parts for use with useChat.
 *
 * @see https://json-render.dev/docs/streaming
 * @see https://json-render.dev/docs/api/react
 */

export { createSpecStreamCompiler, compileSpecStream } from '@json-render/core'
