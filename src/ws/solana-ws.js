import WebSocket from "ws";

function createJsonRpcMessage(method, params = []) {
  return {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params
  };
}

export function testSolanaWebSocket({ url, notificationsToReceive, timeoutMs, pingIntervalMs }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const ws = new WebSocket(url);
    let subscriptionId = null;
    let notifications = 0;
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(ping);

      if (ws.readyState === WebSocket.OPEN && subscriptionId !== null) {
        ws.send(JSON.stringify(createJsonRpcMessage("slotUnsubscribe", [subscriptionId])));
      }

      ws.close();

      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for ${notificationsToReceive} slot notifications.`));
    }, timeoutMs);

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, pingIntervalMs);

    ws.on("open", () => {
      ws.send(JSON.stringify(createJsonRpcMessage("slotSubscribe")));
    });

    ws.on("message", (raw) => {
      let message;

      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.error) {
        finish(new Error(`WebSocket RPC error: ${JSON.stringify(message.error)}`));
        return;
      }

      if (message.result && subscriptionId === null) {
        subscriptionId = message.result;
        return;
      }

      if (message.method === "slotNotification") {
        notifications += 1;

        if (notifications >= notificationsToReceive) {
          finish(null, {
            ok: true,
            provider: "solana-ws",
            subscriptionId,
            notifications,
            elapsedMs: Date.now() - startedAt,
            lastSlot: message.params?.result || null
          });
        }
      }
    });

    ws.on("error", (error) => {
      finish(error);
    });

    ws.on("close", () => {
      if (!settled) {
        finish(new Error("WebSocket closed before the test completed."));
      }
    });
  });
}
