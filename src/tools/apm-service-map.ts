/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import fs from "fs";
import { getConfig, kibanaRequest } from "../elastic/client.js";
import { safeEsqlRows } from "../elastic/esql.js";
import { buildServiceFilter, resolveNamespace } from "../elastic/apm.js";
import { resolveViewPath } from "./view-path.js";
import { consumeWelcomeNotice } from "../setup/notice.js";
import {
  applyPortableGraphState,
  buildPortableGraphFromRawResponse,
  getServiceNamesFromGraph,
  mergePortableGraphWithBadges,
  type RawServiceMapResponse,
  type ServiceMapBadgeResponse,
} from "./apm_service_map_fallback.js";

const RESOURCE_URI = "ui://apm-service-map/mcp-app.html";
const ENVIRONMENT_ALL = "ENVIRONMENT_ALL";
const DEFAULT_RANGE_FROM = "now-1h";
const DEFAULT_RANGE_TO = "now";
const DEFAULT_ORIENTATION = "horizontal";
const MAX_HIGHLIGHTED_SERVICES = 12;
const MAX_INVESTIGATION_OBJECTS = 8;
const MAX_RELATED_CLUSTERS = 2;
const MAX_RELATED_ALERT_HITS = 40;
const MAX_SERVICE_NAMES_FOR_RAC = 120;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type ServiceMapIntent =
  | "service"
  | "current_context"
  | "erroring"
  | "spiking"
  | "silent"
  | "explicit_services"
  | "global";

interface PortableServiceMapViewport {
  x: number;
  y: number;
  zoom: number;
}

interface PortableServiceMapSelectedNode {
  kind: "node";
  nodeId: string;
}

interface PortableServiceMapSelectedEdge {
  kind: "edge";
  edgeId?: string;
  source?: string;
  target?: string;
}

type PortableServiceMapSelectedElement =
  | PortableServiceMapSelectedNode
  | PortableServiceMapSelectedEdge;

interface PortableServiceMapViewState {
  version: string;
  rangeFrom: string;
  rangeTo: string;
  environment: string;
  kuery: string;
  serviceName?: string;
  serviceGroupId?: string;
  highlightedServiceNames: string[];
  filters: {
    alertStatusFilter: string[];
    sloStatusFilter: string[];
    anomalyStatusFilter: string[];
  };
  orientation: "horizontal" | "vertical";
  viewport?: PortableServiceMapViewport;
  selectedElement?: PortableServiceMapSelectedElement;
}

interface ServiceMapToolArgs {
  intent?: ServiceMapIntent;
  service?: string;
  services?: string[];
  service_group_id?: string;
  environment?: string;
  kuery?: string;
  namespace?: string;
  range_from?: string;
  range_to?: string;
}

interface TimeWindow {
  rangeFrom: string;
  rangeTo: string;
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
  lookback: string;
}

type InvestigationObjectKind = "alert" | "slo";
type InvestigationObjectTone = "critical" | "warning" | "info" | "neutral";

type RacAlertFilterClause =
  | { terms: { "service.name": string[] } }
  | { term: { "kibana.alert.status": "active" } }
  | { term: { "service.environment": string } }
  | { range: { "@timestamp": { gte: string; lte: string } } };

type RelatedAlertStatus = "active" | "recovered";

type InvestigationAlertFilterClause =
  | { terms: { "service.name": string[] } }
  | { terms: { "orchestrator.cluster.name": string[] } }
  | { terms: { "kibana.alert.status": RelatedAlertStatus[] } }
  | { term: { "service.environment": string } }
  | { range: { "@timestamp": { gte: string; lte: string } } };

interface RacAlertsFindResponse {
  aggregations?: {
    services?: {
      buckets?: Array<{
        key: string;
        doc_count: number;
      }>;
    };
  };
}

interface InvestigationObject {
  id: string;
  kind: InvestigationObjectKind;
  title: string;
  subtitle: string;
  summary: string;
  shortLabel: string;
  badge?: number;
  tone: InvestigationObjectTone;
  score: number;
  status: RelatedAlertStatus;
  focusServiceName?: string;
  highlightedServiceNames?: string[];
  serviceName?: string;
  clusterName?: string;
  kibanaUrl?: string;
}

interface RacAlertHitSource {
  "@timestamp"?: string;
  "kibana.alert.uuid"?: string;
  "kibana.alert.status"?: string;
  "kibana.alert.reason"?: string;
  "kibana.alert.rule.name"?: string;
  "kibana.alert.rule.consumer"?: string;
  "kibana.alert.rule.category"?: string;
  "kibana.alert.action_group"?: string;
  "service.name"?: string | string[];
  "orchestrator.cluster.name"?: string | string[];
}

interface RacAlertHit {
  _source?: RacAlertHitSource;
}

interface RacAlertHitsResponse {
  hits?: {
    hits?: RacAlertHit[];
  };
}

interface InvestigationObjectGroup {
  id: string;
  kind: InvestigationObjectKind;
  title: string;
  latestSummary: string;
  occurrences: number;
  status: RelatedAlertStatus;
  tone: InvestigationObjectTone;
  badge?: number;
  score: number;
  focusServiceName?: string;
  highlightedServiceNames: string[];
  serviceName?: string;
  clusterName?: string;
  kibanaUrl?: string;
}

interface KibanaServiceMapNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  hidden?: boolean;
  selected?: boolean;
  data: {
    id: string;
    label: string;
    isService: boolean;
    isGrouped?: boolean;
    count?: number;
    groupedConnections?: Array<{
      id: string;
      label: string;
      spanType?: string;
      spanSubtype?: string;
    }>;
    spanType?: string;
    spanSubtype?: string;
    contextHighlight?: boolean;
    agentName?: string;
    alertsCount?: number;
    sloStatus?: string;
    sloCount?: number;
    serviceAnomalyStats?: {
      healthStatus?: string;
    };
  };
}

interface KibanaServiceMapEdge {
  id: string;
  source: string;
  target: string;
  type: "default";
  hidden?: boolean;
  selected?: boolean;
  style?: {
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  };
  markerEnd?: {
    type?: string;
    width?: number;
    height?: number;
    color?: string;
  };
  markerStart?: {
    type?: string;
    width?: number;
    height?: number;
    color?: string;
  };
  data?: {
    isBidirectional?: boolean;
    isGrouped?: boolean;
    sourceLabel?: string;
    targetLabel?: string;
    resources?: string[];
    sourceData?: Record<string, unknown>;
    targetData?: Record<string, unknown>;
  };
}

interface KibanaPortableServiceMapResponse {
  nodes: KibanaServiceMapNode[];
  edges: KibanaServiceMapEdge[];
  nodesCount: number;
  tracesCount: number;
}

type KibanaStandardServiceMapResponse =
  | RawServiceMapResponse
  | {
      data: RawServiceMapResponse;
    };

interface ServiceMapDetailStats {
  label: string;
  value: string;
}

interface ServiceMapDetailAction {
  label: string;
  url: string;
}

interface DerivedScope {
  kind: Exclude<ServiceMapIntent, "service" | "global">;
  services: string[];
  explanation: string;
  note?: string;
}

interface NodeStats {
  transactionStats?: {
    latency?: { value: number | null };
    throughput?: { value: number | null };
  };
  failedTransactionsRate?: { value: number | null };
  cpuUsage?: { value?: number | null };
  memoryUsage?: { value?: number | null };
}

interface ServiceNodeInfoResponse {
  currentPeriod: NodeStats;
  previousPeriod?: NodeStats;
}

interface DependencyNodeInfoResponse {
  currentPeriod: NodeStats;
  previousPeriod?: NodeStats;
}

const intentSchema = z
  .enum([
    "service",
    "current_context",
    "erroring",
    "spiking",
    "silent",
    "explicit_services",
    "global",
  ])
  .optional();

const portableViewStateSchema: z.ZodType<PortableServiceMapViewState> = z.object({
  version: z.string(),
  rangeFrom: z.string(),
  rangeTo: z.string(),
  environment: z.string(),
  kuery: z.string(),
  serviceName: z.string().optional(),
  serviceGroupId: z.string().optional(),
  highlightedServiceNames: z.array(z.string()),
  filters: z.object({
    alertStatusFilter: z.array(z.string()),
    sloStatusFilter: z.array(z.string()),
    anomalyStatusFilter: z.array(z.string()),
  }),
  orientation: z.enum(["horizontal", "vertical"]),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number(),
    })
    .optional(),
  selectedElement: z
    .union([
      z.object({
        kind: z.literal("node"),
        nodeId: z.string(),
      }),
      z.object({
        kind: z.literal("edge"),
        edgeId: z.string().optional(),
        source: z.string().optional(),
        target: z.string().optional(),
      }),
    ])
    .optional(),
});

