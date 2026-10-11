import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { createPrivateBetaWebHandler } from "../src/ui.js";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("private-beta tester UI", () => {
  it("serves a bilingual user-friendly onboarding UI and delegates API paths", async () => {
    let delegated = 0;
    const handler = createPrivateBetaWebHandler(async (_request, response) => {
      delegated += 1;
      response.statusCode = 204;
      response.end();
    });
    const server = createServer((request, response) => void handler(request, response));
    const baseUrl = await listen(server);

    try {
      const page = await fetch(`${baseUrl}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
      const html = await page.text();
      expect(html).toContain("MYMODZ · FACTORIO BETA");
      expect(html).toContain("Make Factorio play your way.");
      expect(html).toContain("No Lua required");
      expect(html).toContain("We build & check");
      expect(html).toContain("Paste your invite token");
      expect(html).toContain("Start with an example");
      expect(html).toContain("NEW CONTENT");
      expect(html).toContain("Create a new machine with its own recipe and technology");
      expect(html).toContain("Add a new alternative recipe for an existing item");
      expect(html).toContain("Create a new material and use it in a new machine");
      expect(html).toContain('data-prompt-ru="Создай новый промежуточный предмет «Усиленная пластина»');
      expect(html).toContain('data-prompt-ru="Создай новый рецепт «Стальные шестерни»');
      expect(html).toContain("custom graphics/assets");
      expect(html).toContain("What can I change right now?");
      expect(html).toContain('data-lang-select="en"');
      expect(html).toContain('data-lang-select="ru"');
      expect(html).toContain('data-prompt-ru="Ускорь сборочный автомат 2');
      expect(html).toContain('data-prompt-ru="Создай новую машину «Улучшенная электрическая печь»');
      expect(html).toContain('id="token"');
      expect(html).toContain('id="clear-token"');
      expect(html).toContain('id="history-panel"');
      expect(html).toContain("What the mod changes");
      expect(html).toContain("What changed in this revision");
      expect(html).toContain("Did MyModz understand what you wanted?");
      expect(html).toContain('data-intent="partial"');
      expect(html).toContain('data-game="not_tested"');
      expect(html).toContain('id="feedback-issue"');
      expect(html).toContain('id="save-feedback"');
      expect(html).toContain("isolated base-game Factorio 2.0.77");
      expect(html).toContain('id="revision-prompt"');
      expect(html).toContain('id="revise"');
      expect(html).toContain('src="/app.js"');

      const script = await fetch(`${baseUrl}/app.js`);
      expect(script.status).toBe(200);
      const javascript = await script.text();
      expect(javascript).toContain("project.language");
      expect(javascript).toContain("localStorage.setItem");
      expect(javascript).toContain("sessionStorage");
      expect(javascript).toContain("sessionStorage.removeItem");
      expect(javascript).toContain("Настрой Factorio под себя.");
      expect(javascript).toContain("Собрать мой мод");
      expect(javascript).toContain('"cap.new_machine":"Новая машина"');
      expect(javascript).toContain('"cap.new_recipe":"Новый рецепт"');
      expect(javascript).toContain('"cap.new_item":"Новый материал"');
      expect(javascript).toContain('change.type === "new_machine"');
      expect(javascript).toContain('change.type === "new_recipe"');
      expect(javascript).toContain('change.type === "new_item"');
      expect(javascript).toContain("Проверка запускается в изолированной базовой Factorio 2.0.77");
      expect(javascript).toContain("data-prompt-en");
      expect(javascript).toContain('Accept:"application/json"');
      expect(javascript).toContain("/feedback");
      expect(javascript).toContain("intentMatch:feedbackIntent");
      expect(javascript).toContain("gameTest:feedbackGame");
      expect(javascript).toContain("MyModz правильно понял, что ты хотел?");
      expect(javascript).toContain("/retry");
      expect(javascript).toContain("/revise");
      expect(javascript).toContain("/v1/generations?limit=10");
      expect(javascript).toContain("renderHistory");
      expect(javascript).toContain("describeChange");
      expect(javascript).toContain("revisionDiff");
      expect(javascript).toContain("/v1/survey");

      const css = await fetch(`${baseUrl}/app.css`);
      expect(css.status).toBe(200);
      expect(css.headers.get("content-type")).toContain("text/css");
      const stylesheet = await css.text();
      expect(stylesheet).toContain(".language-switch");
      expect(stylesheet).toContain(".workflow");
      expect(stylesheet).toContain(".example-grid");
      expect(stylesheet).toContain(".example-featured");

      const api = await fetch(`${baseUrl}/v1/generations/example`);
      expect(api.status).toBe(204);
      expect(delegated).toBe(1);
    } finally {
      await close(server);
    }
  });
});
