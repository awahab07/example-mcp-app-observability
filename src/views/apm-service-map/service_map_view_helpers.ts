/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Dagre from '@dagrejs/dagre';
import { Position } from '@xyflow/react';
import type {
  PortableServiceMapNodeData,
} from './local_portable_types';
import type { ServiceMapEdge, ServiceMapNode } from './local_portable_types';

export type ServiceMapAlertStatus = 'active' | 'recovered' | 'untracked' | 'delayed';
export type ServiceMapSloStatus = 'healthy' | 'degrading' | 'violated' | 'noData';
export type ServiceMapAnomalyStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type ServiceMapOrientation = 'horizontal' | 'vertical';

export interface ServiceMapFilters {
  alertStatusFilter: ServiceMapAlertStatus[];
  sloStatusFilter: ServiceMapSloStatus[];
  anomalyStatusFilter: ServiceMapAnomalyStatus[];
}

export interface ServiceMapFilterOptionCounts {
  alerts: Record<ServiceMapAlertStatus, number>;
  slo: Record<ServiceMapSloStatus, number>;
  anomaly: Record<ServiceMapAnomalyStatus, number>;
}

interface ServiceMapContextHighlightArgs {
  focusServiceName?: string;
  highlightedServiceNames?: string[];
}

export const DEFAULT_SERVICE_MAP_FILTERS: ServiceMapFilters = {
  alertStatusFilter: [],
  sloStatusFilter: [],
  anomalyStatusFilter: [],
};

export const ALERT_STATUS_OPTIONS: Array<{
  value: ServiceMapAlertStatus;
  label: string;
}> = [
  { value: 'active', label: 'Active' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'untracked', label: 'Untracked' },
  { value: 'delayed', label: 'Delayed' },
];

export const SLO_STATUS_OPTIONS: Array<{
  value: ServiceMapSloStatus;
  label: string;
}> = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'degrading', label: 'Degrading' },
  { value: 'violated', label: 'Violated' },
  { value: 'noData', label: 'No data' },
];

export const ANOMALY_STATUS_OPTIONS: Array<{
  value: ServiceMapAnomalyStatus;
  label: string;
}> = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
  { value: 'unknown', label: 'Unknown' },
];

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const RANK_SEPARATION = 120;
const NODE_SEPARATION = 80;
const GRAPH_MARGIN = 50;

function isServiceNodeData(data: PortableServiceMapNodeData): boolean {
  return data.isService === true;
}

function isDependencySearchableNode(node: ServiceMapNode): boolean {
  return node.type === 'dependency';
}

function getNormalizedSloStatusForMapFilters(data: PortableServiceMapNodeData): ServiceMapSloStatus {
  const raw = data.sloStatus;
  if (raw === undefined || raw === 'noSLOs') {
    return 'noData';
  }

  if (raw === 'healthy' || raw === 'degrading' || raw === 'violated' || raw === 'noData') {
    return raw;
  }

  return 'noData';
}

function getServiceNodeAlertCountForStatus(
  data: PortableServiceMapNodeData,
  status: ServiceMapAlertStatus
): number {
  const alertsByStatus = data.alertsByStatus;
  const fromBreakdown =
    alertsByStatus && typeof alertsByStatus[status] === 'number' ? alertsByStatus[status] : undefined;

  if (fromBreakdown !== undefined) {
    return fromBreakdown;
  }

  if (status === 'active' && typeof data.alertsCount === 'number') {
    return data.alertsCount;
  }

  return 0;
}

function serviceMatchesFilters(data: PortableServiceMapNodeData, filters: ServiceMapFilters): boolean {
  if (filters.alertStatusFilter.length > 0) {
    const matchesAny = filters.alertStatusFilter.some(
      (status) => getServiceNodeAlertCountForStatus(data, status) > 0
    );
    if (!matchesAny) {
      return false;
    }
  }

  if (filters.sloStatusFilter.length > 0) {
    const sloStatus = getNormalizedSloStatusForMapFilters(data);
    if (!filters.sloStatusFilter.includes(sloStatus)) {
      return false;
    }
  }

  if (filters.anomalyStatusFilter.length > 0) {
    const healthStatus = data.serviceAnomalyStats?.healthStatus ?? 'unknown';
    if (
      healthStatus !== 'healthy' &&
      healthStatus !== 'warning' &&
      healthStatus !== 'critical' &&
      healthStatus !== 'unknown'
    ) {
      return false;
    }
    if (!filters.anomalyStatusFilter.includes(healthStatus)) {
      return false;
    }
  }

  return true;
}