function escapeEsql(value: string): string {
  return value.replace(/"/g, '\\"');
}

function normalizeServiceNames(services?: string[]): string[] {
  if (!services?.length) {
    return [];
  }

  return [...new Set(services.map((service) => service.trim()).filter(Boolean))];
}

function normalizeAlertField(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = item.trim();
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

function normalizeRelatedAlertStatus(value: string | undefined): RelatedAlertStatus | undefined {
  if (value === "active" || value === "recovered") {
    return value;
  }

  return undefined;
}

function getAlertTimestampMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getInvestigationTonePriority(tone: InvestigationObjectTone): number {
  switch (tone) {
    case "critical":
      return 4;
    case "warning":
      return 3;
    case "info":
      return 2;
    default:
      return 1;
  }
}

function getServicePriority(node: KibanaServiceMapNode): number {
  if (!node.data.isService) {
    return 0;
  }

  let score = 0;

  if (typeof node.data.alertsCount === "number" && node.data.alertsCount > 0) {
    score += 100 + node.data.alertsCount;
  }

  if (node.data.sloStatus === "violated") {
    score += 80;
  } else if (node.data.sloStatus === "degrading") {
    score += 45;
  }

  const anomalyStatus = node.data.serviceAnomalyStats?.healthStatus;
  if (anomalyStatus === "critical" || anomalyStatus === "major") {
    score += 70;
  } else if (anomalyStatus === "warning") {
    score += 35;
  }

  if (node.data.contextHighlight) {
    score += 25;
  }

  return score;
}

function buildGraphServicePriorityMap(graph: KibanaPortableServiceMapResponse): Map<string, number> {
  return new Map(
    graph.nodes
      .filter((node) => node.data.isService)
      .map((node) => [String(node.data.label ?? node.id), getServicePriority(node)] as const)
  );
}

function buildGraphNeighborsByService(
  graph: KibanaPortableServiceMapResponse
): Map<string, string[]> {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const neighborsByService = new Map<string, Set<string>>();

  const link = (leftServiceName: string, rightServiceName: string) => {
    let current = neighborsByService.get(leftServiceName);
    if (!current) {
      current = new Set<string>();
      neighborsByService.set(leftServiceName, current);
    }
    current.add(rightServiceName);
  };

  for (const edge of graph.edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) {
      continue;
    }

    const sourceServiceName = sourceNode.data.isService
      ? String(sourceNode.data.label ?? sourceNode.id)
      : undefined;
    const targetServiceName = targetNode.data.isService
      ? String(targetNode.data.label ?? targetNode.id)
      : undefined;

    if (sourceServiceName && targetServiceName) {
      link(sourceServiceName, targetServiceName);
      link(targetServiceName, sourceServiceName);
    }
  }

  return new Map(
    [...neighborsByService.entries()].map(([serviceName, neighbors]) => [
      serviceName,
      [...neighbors].sort((left, right) => left.localeCompare(right)),
    ])
  );
}

function getRelatedServiceNames(args: {
  focusServiceName: string | undefined;
  neighborsByService: Map<string, string[]>;
  servicePriority: Map<string, number>;
}): string[] {
  if (!args.focusServiceName) {
    return [];
  }

  const rankedNeighbors = [...(args.neighborsByService.get(args.focusServiceName) ?? [])].sort(
    (left, right) =>
      (args.servicePriority.get(right) ?? 0) - (args.servicePriority.get(left) ?? 0) ||
      left.localeCompare(right)
  );

  return normalizeServiceNames([args.focusServiceName, ...rankedNeighbors.slice(0, 4)]).slice(
    0,
    MAX_HIGHLIGHTED_SERVICES
  );
}

function isSloRelatedAlert(source: RacAlertHitSource): boolean {
  return (
    source["kibana.alert.rule.consumer"] === "slo" ||
    source["kibana.alert.rule.category"]?.toLowerCase().includes("slo") === true
  );
}

function getInvestigationObjectTone(source: RacAlertHitSource): InvestigationObjectTone {
  const status = normalizeRelatedAlertStatus(source["kibana.alert.status"]);
  const actionGroup = source["kibana.alert.action_group"];

  if (isSloRelatedAlert(source)) {
    if (actionGroup === "slo.burnRate.alert" || actionGroup === "slo.burnRate.high") {
      return "critical";
    }
    if (actionGroup === "slo.burnRate.medium") {
      return "warning";
    }
    if (actionGroup === "slo.burnRate.low") {
      return "info";
    }
  }

  if (status === "active") {
    return "critical";
  }

  if (status === "recovered") {
    return "warning";
  }

  return "neutral";
}

function buildAlertPageUrl(alertId: string | undefined): string | undefined {
  if (!alertId) {
    return undefined;
  }

  return `${getConfig().kibanaUrl}/app/observability/alerts/${encodeURIComponent(alertId)}`;
}

function buildInvestigationObjectMapUrl(args: {
  timeWindow: TimeWindow;
  environment: string;
  kuery: string;
  serviceGroupId?: string;
  focusServiceName?: string;
  highlightedServiceNames: string[];
}): string | undefined {
  if (!args.focusServiceName && args.highlightedServiceNames.length === 0) {
    return undefined;
  }

  const viewState = normalizePortableViewState({
    rangeFrom: args.timeWindow.rangeFrom,
    rangeTo: args.timeWindow.rangeTo,
    environment: args.environment,
    kuery: args.kuery,
    serviceName: args.focusServiceName,
    serviceGroupId: args.serviceGroupId,
    highlightedServiceNames: args.highlightedServiceNames,
  });

  return buildKibanaServiceMapUrl({
    rangeFrom: args.timeWindow.rangeFrom,
    rangeTo: args.timeWindow.rangeTo,
    environment: args.environment,
    kuery: args.kuery,
    serviceName: args.focusServiceName,
    serviceGroupId: args.serviceGroupId,
    serviceMapState: viewState,
  });
}

function dedupeAlertHits(hits: RacAlertHit[]): RacAlertHit[] {
  const seen = new Set<string>();
  const unique: RacAlertHit[] = [];

  for (const hit of hits) {
    const source = hit._source;
    if (!source) {
      continue;
    }

    const dedupeKey =
      source["kibana.alert.uuid"] ||
      [
        source["@timestamp"],
        source["kibana.alert.rule.name"],
        normalizeAlertField(source["service.name"]),
        normalizeAlertField(source["orchestrator.cluster.name"]),
      ].join("|");

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    unique.push(hit);
  }

  return unique;
}

async function fetchRelatedAlertHits(args: {
  timeWindow: TimeWindow;
  serviceNames?: string[];
  clusterNames?: string[];
  environment?: string;
}): Promise<RacAlertHit[]> {
  const filterClauses: InvestigationAlertFilterClause[] = [
    {
      terms: {
        "kibana.alert.status": ["active", "recovered"],
      },
    },
    {
      range: {
        "@timestamp": {
          gte: args.timeWindow.startIso,
          lte: args.timeWindow.endIso,
        },
      },
    },
  ];

  if (args.serviceNames?.length) {
    filterClauses.push({
      terms: {
        "service.name": args.serviceNames.slice(0, MAX_SERVICE_NAMES_FOR_RAC),
      },
    });
  } else if (args.clusterNames?.length) {
    filterClauses.push({
      terms: {
        "orchestrator.cluster.name": args.clusterNames.slice(0, MAX_RELATED_CLUSTERS),
      },
    });
  } else {
    return [];
  }

  if (args.environment && args.environment !== ENVIRONMENT_ALL && args.serviceNames?.length) {
    filterClauses.push({
      term: {
        "service.environment": args.environment,
      },
    });
  }

  const response = await kibanaRequest<RacAlertHitsResponse>("/internal/rac/alerts/find", {
    method: "POST",
    body: {
      size: MAX_RELATED_ALERT_HITS,
      query: {
        bool: {
          filter: filterClauses,
        },
      },
      sort: [
        {
          "@timestamp": {
            order: "desc",
          },
        },
      ],
    },
  });

  return response.hits?.hits ?? [];
}

async function buildInvestigationObjects(args: {
  graph: KibanaPortableServiceMapResponse;
  timeWindow: TimeWindow;
  environment: string;
  kuery: string;
  serviceGroupId?: string;
}): Promise<InvestigationObject[]> {
  const serviceNames = normalizeServiceNames(
    args.graph.nodes
      .filter((node) => node.data.isService)
      .map((node) => String(node.data.label ?? node.id))
  ).slice(0, MAX_SERVICE_NAMES_FOR_RAC);
  if (serviceNames.length === 0) {
    return [];
  }

  const servicePriority = buildGraphServicePriorityMap(args.graph);
  const neighborsByService = buildGraphNeighborsByService(args.graph);
  const serviceAlertHits = await fetchRelatedAlertHits({
    timeWindow: args.timeWindow,
    serviceNames,
    environment: args.environment,
  });

  const clusterStats = new Map<string, { count: number; score: number; services: Set<string> }>();
  for (const hit of serviceAlertHits) {
    const source = hit._source;
    if (!source) {
      continue;
    }

    const clusterName = normalizeAlertField(source["orchestrator.cluster.name"]);
    const serviceName = normalizeAlertField(source["service.name"]);
    if (!clusterName || !serviceName) {
      continue;
    }

    const serviceScore = servicePriority.get(serviceName) ?? 0;
    const statusBonus = normalizeRelatedAlertStatus(source["kibana.alert.status"]) === "active" ? 10 : 5;
    const current = clusterStats.get(clusterName) ?? { count: 0, score: 0, services: new Set<string>() };
    current.count += 1;
    current.score += serviceScore + statusBonus;
    current.services.add(serviceName);
    clusterStats.set(clusterName, current);
  }

  const topClusters = [...clusterStats.entries()]
    .sort(
      (left, right) =>
        right[1].score - left[1].score ||
        right[1].count - left[1].count ||
        left[0].localeCompare(right[0])
    )
    .slice(0, MAX_RELATED_CLUSTERS)
    .map(([clusterName]) => clusterName);

  const clusterAlertHits = topClusters.length
    ? await fetchRelatedAlertHits({
        timeWindow: args.timeWindow,
        clusterNames: topClusters,
      })
    : [];

  const groupedObjects = new Map<string, InvestigationObjectGroup>();
  const relatedAlertHits = dedupeAlertHits([...serviceAlertHits, ...clusterAlertHits]).sort(
    (left, right) =>
      getAlertTimestampMs(right._source?.["@timestamp"]) -
      getAlertTimestampMs(left._source?.["@timestamp"])
  );

  for (const hit of relatedAlertHits) {
    const source = hit._source;
    if (!source) {
      continue;
    }

    const status = normalizeRelatedAlertStatus(source["kibana.alert.status"]);
    const title = source["kibana.alert.rule.name"]?.trim();
    if (!status || !title) {
      continue;
    }

    const kind: InvestigationObjectKind = isSloRelatedAlert(source) ? "slo" : "alert";
    const serviceName = normalizeAlertField(source["service.name"]);
    const clusterName = normalizeAlertField(source["orchestrator.cluster.name"]);
    const focusCandidates = clusterName ? [...(clusterStats.get(clusterName)?.services ?? [])] : [];
    const focusServiceName = normalizeServiceNames([
      ...(serviceName ? [serviceName] : []),
      ...focusCandidates.sort(
        (left, right) =>
          (servicePriority.get(right) ?? 0) - (servicePriority.get(left) ?? 0) ||
          left.localeCompare(right)
      ),
    ])[0];

    const highlightedServiceNames = getRelatedServiceNames({
      focusServiceName,
      neighborsByService,
      servicePriority,
    });
    const tone = getInvestigationObjectTone(source);
    const latestSummary = source["kibana.alert.reason"]?.trim() || "Recent investigation signal";
    const scopeId = serviceName ? `service:${serviceName}` : clusterName ? `cluster:${clusterName}` : "scope";
    const groupId = `${kind}:${title}:${scopeId}`;
    const count = (groupedObjects.get(groupId)?.occurrences ?? 0) + 1;
    const focusMapUrl = buildInvestigationObjectMapUrl({
      timeWindow: args.timeWindow,
      environment: args.environment,
      kuery: args.kuery,
      serviceGroupId: args.serviceGroupId,
      focusServiceName,
      highlightedServiceNames,
    });

    const score =
      (status === "active" ? 520 : 360) +
      getInvestigationTonePriority(tone) * 40 +
      count * 6 +
      (focusServiceName ? (servicePriority.get(focusServiceName) ?? 0) : 0);

    const previous = groupedObjects.get(groupId);
    groupedObjects.set(groupId, {
      id: groupId,
      kind,
      title,
      latestSummary: previous?.latestSummary ?? latestSummary,
      occurrences: count,
      status: previous?.status === "active" || status === "active" ? "active" : "recovered",
      tone:
        previous && getInvestigationTonePriority(previous.tone) > getInvestigationTonePriority(tone)
          ? previous.tone
          : tone,
      badge: count > 1 ? count : undefined,
      score: previous ? Math.max(previous.score, score) + (count > 1 ? 2 : 0) : score,
      focusServiceName: focusServiceName ?? previous?.focusServiceName,
      highlightedServiceNames:
        highlightedServiceNames.length > 0
          ? highlightedServiceNames
          : (previous?.highlightedServiceNames ?? []),
      serviceName: serviceName ?? previous?.serviceName,
      clusterName: clusterName ?? previous?.clusterName,
      kibanaUrl:
        buildAlertPageUrl(source["kibana.alert.uuid"]) ??
        focusMapUrl ??
        previous?.kibanaUrl,
    });
  }

  return [...groupedObjects.values()]
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, MAX_INVESTIGATION_OBJECTS)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: [
        item.status === "active" ? "Active" : "Recovered",
        item.clusterName ? item.clusterName : item.serviceName ? item.serviceName : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      summary: item.latestSummary,
      shortLabel: item.kind === "slo" ? "SL" : "AL",
      badge: item.badge,
      tone: item.tone,
      score: item.score,
      status: item.status,
      focusServiceName: item.focusServiceName,
      highlightedServiceNames: item.highlightedServiceNames,
      serviceName: item.serviceName,
      clusterName: item.clusterName,
      kibanaUrl: item.kibanaUrl,
    }));
}

