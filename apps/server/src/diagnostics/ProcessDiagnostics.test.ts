import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ProcessDiagnostics from "./ProcessDiagnostics.ts";

describe("ProcessDiagnostics", () => {
  it.effect("parses POSIX ps rows with full commands", () =>
    Effect.sync(() => {
      const rows = ProcessDiagnostics.parsePosixProcessRows(
        [
          "  10     1    10 Ss      0.0   1024   01:02.03 /usr/bin/node server.js   ",
          "  11    10    10 S+     12.5  20480      00:04 codex app-server --config /tmp/one two",
        ].join("\n"),
      );

      expect(rows).toEqual([
        {
          pid: 10,
          ppid: 1,
          pgid: 10,
          status: "Ss",
          cpuPercent: 0,
          rssBytes: 1024 * 1024,
          elapsed: "01:02.03",
          command: "/usr/bin/node server.js",
        },
        {
          pid: 11,
          ppid: 10,
          pgid: 10,
          status: "S+",
          cpuPercent: 12.5,
          rssBytes: 20480 * 1024,
          elapsed: "00:04",
          command: "codex app-server --config /tmp/one two",
        },
      ]);
    }),
  );

  it.effect("aggregates only descendants of the server process", () =>
    Effect.sync(() => {
      const diagnostics = ProcessDiagnostics.aggregateProcessDiagnostics({
        serverPid: 100,
        readAt: DateTime.makeUnsafe("2026-05-05T10:00:00.000Z"),
        rows: [
          {
            pid: 100,
            ppid: 1,
            pgid: 100,
            status: "S",
            cpuPercent: 0,
            rssBytes: 1_000,
            elapsed: "01:00",
            command: "t3 server",
          },
          {
            pid: 101,
            ppid: 100,
            pgid: 100,
            status: "S",
            cpuPercent: 1.5,
            rssBytes: 2_000,
            elapsed: "00:20",
            command: "codex app-server",
          },
          {
            pid: 102,
            ppid: 101,
            pgid: 100,
            status: "R",
            cpuPercent: 3.25,
            rssBytes: 4_000,
            elapsed: "00:05",
            command: "git status",
          },
          {
            pid: 200,
            ppid: 1,
            pgid: 200,
            status: "S",
            cpuPercent: 99,
            rssBytes: 8_000,
            elapsed: "00:01",
            command: "unrelated",
          },
          {
            pid: 201,
            ppid: 100,
            pgid: 100,
            status: "R",
            cpuPercent: 9,
            rssBytes: 9_000,
            elapsed: "00:00",
            command: "ps -axo pid=,ppid=,pgid=,stat=,pcpu=,rss=,etime=,command=",
          },
        ],
      });

      expect(diagnostics.serverPid).toBe(100);
      expect(DateTime.formatIso(diagnostics.readAt)).toBe("2026-05-05T10:00:00.000Z");
      expect(diagnostics.processCount).toBe(2);
      expect(diagnostics.totalRssBytes).toBe(6_000);
      expect(diagnostics.totalCpuPercent).toBe(4.75);
      expect(diagnostics.processes.map((process) => process.pid)).toEqual([101, 102]);
      expect(diagnostics.processes.map((process) => process.depth)).toEqual([0, 1]);
      expect(Option.getOrNull(diagnostics.processes[0]!.pgid)).toBe(100);
      expect(diagnostics.processes[0]?.childPids).toEqual([102]);
    }),
  );

  it.effect("preserves ascending sibling order for nested descendants", () =>
    Effect.sync(() => {
      const diagnostics = ProcessDiagnostics.aggregateProcessDiagnostics({
        serverPid: 100,
        readAt: DateTime.makeUnsafe("2026-05-05T10:00:00.000Z"),
        rows: [
          {
            pid: 101,
            ppid: 100,
            pgid: 100,
            status: "S",
            cpuPercent: 0,
            rssBytes: 100,
            elapsed: "00:10",
            command: "agent",
          },
          {
            pid: 103,
            ppid: 101,
            pgid: 100,
            status: "S",
            cpuPercent: 0,
            rssBytes: 100,
            elapsed: "00:10",
            command: "child-b",
          },
          {
            pid: 102,
            ppid: 101,
            pgid: 100,
            status: "S",
            cpuPercent: 0,
            rssBytes: 100,
            elapsed: "00:10",
            command: "child-a",
          },
        ],
      });

      expect(diagnostics.processes.map((process) => process.pid)).toEqual([101, 102, 103]);
    }),
  );

  it.effect("parses lsof listening port rows", () =>
    Effect.sync(() => {
      const ports = ProcessDiagnostics.parseLsofListeningPortRows(
        [
          "p101",
          "cnode",
          "f21",
          "PTCP",
          "n127.0.0.1:3000",
          "TST=LISTEN",
          "p102",
          "cvite",
          "f9",
          "PUDP",
          "n*:5173",
          "f10",
          "PUDP",
          "n*:*",
        ].join("\n"),
      );

      expect(ports).toEqual([
        {
          protocol: "TCP",
          localAddress: "127.0.0.1",
          localPort: 3000,
          pid: 101,
          command: "node",
        },
        {
          protocol: "UDP",
          localAddress: "*",
          localPort: 5173,
          pid: 102,
          command: "vite",
        },
      ]);
    }),
  );

  it.effect("aggregates machine processes with protected T3 server row", () =>
    Effect.sync(() => {
      const snapshot = ProcessDiagnostics.aggregateMachineProcessSnapshot({
        serverPid: 100,
        readAt: DateTime.makeUnsafe("2026-05-05T10:00:00.000Z"),
        rows: [
          {
            pid: 100,
            ppid: 1,
            pgid: 100,
            status: "S",
            cpuPercent: 1,
            rssBytes: 1_000,
            elapsed: "01:00",
            command: "t3 server",
          },
          {
            pid: 101,
            ppid: 1,
            pgid: 101,
            status: "R",
            cpuPercent: 9,
            rssBytes: 2_000,
            elapsed: "00:10",
            command: "vite --host 0.0.0.0",
          },
        ],
        ports: [
          {
            protocol: "TCP",
            localAddress: "127.0.0.1",
            localPort: 3000,
            pid: 100,
            command: "t3",
          },
          {
            protocol: "TCP",
            localAddress: "*",
            localPort: 5173,
            pid: 101,
            command: "vite",
          },
          {
            protocol: "TCP",
            localAddress: "*",
            localPort: 5173,
            pid: 101,
            command: "vite",
          },
        ],
      });

      expect(snapshot.processCount).toBe(2);
      expect(snapshot.serviceCount).toBe(2);
      expect(snapshot.ports.map((port) => `${port.pid}:${port.localPort}`)).toEqual([
        "100:3000",
        "101:5173",
      ]);
      expect(snapshot.processes.find((process) => process.pid === 100)?.canSignal).toBe(false);
      expect(snapshot.processes.find((process) => process.pid === 101)?.canSignal).toBe(true);
      expect(snapshot.ports.find((port) => port.pid === 100)?.protectedReason).toBe(
        "T3 server process",
      );
    }),
  );
});
