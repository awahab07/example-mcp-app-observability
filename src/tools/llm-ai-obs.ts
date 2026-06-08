/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import fs from "fs";
import { registerTrackedAppTool } from "./tracked-app-tool.js";
import { esRequest, getConfig, kibanaRequest } from "../elastic/client.js";
import { noopAnalyticsClient, type AnalyticsClient } from "../elastic/analytics/index.js";
import { resolveViewPath } from "./view-path.js";

const RESOURCE_URI = "ui://llm-ai-obs/mcp-app.html";

interface EsSearchResponse {
  hits: {
    hits: Array<{
      _source?: {
        trace_id?: string;
        trace?: { id?: string };
      };
    }>;
  };
}

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
  badges: string[];
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

interface AipmTraceDetail {
  trace: AipmTraceSummary;
  map: {
    nodes: AipmTraceMapNode[];
    edges: AipmTraceMapEdge[];
  };
}

function encodeKuery(kuery: string): string {
  return encodeURIComponent(kuery);
}

function buildRange({ start, end, lookback }: { start?: string; end?: string; lookback: string }) {
  if (start || end) {
    return {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    };
  }

  return {
    gte: `now-${lookback}`,
    lte: "now",
  };
}

async function findLatestAipmTraceId({
  start,
  end,
  lookback,
}: {
  start?: string;
  end?: string;
  lookback: string;
}): Promise<string | undefined> {
  const response = await esRequest<EsSearchResponse>("/traces-apm*,traces-*.otel*/_search", {
    body: {
      size: 1,
      track_total_hits: false,
      sort: [{ "@timestamp": { order: "desc" } }],
      _source: ["trace_id", "trace.id"],
      query: {
        bool: {
          filter: [
            {
              range: {
                "@timestamp": buildRange({ start, end, lookback }),
              },
            },
            { exists: { field: "attributes.es_sdk.story.id" } },
            { exists: { field: "attributes.es_sdk.map.step_id" } },
          ],
        },
      },
    },
  });

  const source = response.hits.hits[0]?._source;
  return source?.trace_id ?? source?.trace?.id;
}

export function registerLlmAiObsTool(server: McpServer, analytics: AnalyticsClient = noopAnalyticsClient) {
  registerTrackedAppTool(
    analytics,
    server,
    "llm-ai-obs-agent-map",
    {
      title: "LLM AI Observability Agent Map",
      description:
        "Requires: Kibana with the AIPM plugin and AIPM-enriched APM traces. " +
        "Renders the agent map for an LLM transaction. Use when the user asks to visualize, trace, " +
        "or diagnose an LLM/AI agent flow, tool call, MCP hop, downstream service call, evaluation, " +
        "or feedback path. If the user provides a trace.id, pass it as trace_id. If the user provides " +
        "a time span but no trace id, pass start/end or lookback and this tool will render the latest " +
        "AIPM-enriched trace in that window.",
      inputSchema: {
        trace_id: z.string().optional().describe("APM trace.id for the LLM transaction to render."),
        lookback: z.string().optional().describe("Fallback time window when trace_id is omitted. Default '24h'."),
        start: z.string().optional().describe("Optional absolute start time, for example 2026-06-08T00:00:00.000Z."),
        end: z.string().optional().describe("Optional absolute end time, for example 2026-06-08T01:00:00.000Z."),
        focus_step_id: z
          .string()
          .optional()
          .describe("Optional AIPM map node id to focus, for example 'model.planner' or 'tool.lookup_account_bundle'."),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ trace_id: traceId, lookback, start, end, focus_step_id: focusStepId }) => {
      const lb = lookback || "24h";
      const resolvedTraceId = traceId || (await findLatestAipmTraceId({ start, end, lookback: lb }));

      if (!resolvedTraceId) {
        const result = {
          status: "NO_AIPM_TRACE",
          message:
            `No AIPM-enriched LLM trace found in ${start || end ? "the requested window" : `the last ${lb}`}. ` +
            "Generate data with the aipm_fullstack_llm_journey synthtrace scenario or provide a known trace.id.",
          filters: { lookback: lb, start, end },
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      }

      const detail = await kibanaRequest<AipmTraceDetail>(
        `/internal/observability/aipm/traces/${encodeURIComponent(resolvedTraceId)}`
      );
      const config = getConfig();
      const selectedNode = focusStepId
        ? detail.map.nodes.find((node) => node.id === focusStepId) ?? detail.map.nodes[0]
        : detail.map.nodes[0];
      const aipmUrl = new URL(`/app/aipm/agent-map/${encodeURIComponent(resolvedTraceId)}`, config.kibanaUrl);
      if (selectedNode) aipmUrl.searchParams.set("focusNodeId", selectedNode.id);
      const apmUrl = `${config.kibanaUrl}/app/apm/traces?kuery=${encodeKuery(detail.trace.apmQuery)}`;

      const result = {
        status: "OK",
        message: `Rendered AIPM agent map for trace ${resolvedTraceId}.`,
        trace_id: resolvedTraceId,
        resolved_from: traceId ? "trace_id" : "time_window",
        focus_step_id: selectedNode?.id,
        trace: detail.trace,
        map: detail.map,
        links: {
          aipm_agent_map: aipmUrl.toString(),
          apm_trace: apmUrl,
        },
        filters: { lookback: lb, start, end },
        investigation_actions: [
          {
            label: "Open in AIPM",
            prompt: `Open ${aipmUrl.toString()} to inspect the focused AIPM agent map.`,
          },
          {
            label: "Open in APM",
            prompt: `Open ${apmUrl} to inspect the corresponding APM trace.`,
          },
        ],
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  const viewPath = resolveViewPath("llm-ai-obs");
  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = fs.readFileSync(viewPath, "utf-8");
      return {
        contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    }
  );
}