async function fetchServiceBadgesFromRacAlerts(args: {
  serviceNames: string[];
  timeWindow: TimeWindow;
  environment: string;
}): Promise<ServiceMapBadgeResponse> {
  const filterClauses: RacAlertFilterClause[] = [
    { terms: { "service.name": args.serviceNames } },
    { term: { "kibana.alert.status": "active" } },
    {
      range: {
        "@timestamp": {
          gte: args.timeWindow.startIso,
          lte: args.timeWindow.endIso,
        },
      },
    },
  ];

  if (args.environment !== ENVIRONMENT_ALL) {
    filterClauses.push({
      term: {
        "service.environment": args.environment,
      },
    });
  }

  const response = await kibanaRequest<RacAlertsFindResponse>("/internal/rac/alerts/find", {
    method: "POST",
    body: {
      size: 0,
      query: {
        bool: {
          filter: filterClauses,
        },
      },
      aggs: {
        services: {
          terms: {
            field: "service.name",
            size: args.serviceNames.length,
          },
        },
      },
    },
  });

  const alerts =
    response.aggregations?.services?.buckets
      ?.filter((bucket) => bucket.key.trim().length > 0)
      .map((bucket) => ({
        serviceName: bucket.key,
        alertsCount: bucket.doc_count,
      }))
      .sort(
        (left, right) =>
          right.alertsCount - left.alertsCount || left.serviceName.localeCompare(right.serviceName)
      ) ?? [];

  return {
    alerts,
    slos: [],
  };
}