function clearHiddenState(nodes: ServiceMapNode[]): ServiceMapNode[] {
  return nodes.map((node) => ({ ...node, hidden: false }));
}

function clearHiddenEdges(edges: ServiceMapEdge[]): ServiceMapEdge[] {
  return edges.map((edge) => ({ ...edge, hidden: false }));
}

function applyContextHighlights(
  nodes: ServiceMapNode[],
  args: ServiceMapContextHighlightArgs
): ServiceMapNode[] {
  const highlightedServices = new Set(
    [args.focusServiceName, ...(args.highlightedServiceNames ?? [])]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  );

  if (highlightedServices.size === 0) {
    return nodes.map((node) =>
      node.data.isService
        ? {
            ...node,
            data: {
              ...node.data,
              contextHighlight: false,
            },
          }
        : node
    );
  }

  return nodes.map((node) => {
    if (!node.data.isService) {
      return node;
    }

    const serviceLabel = String(node.data.label ?? node.id);
    return {
      ...node,
      data: {
        ...node.data,
        contextHighlight: highlightedServices.has(serviceLabel) || highlightedServices.has(node.id),
      },
    };
  });
}

function handlePositionsForOrientation(orientation: ServiceMapOrientation): {
  sourcePosition: Position;
  targetPosition: Position;
} {
  return orientation === 'vertical'
    ? { sourcePosition: Position.Bottom, targetPosition: Position.Top }
    : { sourcePosition: Position.Right, targetPosition: Position.Left };
}

export function applyDagreLayout<T extends ServiceMapNode>(
  nodes: T[],
  edges: ServiceMapEdge[],
  orientation: ServiceMapOrientation
): T[] {
  if (nodes.length === 0) {
    return nodes;
  }

  const graph = new Dagre.graphlib.Graph({ directed: true, compound: false })
    .setGraph({
      rankdir: orientation === 'vertical' ? 'TB' : 'LR',
      ranksep: RANK_SEPARATION,
      nodesep: NODE_SEPARATION,
      marginx: GRAPH_MARGIN,
      marginy: GRAPH_MARGIN,
    })
    .setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  });

  Dagre.layout(graph);

  const handles = handlePositionsForOrientation(orientation);

  return nodes.map((node) => {
    const dagreNode = graph.node(node.id);
    if (!dagreNode) {
      return {
        ...node,
        ...handles,
      };
    }

    return {
      ...node,
      ...handles,
      position: {
        x: Math.round(dagreNode.x - NODE_WIDTH / 2),
        y: Math.round(dagreNode.y - NODE_HEIGHT / 2),
      },
    };
  });
}

export function applyServiceMapVisibility(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[],
  filters: ServiceMapFilters
): {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
} {
  const visibleIds = new Set<string>();
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  for (const node of nodes) {
    if (isServiceNodeData(node.data) && serviceMatchesFilters(node.data, filters)) {
      visibleIds.add(node.id);
    }
  }

  const adjacency = new Map<string, string[]>();
  const link = (left: string, right: string) => {
    let neighbors = adjacency.get(left);
    if (!neighbors) {
      neighbors = [];
      adjacency.set(left, neighbors);
    }
    neighbors.push(right);
  };

  for (const edge of edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const queue = [...visibleIds];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    for (const neighborId of adjacency.get(id) ?? []) {
      if (visibleIds.has(neighborId)) {
        continue;
      }

      const neighbor = nodeById.get(neighborId);
      if (!neighbor || isServiceNodeData(neighbor.data)) {
        continue;
      }

      visibleIds.add(neighborId);
      queue.push(neighborId);
    }
  }

  return {
    nodes: nodes.map((node) => ({
      ...node,
      hidden: !visibleIds.has(node.id),
    })),
    edges: edges.map((edge) => ({
      ...edge,
      hidden: !visibleIds.has(edge.source) || !visibleIds.has(edge.target),
    })),
  };
}

