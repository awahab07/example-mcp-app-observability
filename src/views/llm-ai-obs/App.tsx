/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMcpApp } from "@shared/hooks/useMcpApp";
import { parseToolResult } from "@shared/parse-tool-result";
import { theme, applyTheme } from "@shared/theme";
import { SectionCard, StatCard, StatGrid, StatusBadge } from "@shared/components";

interface AipmTraceSummary {
  traceId: string;
  workflowName: string;
  serviceName: string;
  startedAt: string;
  durationUs: number;
  outcome: string;
  provider?: string;
  model?: string;
  totalTokens?: number;
  totalCost?: number;
  warning?: string;
  apmQuery: string;
}

interface AipmTraceMapNode {
  id: string;
  label: string;
  subtitle?: string;
  nodeKind: string;
  outcome: string;
  durationUs?: number;
  summary?: string;
  warning?: string;
  badges?: string[];
  apmQuery: string;
}

interface AipmTraceMapEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  summary?: string;
  outcome?: string;
  apmQuery: string;
}

interface LlmAiObsResult {
  status: "OK" | "NO_AIPM_TRACE";
  message: string;
  trace_id?: string;
  focus_step_id?: string;
  trace?: AipmTraceSummary;
  map?: {
    nodes: AipmTraceMapNode[];
    edges: AipmTraceMapEdge[];
  };
  links?: {
    aipm_agent_map?: string;
    apm_trace?: string;
  };
  filters?: Record<string, unknown>;
}

interface PositionedNode extends AipmTraceMapNode {
  x: number;
  y: number;
}

const NODE_WIDTH = 230;
const NODE_HEIGHT = 96;
const RANK_GAP = 300;
const ROW_GAP = 136;