function normalizePortableViewState(input: {
  rangeFrom: string;
  rangeTo: string;
  environment?: string;
  kuery?: string;
  serviceName?: string;
  serviceGroupId?: string;
  highlightedServiceNames?: string[];
  viewport?: PortableServiceMapViewport;
  selectedElement?: PortableServiceMapSelectedElement;
}): PortableServiceMapViewState {
  const serviceName = input.serviceName?.trim();
  const serviceGroupId = serviceName ? undefined : input.serviceGroupId?.trim();

  return {
    version: "1",
    rangeFrom: input.rangeFrom,
    rangeTo: input.rangeTo,
    environment: input.environment?.trim() || ENVIRONMENT_ALL,
    kuery: input.kuery?.trim() || "",
    ...(serviceName ? { serviceName } : {}),
    ...(serviceGroupId ? { serviceGroupId } : {}),
    highlightedServiceNames: normalizeServiceNames(input.highlightedServiceNames).slice(
      0,
      MAX_HIGHLIGHTED_SERVICES
    ),
    filters: {
      alertStatusFilter: [],
      sloStatusFilter: [],
      anomalyStatusFilter: [],
    },
    orientation: DEFAULT_ORIENTATION,
    ...(input.viewport ? { viewport: input.viewport } : {}),
    ...(input.selectedElement ? { selectedElement: input.selectedElement } : {}),
  };
}

function serializePortableViewState(viewState: PortableServiceMapViewState): string {
  return JSON.stringify(viewState);
}

function isMissingPortableServiceMapRouteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("Kibana 404") && !message.includes("Kibana 400")) {
    return false;
  }

  return message.includes("Not Found") || message.toLowerCase().includes("no handler found");
}