export function applyServiceMapRelayoutForFilteredView(
  nodesFromFullMapLayout: ServiceMapNode[],
  edges: ServiceMapEdge[],
  filters: ServiceMapFilters,
  orientation: ServiceMapOrientation
): {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
} {
  const visibilityResult = applyServiceMapVisibility(nodesFromFullMapLayout, edges, filters);
  const hasHiddenNodes = visibilityResult.nodes.some((node) => node.hidden);

  if (!hasHiddenNodes) {
    return visibilityResult;
  }

  const visibleNodesOnly = visibilityResult.nodes.filter((node) => !node.hidden);
  const visibleEdgesOnly = visibilityResult.edges.filter((edge) => !edge.hidden);

  if (visibleNodesOnly.length === 0) {
    return visibilityResult;
  }

  const subgraphNodes = applyDagreLayout(visibleNodesOnly, visibleEdgesOnly, orientation);
  const subgraphNodeById = new Map(subgraphNodes.map((node) => [node.id, node] as const));

  return {
    nodes: visibilityResult.nodes.map((node) => {
      if (node.hidden) {
        return node;
      }

      const updated = subgraphNodeById.get(node.id);
      return updated ? { ...node, ...updated } : node;
    }),
    edges: visibilityResult.edges,
  };
}

export function buildRenderedServiceMapGraph(args: {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  filters: ServiceMapFilters;
  orientation: ServiceMapOrientation;
  baseOrientation: ServiceMapOrientation;
  focusServiceName?: string;
  highlightedServiceNames?: string[];
}): {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
} {
  const baseNodes = applyContextHighlights(clearHiddenState(args.nodes), {
    focusServiceName: args.focusServiceName,
    highlightedServiceNames: args.highlightedServiceNames,
  });
  const baseEdges = clearHiddenEdges(args.edges);
  const orientedNodes =
    args.orientation === args.baseOrientation
      ? baseNodes
      : applyDagreLayout(baseNodes, baseEdges, args.orientation);

  return applyServiceMapRelayoutForFilteredView(
    orientedNodes,
    baseEdges,
    args.filters,
    args.orientation
  );
}

export function computeServiceMapFilterOptionCounts(
  nodes: ServiceMapNode[]
): ServiceMapFilterOptionCounts {
  const counts: ServiceMapFilterOptionCounts = {
    alerts: {
      active: 0,
      recovered: 0,
      untracked: 0,
      delayed: 0,
    },
    slo: {
      healthy: 0,
      degrading: 0,
      violated: 0,
      noData: 0,
    },
    anomaly: {
      healthy: 0,
      warning: 0,
      critical: 0,
      unknown: 0,
    },
  };

  for (const node of nodes) {
    if (!isServiceNodeData(node.data)) {
      continue;
    }

    for (const option of ALERT_STATUS_OPTIONS) {
      if (getServiceNodeAlertCountForStatus(node.data, option.value) > 0) {
        counts.alerts[option.value] += 1;
      }
    }

    counts.slo[getNormalizedSloStatusForMapFilters(node.data)] += 1;

    const anomalyStatus = node.data.serviceAnomalyStats?.healthStatus ?? 'unknown';
    if (
      anomalyStatus === 'healthy' ||
      anomalyStatus === 'warning' ||
      anomalyStatus === 'critical' ||
      anomalyStatus === 'unknown'
    ) {
      counts.anomaly[anomalyStatus] += 1;
    }
  }

  return counts;
}

export function getVisibleServiceCount(nodes: ServiceMapNode[]): number {
  return nodes.filter((node) => !node.hidden && isServiceNodeData(node.data)).length;
}

export function getVisibleEdgeCount(edges: ServiceMapEdge[]): number {
  return edges.filter((edge) => !edge.hidden).length;
}

export function getVisibleGroupedNodeCount(nodes: ServiceMapNode[]): number {
  return nodes.filter((node) => !node.hidden && node.data.isGrouped === true).length;
}

export function getVisibleSearchableNodes(nodes: ServiceMapNode[]): ServiceMapNode[] {
  return nodes.filter((node) => {
    if (node.hidden) {
      return false;
    }

    return isServiceNodeData(node.data) || isDependencySearchableNode(node);
  });
}

export function hasActiveViewControls(args: {
  filters: ServiceMapFilters;
  orientation: ServiceMapOrientation;
  baseOrientation: ServiceMapOrientation;
  searchQuery: string;
}): boolean {
  return Boolean(
    args.filters.alertStatusFilter.length ||
      args.filters.sloStatusFilter.length ||
      args.filters.anomalyStatusFilter.length ||
      args.orientation !== args.baseOrientation ||
      args.searchQuery.trim()
  );
}

export function toggleFilterValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
