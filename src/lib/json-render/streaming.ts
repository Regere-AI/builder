/**
 * json-render streaming (SpecStream) helpers.
 *
 * SpecStream uses RFC 6902 JSON Patch. Each line is one patch object. All six operations
 * are supported by @json-render/core (createSpecStreamCompiler / compileSpecStream):
 *
 * - add    — Add a value at path (creates/replaces for objects, inserts for arrays). Requires "value".
 * - remove — Remove the value at path.
 * - replace — Replace the value at path. Requires "value".
 * - move   — Move a value from one path to another. Requires "from".
 * - copy   — Copy a value from one path to another. Requires "from".
 * - test   — Assert value at path equals given value. Requires "value".
 *
 * Path format: JSON Pointer (RFC 6901) into the spec, e.g.:
 *   /root                      → root element key (string)
 *   /elements/<id>             → element with key <id>
 *   /elements/<id>/props       → props of element
 *   /elements/<id>/children   → children array of element
 *
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
 * @see https://json-render.dev/docs/api/core (SpecStream types)
 */

export { createSpecStreamCompiler, compileSpecStream } from '@json-render/core'