function parseLookbackMs(lookback: string): number {
  const match = lookback.match(/^(\d+)\s*([mhd])$/i);
  if (!match) {
    throw new Error(`Unsupported lookback '${lookback}'. Expected values like 15m, 1h, or 2d.`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "m") return value * MINUTE_MS;
  if (unit === "h") return value * HOUR_MS;
  return value * DAY_MS;
}

function formatLookbackMs(ms: number): string {
  if (ms <= MINUTE_MS) {
    return "1m";
  }

  if (ms % DAY_MS === 0) {
    return `${Math.round(ms / DAY_MS)}d`;
  }

  if (ms % HOUR_MS === 0) {
    return `${Math.round(ms / HOUR_MS)}h`;
  }

  return `${Math.max(1, Math.round(ms / MINUTE_MS))}m`;
}

function resolveTimeExpression(value: string, nowMs: number): number | undefined {
  const trimmed = value.trim();

  if (trimmed === "now") {
    return nowMs;
  }

  const relativeMatch = trimmed.match(/^now-(\d+)\s*([mhd])$/i);
  if (relativeMatch) {
    return nowMs - parseLookbackMs(`${relativeMatch[1]}${relativeMatch[2]}`);
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function resolveTimeWindow(rangeFrom?: string, rangeTo?: string): TimeWindow {
  const normalizedRangeFrom = rangeFrom?.trim() || DEFAULT_RANGE_FROM;
  const normalizedRangeTo = rangeTo?.trim() || DEFAULT_RANGE_TO;
  const nowMs = Date.now();
  const startMs = resolveTimeExpression(normalizedRangeFrom, nowMs);
  const endMs = resolveTimeExpression(normalizedRangeTo, nowMs);

  if (startMs == null || endMs == null) {
    throw new Error(
      `Could not resolve range_from='${normalizedRangeFrom}' and range_to='${normalizedRangeTo}'.`
    );
  }

  if (startMs >= endMs) {
    throw new Error("The requested time range is invalid because range_from is not earlier than range_to.");
  }

  return {
    rangeFrom: normalizedRangeFrom,
    rangeTo: normalizedRangeTo,
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    lookback: formatLookbackMs(endMs - startMs),
  };
}

function buildTimestampClause(timeWindow: TimeWindow): string {
  return `@timestamp >= TO_DATETIME("${timeWindow.startIso}") AND @timestamp <= TO_DATETIME("${timeWindow.endIso}")`;
}

function buildEnvironmentClause(environment: string): string {
  if (!environment || environment === ENVIRONMENT_ALL) {
    return "";
  }

  return `\n  AND service.environment == "${escapeEsql(environment)}"`;
}

function buildKibanaServiceMapUrl(args: {
  rangeFrom: string;
  rangeTo: string;
  environment: string;
  kuery: string;
  serviceName?: string;
  serviceGroupId?: string;
  serviceMapState?: PortableServiceMapViewState;
}): string {
  const config = getConfig();
  const searchParams = new URLSearchParams();
  searchParams.set("rangeFrom", args.rangeFrom);
  searchParams.set("rangeTo", args.rangeTo);

  if (args.environment) {
    searchParams.set("environment", args.environment);
  }

  if (args.kuery) {
    searchParams.set("kuery", args.kuery);
  }

  if (args.serviceGroupId) {
    searchParams.set("serviceGroup", args.serviceGroupId);
  }

  if (args.serviceMapState) {
    searchParams.set("serviceMapState", serializePortableViewState(args.serviceMapState));
  }

  const hashPath = args.serviceName
    ? `/services/${encodeURIComponent(args.serviceName)}/service-map`
    : "/service-map";

  return `${config.kibanaUrl}/app/apm#${hashPath}?${searchParams.toString()}`;
}

function getServiceCount(graph: KibanaPortableServiceMapResponse): number {
  return graph.nodes.filter((node) => node.data.isService).length;
}

function buildRequestContext(args: {
  intent: ServiceMapIntent;
  service?: string;
  services: string[];
  serviceGroupId?: string;
  environment: string;
  kuery: string;
  namespace?: string;
  timeWindow: TimeWindow;
  namespaceNote?: string;
  namespaceCandidates?: string[];
}): Record<string, unknown> {
  const {
    intent,
    service,
    services,
    serviceGroupId,
    environment,
    kuery,
    namespace,
    timeWindow,
    namespaceNote,
    namespaceCandidates,
  } = args;

  return {
    intent,
    range_from: timeWindow.rangeFrom,
    range_to: timeWindow.rangeTo,
    environment,
    kuery,
    ...(service ? { service } : {}),
    ...(services.length ? { services } : {}),
    ...(serviceGroupId ? { service_group_id: serviceGroupId } : {}),
    ...(namespace ? { namespace } : {}),
    ...(namespaceNote ? { namespace_note: namespaceNote } : {}),
    ...(namespaceCandidates?.length ? { namespace_candidates: namespaceCandidates } : {}),
  };
}

function defaultIntent(args: {
  intent?: ServiceMapIntent;
  service?: string;
  services: string[];
  namespace?: string;
}): ServiceMapIntent {
  if (args.intent) {
    return args.intent;
  }

  if (args.service) {
    return "service";
  }

  if (args.services.length > 0) {
    return "explicit_services";
  }

  if (args.namespace) {
    return "current_context";
  }

  return "global";
}

async function resolveNamespaceServices(
  namespace: string | undefined,
  timeWindow: TimeWindow,
  errors: string[]
): Promise<{
  effectiveNamespace?: string;
  services: string[];
  note?: string;
  candidates?: string[];
  ambiguous?: boolean;
}> {
  if (!namespace) {
    return { services: [] };
  }

  const resolution = await resolveNamespace(namespace, timeWindow.lookback, errors);
  if (resolution.ambiguous) {
    return {
      effectiveNamespace: resolution.resolved,
      services: [],
      note: resolution.note,
      candidates: resolution.candidates,
      ambiguous: true,
    };
  }

  const effectiveNamespace = resolution.resolved ?? namespace;
  const clause = buildTimestampClause(timeWindow);
  const escapedNamespace = escapeEsql(effectiveNamespace);

  const otelQuery = `
FROM traces-*.otel-*
| WHERE ${clause}
  AND k8s.namespace.name == "${escapedNamespace}"
  AND service.name IS NOT NULL
| STATS cnt = COUNT(*) BY service.name
| SORT cnt DESC
| LIMIT 100
`;

  const classicQuery = `
FROM traces-apm*
| WHERE ${clause}
  AND kubernetes.namespace == "${escapedNamespace}"
  AND service.name IS NOT NULL
  AND processor.event == "transaction"
| STATS cnt = COUNT(*) BY service.name
| SORT cnt DESC
| LIMIT 100
`;

  const [otelRows, classicRows] = await Promise.all([
    safeEsqlRows<{ "service.name"?: string }>(otelQuery, errors),
    safeEsqlRows<{ "service.name"?: string }>(classicQuery, errors, { optional: true }),
  ]);

  const services = normalizeServiceNames([
    ...otelRows.map((row) => row["service.name"] || ""),
    ...classicRows.map((row) => row["service.name"] || ""),
  ]);

  return {
    effectiveNamespace,
    services,
    note: resolution.note,
    candidates: resolution.candidates,
    ambiguous: resolution.ambiguous,
  };
}

async function deriveErroringServices(args: {
  timeWindow: TimeWindow;
  environment: string;
  scopedServices?: string[];
  errors: string[];
}): Promise<{ services: string[]; explanation: string }> {
  const { timeWindow, environment, scopedServices, errors } = args;
  const query = `
FROM traces-apm*,traces-*.otel-*
| WHERE ${buildTimestampClause(timeWindow)}
  AND service.name IS NOT NULL${buildServiceFilter(scopedServices)}${buildEnvironmentClause(environment)}
| STATS
    total = COUNT(*),
    error_count = COUNT(*) WHERE event.outcome == "failure"
  BY service.name
| EVAL error_rate = CASE(total > 0, TO_DOUBLE(error_count) / TO_DOUBLE(total), NULL)
| WHERE error_count > 0
| SORT error_rate DESC NULLS LAST, error_count DESC, total DESC
| LIMIT ${MAX_HIGHLIGHTED_SERVICES}
`;

  const rows = await safeEsqlRows<{
    "service.name"?: string;
    error_count?: number;
    error_rate?: number;
  }>(query, errors);

  const services = normalizeServiceNames(rows.map((row) => row["service.name"] || ""));
  const top = rows[0];
  const explanation =
    services.length > 0
      ? `Highlighting ${services.length} service${services.length === 1 ? "" : "s"} with recent errors. ${top?.["service.name"] ? `Highest error pressure: ${top["service.name"]}.` : ""}`.trim()
      : "No services crossed the erroring threshold in the requested time range.";

  return { services, explanation };
}

async function deriveSpikingServices(args: {
  timeWindow: TimeWindow;
  environment: string;
  scopedServices?: string[];
  errors: string[];
}): Promise<{ services: string[]; explanation: string }> {
  const { timeWindow, environment, scopedServices, errors } = args;
  const midpointIso = new Date(timeWindow.startMs + (timeWindow.endMs - timeWindow.startMs) / 2).toISOString();
  const query = `
FROM traces-apm*,traces-*.otel-*
| WHERE ${buildTimestampClause(timeWindow)}
  AND service.name IS NOT NULL${buildServiceFilter(scopedServices)}${buildEnvironmentClause(environment)}
| EVAL window = CASE(@timestamp >= TO_DATETIME("${midpointIso}"), "recent", "baseline")
| STATS
    recent = COUNT(CASE(window == "recent", 1, NULL)),
    baseline = COUNT(CASE(window == "baseline", 1, NULL))
  BY service.name
| EVAL ratio = CASE(baseline > 0, TO_DOUBLE(recent) / TO_DOUBLE(baseline), NULL)
| WHERE recent >= 10 AND (ratio >= 2 OR (baseline == 0 AND recent >= 25))
| SORT ratio DESC NULLS LAST, recent DESC
| LIMIT ${MAX_HIGHLIGHTED_SERVICES}
`;

  const rows = await safeEsqlRows<{
    "service.name"?: string;
    ratio?: number;
    recent?: number;
    baseline?: number;
  }>(query, errors);

  const services = normalizeServiceNames(rows.map((row) => row["service.name"] || ""));
  const top = rows[0];
  const explanation =
    services.length > 0
      ? `Highlighting ${services.length} service${services.length === 1 ? "" : "s"} with a relative throughput spike between the first and second half of the requested window.${top?.["service.name"] ? ` Strongest spike: ${top["service.name"]}.` : ""}`
      : "No services showed a strong relative throughput spike in the requested time range.";

  return { services, explanation };
}

async function deriveSilentServices(args: {
  timeWindow: TimeWindow;
  environment: string;
  scopedServices?: string[];
  errors: string[];
}): Promise<{ services: string[]; explanation: string }> {
  const { timeWindow, environment, scopedServices, errors } = args;
  const midpointIso = new Date(timeWindow.startMs + (timeWindow.endMs - timeWindow.startMs) / 2).toISOString();
  const query = `
FROM traces-apm*,traces-*.otel-*
| WHERE ${buildTimestampClause(timeWindow)}
  AND service.name IS NOT NULL${buildServiceFilter(scopedServices)}${buildEnvironmentClause(environment)}
| EVAL window = CASE(@timestamp >= TO_DATETIME("${midpointIso}"), "recent", "baseline")
| STATS
    recent = COUNT(CASE(window == "recent", 1, NULL)),
    baseline = COUNT(CASE(window == "baseline", 1, NULL))
  BY service.name
| EVAL remaining_ratio = CASE(baseline > 0, TO_DOUBLE(recent) / TO_DOUBLE(baseline), NULL)
| WHERE baseline >= 10 AND recent <= baseline / 4
| SORT remaining_ratio ASC NULLS LAST, baseline DESC
| LIMIT ${MAX_HIGHLIGHTED_SERVICES}
`;

  const rows = await safeEsqlRows<{
    "service.name"?: string;
    remaining_ratio?: number;
    recent?: number;
    baseline?: number;
  }>(query, errors);

  const services = normalizeServiceNames(rows.map((row) => row["service.name"] || ""));
  const top = rows[0];
  const explanation =
    services.length > 0
      ? `Highlighting ${services.length} service${services.length === 1 ? "" : "s"} whose recent traffic dropped sharply relative to the earlier half of the requested window.${top?.["service.name"] ? ` Quietest drop: ${top["service.name"]}.` : ""}`
      : "No services became materially quieter in the requested time range.";

  return { services, explanation };
}

async function deriveScope(args: {
  intent: ServiceMapIntent;
  explicitServices: string[];
  namespace?: string;
  timeWindow: TimeWindow;
  environment: string;
  errors: string[];
}): Promise<{
  derivedScope: DerivedScope | null;
  scopedServices: string[];
  namespaceNote?: string;
  namespaceCandidates?: string[];
}> {
  const { intent, explicitServices, namespace, timeWindow, environment, errors } = args;

  const namespaceResolution = await resolveNamespaceServices(namespace, timeWindow, errors);
  const namespaceServices = namespaceResolution.services;
  const scopedServices =
    explicitServices.length > 0 && namespaceServices.length > 0
      ? explicitServices.filter((service) => namespaceServices.includes(service))
      : explicitServices.length > 0
      ? explicitServices
      : namespaceServices;

  if (namespaceResolution.ambiguous) {
    return {
      derivedScope: {
        kind: "current_context",
        services: [],
        explanation: namespaceResolution.note || "Namespace resolution is ambiguous.",
        note: namespaceResolution.note,
      },
      scopedServices: [],
      namespaceNote: namespaceResolution.note,
      namespaceCandidates: namespaceResolution.candidates,
    };
  }

  if (intent === "explicit_services" || intent === "current_context") {
    const explanation =
      scopedServices.length > 0
        ? `Highlighting ${scopedServices.length} service${scopedServices.length === 1 ? "" : "s"} from the supplied context.`
        : namespace
        ? `No APM services were found in namespace "${namespaceResolution.effectiveNamespace ?? namespace}" during the requested time range.`
        : "No explicit services were supplied for the current-context request.";

    return {
      derivedScope: {
        kind: intent === "explicit_services" ? "explicit_services" : "current_context",
        services: scopedServices,
        explanation,
        note: namespaceResolution.note,
      },
      scopedServices,
      namespaceNote: namespaceResolution.note,
      namespaceCandidates: namespaceResolution.candidates,
    };
  }

  const baseArgs = {
    timeWindow,
    environment,
    scopedServices: scopedServices.length > 0 ? scopedServices : undefined,
    errors,
  };

  if (intent === "erroring") {
    const result = await deriveErroringServices(baseArgs);
    return {
      derivedScope: {
        kind: "erroring",
        services: result.services,
        explanation: result.explanation,
        note: namespaceResolution.note,
      },
      scopedServices: result.services,
      namespaceNote: namespaceResolution.note,
      namespaceCandidates: namespaceResolution.candidates,
    };
  }

  if (intent === "spiking") {
    const result = await deriveSpikingServices(baseArgs);
    return {
      derivedScope: {
        kind: "spiking",
        services: result.services,
        explanation: result.explanation,
        note: namespaceResolution.note,
      },
      scopedServices: result.services,
      namespaceNote: namespaceResolution.note,
      namespaceCandidates: namespaceResolution.candidates,
    };
  }

  if (intent === "silent") {
    const result = await deriveSilentServices(baseArgs);
    return {
      derivedScope: {
        kind: "silent",
        services: result.services,
        explanation: result.explanation,
        note: namespaceResolution.note,
      },
      scopedServices: result.services,
      namespaceNote: namespaceResolution.note,
      namespaceCandidates: namespaceResolution.candidates,
    };
  }

  return {
    derivedScope: null,
    scopedServices,
    namespaceNote: namespaceResolution.note,
    namespaceCandidates: namespaceResolution.candidates,
  };
}

function formatDuration(value?: number | null): string | undefined {
  if (value == null || Number.isNaN(value)) {
    return undefined;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} s`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)} ms`;
  }

  return `${value.toFixed(0)} μs`;
}

function formatRate(value?: number | null): string | undefined {
  if (value == null || Number.isNaN(value)) {
    return undefined;
  }

  return `${value.toFixed(1)} tpm`;
}

function formatPercent(value?: number | null): string | undefined {
  if (value == null || Number.isNaN(value)) {
    return undefined;
  }

  return `${(value * 100).toFixed(1)}%`;
}

function buildStatsList(stats: NodeStats): ServiceMapDetailStats[] {
  const items: Array<ServiceMapDetailStats | undefined> = [
    (() => {
      const value = formatDuration(stats.transactionStats?.latency?.value);
      return value ? { label: "Latency (avg.)", value } : undefined;
    })(),
    (() => {
      const value = formatRate(stats.transactionStats?.throughput?.value);
      return value ? { label: "Throughput (avg.)", value } : undefined;
    })(),
    (() => {
      const value = formatPercent(stats.failedTransactionsRate?.value);
      return value ? { label: "Failed transaction rate", value } : undefined;
    })(),
    (() => {
      const value = formatPercent(stats.cpuUsage?.value);
      return value ? { label: "CPU usage (avg.)", value } : undefined;
    })(),
    (() => {
      const value = formatPercent(stats.memoryUsage?.value);
      return value ? { label: "Memory usage (avg.)", value } : undefined;
    })(),
  ];

  return items.filter((item): item is ServiceMapDetailStats => Boolean(item));
}

function getFocusServiceName(viewState: PortableServiceMapViewState): string | undefined {
  return viewState.serviceName || (viewState.highlightedServiceNames.length === 1 ? viewState.highlightedServiceNames[0] : undefined);
}

function buildDetailUrls(args: {
  viewState: PortableServiceMapViewState;
  serviceName?: string;
  dependencyName?: string;
}): ServiceMapDetailAction[] {
  const { viewState, serviceName, dependencyName } = args;
  const config = getConfig();
  const searchParams = new URLSearchParams();
  searchParams.set("rangeFrom", viewState.rangeFrom);
  searchParams.set("rangeTo", viewState.rangeTo);
  searchParams.set("environment", viewState.environment);

  if (viewState.kuery) {
    searchParams.set("kuery", viewState.kuery);
  }

  if (viewState.serviceGroupId) {
    searchParams.set("serviceGroup", viewState.serviceGroupId);
  }

  const actions: ServiceMapDetailAction[] = [];

  if (serviceName) {
    actions.push({
      label: "Open service details",
      url: `${config.kibanaUrl}/app/apm#/services/${encodeURIComponent(serviceName)}?${searchParams.toString()}`,
    });
  }

  if (dependencyName) {
    const dependencyParams = new URLSearchParams(searchParams);
    dependencyParams.set("dependencyName", dependencyName);
    actions.push({
      label: "Open dependency details",
      url: `${config.kibanaUrl}/app/apm#/dependencies/overview?${dependencyParams.toString()}`,
    });
  }

  const focusServiceName = getFocusServiceName(viewState);
  actions.push({
    label: "Open this map in Kibana",
    url: buildKibanaServiceMapUrl({
      rangeFrom: viewState.rangeFrom,
      rangeTo: viewState.rangeTo,
      environment: viewState.environment,
      kuery: viewState.kuery,
      serviceName: focusServiceName,
      serviceGroupId: viewState.serviceGroupId,
      serviceMapState: viewState,
    }),
  });

  return actions;
}

function formatPromptList(values: string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

function buildApmServiceMapPrompt(args: {
  intent: ServiceMapIntent;
  rangeFrom: string;
  rangeTo: string;
  service?: string;
  services?: string[];
  serviceGroupId?: string;
  environment?: string;
  kuery?: string;
  namespace?: string;
}): string {
  const parts = [`intent "${args.intent}"`, `range_from "${args.rangeFrom}"`, `range_to "${args.rangeTo}"`];

  if (args.service) {
    parts.push(`service "${args.service}"`);
  }

  if (args.services?.length) {
    parts.push(`services ${formatPromptList(args.services)}`);
  }

  if (args.serviceGroupId) {
    parts.push(`service_group_id "${args.serviceGroupId}"`);
  }

  if (args.environment && args.environment !== ENVIRONMENT_ALL) {
    parts.push(`environment "${args.environment}"`);
  }

  if (args.kuery) {
    parts.push(`kuery "${args.kuery}"`);
  }

  if (args.namespace) {
    parts.push(`namespace "${args.namespace}"`);
  }

  return `Use apm-service-map with ${parts.join(" and ")}`;
}

function buildRerunPresets(currentLookback: string): string[] {
  return [...new Set([currentLookback, "15m", "1h", "6h", "24h"])];
}

function buildNoDataInvestigationActions(args: {
  intent: ServiceMapIntent;
  lookback: string;
  service?: string;
  services: string[];
  serviceGroupId?: string;
  environment: string;
  kuery: string;
  namespace?: string;
}): Array<{ label: string; prompt: string }> {
  const { intent, lookback, service, services, serviceGroupId, environment, kuery, namespace } = args;
  const actions: Array<{ label: string; prompt: string }> = [];

  if (lookback !== "24h") {
    actions.push({
      label: "Retry with 24h",
      prompt: buildApmServiceMapPrompt({
        intent,
        rangeFrom: "now-24h",
        rangeTo: "now",
        service,
        services,
        serviceGroupId,
        environment,
        kuery,
        namespace,
      }),
    });
  }

  if (environment !== ENVIRONMENT_ALL) {
    actions.push({
      label: "Retry all environments",
      prompt: buildApmServiceMapPrompt({
        intent,
        rangeFrom: `now-${lookback}`,
        rangeTo: "now",
        service,
        services,
        serviceGroupId,
        kuery,
        namespace,
      }),
    });
  }

  if (intent !== "global" || service || services.length > 0 || serviceGroupId || namespace) {
    actions.push({
      label: "Show the full map",
      prompt: buildApmServiceMapPrompt({
        intent: "global",
        rangeFrom: `now-${lookback}`,
        rangeTo: "now",
        environment,
        kuery,
      }),
    });
  }

  return actions;
}

function buildInvestigationActions(args: {
  focusServiceName?: string;
  highlightedServices: string[];
  lookback: string;
  namespace?: string;
}): Array<{ label: string; prompt: string }> {
  const actions: Array<{ label: string; prompt: string }> = [];
  const [first, second] = args.highlightedServices;

  if (first) {
    actions.push({
      label: `Investigate ${first}`,
      prompt: `Use ml-anomalies with entity "${first}" and lookback "${args.lookback}" to explain what changed around this service.`,
    });
  }

  if (second && second !== first) {
    actions.push({
      label: `Compare ${second}`,
      prompt: `Use apm-health-summary${args.namespace ? ` with namespace "${args.namespace}"` : ""} and lookback "${args.lookback}" to compare ${second} with the rest of the environment.`,
    });
  }

  if (args.focusServiceName) {
    actions.push({
      label: "Review focused service health",
      prompt: `Use apm-health-summary and lookback "${args.lookback}" to review health for "${args.focusServiceName}".`,
    });
  }

  if (!actions.length) {
    actions.push({
      label: "Cluster health rollup",
      prompt: `Use apm-health-summary${args.namespace ? ` with namespace "${args.namespace}"` : ""} and lookback "${args.lookback}" to review service health before drilling into topology.`,
    });
  }

  return actions;
}

function buildSparseTopologyInvestigationActions(args: {
  focusServiceName?: string;
  environment: string;
  kuery: string;
  namespace?: string;
}): Array<{ label: string; prompt: string }> {
  const actions: Array<{ label: string; prompt: string }> = [];

  if (args.focusServiceName) {
    actions.push({
      label: `Show current topology for ${args.focusServiceName}`,
      prompt: buildApmServiceMapPrompt({
        intent: "service",
        rangeFrom: "now-24h",
        rangeTo: "now",
        service: args.focusServiceName,
        environment: args.environment,
        kuery: args.kuery,
        namespace: args.namespace,
      }),
    });
  }

  if (args.environment !== ENVIRONMENT_ALL) {
    actions.push({
      label: "Show current environment map",
      prompt: buildApmServiceMapPrompt({
        intent: "global",
        rangeFrom: "now-24h",
        rangeTo: "now",
        environment: args.environment,
        kuery: args.kuery,
        namespace: args.namespace,
      }),
    });
  }

  return actions;
}

export function registerApmServiceMapTool(server: McpServer) {
  registerAppTool(
    server,
    "apm-service-map",
    {
      title: "APM Service Map",
      description:
        'Requires: Kibana APM service map APIs and Elastic APM data. Best RCA entrypoint for topology questions: use intent "erroring" to highlight recently failing services, intent "service" with an exact service.name to focus one service, or intent "global" for the full graph. If the map comes back empty, retry with a wider time range or a looser environment filter.',
      inputSchema: {
        intent: intentSchema.describe(
          'Optional map mode. Use "erroring" for incident triage, "service" when you already know the exact service.name, "explicit_services" for a supplied shortlist, "current_context" for namespace-derived services, and "global" for the full topology.'
        ),
        service: z.string().optional().describe(
          'Exact APM service.name to focus. Pair this with intent "service" for requests like "show me the map for checkout".'
        ),
        services: z
          .array(z.string())
          .optional()
          .describe(
            'Explicit service.name values to highlight from the current investigation context. Best paired with intent "explicit_services".'
          ),
        service_group_id: z.string().optional().describe("Optional APM service group id."),
        environment: z
          .string()
          .optional()
          .describe("Optional service.environment scope. Strongly recommended in multi-environment deployments."),
        kuery: z.string().optional().describe(
          "Optional Kibana KQL filter applied to the topology request."
        ),
        namespace: z.string().optional().describe(
          "Optional namespace or surrounding context hint used to derive services."
        ),
        range_from: z.string().optional().describe(
          'Start of the time range. Defaults to now-1h. Accepts now-relative values or ISO timestamps. If the map is empty, retrying with something broader like "now-24h" is often the right next step.'
        ),
        range_to: z.string().optional().describe(
          "End of the time range. Defaults to now. Accepts now-relative values or ISO timestamps."
        ),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (rawArgs) => {
      const args = rawArgs as ServiceMapToolArgs;
      const timeWindow = resolveTimeWindow(args.range_from, args.range_to);
      const environment = args.environment?.trim() || ENVIRONMENT_ALL;
      const kuery = args.kuery?.trim() || "";
      const explicitServices = normalizeServiceNames(args.services);
      const service = args.service?.trim();
      const serviceGroupId = args.service_group_id?.trim();
      const effectiveIntent = defaultIntent({
        intent: args.intent,
        service,
        services: explicitServices,
        namespace: args.namespace,
      });

      const queryErrors: string[] = [];
      const warnings: string[] = [];

      if (kuery) {
        warnings.push(
          "Derived service highlighting is based on direct telemetry queries and does not yet re-apply the supplied KQL when choosing highlighted services."
        );
      }

      const { derivedScope, scopedServices, namespaceNote, namespaceCandidates } = await deriveScope({
        intent: effectiveIntent,
        explicitServices,
        namespace: args.namespace,
        timeWindow,
        environment,
        errors: queryErrors,
      });

      const focusServiceName =
        service ||
        (effectiveIntent === "service"
          ? service
          : effectiveIntent === "global"
          ? undefined
          : scopedServices.length === 1
          ? scopedServices[0]
          : undefined);

      const highlightedServiceNames =
        focusServiceName && scopedServices.length === 0
          ? [focusServiceName]
          : scopedServices;

      const viewState = normalizePortableViewState({
        rangeFrom: timeWindow.rangeFrom,
        rangeTo: timeWindow.rangeTo,
        environment,
        kuery,
        serviceName: focusServiceName,
        serviceGroupId,
        highlightedServiceNames,
      });

      let graph: KibanaPortableServiceMapResponse;
      let usedStandardRouteFallback = false;
      let usedRacAlertBadgeFallback = false;

      try {
        graph = await kibanaRequest<KibanaPortableServiceMapResponse>(
          "/internal/apm/service-map/portable",
          {
            params: {
              start: timeWindow.startIso,
              end: timeWindow.endIso,
              environment,
              ...(kuery ? { kuery } : {}),
              ...(viewState.serviceName ? { serviceName: viewState.serviceName } : {}),
              ...(viewState.serviceGroupId ? { serviceGroup: viewState.serviceGroupId } : {}),
              serviceMapState: serializePortableViewState(viewState),
            },
          }
        );
      } catch (error) {
        if (!isMissingPortableServiceMapRouteError(error)) {
          throw error;
        }

        usedStandardRouteFallback = true;

        const standardGraph = await kibanaRequest<KibanaStandardServiceMapResponse>(
          "/internal/apm/service-map",
          {
            params: {
              start: timeWindow.startIso,
              end: timeWindow.endIso,
              environment,
              ...(kuery ? { kuery } : {}),
              ...(viewState.serviceName ? { serviceName: viewState.serviceName } : {}),
              ...(viewState.serviceGroupId ? { serviceGroup: viewState.serviceGroupId } : {}),
            },
          }
        );

        const baseGraph = buildPortableGraphFromRawResponse(standardGraph);
        const serviceNames = getServiceNamesFromGraph(baseGraph.nodes);

        let badges: ServiceMapBadgeResponse = {
          alerts: [],
          slos: [],
        };

        if (serviceNames.length > 0) {
          try {
            badges = await kibanaRequest<ServiceMapBadgeResponse>(
              "/internal/apm/service-map/service_badges",
              {
                method: "POST",
                params: {
                  start: timeWindow.startIso,
                  end: timeWindow.endIso,
                  environment,
                  ...(kuery ? { kuery } : {}),
                },
                body: {
                  serviceNames: JSON.stringify(serviceNames),
                },
              }
            );
          } catch (badgeError) {
            const message = badgeError instanceof Error ? badgeError.message : String(badgeError);
            queryErrors.push(`Service-map badges route failed: ${message}`);

            try {
              badges = await fetchServiceBadgesFromRacAlerts({
                serviceNames,
                timeWindow,
                environment,
              });
              usedRacAlertBadgeFallback = true;
            } catch (racBadgeError) {
              const racMessage =
                racBadgeError instanceof Error ? racBadgeError.message : String(racBadgeError);
              queryErrors.push(`Service-map RAC alert badge fallback failed: ${racMessage}`);
            }
          }
        }

        const nodesWithBadges = mergePortableGraphWithBadges(baseGraph.nodes, badges);
        const graphWithState = applyPortableGraphState({
          nodes: nodesWithBadges,
          edges: baseGraph.edges,
          viewState: {
            serviceName: viewState.serviceName,
            highlightedServiceNames: viewState.highlightedServiceNames,
            orientation: viewState.orientation,
            filters: viewState.filters,
          },
        });

        graph = {
          nodes: graphWithState.nodes,
          edges: graphWithState.edges,
          nodesCount: baseGraph.nodesCount,
          tracesCount: baseGraph.tracesCount,
        };
      }

      const serviceCount = getServiceCount(graph);
      const edgeCount = graph.edges.length;
      const fullMapUrl = buildKibanaServiceMapUrl({
        rangeFrom: timeWindow.rangeFrom,
        rangeTo: timeWindow.rangeTo,
        environment,
        kuery,
        serviceName: viewState.serviceName,
        serviceGroupId: viewState.serviceGroupId,
        serviceMapState: viewState,
      });

      const summary =
        serviceCount > 0
          ? `Service map${viewState.serviceName ? ` for ${viewState.serviceName}` : ""} with ${serviceCount} service${serviceCount === 1 ? "" : "s"} and ${edgeCount} relationship${edgeCount === 1 ? "" : "s"}.`
          : `No service map nodes were returned for the requested scope and time range. This usually means no matching APM telemetry was found in ${timeWindow.lookback}.`;

      if (serviceCount === 0) {
        warnings.push(
          `No APM service-map telemetry matched this scope in ${timeWindow.lookback}. If you expected data, retry with a wider window${environment !== ENVIRONMENT_ALL ? " or without the environment filter" : ""}.`
        );
      }

      const hasSparseTopology = serviceCount > 0 && edgeCount === 0 && graph.tracesCount === 0;
      if (hasSparseTopology) {
        warnings.push(
          `The requested window matched ${serviceCount} service${serviceCount === 1 ? "" : "s"}, but no relationship telemetry was available, so the map contains 0 relationships. This commonly happens for older windows after trace-based topology data has aged out.`
        );

        if (viewState.serviceName) {
          warnings.push(
            `Try a current window for "${viewState.serviceName}" to inspect the live neighborhood around the alerted service, then use the historical alert context to reason about likely downstream suspects.`
          );
        }
      }

      if (usedStandardRouteFallback) {
        warnings.push(
          "This Kibana cluster does not expose the portable service-map API. The MCP fell back to the standard APM service-map route and applied badges, highlighting, layout, and filters locally."
        );

        if (usedRacAlertBadgeFallback) {
          warnings.push(
            "Alert badges were derived from Kibana alert documents because the APM service-badge route is unavailable on this cluster. SLO badges may be missing in this fallback mode."
          );
        }
      }

      const investigationActions =
        serviceCount > 0
          ? [
              ...(hasSparseTopology
                ? buildSparseTopologyInvestigationActions({
                    focusServiceName: viewState.serviceName,
                    environment,
                    kuery,
                    namespace: args.namespace,
                  })
                : []),
              ...buildInvestigationActions({
                focusServiceName: viewState.serviceName,
                highlightedServices: viewState.highlightedServiceNames,
                lookback: timeWindow.lookback,
                namespace: args.namespace,
              }),
            ]
          : buildNoDataInvestigationActions({
              intent: effectiveIntent,
              lookback: timeWindow.lookback,
              service,
              services: explicitServices,
              serviceGroupId,
              environment,
              kuery,
              namespace: args.namespace,
            });

      const rerunContext = {
        tool: "apm-service-map",
        current_lookback: timeWindow.lookback,
        prompt_template: buildApmServiceMapPrompt({
          intent: effectiveIntent,
          rangeFrom: "now-{lookback}",
          rangeTo: "now",
          service,
          services: explicitServices,
          serviceGroupId,
          environment,
          kuery,
          namespace: args.namespace,
        }),
        presets: buildRerunPresets(timeWindow.lookback),
      };

      let investigationObjects: InvestigationObject[] | undefined;
      try {
        investigationObjects = await buildInvestigationObjects({
          graph,
          timeWindow,
          environment,
          kuery,
          serviceGroupId,
        });
      } catch (investigationObjectError) {
        const message =
          investigationObjectError instanceof Error
            ? investigationObjectError.message
            : String(investigationObjectError);
        queryErrors.push(`Investigation-object derivation failed: ${message}`);
      }

      const result: Record<string, unknown> = {
        summary,
        request_context: buildRequestContext({
          intent: effectiveIntent,
          service,
          services: explicitServices,
          serviceGroupId,
          environment,
          kuery,
          namespace: args.namespace,
          timeWindow,
          namespaceNote,
          namespaceCandidates,
        }),
        derived_scope: derivedScope,
        view_state: viewState,
        graph: {
          nodes: graph.nodes,
          edges: graph.edges,
          nodesCount: graph.nodesCount,
          tracesCount: graph.tracesCount,
          service_count: serviceCount,
          edge_count: edgeCount,
          full_map_url: fullMapUrl,
        },
        investigation_actions: investigationActions,
        rerun_context: rerunContext,
      };

      if (investigationObjects?.length) {
        result.investigation_objects = investigationObjects;
      }

      if (namespaceNote) {
        result.namespace_note = namespaceNote;
      }

      if (namespaceCandidates?.length) {
        result.namespace_candidates = namespaceCandidates;
      }

      if (warnings.length) {
        result.warnings = warnings;
      }

      if (queryErrors.length) {
        result._query_errors = queryErrors;
      }

      const welcome = consumeWelcomeNotice();
      if (welcome) {
        result._setup_notice = welcome;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  server.registerTool(
    "_apm-service-map-node-details",
    {
      title: "APM Service Map Node Details",
      description:
        "Internal: fetches detail content for a selected service-map node so the inline view can render an inspector without asking the model again.",
      inputSchema: {
        node_id: z.string(),
        node_label: z.string(),
        is_service: z.boolean(),
        is_grouped: z.boolean().optional(),
        grouped_connections: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              spanType: z.string().optional(),
              spanSubtype: z.string().optional(),
            })
          )
          .optional(),
        view_state: portableViewStateSchema,
      },
    },
    async ({ node_id, node_label, is_service, is_grouped, grouped_connections, view_state }) => {
      const timeWindow = resolveTimeWindow(view_state.rangeFrom, view_state.rangeTo);

      if (is_grouped) {
        const actions = buildDetailUrls({
          viewState: view_state,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                selection: { kind: "node", nodeId: node_id },
                title: node_label,
                subtitle: `${grouped_connections?.length ?? 0} grouped resource${grouped_connections?.length === 1 ? "" : "s"}`,
                stats: [],
                grouped_connections: grouped_connections ?? [],
                actions,
              }),
            },
          ],
        };
      }

      if (is_service) {
        const response = await kibanaRequest<ServiceNodeInfoResponse>(
          `/internal/apm/service-map/service/${encodeURIComponent(node_id)}`,
          {
            params: {
              start: timeWindow.startIso,
              end: timeWindow.endIso,
              environment: view_state.environment,
            },
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                selection: { kind: "node", nodeId: node_id },
                title: node_label,
                stats: buildStatsList(response.currentPeriod),
                actions: buildDetailUrls({
                  viewState: view_state,
                  serviceName: node_id,
                }),
              }),
            },
          ],
        };
      }

      const response = await kibanaRequest<DependencyNodeInfoResponse>(
        "/internal/apm/service-map/dependency",
        {
          params: {
            dependencies: node_label,
            start: timeWindow.startIso,
            end: timeWindow.endIso,
            environment: view_state.environment,
          },
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              selection: { kind: "node", nodeId: node_id },
              title: node_label,
              stats: buildStatsList(response.currentPeriod),
              actions: buildDetailUrls({
                viewState: view_state,
                dependencyName: node_label,
              }),
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "_apm-service-map-edge-details",
    {
      title: "APM Service Map Edge Details",
      description:
        "Internal: fetches detail content for a selected service-map edge so the inline view can render relationship details.",
      inputSchema: {
        edge_id: z.string().optional(),
        source_service_name: z.string().optional(),
        target_service_name: z.string().optional(),
        resources: z.array(z.string()).optional(),
        is_grouped: z.boolean().optional(),
        view_state: portableViewStateSchema,
      },
    },
    async ({ edge_id, source_service_name, target_service_name, resources, is_grouped, view_state }) => {
      const timeWindow = resolveTimeWindow(view_state.rangeFrom, view_state.rangeTo);
      const selection = {
        kind: "edge" as const,
        ...(edge_id ? { edgeId: edge_id } : {}),
        ...(source_service_name ? { source: source_service_name } : {}),
        ...(target_service_name ? { target: target_service_name } : {}),
      };

      if (!source_service_name || !resources?.length || is_grouped) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                selection,
                title: `${source_service_name ?? "Unknown"} → ${target_service_name ?? "Unknown"}`,
                stats: [],
                message:
                  "No direct latency metrics are available for this relationship. Open the map in Kibana for the full context.",
                actions: buildDetailUrls({
                  viewState: view_state,
                  serviceName: getFocusServiceName(view_state),
                }),
              }),
            },
          ],
        };
      }

      const response = await kibanaRequest<DependencyNodeInfoResponse>(
        "/internal/apm/service-map/dependency",
        {
          params: {
            sourceServiceName: source_service_name,
            dependencies: resources,
            start: timeWindow.startIso,
            end: timeWindow.endIso,
            environment: view_state.environment,
          },
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              selection,
              title: `${source_service_name} → ${target_service_name ?? resources[0]}`,
              stats: buildStatsList(response.currentPeriod),
              actions: buildDetailUrls({
                viewState: view_state,
                dependencyName: resources[0],
              }),
            }),
          },
        ],
      };
    }
  );

  const viewPath = resolveViewPath("apm-service-map");
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
