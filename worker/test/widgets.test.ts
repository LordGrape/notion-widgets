import { describe, expect, it } from "vitest";
import { buildWidgetAssetUrl, widgetAssetPath, widgetContentType } from "../src/routes/widgets";
import { validateAuth } from "../src/auth";
import type { Env } from "../src/types";

describe("widget asset proxy", () => {
  it("allows the public widget files and safe nested assets", () => {
    expect(widgetAssetPath("/widgets/timetable.html")).toBe("timetable.html");
    expect(widgetAssetPath("/widgets/action-blocks.js")).toBe("action-blocks.js");
    expect(widgetAssetPath("/widgets/assets/card.webp")).toBe("assets/card.webp");
    expect(buildWidgetAssetUrl("/widgets/todo.html")).toBe(
      "https:" + "//raw.githubusercontent.com/LordGrape/notion-widgets/main/todo.html"
    );
  });

  it("rejects traversal and non-static repository files", () => {
    expect(widgetAssetPath("/widgets/../worker/src/index.ts")).toBeNull();
    expect(widgetAssetPath("/widgets/%2e%2e%2fAGENTS.md")).toBeNull();
    expect(widgetAssetPath("/widgets/worker/src/index.ts")).toBeNull();
  });

  it("serves scripts with an executable content type", () => {
    expect(widgetContentType("action-blocks.js")).toBe("application/javascript; charset=utf-8");
    expect(widgetContentType("timetable.html")).toBe("text/html; charset=utf-8");
  });

  it("does not require the private widget key for public widget assets", () => {
    const request = new Request("https:" + "//worker.example/widgets/timetable.html");
    expect(validateAuth(request, { WIDGET_SECRET: "secret" } as Env, "/widgets/timetable.html")).toBeNull();
  });
});
