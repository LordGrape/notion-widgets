import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignmentFilter,
  fromAssignmentPage,
  fromPhasePage,
  handleUpcomingAssignments,
  sortPhases,
  validDateKey,
} from "../upcoming-assignments";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upcoming assignment helpers", () => {
  it("builds a bounded assignment-only filter", () => {
    const filter = assignmentFilter("2026-09-03", "2026-09-17");
    expect(filter).toEqual({
      and: [
        { property: "assignment", select: { equals: "assignment 📑" } },
        { property: "progress", status: { does_not_equal: "done" } },
        { property: "date", date: { on_or_after: "2026-09-03" } },
        { property: "date", date: { on_or_before: "2026-09-17" } },
        { property: "hide from calendar", checkbox: { equals: false } },
      ],
    });
  });

  it("validates calendar date keys", () => {
    expect(validDateKey("2026-09-03")).toBe(true);
    expect(validDateKey("2026-9-3")).toBe(false);
    expect(validDateKey(null)).toBe(false);
  });

  it("maps only the assignment and phase fields needed by the widget", () => {
    expect(
      fromAssignmentPage({
        id: "assignment-1",
        url: "https://notion.example/assignment-1",
        properties: {
          "lecture/assignment": {
            title: [{ plain_text: "Case Brief Assignment" }],
          },
          date: { date: { start: "2026-09-12" } },
        },
      }),
    ).toEqual({
      id: "assignment-1",
      title: "Case Brief Assignment",
      due: "2026-09-12",
      url: "https://notion.example/assignment-1",
      phases: [],
    });

    expect(
      fromPhasePage({
        id: "phase-page-1",
        last_edited_time: "2026-09-03T12:00:00.000Z",
        properties: {
          Action: { title: [{ plain_text: "Draft paper" }] },
          "Occurrence ID": {
            rich_text: [{ plain_text: "assignment:assignment-1:phase-1" }],
          },
          Status: { status: { name: "Scheduled" } },
          Scheduled: { date: { start: "2026-09-08" } },
          Context: { relation: [{ id: "assignment-1" }] },
        },
      }),
    ).toEqual({
      notionPageId: "phase-page-1",
      occurrenceId: "assignment:assignment-1:phase-1",
      action: "Draft paper",
      status: "Scheduled",
      scheduledStart: "2026-09-08",
      contextPageId: "assignment-1",
      lastEdited: "2026-09-03T12:00:00.000Z",
    });
  });

  it("sorts dated phases first and leaves unscheduled phases available", () => {
    const phases = sortPhases([
      {
        notionPageId: "3",
        occurrenceId: "3",
        action: "Finalise",
        status: "Scheduled",
        scheduledStart: null,
        contextPageId: "a",
        lastEdited: null,
      },
      {
        notionPageId: "2",
        occurrenceId: "2",
        action: "Edit",
        status: "Scheduled",
        scheduledStart: "2026-09-10",
        contextPageId: "a",
        lastEdited: null,
      },
      {
        notionPageId: "1",
        occurrenceId: "1",
        action: "Draft",
        status: "Done",
        scheduledStart: "2026-09-05",
        contextPageId: "a",
        lastEdited: null,
      },
    ]);
    expect(phases.map((phase) => phase.action)).toEqual([
      "Draft",
      "Edit",
      "Finalise",
    ]);
  });
});

describe("upcoming assignment route", () => {
  it("returns five or fewer assignments with linked phases", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      const relationFilter = body.filter?.and?.find(
        (entry: { property?: string }) => entry.property === "Context",
      );
      if (relationFilter) {
        const assignmentId = relationFilter.relation.contains;
        return new Response(
          JSON.stringify({
            results: [
              {
                id: `phase-${assignmentId}`,
                properties: {
                  Action: { title: [{ plain_text: "Draft paper" }] },
                  "Occurrence ID": {
                    rich_text: [
                      { plain_text: `assignment:${assignmentId}:draft` },
                    ],
                  },
                  Status: { status: { name: "Scheduled" } },
                  Scheduled: { date: null },
                  Context: { relation: [{ id: assignmentId }] },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      expect(body.page_size).toBe(5);
      expect(body.filter).toEqual(assignmentFilter("2026-09-03", "2026-09-17"));
      return new Response(
        JSON.stringify({
          results: [
            {
              id: "assignment-1",
              url: "https://notion.example/assignment-1",
              properties: {
                "lecture/assignment": {
                  title: [{ plain_text: "Case Brief Assignment" }],
                },
                date: { date: { start: "2026-09-12" } },
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleUpcomingAssignments(
      new Request(
        "https://worker.example/notion/upcoming?from=2026-09-03&to=2026-09-17",
      ),
      { NOTION_TOKEN: "test" } as never,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      configured: boolean;
      assignments: Array<{ title: string; phases: Array<{ action: string }> }>;
    };
    expect(payload.configured).toBe(true);
    expect(payload.assignments).toHaveLength(1);
    expect(payload.assignments[0].title).toBe("Case Brief Assignment");
    expect(payload.assignments[0].phases[0].action).toBe("Draft paper");
  });

  it("rejects invalid or reversed windows", async () => {
    const invalid = await handleUpcomingAssignments(
      new Request(
        "https://worker.example/notion/upcoming?from=2026-9-3&to=2026-09-17",
      ),
      { NOTION_TOKEN: "test" } as never,
    );
    expect(invalid.status).toBe(400);

    const reversed = await handleUpcomingAssignments(
      new Request(
        "https://worker.example/notion/upcoming?from=2026-09-17&to=2026-09-03",
      ),
      { NOTION_TOKEN: "test" } as never,
    );
    expect(reversed.status).toBe(400);
  });
});