function formatDuration(us?: number): string {
  if (!us) return "-";
  if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(2)}s`;
  if (us >= 1_000) return `${Math.round(us / 1_000)}ms`;
  return `${Math.round(us)}us`;
}

function formatCost(value?: number): string {
  if (value == null) return "-";
  return `$${value.toFixed(3)}`;
}

function colorForKind(kind: string, outcome: string): string {
  if (outcome === "failure") return theme.red;
  switch (kind) {
    case "model":
      return theme.purple;
    case "tool":
      return theme.amber;
    case "mcp":
      return theme.cyan;
    case "service":
      return theme.blue;
    case "evaluator":
    case "feedback":
      return theme.greenSoft;
    default:
      return theme.textMuted;
  }
}

function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);

  return lines.slice(0, 2).map((line, index, arr) =>
    index === 1 && arr.length < lines.length ? `${line.slice(0, maxChars - 1)}…` : line
  );
}

function compactEdgeLabel(label: string): string {
  return label.split(" • ")[0] || label;
}

function truncateText(value: string | undefined, maxChars: number): string {
  if (!value || value.length <= maxChars) return value ?? "";
  return `${value.slice(0, maxChars - 1)}…`;
}

function layoutNodes(nodes: AipmTraceMapNode[], edges: AipmTraceMapEdge[]): PositionedNode[] {
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  for (let i = 0; i < nodes.length; i++) {
    for (const edge of edges) {
      const sourceRank = rank.get(edge.source) ?? 0;
      const targetRank = rank.get(edge.target) ?? 0;
      if (sourceRank + 1 > targetRank) {
        rank.set(edge.target, sourceRank + 1);
      }
    }
  }

  const rowsByRank = new Map<number, AipmTraceMapNode[]>();
  for (const node of nodes) {
    const nodeRank = rank.get(node.id) ?? 0;
    const rows = rowsByRank.get(nodeRank) ?? [];
    rows.push(node);
    rowsByRank.set(nodeRank, rows);
  }

  return nodes.map((node) => {
    const nodeRank = rank.get(node.id) ?? 0;
    const row = rowsByRank.get(nodeRank)?.findIndex((candidate) => candidate.id === node.id) ?? 0;
    return {
      ...node,
      x: 40 + nodeRank * RANK_GAP,
      y: 40 + row * ROW_GAP,
    };
  });
}

function AgentMap({ data, focusStepId }: { data: LlmAiObsResult; focusStepId?: string }) {
  const map = data.map;
  const positioned = useMemo(
    () => (map ? layoutNodes(map.nodes, map.edges) : []),
    [map]
  );
  const nodeById = new Map(positioned.map((node) => [node.id, node]));
  const maxX = Math.max(...positioned.map((node) => node.x), 0) + NODE_WIDTH + 40;
  const maxY = Math.max(...positioned.map((node) => node.y), 0) + NODE_HEIGHT + 40;

  if (!map || !positioned.length) {
    return <SectionCard title="Agent map">{data.message}</SectionCard>;
  }

  return (
    <SectionCard title="Agent map">
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg width={Math.max(maxX, 760)} height={Math.max(maxY, 240)} role="img">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.borderStrong} />
            </marker>
          </defs>
          {map.edges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            if (!source || !target) return null;
            const x1 = source.x + NODE_WIDTH;
            const y1 = source.y + NODE_HEIGHT / 2;
            const x2 = target.x;
            const y2 = target.y + NODE_HEIGHT / 2;
            const midX = (x1 + x2) / 2;
            return (
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.outcome === "failure" ? theme.red : theme.borderStrong}
                  strokeWidth={2}
                  markerEnd="url(#arrow)"
                />
                <text x={midX} y={(y1 + y2) / 2 - 6} fill={theme.textDim} fontSize="10" textAnchor="middle">
                  {compactEdgeLabel(edge.label)}
                </text>
              </g>
            );
          })}
          {positioned.map((node) => {
            const focused = node.id === focusStepId;
            const color = colorForKind(node.nodeKind, node.outcome);
            const labelLines = wrapLabel(node.label, 28);
            return (
              <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="10"
                  fill={theme.bgTertiary}
                  stroke={focused ? color : theme.border}
                  strokeWidth={focused ? 3 : 1}
                />
                <rect width={NODE_WIDTH} height="5" rx="3" fill={color} />
                <text x="12" y="25" fill={theme.text} fontSize="12" fontWeight="700">
                  {labelLines.map((line, index) => (
                    <tspan key={`${node.id}-${index}`} x="12" dy={index === 0 ? 0 : 15}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text x="12" y={labelLines.length > 1 ? 58 : 43} fill={theme.textDim} fontSize="10">
                  {node.nodeKind}
                  {node.subtitle ? ` - ${truncateText(node.subtitle, 28)}` : ""}
                </text>
                <text x="12" y={labelLines.length > 1 ? 78 : 61} fill={theme.textMuted} fontSize="10">
                  {formatDuration(node.durationUs)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </SectionCard>
  );
}

export function App() {
  const [data, setData] = useState<LlmAiObsResult | null>(null);
  const { subscribeToToolResult } = useMcpApp();

  useEffect(() => {
    applyTheme();
  }, []);

  const handleToolResult = useCallback((params: Parameters<typeof parseToolResult>[0]) => {
    const next = parseToolResult<LlmAiObsResult>(params);
    if (next?.status) {
      setData(next);
    }
  }, []);

  useEffect(() => subscribeToToolResult(handleToolResult), [handleToolResult, subscribeToToolResult]);

  if (!data) {
    return (
      <main className="ds-view">
        <SectionCard title="LLM AI Observability">
          Waiting for an llm-ai-obs-agent-map tool result.
        </SectionCard>
      </main>
    );
  }

  if (data.status !== "OK" || !data.trace || !data.map) {
    return (
      <main className="ds-view">
        <SectionCard title="LLM AI Observability" tone="major">
          {data.message}
        </SectionCard>
      </main>
    );
  }

  const trace = data.trace;

  return (
    <main className="ds-view">
      <header style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: theme.textMuted, fontSize: 12 }}>LLM AI Observability</div>
            <h1 style={{ fontSize: 20, lineHeight: 1.25 }}>{trace.workflowName}</h1>
            <div style={{ color: theme.textDim, fontSize: 12 }}>
              trace.id <code>{trace.traceId}</code> · {trace.serviceName}
            </div>
          </div>
          <StatusBadge tone={trace.outcome === "failure" ? "critical" : trace.warning ? "major" : "ok"}>
            {trace.warning ? "warning" : trace.outcome}
          </StatusBadge>
        </div>
      </header>

      <StatGrid>
        <StatCard label="Duration" value={formatDuration(trace.durationUs)} />
        <StatCard label="Nodes" value={data.map.nodes.length} />
        <StatCard label="Edges" value={data.map.edges.length} />
        <StatCard label="Tokens" value={trace.totalTokens ?? "-"} />
        <StatCard label="Cost" value={formatCost(trace.totalCost)} />
      </StatGrid>

      <AgentMap data={data} focusStepId={data.focus_step_id} />

      <SectionCard title="Trace links">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {data.links?.aipm_agent_map && (
            <a href={data.links.aipm_agent_map} target="_blank" rel="noreferrer" style={{ color: theme.blue }}>
              Open focused agent map
            </a>
          )}
          {data.links?.apm_trace && (
            <a href={data.links.apm_trace} target="_blank" rel="noreferrer" style={{ color: theme.blue }}>
              Open APM trace
            </a>
          )}
        </div>
      </SectionCard>
    </main>
  );
}
