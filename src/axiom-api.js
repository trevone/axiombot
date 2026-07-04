const DEFAULT_BASE_URL = "https://lar.axiom.ai";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AxiomApiClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async listAutomations() {
    return this.post("/api/v3/list-automations", {});
  }

  async triggerAutomation(name, data) {
    const payload = { name };

    if (data) {
      payload.data = data;
    }

    return this.post("/api/v3/trigger", payload);
  }

  async getRunData(name) {
    return this.post("/api/v3/run-data", { name });
  }

  async waitForRun(name, { pollIntervalMs, timeoutMs }) {
    const startedAt = Date.now();

    while (true) {
      const result = await this.getRunData(name);

      if (result.status === "Success") {
        return result;
      }

      if (result.status === "Failure") {
        throw new Error(`Axiom automation failed: ${JSON.stringify(result)}`);
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for "${name}" after ${timeoutMs}ms.`);
      }

      await sleep(pollIntervalMs);
    }
  }

  async post(path, payload) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: this.apiKey,
        ...payload
      })
    });

    let result;
    try {
      result = await response.json();
    } catch {
      const body = await response.text();
      throw new Error(`Axiom API returned non-JSON response (${response.status}): ${body}`);
    }

    if (!response.ok) {
      throw new Error(`Axiom API request failed (${response.status}): ${JSON.stringify(result)}`);
    }

    if (result.status === "error") {
      throw new Error(result.message || "Axiom API returned an error.");
    }

    return result;
  }
}
