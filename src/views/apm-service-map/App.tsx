/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PortableServiceMap } from "@kibana-apm-service-map";
import type {
  PortableServiceMapEdge,
  PortableServiceMapNode,
  PortableServiceMapSelectedElement,
  PortableServiceMapViewport,
} from "@kibana-apm-service-map-state";
import { useApp, type AppLike } from "@shared/use-app";
import { parseToolResult } from "@shared/parse-tool-result";
import { applyTheme } from "@shared/theme";
import {
  InvestigationActions,
  QueryPill,
  SetupNoticeBanner,
  TimeRangeHeader,
  type InvestigationAction,
  type SetupNotice,
} from "@shared/components";
import { AppGlyph, ExitFullscreenIcon, FullscreenIcon } from "@shared/icons";
import { useDisplayMode } from "@shared/use-display-mode";
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
    alertStatusFilter: string[];
    sloStatusFilter: string[];
    anomalyStatusFilter: string[];
  };
  orientation: "horizontal" | "vertical";
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
    nodes: PortableServiceMapNode[];
    edges: PortableServiceMapEdge[];
    nodesCount: number;
    tracesCount: number;
    service_count: number;
    edge_count: number;
    full_map_url?: string;
  };
  investigation_actions?: InvestigationAction[];
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
  url.searchParams.set("serviceMapState", serializeViewState(viewState));
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

function DetailPanel({
  detail,
  detailError,
  detailLoading,
  openUrl,
  selectedNode,
  selectedEdge,
  graphSummary,
}: {
  detail: DetailData | null;
  detailError: string | null;
  detailLoading: boolean;
  openUrl: (url?: string) => void;
  selectedNode?: PortableServiceMapNode;
  selectedEdge?: PortableServiceMapEdge;
  graphSummary: ToolData["graph"];
}) {
  if (detailLoading) {
    return <div className="apm-service-map-detail-empty">Loading service-map details…</div>;
  }

  if (detailError) {
    return <div className="apm-service-map-detail-empty">{detailError}</div>;
  }

  if (!detail) {
    return (
      <>
        <div className="apm-service-map-detail-title">Selection details</div>
        <div className="apm-service-map-detail-subtitle">
          {graphSummary.service_count} service{graphSummary.service_count === 1 ? "" : "s"} ·{" "}
          {graphSummary.edge_count} relationship{graphSummary.edge_count === 1 ? "" : "s"} ·{" "}
          {graphSummary.tracesCount} traces
        </div>
        <div className="apm-service-map-detail-empty">
          Select a node or edge in the map to inspect service or relationship metrics.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="apm-service-map-detail-title">{detail.title}</div>
      {detail.subtitle && <div className="apm-service-map-detail-subtitle">{detail.subtitle}</div>}
      {detail.message && <div className="apm-service-map-summary">{detail.message}</div>}

      {detail.grouped_connections?.length ? (
        <ul className="apm-service-map-group-list">
          {detail.grouped_connections.map((item) => (
            <li key={item.id} className="apm-service-map-group-item">
              {renderGroupedConnectionLabel(item)}
            </li>
          ))}
        </ul>
      ) : null}

      {detail.stats.length > 0 ? (
        <div className="apm-service-map-stat-list">
          {detail.stats.map((stat) => (
            <div key={stat.label} className="apm-service-map-stat-row">
              <span>{stat.label}</span>
              <span>{stat.value}</span>
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
        <div className="apm-service-map-detail-empty">
          No direct detail actions were returned for this selection.
        </div>
      ) : null}
    </>
  );
}

export function App() {
  const [app, setApp] = useState<AppLike | null>(null);
  const [data, setData] = useState<ToolData | null>(null);
  const [viewState, setViewState] = useState<PortableServiceMapViewState | null>(null);
  const [graphVersion, setGraphVersion] = useState(0);
  const [selectedNode, setSelectedNode] = useState<PortableServiceMapNode | undefined>();
  const [selectedEdge, setSelectedEdge] = useState<PortableServiceMapEdge | undefined>();
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const { isFullscreen, toggle: toggleFullscreen } = useDisplayMode(app);

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
          setData(parsed);
          setViewState(parsed.view_state);
          setSelectedNode(undefined);
          setSelectedEdge(undefined);
          setDetail(null);
          setDetailError(null);
          setNoticeDismissed(false);
          setGraphVersion((current) => current + 1);
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

  const fullMapUrl = useMemo(
    () => buildCurrentFullMapUrl(data?.graph.full_map_url, viewState),
    [data?.graph.full_map_url, viewState]
  );

  useEffect(() => {
    if (!app || !viewState) {
      return;
    }
    const currentApp = app;

    if (!selectedNode && !selectedEdge) {
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
        const result = selectedNode
          ? await currentApp.callServerTool({
              name: "_apm-service-map-node-details",
              arguments: {
                node_id: selectedNode.id,
                node_label: selectedNode.data.label,
                is_service: selectedNode.data.isService,
                is_grouped: selectedNode.data.isGrouped === true,
                grouped_connections: selectedNode.data.groupedConnections ?? [],
                view_state: viewState,
              },
            })
          : await currentApp.callServerTool({
              name: "_apm-service-map-edge-details",
              arguments: {
                edge_id: selectedEdge?.id,
                source_service_name: selectedEdge?.data?.sourceLabel,
                target_service_name: selectedEdge?.data?.targetLabel,
                resources: selectedEdge?.data?.resources ?? [],
                is_grouped: selectedEdge?.data?.isGrouped === true,
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
    selectedEdge,
    selectedNode,
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

  const headerStatus = useMemo(() => {
    if (!data) {
      return { tone: "neutral" as const, label: "waiting" };
    }

    if (data.graph.service_count > 0) {
      return { tone: "info" as const, label: `${data.graph.service_count} services` };
    }

    return { tone: "neutral" as const, label: "empty" };
  }, [data]);

  const headerSubtitle = data?.derived_scope?.explanation || data?.summary;
  const requestContext = data?.request_context;
  const pills = useMemo(() => {
    if (!requestContext) {
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

    return values;
  }, [requestContext]);

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

  if (!isConnected || !data || !viewState) {
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

      <div className="apm-service-map-layout">
        <div className="apm-service-map-panel">
          <div className="apm-service-map-graph-shell">
            <PortableServiceMap
              key={graphVersion}
              nodes={data.graph.nodes}
              edges={data.graph.edges}
              height={isFullscreen ? "calc(100vh - 260px)" : 560}
              initialViewport={viewState.viewport}
              initialSelectedElement={viewState.selectedElement}
              onSelectionChange={handleSelectionChange}
              onViewportChange={handleViewportChange}
              onNodeSelect={setSelectedNode}
              onEdgeSelect={setSelectedEdge}
            />
          </div>
        </div>

        <div className="apm-service-map-panel">
          <div className="apm-service-map-panel-body">
            <DetailPanel
              detail={detail}
              detailError={detailError}
              detailLoading={detailLoading}
              openUrl={openUrl}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              graphSummary={data.graph}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <InvestigationActions actions={data.investigation_actions} onSend={onSend} />
      </div>
    </div>
  );
}
