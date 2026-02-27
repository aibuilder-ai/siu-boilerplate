import { DurableObject } from "cloudflare:workers";

export class WebSocketServer extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    for (const client of this.ctx.getWebSockets()) {
      client.send(
        typeof message === "string" ? message : new TextDecoder().decode(message)
      );
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }
}
