import { describe, expect, it } from "vitest";
import { fromNotionPage, toNotionProperties } from "../src/routes/action-blocks";

describe("Action Blocks Notion bridge", () => {
  it("maps a scheduled study action to exact Notion properties", () => {
    const props = toNotionProperties({
      occurrenceId: "tt:block-1:2026-09-02",
      scheduleId: "block-1",
      action: "LAW 171 recall",
      category: "Study",
      status: "Scheduled",
      scheduledStart: "2026-09-02T21:00:00.000Z",
      scheduledEnd: "2026-09-02T21:15:00.000Z",
      plannedMinutes: 15,
      priority: "Should",
      source: "Schedule",
      notes: "Closed-note retrieval"
    }) as any;
    expect(props.Action.title[0].text.content).toBe("LAW 171 recall");
    expect(props.Status.status.name).toBe("Scheduled");
    expect(props["Occurrence ID"].rich_text[0].text.content).toContain("block-1");
    expect(props.Scheduled.date.end).toContain("21:15");
  });

  it("maps a Notion row back to a widget occurrence", () => {
    const item = fromNotionPage({
      id: "page-1",
      last_edited_time: "2026-09-02T20:00:00.000Z",
      properties: {
        Action: { title: [{ plain_text: "Zone 2" }] },
        Status: { status: { name: "Done" } },
        Category: { select: { name: "Training" } },
        Scheduled: { date: { start: "2026-09-02T12:00:00.000Z", end: null } },
        "Occurrence ID": { rich_text: [{ plain_text: "tt:z2:2026-09-02" }] },
        "Schedule ID": { rich_text: [{ plain_text: "z2" }] },
        "Planned minutes": { number: 40 },
        "Actual minutes": { number: 38 },
        Priority: { select: { name: "Should" } },
        Source: { select: { name: "Schedule" } },
        Notes: { rich_text: [] }
      }
    });
    expect(item.status).toBe("Done");
    expect(item.category).toBe("Training");
    expect(item.occurrenceId).toBe("tt:z2:2026-09-02");
  });
});
