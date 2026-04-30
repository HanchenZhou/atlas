import type { AgentEvent } from '../providers/types';

export function encodeSse(event: AgentEvent): string {
  const { type, ...rest } = event;
  return `event: ${type}\ndata: ${JSON.stringify(rest)}\n\n`;
}

export function sseStream(events: AsyncIterable<AgentEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(encodeSse(event)));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            encodeSse({ type: 'error', message: (err as Error).message }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
}
