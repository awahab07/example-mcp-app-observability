/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, type AppLike } from "@shared/use-app";
import { parseToolResult } from "@shared/parse-tool-result";
import { applyTheme } from "@shared/theme";
import {
  InvestigationActions,
  QueryPill,
  SetupNoticeBanner,
  TimeRangeHeader,
  type InvestigationAction,
  type RerunContext,
  type SetupNotice,
} from "@shared/components";
import { AppGlyph, ExitFullscreenIcon, FullscreenIcon, SearchIcon, XIcon } from "@shared/icons";
import { useDisplayMode } from "@shared/use-display-mode";
import type {
  PortableServiceMapSelectedElement,
  PortableServiceMapViewport,
  ServiceMapEdge,
  ServiceMapNode,
} from "./local_portable_types";
import { serviceMapSelectedElementsEqual } from "./local_portable_types";
import {
  ALERT_STATUS_OPTIONS,
  ANOMALY_STATUS_OPTIONS,
  DEFAULT_SERVICE_MAP_FILTERS,
  SLO_STATUS_OPTIONS,
  buildRenderedServiceMapGraph,
  computeServiceMapFilterOptionCounts,
  getVisibleEdgeCount,
  getVisibleGroupedNodeCount,
  getVisibleSearchableNodes,
  getVisibleServiceCount,
  hasActiveViewControls,
  toggleFilterValue,
  type ServiceMapAlertStatus,
  type ServiceMapAnomalyStatus,
  type ServiceMapOrientation,
  type ServiceMapSloStatus,
} from "./service_map_view_helpers";
import { EnhancedPortableServiceMap, type FocusNodeRequest } from "./enhanced_portable_service_map";
import { viewStyles } from "./styles";

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
    alertStatusFilter: ServiceMapAlertStatus[];
    sloStatusFilter: ServiceMapSloStatus[];
    anomalyStatusFilter: ServiceMapAnomalyStatus[];
  };
  orientation: ServiceMapOrientation;
  viewport?: PortableServiceMapViewport;
  selectedElement?: PortableServiceMapSelectedElement;
}

interface ToolData {
  summary: string;
  request_context?: {
    intent?: string;
    service?: string;
    services?: string[];
    service_group_id?: string;
    environment?: string;
    kuery?: string;
    namespace?: string;
    range_from?: string;
    range_to?: string;
    namespace_note?: string;
    namespace_candidates?: string[];
  };
  derived_scope?: {
    kind: string;
    services: string[];
    explanation: string;
    note?: string;
  } | null;
  view_state: PortableServiceMapViewState;
  graph: {
    nodes: ServiceMapNode[];
    edges: ServiceMapEdge[];
    nodesCount: number;
    tracesCount: number;
    service_count: number;
    edge_count: number;
    full_map_url?: string;
  };
  investigation_actions?: InvestigationAction[];
  investigation_objects?: InvestigationObject[];
  rca_candidates?: RcaCandidate[];
  rerun_context?: RerunContext;
  warnings?: string[];
  namespace_note?: string;
  namespace_candidates?: string[];
  _query_errors?: string[];
  _setup_notice?: SetupNotice;
}

interface DetailAction {
  label: string;
  url: string;
}

interface DetailData {
  selection: PortableServiceMapSelectedElement;
  title: string;
  subtitle?: string;
  stats: Array<{ label: string; value: string }>;
  actions?: DetailAction[];
  message?: string;
  grouped_connections?: Array<{
    id: string;
    label: string;
    spanType?: string;
    spanSubtype?: string;
  }>;
}

type StripItemTone = "critical" | "warning" | "info" | "neutral";

interface RcaCandidate {
  id: string;
  kind: "edge" | "service";
  title: string;
  subtitle: string;
  summary: string;
  shortLabel: string;
  tone: "critical" | "warning";
  score: number;
  focusServiceName?: string;
  highlightedServiceNames: string[];
  selectedElement: PortableServiceMapSelectedElement;
  kibanaUrl: string;
  serviceName?: string;
  targetLabel?: string;
  transactionName?: string;
  failures: number;
  total: number;
  failureRate: number;
}

interface InvestigationObject {
  id: string;
  kind: "alert" | "slo";
  title: string;
  subtitle: string;
  summary: string;
  shortLabel: string;
  badge?: number;
  tone: StripItemTone;
  score: number;
  status: "active" | "recovered";
  focusServiceName?: string;
  highlightedServiceNames?: string[];
  serviceName?: string;
  clusterName?: string;
  kibanaUrl?: string;
}

interface InvestigationStripItem {
  id: string;
  kind: "filter" | "service" | "resource" | "object" | "rca";
  title: string;
  subtitle: string;
  shortLabel: string;
  badge?: number;
  tone: StripItemTone;
  selected: boolean;
  nodeId?: string;
  filterKind?: "alert" | "slo" | "anomaly";
  filterValue?: ServiceMapAlertStatus | ServiceMapSloStatus | ServiceMapAnomalyStatus;
  investigationObject?: InvestigationObject;
  rcaCandidate?: RcaCandidate;
  score: number;
}

function getRcaCandidateFocusKey(candidate: RcaCandidate): string {
  const selectedElementKey =
    candidate.selectedElement.kind === "node"
      ? `node:${candidate.selectedElement.nodeId}`
      : `edge:${candidate.selectedElement.edgeId ?? ""}:${candidate.selectedElement.source ?? ""}:${
          candidate.selectedElement.target ?? ""
        }`;

  return JSON.stringify({
    selectedElement: selectedElementKey,
    focusServiceName: candidate.focusServiceName ?? "",
    highlightedServiceNames: [...new Set(candidate.highlightedServiceNames)].sort(),
  });
}

function getDistinctRcaCandidates(candidates: RcaCandidate[]): RcaCandidate[] {
  const focusKeys = new Set<string>();
  const distinctCandidates: RcaCandidate[] = [];

  for (const candidate of candidates) {
    const focusKey = getRcaCandidateFocusKey(candidate);
    if (focusKeys.has(focusKey)) {
      continue;
    }

    focusKeys.add(focusKey);
    distinctCandidates.push(candidate);
  }

  return distinctCandidates;
}

function serializeViewState(viewState: PortableServiceMapViewState): string {
  return JSON.stringify(viewState);
}

