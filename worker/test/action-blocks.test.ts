import { describe, expect, it } from "vitest";
import { fromNotionPage, fromTimetablePage, toNotionProperties, toTimetableProperties } from "../src/routes/action-blocks";

describe("Action Blocks Notion bridge", () => {
  it("maps a scheduled study action to exact Notion properties", () => {
    const props = toNotionProperties({ occurrenceId: "tt:block-1:2026-09-02", scheduleId: "block-1", action: "LAW 171 recall", category: "Study", status: "Scheduled", scheduledStart: "2026-09-02T21:00:00.000Z", scheduledEnd: "2026-09-02T21:15:00.000Z", plannedMinutes: 15, priority: "Should", source: "Schedule", notes: "Closed-note retrieval" }) as any;
    expect(props.Action.title[0].text.content).toBe("LAW 171 recall");
    expect(props.Status.status.name).toBe("Scheduled");
    expect(props["Occurrence ID"].rich_text[0].text.content).toContain("block-1");
    expect(props.Scheduled.date.end).toContain("21:15");
  });

  it("maps a Notion action row back to a widget occurrence", () => {
    const item = fromNotionPage({ id: "page-1", last_edited_time: "2026-09-02T20:00:00.000Z", properties: { Action: { title: [{ plain_text: "Zone 2" }] }, Status: { status: { name: "Done" } }, Category: { select: { name: "Training" } }, Scheduled: { date: { start: "2026-09-02T12:00:00.000Z", end: null } }, "Occurrence ID": { rich_text: [{ plain_text: "tt:z2:2026-09-02" }] }, "Schedule ID": { rich_text: [{ plain_text: "z2" }] }, "Planned minutes": { number: 40 }, "Actual minutes": { number: 38 }, Priority: { select: { name: "Should" } }, Source: { select: { name: "Schedule" } }, Notes: { rich_text: [] } } });
    expect(item.status).toBe("Done");
    expect(item.category).toBe("Training");
    expect(item.occurrenceId).toBe("tt:z2:2026-09-02");
  });

  it("round-trips a timetable occurrence", () => {
    const props = toTimetableProperties({ target: "timetable", occurrenceId: "tt:law195:2026-09-09", scheduleId: "law195", activity: "LAW 195", category: "Class", scheduledStart: "2026-09-09T14:00:00.000Z", scheduledEnd: "2026-09-09T15:30:00.000Z", location: "Room 100", notes: "Class" }) as any;
    const item = fromTimetablePage({ id: "page-tt", properties: props as any });
    expect(item.activity).toBe("LAW 195");
    expect(item.scheduleId).toBe("law195");
    expect(item.scheduledEnd).toContain("15:30");
  });

  it("gives manually created Notion rows stable fallback identifiers", () => {
    const item = fromTimetablePage({ id: "manual-page", properties: { Activity: { title: [{ plain_text: "Orientation" }] }, Category: { select: { name: "Personal" } }, Scheduled: { date: { start: "2026-09-09T09:00:00-04:00", end: "2026-09-09T16:30:00-04:00" } }, Location: { rich_text: [] }, Notes: { rich_text: [] }, "Occurrence ID": { rich_text: [] }, "Schedule ID": { rich_text: [] } } });
    expect(item.occurrenceId).toBe("notion:manual-page");
    expect(item.scheduleId).toBe("notion:manual-page");
  });
});