function buildCurrentFullMapUrl(
  baseUrl: string | undefined,
  viewState: PortableServiceMapViewState | null
): string | undefined {
  if (!baseUrl || !viewState) {
    return undefined;
  }

  const url = new URL(baseUrl);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const separatorIndex = hash.indexOf("?");
  const hashSearch = separatorIndex === -1 ? "" : hash.slice(separatorIndex + 1);
  const hashParams = new URLSearchParams(hashSearch);
  const hashPath = viewState.serviceName
    ? `/services/${encodeURIComponent(viewState.serviceName)}/service-map`
    : "/service-map";

  hashParams.set("rangeFrom", viewState.rangeFrom);
  hashParams.set("rangeTo", viewState.rangeTo);
  hashParams.set("environment", viewState.environment);
  hashParams.set("serviceMapState", serializeViewState(viewState));
  hashParams.set("mapOrientation", viewState.orientation);

  if (viewState.kuery) {
    hashParams.set("kuery", viewState.kuery);
  } else {
    hashParams.delete("kuery");
  }

  if (viewState.serviceGroupId) {
    hashParams.set("serviceGroup", viewState.serviceGroupId);
  } else {
    hashParams.delete("serviceGroup");
  }

  url.hash = `${hashPath}?${hashParams.toString()}`;
  return url.toString();
}

function clearableViewStateUpdate(
  current: PortableServiceMapViewState | null,
  update: Partial<PortableServiceMapViewState> & {
    viewport?: PortableServiceMapViewport;
    selectedElement?: PortableServiceMapSelectedElement;
  }
): PortableServiceMapViewState | null {
  if (!current) {
    return current;
  }

  const next: PortableServiceMapViewState = { ...current };

  if ("viewport" in update) {
    if (update.viewport) {
      next.viewport = update.viewport;
    } else {
      delete next.viewport;
    }
  }

  if ("selectedElement" in update) {
    if (update.selectedElement) {
      next.selectedElement = update.selectedElement;
    } else {
      delete next.selectedElement;
    }
  }

  return {
    ...next,
    ...Object.fromEntries(
      Object.entries(update).filter(([key]) => key !== "viewport" && key !== "selectedElement")
    ),
  };
}

function renderGroupedConnectionLabel(item: {
  label: string;
  spanType?: string;
  spanSubtype?: string;
}): string {
  const detail = item.spanSubtype || item.spanType;
  return detail ? `${item.label} · ${detail}` : item.label;
}

function getTonePriority(tone: StripItemTone): number {
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

function getItemToneClassName(tone: StripItemTone): string {
  switch (tone) {
    case "critical":
      return "is-critical";
    case "warning":
      return "is-warning";
    case "info":
      return "is-info";
    default:
      return "is-neutral";
  }
}

function getShortLabel(label: string, fallback = "?"): string {
  const normalized = label.trim();
  if (!normalized) {
    return fallback;
  }

  const parts = normalized
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }

  return normalized.slice(0, 2).toUpperCase();
}

function getAlertTone(status: ServiceMapAlertStatus): StripItemTone {
  switch (status) {
    case "active":
      return "critical";
    case "delayed":
      return "warning";
    case "untracked":
      return "info";
    default:
      return "neutral";
  }
}

function getSloTone(status: ServiceMapSloStatus): StripItemTone {
  switch (status) {
    case "violated":
      return "critical";
    case "degrading":
      return "warning";
    case "healthy":
      return "info";
    default:
      return "neutral";
  }
}

function getAnomalyTone(status: ServiceMapAnomalyStatus): StripItemTone {
  switch (status) {
    case "critical":
      return "critical";
    case "warning":
      return "warning";
    case "healthy":
      return "info";
    default:
      return "neutral";
  }
}

function getServiceAttentionSummary(node: ServiceMapNode): {
  tone: StripItemTone;
  summary: string;
  score: number;
  badge?: number;
} {
  const reasons: string[] = [];
  let tone: StripItemTone = "neutral";
  let score = 0;
  let badge: number | undefined;

  if (typeof node.data.alertsCount === "number" && node.data.alertsCount > 0) {
    reasons.push(
      `${node.data.alertsCount} alert${node.data.alertsCount === 1 ? "" : "s"}`
    );
    tone = "critical";
    score += 100 + node.data.alertsCount;
    badge = node.data.alertsCount;
  }

  if (node.data.sloStatus === "violated") {
    reasons.push("Violating SLO");
    tone = "critical";
    score += 80;
  } else if (node.data.sloStatus === "degrading") {
    reasons.push("Degrading SLO");
    if (tone !== "critical") {
      tone = "warning";
    }
    score += 45;
  }

  const healthStatus = node.data.serviceAnomalyStats?.healthStatus;
  if (healthStatus === "critical" || healthStatus === "major") {
    reasons.push("Critical anomaly");
    tone = "critical";
    score += 70;
  } else if (healthStatus === "warning") {
    reasons.push("Warning anomaly");
    if (tone !== "critical") {
      tone = "warning";
    }
    score += 35;
  }

  if (node.data.contextHighlight) {
    reasons.push("Investigation focus");
    if (tone === "neutral") {
      tone = "info";
    }
    score += 25;
  }

  return {
    tone,
    summary: reasons.slice(0, 2).join(" · ") || "Visible on the map",
    score,
    badge,
  };
}

function SelectionTray({
  detail,
  detailError,
  detailLoading,
  openUrl,
  selectedNode,
  selectedEdge,
  graphSummary,
  onClearSelection,
}: {
  detail: DetailData | null;
  detailError: string | null;
  detailLoading: boolean;
  openUrl: (url?: string) => void;
  selectedNode?: ServiceMapNode;
  selectedEdge?: ServiceMapEdge;
  graphSummary: ToolData["graph"];
  onClearSelection: () => void;
}) {
  if (detailLoading) {
    return <div className="apm-service-map-selection-empty">Loading selection details…</div>;
  }

  if (detailError) {
    return <div className="apm-service-map-selection-empty">{detailError}</div>;
  }

  if (!detail) {
    if (selectedNode) {
      const nodeStats = [
        typeof selectedNode.data.alertsCount === "number"
          ? { label: "Alerts", value: String(selectedNode.data.alertsCount) }
          : undefined,
        selectedNode.data.sloStatus
          ? { label: "SLO", value: selectedNode.data.sloStatus }
          : undefined,
        selectedNode.data.serviceAnomalyStats?.healthStatus
          ? {
              label: "Anomaly",
              value: selectedNode.data.serviceAnomalyStats.healthStatus,
            }
          : undefined,
      ].filter((item): item is { label: string; value: string } => Boolean(item));

      return (
        <div className="apm-service-map-selection-tray">
          <div className="apm-service-map-selection-head">
            <div>
              <div className="apm-service-map-selection-title">
                {String(selectedNode.data.label ?? selectedNode.id)}
              </div>
              <div className="apm-service-map-selection-subtitle">
                {selectedNode.data.isGrouped
                  ? "Grouped resource"
                  : selectedNode.data.isService
                    ? "Service node"
                    : "Dependency node"}
              </div>
            </div>
            <button
              type="button"
              className="apm-service-map-inline-icon-btn"
              aria-label="Clear current selection"
              title="Clear selection"
              onClick={onClearSelection}
            >
              <XIcon size={14} />
            </button>
          </div>

          <div className="apm-service-map-summary">
            Focused from the investigation strip or the map. Additional server-side details were
            not returned for this selection.
          </div>

          {selectedNode.data.groupedConnections?.length ? (
            <div className="apm-service-map-selection-chip-row">
              {selectedNode.data.groupedConnections.map((item) => (
                <span key={item.id} className="apm-service-map-selection-chip">
                  {renderGroupedConnectionLabel(item)}
                </span>
              ))}
            </div>
          ) : null}

          {nodeStats.length > 0 ? (
            <div className="apm-service-map-selection-stat-row">
              {nodeStats.map((stat) => (
                <div key={stat.label} className="apm-service-map-selection-stat">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (selectedEdge) {
      const edgeStats = [
        selectedEdge.data?.resources?.length
          ? {
              label: "Resources",
              value: String(selectedEdge.data.resources.length),
            }
          : undefined,
        selectedEdge.data?.isGrouped ? { label: "Grouping", value: "Grouped" } : undefined,
      ].filter((item): item is { label: string; value: string } => Boolean(item));

      return (
        <div className="apm-service-map-selection-tray">
          <div className="apm-service-map-selection-head">
            <div>
              <div className="apm-service-map-selection-title">
                {selectedEdge.data?.sourceLabel || selectedEdge.source} →{" "}
                {selectedEdge.data?.targetLabel || selectedEdge.target}
              </div>
              <div className="apm-service-map-selection-subtitle">Relationship edge</div>
            </div>
            <button
              type="button"
              className="apm-service-map-inline-icon-btn"
              aria-label="Clear current selection"
              title="Clear selection"
              onClick={onClearSelection}
            >
              <XIcon size={14} />
            </button>
          </div>

          <div className="apm-service-map-summary">
            Focused from the map. Additional server-side details were not returned for this
            relationship.
          </div>

          {edgeStats.length > 0 ? (
            <div className="apm-service-map-selection-stat-row">
              {edgeStats.map((stat) => (
                <div key={stat.label} className="apm-service-map-selection-stat">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="apm-service-map-selection-tray is-empty">
        <div className="apm-service-map-selection-head">
          <div>
            <div className="apm-service-map-selection-title">Map overview</div>
            <div className="apm-service-map-selection-subtitle">
              {graphSummary.service_count} service{graphSummary.service_count === 1 ? "" : "s"} ·{" "}
              {graphSummary.edge_count} relationship{graphSummary.edge_count === 1 ? "" : "s"} ·{" "}
              {graphSummary.tracesCount} traces
            </div>
          </div>
        </div>
        <div className="apm-service-map-selection-empty">
          Select a node, edge, or investigation object to focus the topology and inspect its
          related metrics.
        </div>
      </div>
    );
  }

  return (
    <div className="apm-service-map-selection-tray">
      <div className="apm-service-map-selection-head">
        <div>
          <div className="apm-service-map-selection-title">{detail.title}</div>
          <div className="apm-service-map-selection-subtitle">
            {detail.subtitle || (
              <>
                {graphSummary.service_count} service{graphSummary.service_count === 1 ? "" : "s"} ·{" "}
                {graphSummary.edge_count} relationship
                {graphSummary.edge_count === 1 ? "" : "s"} · {graphSummary.tracesCount} traces
              </>
            )}
          </div>
        </div>
        {(selectedNode || selectedEdge) && (
          <button
            type="button"
            className="apm-service-map-inline-icon-btn"
            aria-label="Clear current selection"
            title="Clear selection"
            onClick={onClearSelection}
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {detail.message && <div className="apm-service-map-summary">{detail.message}</div>}

      {detail.grouped_connections?.length ? (
        <div className="apm-service-map-selection-chip-row">
          {detail.grouped_connections.map((item) => (
            <span key={item.id} className="apm-service-map-selection-chip">
              {renderGroupedConnectionLabel(item)}
            </span>
          ))}
        </div>
      ) : null}

      {detail.stats.length > 0 ? (
        <div className="apm-service-map-selection-stat-row">
          {detail.stats.map((stat) => (
            <div key={stat.label} className="apm-service-map-selection-stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {detail.actions?.length ? (
        <div className="apm-service-map-detail-actions">
          {detail.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="apm-service-map-detail-action"
              onClick={() => openUrl(action.url)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {!detail.actions?.length && (selectedNode || selectedEdge) ? (
        <div className="apm-service-map-selection-empty">
          No direct detail actions were returned for this selection.
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  const [app, setApp] = useState<AppLike | null>(null);
  const [data, setData] = useState<ToolData | null>(null);
  const [viewState, setViewState] = useState<PortableServiceMapViewState | null>(null);
  const [graphVersion, setGraphVersion] = useState(0);
  const [selectedNode, setSelectedNode] = useState<ServiceMapNode | undefined>();
  const [selectedEdge, setSelectedEdge] = useState<ServiceMapEdge | undefined>();
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchStarted, setSearchStarted] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusNodeRequest | undefined>();
  const [activeInvestigationObjectId, setActiveInvestigationObjectId] = useState<string | undefined>();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const focusNonceRef = useRef(0);
  const { isFullscreen, toggle: toggleFullscreen } = useDisplayMode(app);

  const applyToolData = useCallback((parsed: ToolData) => {
    setData(parsed);
    setViewState(parsed.view_state);
    setSelectedNode(undefined);
    setSelectedEdge(undefined);
    setDetail(null);
    setDetailError(null);
    setNoticeDismissed(false);
    setSearchQuery("");
    setSearchIndex(0);
    setSearchStarted(false);
    setFocusRequest(undefined);
    setActiveInvestigationObjectId(undefined);
    setGraphVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = viewStyles;
    document.head.appendChild(style);
    applyTheme();
    return () => style.remove();
  }, []);

  const { isConnected, error } = useApp({
    appInfo: { name: "APM Service Map", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (created) => {
      created.ontoolresult = (params) => {
        const parsed = parseToolResult<ToolData>(params);
        if (parsed?.graph?.nodes && parsed?.view_state) {
          applyToolData(parsed);
        }
      };
      setApp(created);
    },
  });

  const onSend = useCallback((prompt: string) => {
    app?.sendMessage(prompt);
  }, [app]);

  const openUrl = useCallback(
    (url?: string) => {
      if (!url) return;
      if (app) {
        app.openLink({ url }).catch(() => {
          window.open(url, "_blank", "noopener,noreferrer");
        });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [app]
  );

  const setupNotice = data?._setup_notice;
  const dismissNotice = useCallback(() => {
    setNoticeDismissed(true);
    app?.callServerTool({ name: "_setup-dismiss-welcome", arguments: {} }).catch(() => {});
  }, [app]);

  const renderedGraph = useMemo(() => {
    if (!data || !viewState) {
      return null;
    }

    return buildRenderedServiceMapGraph({
      nodes: data.graph.nodes,
      edges: data.graph.edges,
      filters: viewState.filters,
      orientation: viewState.orientation,
      baseOrientation: data.view_state.orientation,
      focusServiceName: viewState.serviceName,
      highlightedServiceNames: viewState.highlightedServiceNames,
    });
  }, [
    data?.graph.edges,
    data?.graph.nodes,
    data?.view_state.orientation,
    viewState?.filters,
    viewState?.highlightedServiceNames,
    viewState?.orientation,
    viewState?.serviceName,
  ]);

  const visibleServiceCount = useMemo(
    () => (renderedGraph ? getVisibleServiceCount(renderedGraph.nodes) : 0),
    [renderedGraph]
  );
  const visibleEdgeCount = useMemo(
    () => (renderedGraph ? getVisibleEdgeCount(renderedGraph.edges) : 0),
    [renderedGraph]
  );
  const visibleGroupedNodeCount = useMemo(
    () => (renderedGraph ? getVisibleGroupedNodeCount(renderedGraph.nodes) : 0),
    [renderedGraph]
  );
  const filterOptionCounts = useMemo(
    () => (data ? computeServiceMapFilterOptionCounts(data.graph.nodes) : null),
    [data]
  );
  const totalServiceCount = useMemo(
    () => (data ? data.graph.nodes.filter((node) => node.data.isService === true).length : 0),
    [data]
  );

  const searchableNodes = useMemo(
    () => (renderedGraph ? getVisibleSearchableNodes(renderedGraph.nodes) : []),
    [renderedGraph]
  );
  const serviceNodeIdByName = useMemo(() => {
    if (!renderedGraph) {
      return new Map<string, string>();
    }

    return new Map(
      renderedGraph.nodes
        .filter((node) => !node.hidden && node.data.isService === true)
        .map((node) => [String(node.data.label ?? node.id), node.id] as const)
    );
  }, [renderedGraph]);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return searchableNodes.filter((node) => {
      const label = String(node.data.label ?? "").toLowerCase();
      return label.includes(query) || node.id.toLowerCase().includes(query);
    });
  }, [searchQuery, searchableNodes]);

  const fullMapUrl = useMemo(
    () => buildCurrentFullMapUrl(data?.graph.full_map_url, viewState),
    [data?.graph.full_map_url, viewState]
  );

  const selectedNodeForDetails = useMemo(() => {
    if (selectedNode) {
      return selectedNode;
    }

    const selectedElement = viewState?.selectedElement;
    if (!renderedGraph || selectedElement?.kind !== "node") {
      return undefined;
    }

    return renderedGraph.nodes.find((node) => node.id === selectedElement.nodeId && !node.hidden);
  }, [renderedGraph, selectedNode, viewState?.selectedElement]);

  const selectedEdgeForDetails = useMemo(() => {
    if (selectedEdge) {
      return selectedEdge;
    }

    const selectedElement = viewState?.selectedElement;
    if (!renderedGraph || selectedElement?.kind !== "edge") {
      return undefined;
    }

    return renderedGraph.edges.find((edge) => edge.id === selectedElement.edgeId && !edge.hidden);
  }, [renderedGraph, selectedEdge, viewState?.selectedElement]);

  useEffect(() => {
    if (!app || !viewState) {
      return;
    }
    const currentApp = app;

    if (!selectedNodeForDetails && !selectedEdgeForDetails) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;

    async function loadDetails() {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const result = selectedNodeForDetails
          ? await currentApp.callServerTool({
              name: "_apm-service-map-node-details",
              arguments: {
                node_id: selectedNodeForDetails.id,
                node_label: selectedNodeForDetails.data.label,
                is_service: selectedNodeForDetails.data.isService,
                is_grouped: selectedNodeForDetails.data.isGrouped === true,
                grouped_connections: selectedNodeForDetails.data.groupedConnections ?? [],
                view_state: viewState,
              },
            })
          : await currentApp.callServerTool({
              name: "_apm-service-map-edge-details",
              arguments: {
                edge_id: selectedEdgeForDetails?.id,
                source_service_name: selectedEdgeForDetails?.data?.sourceLabel,
                target_service_name: selectedEdgeForDetails?.data?.targetLabel,
                resources: selectedEdgeForDetails?.data?.resources ?? [],
                is_grouped: selectedEdgeForDetails?.data?.isGrouped === true,
                view_state: viewState,
              },
            });

        if (cancelled) {
          return;
        }

        const parsed = parseToolResult<DetailData>(result);
        setDetail(parsed ?? null);
      } catch (err) {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [
    app,
    selectedEdgeForDetails,
    selectedNodeForDetails,
    viewState?.environment,
    viewState?.kuery,
    viewState?.rangeFrom,
    viewState?.rangeTo,
    viewState?.serviceGroupId,
    viewState?.serviceName,
  ]);

  const handleSelectionChange = useCallback((selection?: PortableServiceMapSelectedElement) => {
    setViewState((current) =>
      clearableViewStateUpdate(current, {
        selectedElement: selection,
      })
    );
  }, []);

  const handleViewportChange = useCallback((viewport?: PortableServiceMapViewport) => {
    setViewState((current) =>
      clearableViewStateUpdate(current, {
        viewport,
      })
    );
  }, []);

  const clearGraphSelection = useCallback(() => {
    setSelectedNode(undefined);
    setSelectedEdge(undefined);
    setDetail(null);
    setDetailError(null);
    setFocusRequest(undefined);
    setViewState((current) =>
      clearableViewStateUpdate(current, {
        selectedElement: undefined,
      })
    );
  }, []);

  const restoreBaseInvestigationContext = useCallback(() => {
    setActiveInvestigationObjectId(undefined);
    setViewState((current) => {
      if (!current || !data) {
        return current;
      }

      return clearableViewStateUpdate(current, {
        serviceName: data.view_state.serviceName,
        highlightedServiceNames: data.view_state.highlightedServiceNames,
      });
    });
  }, [data]);

  const focusGraphNode = useCallback(
    (nodeId: string, options?: { toggleSelection?: boolean }) => {
      const currentSelection = viewState?.selectedElement;
      if (
        options?.toggleSelection !== false &&
        currentSelection?.kind === "node" &&
        currentSelection.nodeId === nodeId
      ) {
        clearGraphSelection();
        return;
      }

      const targetNode = renderedGraph?.nodes.find((node) => node.id === nodeId && !node.hidden);
      if (targetNode) {
        setSelectedNode(targetNode);
        setSelectedEdge(undefined);
        setDetail(null);
        setDetailError(null);
      }

      focusNonceRef.current += 1;
      setFocusRequest({
        nodeId,
        nonce: focusNonceRef.current,
      });
      setViewState((current) =>
        clearableViewStateUpdate(current, {
          selectedElement: {
            kind: "node",
            nodeId,
          },
        })
      );
    },
    [clearGraphSelection, renderedGraph?.nodes, viewState?.selectedElement]
  );

  const focusGraphEdge = useCallback(
    (selectedElement: PortableServiceMapSelectedElement) => {
      if (selectedElement.kind !== "edge") {
        return;
      }

      const targetEdge = renderedGraph?.edges.find((edge) => {
        if (selectedElement.edgeId && edge.id === selectedElement.edgeId && !edge.hidden) {
          return true;
        }

        return Boolean(
          selectedElement.source &&
            selectedElement.target &&
            edge.source === selectedElement.source &&
            edge.target === selectedElement.target &&
            !edge.hidden
        );
      });

      if (targetEdge) {
        setSelectedEdge(targetEdge);
        setSelectedNode(undefined);
        setDetail(null);
        setDetailError(null);
        focusNonceRef.current += 1;
        setFocusRequest({
          nodeId: targetEdge.source,
          nonce: focusNonceRef.current,
        });
      } else {
        clearGraphSelection();
        return;
      }

      setViewState((current) =>
        clearableViewStateUpdate(current, {
          selectedElement,
        })
      );
    },
    [clearGraphSelection, renderedGraph?.edges]
  );

  const focusRcaCandidate = useCallback(
    (candidate: RcaCandidate) => {
      if (!viewState) {
        return;
      }

      const activeId = `rca:${candidate.id}`;
      setActiveInvestigationObjectId(activeId);
      setViewState((current) => {
        if (!current) {
          return current;
        }

        return clearableViewStateUpdate(current, {
          serviceName: candidate.focusServiceName || current.serviceName,
          highlightedServiceNames: [
            ...new Set([
              ...candidate.highlightedServiceNames,
              ...(candidate.focusServiceName ? [candidate.focusServiceName] : []),
            ]),
          ],
          selectedElement: candidate.selectedElement,
        });
      });

      if (candidate.selectedElement.kind === "node") {
        focusGraphNode(candidate.selectedElement.nodeId, { toggleSelection: false });
        return;
      }

      focusGraphEdge(candidate.selectedElement);
    },
    [
      activeInvestigationObjectId,
      focusGraphEdge,
      focusGraphNode,
      viewState,
    ]
  );

  const focusInvestigationObject = useCallback(
    (item: InvestigationObject) => {
      if (!viewState) {
        return;
      }

      if (activeInvestigationObjectId === item.id) {
        restoreBaseInvestigationContext();
        clearGraphSelection();
        return;
      }

      const focusServiceName =
        item.focusServiceName ||
        item.serviceName ||
        ((item.highlightedServiceNames?.length ?? 0) === 1
          ? item.highlightedServiceNames?.[0]
          : undefined);
      const highlightedServiceNames = [
        ...new Set([...(item.highlightedServiceNames ?? []), ...(focusServiceName ? [focusServiceName] : [])]),
      ];

      setActiveInvestigationObjectId(item.id);
      setViewState((current) => {
        if (!current) {
          return current;
        }

        return clearableViewStateUpdate(current, {
          serviceName: focusServiceName,
          highlightedServiceNames,
        });
      });

      if (!focusServiceName) {
        clearGraphSelection();
        return;
      }

      const targetNodeId = serviceNodeIdByName.get(focusServiceName);
      if (!targetNodeId) {
        clearGraphSelection();
        return;
      }

      focusGraphNode(targetNodeId, { toggleSelection: false });
    },
    [
      activeInvestigationObjectId,
      clearGraphSelection,
      focusGraphNode,
      restoreBaseInvestigationContext,
      serviceNodeIdByName,
      viewState,
    ]
  );

  useEffect(() => {
    setSearchIndex((current) =>
      searchResults.length === 0 ? 0 : Math.min(current, searchResults.length - 1)
    );
    if (searchResults.length === 0) {
      setSearchStarted(false);
    }
  }, [searchResults.length]);

  const focusSearchResult = useCallback((index: number) => {
    const node = searchResults[index];
    if (!node) {
      return;
    }

    setSearchStarted(true);
    setActiveInvestigationObjectId(undefined);
    focusGraphNode(node.id);
  }, [focusGraphNode, searchResults]);

  const goToNextSearchResult = useCallback(() => {
    if (searchResults.length === 0) {
      return;
    }

    const nextIndex = searchStarted ? (searchIndex + 1) % searchResults.length : searchIndex;
    setSearchIndex(nextIndex);
    focusSearchResult(nextIndex);
  }, [focusSearchResult, searchIndex, searchResults.length, searchStarted]);

  const goToPreviousSearchResult = useCallback(() => {
    if (searchResults.length === 0) {
      return;
    }

    const nextIndex = searchStarted
      ? (searchIndex - 1 + searchResults.length) % searchResults.length
      : (searchResults.length - 1 + searchResults.length) % searchResults.length;
    setSearchIndex(nextIndex);
    focusSearchResult(nextIndex);
  }, [focusSearchResult, searchIndex, searchResults.length, searchStarted]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== "k") {
        return;
      }

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const updateFilters = useCallback(
    (
      updater: (
        current: PortableServiceMapViewState["filters"]
      ) => PortableServiceMapViewState["filters"]
    ) => {
      setSelectedNode(undefined);
      setSelectedEdge(undefined);
      setDetail(null);
      setDetailError(null);
      setFocusRequest(undefined);
      setViewState((current) => {
        if (!current) {
          return current;
        }

        return clearableViewStateUpdate(current, {
          filters: updater(current.filters),
          viewport: undefined,
          selectedElement: undefined,
        });
      });
    },
    []
  );

  const toggleAlertFilter = useCallback((value: ServiceMapAlertStatus) => {
    updateFilters((current) => ({
      ...current,
      alertStatusFilter: toggleFilterValue(current.alertStatusFilter, value),
    }));
  }, [updateFilters]);

  const toggleSloFilter = useCallback((value: ServiceMapSloStatus) => {
    updateFilters((current) => ({
      ...current,
      sloStatusFilter: toggleFilterValue(current.sloStatusFilter, value),
    }));
  }, [updateFilters]);

  const toggleAnomalyFilter = useCallback((value: ServiceMapAnomalyStatus) => {
    updateFilters((current) => ({
      ...current,
      anomalyStatusFilter: toggleFilterValue(current.anomalyStatusFilter, value),
    }));
  }, [updateFilters]);

  const setOrientation = useCallback((orientation: ServiceMapOrientation) => {
    setViewState((current) => {
      if (!current) {
        return current;
      }

      return clearableViewStateUpdate(current, {
        orientation,
        viewport: undefined,
      });
    });
  }, []);

  const resetViewControls = useCallback(() => {
    setSearchQuery("");
    setSearchIndex(0);
    setSearchStarted(false);
    setFocusRequest(undefined);
    setActiveInvestigationObjectId(undefined);
    setSelectedNode(undefined);
    setSelectedEdge(undefined);
    setDetail(null);
    setDetailError(null);
    setViewState((current) => {
      if (!current || !data) {
        return current;
      }

      return clearableViewStateUpdate(current, {
        filters: DEFAULT_SERVICE_MAP_FILTERS,
        orientation: data.view_state.orientation,
        serviceName: data.view_state.serviceName,
        highlightedServiceNames: data.view_state.highlightedServiceNames,
        selectedElement: undefined,
        viewport: undefined,
      });
    });
  }, [data]);

  const headerStatus = useMemo(() => {
    if (!data || !renderedGraph) {
      return { tone: "neutral" as const, label: "waiting" };
    }

    if (visibleServiceCount > 0) {
      return {
        tone: "info" as const,
        label:
          visibleServiceCount === totalServiceCount
            ? `${visibleServiceCount} services`
            : `${visibleServiceCount}/${totalServiceCount} services`,
      };
    }

    return { tone: "neutral" as const, label: "no data" };
  }, [data, renderedGraph, totalServiceCount, visibleServiceCount]);

  const headerSubtitle =
    data?.rca_candidates?.[0]?.summary || data?.derived_scope?.explanation || data?.summary;
  const requestContext = data?.request_context;
  const pills = useMemo(() => {
    if (!requestContext || !viewState) {
      return [];
    }

    const values: React.ReactNode[] = [];
    if (requestContext.intent) {
      values.push(<QueryPill key="intent">intent: {requestContext.intent}</QueryPill>);
    }
    if (requestContext.service) {
      values.push(<QueryPill key="service">service: {requestContext.service}</QueryPill>);
    }
    if (requestContext.services?.length) {
      values.push(
        <QueryPill key="services">services: {requestContext.services.slice(0, 4).join(", ")}</QueryPill>
      );
    }
    if (requestContext.namespace) {
      values.push(<QueryPill key="namespace">namespace: {requestContext.namespace}</QueryPill>);
    }
    if (requestContext.environment && requestContext.environment !== "ENVIRONMENT_ALL") {
      values.push(
        <QueryPill key="environment">environment: {requestContext.environment}</QueryPill>
      );
    }
    if (requestContext.range_from && requestContext.range_to) {
      values.push(
        <QueryPill key="range">
          range: {requestContext.range_from} → {requestContext.range_to}
        </QueryPill>
      );
    }
    if (requestContext.kuery) {
      values.push(<QueryPill key="kuery">kuery: {requestContext.kuery}</QueryPill>);
    }
    if (viewState.orientation === "vertical") {
      values.push(<QueryPill key="orientation">layout: vertical</QueryPill>);
    }
    if (viewState.filters.alertStatusFilter.length) {
      values.push(
        <QueryPill key="alert-filter">
          alerts: {viewState.filters.alertStatusFilter.join(", ")}
        </QueryPill>
      );
    }
    if (viewState.filters.sloStatusFilter.length) {
      values.push(
        <QueryPill key="slo-filter">SLO: {viewState.filters.sloStatusFilter.join(", ")}</QueryPill>
      );
    }
    if (viewState.filters.anomalyStatusFilter.length) {
      values.push(
        <QueryPill key="anomaly-filter">
          anomaly: {viewState.filters.anomalyStatusFilter.join(", ")}
        </QueryPill>
      );
    }

    return values;
  }, [requestContext, viewState]);

  const hasControlChanges = useMemo(
    () =>
      data && viewState
        ? hasActiveViewControls({
            filters: viewState.filters,
            orientation: viewState.orientation,
            baseOrientation: data.view_state.orientation,
            searchQuery,
          })
        : false,
    [data, searchQuery, viewState]
  );

  const alertStatusesWithBreakdown = useMemo(() => {
    if (!data) {
      return new Set<ServiceMapAlertStatus>(["active"]);
    }

    const available = new Set<ServiceMapAlertStatus>(["active"]);
    for (const node of data.graph.nodes) {
      const alertsByStatus = node.data.alertsByStatus;
      if (!alertsByStatus) {
        continue;
      }

      for (const option of ALERT_STATUS_OPTIONS) {
        if (typeof alertsByStatus[option.value] === "number") {
          available.add(option.value);
        }
      }
    }
    return available;
  }, [data]);

  const visibleAlertOptions = useMemo(
    () =>
      ALERT_STATUS_OPTIONS.filter(
        (option) =>
          alertStatusesWithBreakdown.has(option.value) ||
          Boolean(viewState?.filters.alertStatusFilter.includes(option.value))
      ),
    [alertStatusesWithBreakdown, viewState]
  );

  const selectedNodeId =
    viewState?.selectedElement?.kind === "node" ? viewState.selectedElement.nodeId : undefined;

  const filterStripItems = useMemo(() => {
    if (!filterOptionCounts || !viewState) {
      return [];
    }

    const items: InvestigationStripItem[] = [];

    for (const option of visibleAlertOptions) {
      const count = filterOptionCounts.alerts[option.value];
      const selected = viewState.filters.alertStatusFilter.includes(option.value);
      if (count === 0 && !selected) {
        continue;
      }

      items.push({
        id: `alert-${option.value}`,
        kind: "filter",
        title: `${option.label} alerts`,
        subtitle: `${count} service${count === 1 ? "" : "s"}`,
        shortLabel: option.label.slice(0, 2).toUpperCase(),
        badge: count,
        tone: getAlertTone(option.value),
        selected,
        filterKind: "alert",
        filterValue: option.value,
        score: getTonePriority(getAlertTone(option.value)) * 100 + count,
      });
    }

    for (const option of SLO_STATUS_OPTIONS) {
      const count = filterOptionCounts.slo[option.value];
      const selected = viewState.filters.sloStatusFilter.includes(option.value);
      if (count === 0 && !selected) {
        continue;
      }

      items.push({
        id: `slo-${option.value}`,
        kind: "filter",
        title: `${option.label} SLO`,
        subtitle: `${count} service${count === 1 ? "" : "s"}`,
        shortLabel: `S${option.label.slice(0, 1).toUpperCase()}`,
        badge: count,
        tone: getSloTone(option.value),
        selected,
        filterKind: "slo",
        filterValue: option.value,
        score: getTonePriority(getSloTone(option.value)) * 100 + count,
      });
    }

    for (const option of ANOMALY_STATUS_OPTIONS) {
      const count = filterOptionCounts.anomaly[option.value];
      const selected = viewState.filters.anomalyStatusFilter.includes(option.value);
      if (count === 0 && !selected) {
        continue;
      }

      items.push({
        id: `anomaly-${option.value}`,
        kind: "filter",
        title: `${option.label} anomaly`,
        subtitle: `${count} service${count === 1 ? "" : "s"}`,
        shortLabel: `A${option.label.slice(0, 1).toUpperCase()}`,
        badge: count,
        tone: getAnomalyTone(option.value),
        selected,
        filterKind: "anomaly",
        filterValue: option.value,
        score: getTonePriority(getAnomalyTone(option.value)) * 100 + count,
      });
    }

    return items.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  }, [filterOptionCounts, viewState, visibleAlertOptions]);

  const rcaCandidateStripItems = useMemo<InvestigationStripItem[]>(() => {
    if (!data?.rca_candidates?.length) {
      return [];
    }

    return getDistinctRcaCandidates(data.rca_candidates)
      .slice(0, 3)
      .map((candidate) => ({
        id: `rca-${candidate.id}`,
        kind: "rca" as const,
        title: candidate.title,
        subtitle: candidate.subtitle,
        shortLabel: "Hyp",
        badge: undefined,
        tone: candidate.tone,
        selected:
          activeInvestigationObjectId === `rca:${candidate.id}` ||
          serviceMapSelectedElementsEqual(viewState?.selectedElement, candidate.selectedElement),
        rcaCandidate: candidate,
        score: candidate.score + 1000,
      }));
  }, [activeInvestigationObjectId, data?.rca_candidates, viewState?.selectedElement]);

  const investigationObjectStripItems = useMemo<InvestigationStripItem[]>(() => {
    if (!data?.investigation_objects?.length) {
      return [];
    }

    return data.investigation_objects.map((item) => ({
      id: `object-${item.id}`,
      kind: "object" as const,
      title: item.title,
      subtitle: item.subtitle,
      shortLabel: item.shortLabel,
      badge: item.badge,
      tone: item.tone,
      selected: activeInvestigationObjectId === item.id,
      investigationObject: item,
      score: item.score,
    }));
  }, [activeInvestigationObjectId, data?.investigation_objects]);

  const serviceStripItems = useMemo<InvestigationStripItem[]>(() => {
    if (!renderedGraph) {
      return [];
    }

    const items: InvestigationStripItem[] = renderedGraph.nodes
      .filter((node) => !node.hidden && node.data.isService === true)
      .map((node) => {
        const summary = getServiceAttentionSummary(node);
        return {
          id: `service-${node.id}`,
          kind: "service" as const,
          title: String(node.data.label ?? node.id),
          subtitle: summary.summary,
          shortLabel: getShortLabel(String(node.data.label ?? node.id), "SV"),
          badge: summary.badge,
          tone: summary.tone,
          selected: selectedNodeId === node.id,
          nodeId: node.id,
          score: summary.score,
        };
      })
      .filter((item) => item.score > 0 || item.selected);

    if (items.length === 0) {
      return renderedGraph.nodes
        .filter((node) => !node.hidden && node.data.isService === true)
        .slice(0, 6)
        .map<InvestigationStripItem>((node, index) => ({
          id: `service-${node.id}`,
          kind: "service" as const,
          title: String(node.data.label ?? node.id),
          subtitle: "Visible on the map",
          shortLabel: getShortLabel(String(node.data.label ?? node.id), "SV"),
          badge: undefined,
          tone: node.data.contextHighlight ? "info" : "neutral",
          selected: selectedNodeId === node.id,
          nodeId: node.id,
          score: node.data.contextHighlight ? 20 - index : 10 - index,
        }));
    }

    return items.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  }, [renderedGraph, selectedNodeId]);

  const resourceStripItems = useMemo<InvestigationStripItem[]>(() => {
    if (!renderedGraph) {
      return [];
    }

    return renderedGraph.nodes
      .filter((node) => !node.hidden && node.data.isGrouped === true)
      .map<InvestigationStripItem>((node) => {
        const count =
          typeof node.data.count === "number"
            ? node.data.count
            : node.data.groupedConnections?.length ?? undefined;

        return {
          id: `resource-${node.id}`,
          kind: "resource" as const,
          title: String(node.data.label ?? node.id),
          subtitle: count
            ? `${count} grouped resource${count === 1 ? "" : "s"}`
            : "Grouped resources",
          shortLabel: getShortLabel(String(node.data.label ?? node.id), "GR"),
          badge: count,
          tone: "warning" as const,
          selected: selectedNodeId === node.id,
          nodeId: node.id,
          score: 50 + (count ?? 0),
        };
      })
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  }, [renderedGraph, selectedNodeId]);

  const stripItems = useMemo<InvestigationStripItem[]>(
    () =>
      [
        ...rcaCandidateStripItems,
        ...investigationObjectStripItems,
        ...filterStripItems,
        ...serviceStripItems,
        ...resourceStripItems,
      ]
        .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title)),
    [
      filterStripItems,
      investigationObjectStripItems,
      rcaCandidateStripItems,
      resourceStripItems,
      serviceStripItems,
    ]
  );

  const searchSummaryLabel = searchResults.length
    ? `${searchIndex + 1}/${searchResults.length}`
    : "0/0";

  const header = (
    <TimeRangeHeader
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <AppGlyph />
          APM Service Map
        </span>
      }
      subtitle={headerSubtitle}
      status={headerStatus}
      rerunContext={data?.rerun_context}
      onSend={onSend}
    />
  );

  if (error) {
    return (
      <div className="ds-view">
        {header}
        <div className="apm-service-map-panel">
          <div className="apm-service-map-panel-body">
            <div className="apm-service-map-detail-empty">{error.message}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected || !data || !viewState || !renderedGraph || !filterOptionCounts) {
    return (
      <div className="ds-view">
        {header}
        <div className="apm-service-map-panel">
          <div className="apm-service-map-panel-body">
            <div className="apm-service-map-detail-empty">
              Waiting for APM service-map data. Call <code>apm-service-map</code> to render the
              topology.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-view">
      {header}

      {setupNotice && !noticeDismissed && (
        <SetupNoticeBanner
          notice={setupNotice}
          onDismiss={setupNotice.type === "welcome" ? dismissNotice : undefined}
          onOpenLink={(url) => openUrl(url)}
        />
      )}

      <div className="apm-service-map-toolbar">
        <div className="apm-service-map-toolbar-left">{pills}</div>
        <div className="apm-service-map-toolbar-right">
          {fullMapUrl && (
            <button
              type="button"
              className="apm-service-map-toolbar-btn"
              onClick={() => openUrl(fullMapUrl)}
            >
              Open in Kibana
            </button>
          )}
          {app && (
            <button
              type="button"
              className="apm-service-map-toolbar-btn"
              onClick={() => {
                void toggleFullscreen();
              }}
            >
              {isFullscreen ? <ExitFullscreenIcon size={14} /> : <FullscreenIcon size={14} />}
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </button>
          )}
        </div>
      </div>

      {data.derived_scope?.explanation && (
        <div className="apm-service-map-warning">
          <strong>Scope</strong>
          {data.derived_scope.explanation}
        </div>
      )}

      {data.warnings?.map((warning) => (
        <div key={warning} className="apm-service-map-warning">
          <strong>Note</strong>
          {warning}
        </div>
      ))}

      {data._query_errors?.map((queryError) => (
        <div key={queryError} className="apm-service-map-warning">
          <strong>Query error</strong>
          {queryError}
        </div>
      ))}

      <div className="apm-service-map-panel">
        <div className="apm-service-map-compact-bar">
          <div className="apm-service-map-search-dock">
            <SearchIcon size={14} />
            <input
              id="serviceMapSearchInput"
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              placeholder="Find services or dependencies (Cmd/Ctrl+K)"
              className="apm-service-map-search-input"
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchIndex(0);
                setSearchStarted(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "ArrowDown") {
                  event.preventDefault();
                  goToNextSearchResult();
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  goToPreviousSearchResult();
                }
              }}
            />
            {searchQuery.trim() && (
              <button
                type="button"
                className="apm-service-map-inline-icon-btn"
                aria-label="Clear search"
                title="Clear search"
                onClick={() => {
                  setSearchQuery("");
                  setSearchIndex(0);
                  setSearchStarted(false);
                  setFocusRequest(undefined);
                }}
              >
                <XIcon size={14} />
              </button>
            )}
            <div className="apm-service-map-search-actions">
              <span className="apm-service-map-search-counter">{searchSummaryLabel}</span>
              <button
                type="button"
                className="apm-service-map-search-btn"
                onClick={goToPreviousSearchResult}
                disabled={searchResults.length === 0}
              >
                Prev
              </button>
              <button
                type="button"
                className="apm-service-map-search-btn"
                onClick={goToNextSearchResult}
                disabled={searchResults.length === 0}
              >
                Next
              </button>
            </div>
          </div>

          <div className="apm-service-map-control-meta">
            <span>{visibleServiceCount} visible services</span>
            <span>{visibleEdgeCount} visible relationships</span>
            {visibleGroupedNodeCount > 0 && <span>{visibleGroupedNodeCount} grouped resources</span>}
          </div>

          {hasControlChanges && (
            <button
              type="button"
              className="apm-service-map-toolbar-btn"
              onClick={resetViewControls}
            >
              Reset controls
            </button>
          )}
        </div>

        {searchQuery.trim() && searchResults.length === 0 && (
          <div className="apm-service-map-inline-note">
            No visible services or dependencies match the current query.
          </div>
        )}

        <div className="apm-service-map-investigation-strip" aria-label="Investigation strip">
          {stripItems.length > 0 ? (
            stripItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`apm-service-map-strip-item ${getItemToneClassName(item.tone)}${
                  item.selected ? " is-selected" : ""
                }`}
                title={
                  item.rcaCandidate?.summary
                    ? `${item.title} — ${item.subtitle}\nHypothesis: ${item.rcaCandidate.summary}\nClick to focus the map on this suggested RCA.`
                    : item.investigationObject?.summary
                    ? `${item.title} — ${item.subtitle}\n${item.investigationObject.summary}`
                    : `${item.title} — ${item.subtitle}`
                }
                onClick={() => {
                  if (item.kind === "rca" && item.rcaCandidate) {
                    focusRcaCandidate(item.rcaCandidate);
                    return;
                  }

                  if (item.kind === "object" && item.investigationObject) {
                    focusInvestigationObject(item.investigationObject);
                    return;
                  }

                  if (item.kind === "service" || item.kind === "resource") {
                    setActiveInvestigationObjectId(undefined);
                    if (item.nodeId) {
                      focusGraphNode(item.nodeId);
                    }
                    return;
                  }

                  if (item.filterKind === "alert" && item.filterValue) {
                    setActiveInvestigationObjectId(undefined);
                    toggleAlertFilter(item.filterValue as ServiceMapAlertStatus);
                    return;
                  }

                  if (item.filterKind === "slo" && item.filterValue) {
                    setActiveInvestigationObjectId(undefined);
                    toggleSloFilter(item.filterValue as ServiceMapSloStatus);
                    return;
                  }

                  if (item.filterKind === "anomaly" && item.filterValue) {
                    setActiveInvestigationObjectId(undefined);
                    toggleAnomalyFilter(item.filterValue as ServiceMapAnomalyStatus);
                  }
                }}
              >
                <span className="apm-service-map-strip-orb">
                  <span className="apm-service-map-strip-orb-label">{item.shortLabel}</span>
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span className="apm-service-map-strip-orb-badge">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="apm-service-map-strip-item-title">{item.title}</span>
                <span className="apm-service-map-strip-item-subtitle">{item.subtitle}</span>
              </button>
            ))
          ) : (
            <div className="apm-service-map-strip-empty">
              Investigation objects appear here as alerts, SLOs, anomalies, and grouped resources
              show up on the map.
            </div>
          )}
        </div>

        <div className="apm-service-map-graph-shell">
          <div className="apm-service-map-map-overlay apm-service-map-map-overlay-right">
            {(["horizontal", "vertical"] as const).map((orientation) => (
              <button
                key={orientation}
                type="button"
                className={`apm-service-map-inline-icon-btn${
                  viewState.orientation === orientation ? " is-selected" : ""
                }`}
                aria-label={`Switch to ${orientation} layout`}
                title={`Switch to ${orientation} layout`}
                onClick={() => setOrientation(orientation)}
              >
                {orientation === "horizontal" ? "H" : "V"}
              </button>
            ))}
          </div>

          <EnhancedPortableServiceMap
            key={graphVersion}
            nodes={renderedGraph.nodes}
            edges={renderedGraph.edges}
            height={isFullscreen ? "calc(100vh - 300px)" : 620}
            initialViewport={viewState.viewport}
            initialSelectedElement={viewState.selectedElement}
            onSelectionChange={handleSelectionChange}
            onViewportChange={handleViewportChange}
            onNodeSelect={setSelectedNode}
            onEdgeSelect={setSelectedEdge}
            focusRequest={focusRequest}
          />
        </div>

        <div className="apm-service-map-panel-body apm-service-map-selection-shell">
          <SelectionTray
            detail={detail}
            detailError={detailError}
            detailLoading={detailLoading}
            openUrl={openUrl}
            selectedNode={selectedNodeForDetails}
            selectedEdge={selectedEdgeForDetails}
            graphSummary={{
              ...data.graph,
              service_count: visibleServiceCount,
              edge_count: visibleEdgeCount,
            }}
            onClearSelection={clearGraphSelection}
          />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <InvestigationActions actions={data.investigation_actions} onSend={onSend} />
      </div>
    </div>
  );
}
