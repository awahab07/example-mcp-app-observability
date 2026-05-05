/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Dagre from '@dagrejs/dagre';

const DEFAULT_EDGE_COLOR = '#98a2b3';
const DEFAULT_EDGE_STYLE = {
  stroke: DEFAULT_EDGE_COLOR,
  strokeWidth: 1,
} as const;
const DEFAULT_EDGE_MARKER = {
  type: 'arrowclosed',
  width: 12,
  height: 12,
  color: DEFAULT_EDGE_COLOR,
} as const;
const MINIMUM_GROUP_SIZE = 4;
const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const RANK_SEPARATION = 120;
const NODE_SEPARATION = 80;
const GRAPH_MARGIN = 50;
const NON_GROUPED_SPANS: Record<string, string[]> = {
  aws: ['servicename'],
  cache: ['all'],
  db: ['all'],
  external: ['graphql', 'grpc', 'websocket'],
  template: ['handlebars'],
};
const FORBIDDEN_SERVICE_NAMES = new Set(['constructor']);

type HandlePosition = 'left' | 'right' | 'top' | 'bottom';

interface RawDestinationService {
  agentName: string;
  serviceEnvironment?: string | null;
  serviceName: string;
}

export interface RawServiceMapResponse {
  tracesCount: number;
  spans: RawServiceMapSpan[];
  servicesData: RawServiceData[];
  anomalies?: {
    serviceAnomalies?: RawServiceAnomaly[];
  };
}

interface WrappedRawServiceMapResponse {
  data: RawServiceMapResponse;
}

interface RawServiceMapSpan extends RawDestinationService {
  spanId: string;
  spanDestinationServiceResource: string;
  spanType: string;
  spanSubtype: string;
  destinationService?: RawDestinationService;
}

interface RawServiceData {
  'service.name': string;
  'agent.name': string;
  'service.environment': string | null;
}

interface RawServiceAnomaly {
  serviceName: string;
  healthStatus?: string;
}

interface ServiceConnectionNode extends Record<string, unknown> {
  id: string;
  serviceName: string;
  agentName: string;
  serviceEnvironment: string | null;
  label?: string;
  serviceAnomalyStats?: {
    healthStatus?: string;
  };
}

interface ExternalConnectionNode extends Record<string, unknown> {
  id: string;
  spanDestinationServiceResource: string;
  spanType: string;
  spanSubtype: string;
  label?: string;
}

type ConnectionNode = ServiceConnectionNode | ExternalConnectionNode;

interface Connection {
  source: ConnectionNode;
  destination: ConnectionNode;
}

interface ExitSpanDestination {
  from: ExternalConnectionNode;
  to: ServiceConnectionNode;
}

interface ConnectionEdge {
  id: string;
  source: string;
  target: string;
  bidirectional?: boolean;
  isInverseEdge?: boolean;
  resources?: string[];
  sourceData?: ConnectionNode;
  targetData?: ConnectionNode;
  sourceLabel?: string;
  targetLabel?: string;
}

interface GroupInfo {
  id: string;
  sources: string[];
  targets: string[];
}

export interface PortableGraphNode {
  id: string;
  type: 'service' | 'dependency' | 'groupedResources';
  position: {
    x: number;
    y: number;
  };
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
    alertsByStatus?: Record<string, number>;
    sloStatus?: string;
    sloCount?: number;
    serviceAnomalyStats?: {
      healthStatus?: string;
    };
  };
  hidden?: boolean;
  selected?: boolean;
  sourcePosition?: HandlePosition;
  targetPosition?: HandlePosition;
}

export interface PortableGraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'default';
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
    sourceData?: ConnectionNode;
    targetData?: ConnectionNode;
  };
}

export interface PortableGraphResponse {
  nodes: PortableGraphNode[];
  edges: PortableGraphEdge[];
  nodesCount: number;
  tracesCount: number;
}

export interface ServiceMapBadgeResponse {
  alerts: Array<{
    serviceName: string;
    alertsCount: number;
  }>;
  slos: Array<{
    serviceName: string;
    sloStatus: string;
    sloCount: number;
  }>;
}

export interface PortableGraphViewStateInput {
  serviceName?: string;
  highlightedServiceNames: string[];
  orientation: 'horizontal' | 'vertical';
  filters: {
    alertStatusFilter: string[];
    sloStatusFilter: string[];
    anomalyStatusFilter: string[];
  };
}

function isWrappedRawServiceMapResponse(
  value: RawServiceMapResponse | WrappedRawServiceMapResponse
): value is WrappedRawServiceMapResponse {
  return 'data' in value;
}

function unwrapRawServiceMapResponse(
  value: RawServiceMapResponse | WrappedRawServiceMapResponse
): RawServiceMapResponse {
  return isWrappedRawServiceMapResponse(value) ? value.data : value;
}

function getServiceConnectionNode(event: RawDestinationService): ServiceConnectionNode {
  return {
    id: event.serviceName,
    serviceName: event.serviceName,
    agentName: event.agentName,
    serviceEnvironment: event.serviceEnvironment ?? null,
  };
}

function getExternalConnectionNode(event: RawServiceMapSpan): ExternalConnectionNode {
  return {
    id: `>${event.serviceName}|${event.spanDestinationServiceResource}`,
    spanDestinationServiceResource: event.spanDestinationServiceResource,
    spanType: event.spanType,
    spanSubtype: event.spanSubtype,
  };
}

function isExitSpanNode(node: ConnectionNode): node is ExternalConnectionNode {
  return 'spanDestinationServiceResource' in node;
}

function isServiceConnectionNode(node: ConnectionNode): node is ServiceConnectionNode {
  return 'serviceName' in node;
}

function getEdgeId(sourceId: string, targetId: string): string {
  return `${sourceId}~${targetId}`;
}

function getExitSpanNodeId(node: ExternalConnectionNode): string {
  return `>${node.spanDestinationServiceResource}`;
}

function toDisplayName(id: string): string {
  return id.startsWith('>') ? id.slice(1) : id;
}

function getPaths(spans: RawServiceMapSpan[]): {
  connections: Connection[];
  exitSpanDestinations: ExitSpanDestination[];
} {
  const exitSpanDestinations: ExitSpanDestination[] = [];
  const seenConnections = new Set<string>();
  const connections: Connection[] = [];

  for (const span of spans) {
    const serviceNode = getServiceConnectionNode(span);
    const exitSpanNode = getExternalConnectionNode(span);
    const connectionId = getEdgeId(serviceNode.id, exitSpanNode.id);

    if (!seenConnections.has(connectionId)) {
      seenConnections.add(connectionId);
      connections.push({
        source: serviceNode,
        destination: exitSpanNode,
      });
    }

    if (span.destinationService) {
      exitSpanDestinations.push({
        from: exitSpanNode,
        to: getServiceConnectionNode(span.destinationService),
      });
    }
  }

  return {
    connections,
    exitSpanDestinations,
  };
}

function addMessagingConnections(
  connections: Connection[],
  exitSpanDestinations: ExitSpanDestination[]
): Connection[] {
  const servicesByResource = new Map<string, ServiceConnectionNode[]>();

  for (const { from, to } of exitSpanDestinations) {
    const resource = from.spanDestinationServiceResource;
    const services = servicesByResource.get(resource) ?? [];
    services.push(to);
    servicesByResource.set(resource, services);
  }

  const messagingConnections: Connection[] = [];
  for (const connection of connections) {
    const destination = connection.destination;
    if (!isExitSpanNode(destination) || destination.spanType !== 'messaging') {
      continue;
    }

    const matchedServices = servicesByResource.get(destination.spanDestinationServiceResource) ?? [];
    for (const service of matchedServices) {
      messagingConnections.push({
        source: destination,
        destination: service,
      });
    }
  }

  return [...connections, ...messagingConnections];
}

function getAllNodes(
  services: RawServiceData[],
  connections: Connection[]
): Map<string, ConnectionNode> {
  const allNodes = new Map<string, ConnectionNode>();

  for (const connection of connections) {
    if (!allNodes.has(connection.source.id)) {
      allNodes.set(connection.source.id, connection.source);
    }
    if (!allNodes.has(connection.destination.id)) {
      allNodes.set(connection.destination.id, connection.destination);
    }
  }

  for (const service of services) {
    const serviceName = service['service.name'];
    if (!serviceName || FORBIDDEN_SERVICE_NAMES.has(serviceName) || allNodes.has(serviceName)) {
      continue;
    }

    allNodes.set(serviceName, {
      id: serviceName,
      serviceName,
      agentName: service['agent.name'],
      serviceEnvironment: service['service.environment'],
    });
  }

  return allNodes;
}

function getAllServices(
  allNodes: Map<string, ConnectionNode>,
  exitSpanDestinations: ExitSpanDestination[],
  anomalies: RawServiceAnomaly[]
): Map<string, ServiceConnectionNode> {
  const anomaliesByService = new Map<string, RawServiceAnomaly>(
    anomalies.map((anomaly) => [anomaly.serviceName, anomaly] as const)
  );
  const services = new Map<string, ServiceConnectionNode>();

  for (const { from, to } of exitSpanDestinations) {
    if (allNodes.has(from.id) && !allNodes.has(to.id)) {
      services.set(to.id, {
        ...to,
        serviceAnomalyStats: {
          healthStatus: anomaliesByService.get(to.id)?.healthStatus,
        },
      });
    }
  }

  for (const node of allNodes.values()) {
    if (!isServiceConnectionNode(node)) {
      continue;
    }

    services.set(node.id, {
      ...node,
      serviceAnomalyStats: {
        healthStatus: anomaliesByService.get(node.id)?.healthStatus,
      },
    });
  }

  return services;
}

function getExitSpans(allNodes: Map<string, ConnectionNode>): Map<string, ExternalConnectionNode[]> {
  const exitSpans = new Map<string, ExternalConnectionNode[]>();

  for (const node of allNodes.values()) {
    if (!isExitSpanNode(node)) {
      continue;
    }

    const existing = exitSpans.get(node.id) ?? [];
    existing.push(node);
    exitSpans.set(node.id, existing);
  }

  return exitSpans;
}

function exitSpanDestinationsToMap(
  exitSpanDestinations: ExitSpanDestination[]
): Map<string, ServiceConnectionNode> {
  return exitSpanDestinations.reduce((map, destination) => {
    map.set(destination.from.id, destination.to);
    return map;
  }, new Map<string, ServiceConnectionNode>());
}

function mapNodes(args: {
  allConnections: Connection[];
  nodes: Map<string, ConnectionNode>;
  exitSpanDestinations: ExitSpanDestination[];
  services: Map<string, ServiceConnectionNode>;
}): Map<string, ConnectionNode> {
  const { allConnections, nodes, exitSpanDestinations, services } = args;
  const mappedNodes = new Map<string, ConnectionNode>();
  const exitSpanDestinationMap = exitSpanDestinationsToMap(exitSpanDestinations);
  const exitSpans = getExitSpans(nodes);
  const messagingSpanIds = new Set(
    allConnections
      .map((connection) => connection.source)
      .filter((node): node is ExternalConnectionNode => isExitSpanNode(node))
      .map((node) => node.id)
  );

  for (const [id, node] of nodes.entries()) {
    if (mappedNodes.has(id)) {
      continue;
    }

    const destinationService = messagingSpanIds.has(node.id)
      ? undefined
      : exitSpanDestinationMap.get(node.id);
    const shouldMapToService = Boolean(destinationService) || !isExitSpanNode(node);

    if (shouldMapToService) {
      const serviceId = destinationService ? destinationService.id : node.id;
      const serviceNode = services.get(serviceId);
      if (serviceNode) {
        mappedNodes.set(id, serviceNode);
      }
      continue;
    }

    const exitSpanNodes = exitSpans.get(id) ?? [];
    if (exitSpanNodes.length === 0) {
      continue;
    }

    const sortedSpanTypes = exitSpanNodes.map((span) => span.spanType).sort();
    const sortedSpanSubtypes = exitSpanNodes.map((span) => span.spanSubtype).sort();
    const sample = exitSpanNodes[0];
    if (!sample) {
      continue;
    }

    mappedNodes.set(id, {
      ...sample,
      id: getExitSpanNodeId(sample),
      label: sample.spanDestinationServiceResource,
      spanType: sortedSpanTypes[0] ?? sample.spanType,
      spanSubtype: sortedSpanSubtypes[0] ?? sample.spanSubtype,
    });
  }

  return mappedNodes;
}

function getConnectionNodeLabel(node: ConnectionNode): string {
  if (isExitSpanNode(node)) {
    return node.spanDestinationServiceResource || node.label || toDisplayName(node.id);
  }

  return node.serviceName || node.label || toDisplayName(node.id);
}

function mapEdges(args: {
  allConnections: Connection[];
  nodes: Map<string, ConnectionNode>;
}): ConnectionEdge[] {
  const connections = new Map<string, ConnectionEdge>();
  const resourcesByEdge = new Map<string, Set<string>>();

  for (const connection of args.allConnections) {
    const sourceData = args.nodes.get(connection.source.id);
    const targetData = args.nodes.get(connection.destination.id);
    if (!sourceData || !targetData || sourceData.id === targetData.id) {
      continue;
    }

    const edgeId = getEdgeId(sourceData.id, targetData.id);
    const resource = isExitSpanNode(targetData)
      ? targetData.spanDestinationServiceResource
      : undefined;
    const existing = connections.get(edgeId);

    if (existing) {
      const resourceSet = resourcesByEdge.get(edgeId);
      if (resource && resourceSet && !resourceSet.has(resource)) {
        resourceSet.add(resource);
        existing.resources?.push(resource);
      }
      continue;
    }

    const sourceLabel = getConnectionNodeLabel(sourceData);
    const targetLabel = getConnectionNodeLabel(targetData);
    resourcesByEdge.set(edgeId, new Set(resource ? [resource] : []));
    connections.set(edgeId, {
      id: edgeId,
      source: sourceData.id,
      target: targetData.id,
      sourceData,
      targetData,
      sourceLabel,
      targetLabel,
      resources: resource ? [resource] : [],
    });
  }

  return [...connections.values()];
}

function markBidirectionalConnections(connections: ConnectionEdge[]): ConnectionEdge[] {
  const targets = new Map<string, ConnectionEdge>();

  for (const connection of connections) {
    const edgeId = getEdgeId(connection.source, connection.target);
    const reverseEdgeId = getEdgeId(connection.target, connection.source);
    const reverseEdge = targets.get(reverseEdgeId);

    if (reverseEdge) {
      reverseEdge.bidirectional = true;
      connection.isInverseEdge = true;
    }

    targets.set(edgeId, connection);
  }

  return [...targets.values()];
}

function toGraphNode(node: ConnectionNode): PortableGraphNode {
  if (isServiceConnectionNode(node)) {
    return {
      id: node.id,
      type: 'service',
      position: { x: 0, y: 0 },
      data: {
        id: node.id,
        label: node.serviceName,
        isService: true,
        agentName: node.agentName,
        serviceAnomalyStats: node.serviceAnomalyStats,
      },
    };
  }

  return {
    id: node.id,
    type: 'dependency',
    position: { x: 0, y: 0 },
    data: {
      id: node.id,
      label: node.spanDestinationServiceResource || node.label || toDisplayName(node.id),
      isService: false,
      spanType: node.spanType,
      spanSubtype: node.spanSubtype,
    },
  };
}

function toGraphEdge(edge: ConnectionEdge): PortableGraphEdge {
  const isBidirectional = edge.bidirectional ?? false;

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'default',
    style: DEFAULT_EDGE_STYLE,
    markerEnd: DEFAULT_EDGE_MARKER,
    ...(isBidirectional ? { markerStart: DEFAULT_EDGE_MARKER } : {}),
    data: {
      isBidirectional,
      sourceData: edge.sourceData,
      targetData: edge.targetData,
      sourceLabel: edge.sourceLabel,
      targetLabel: edge.targetLabel,
      resources: edge.resources,
    },
  };
}

function isDependencyGraphNode(node: PortableGraphNode): boolean {
  return node.data.isService === false && node.data.isGrouped !== true;
}

function isSpanGroupingSupported(spanType?: string, spanSubtype?: string): boolean {
  if (!spanType || !(spanType in NON_GROUPED_SPANS)) {
    return true;
  }

  return !NON_GROUPED_SPANS[spanType]!.some(
    (blockedSubtype) => blockedSubtype === 'all' || blockedSubtype === spanSubtype
  );
}

function isGroupableNode(node: PortableGraphNode): boolean {
  return (
    isDependencyGraphNode(node) &&
    isSpanGroupingSupported(node.data.spanType, node.data.spanSubtype)
  );
}

function findGroups(nodes: PortableGraphNode[], edges: PortableGraphEdge[]): GroupInfo[] {
  const groupableNodeIds = new Set(nodes.filter(isGroupableNode).map((node) => node.id));
  const sourcesByTarget = new Map<string, string[]>();

  for (const edge of edges) {
    if (!groupableNodeIds.has(edge.target)) {
      continue;
    }

    const sources = sourcesByTarget.get(edge.target) ?? [];
    sources.push(edge.source);
    sourcesByTarget.set(edge.target, sources);
  }

  const groups = new Map<string, GroupInfo>();
  for (const [target, sources] of sourcesByTarget) {
    const groupId = `resourceGroup{${[...sources].sort().join(';')}}`;
    const existing = groups.get(groupId) ?? {
      id: groupId,
      sources,
      targets: [],
    };
    existing.targets.push(target);
    groups.set(groupId, existing);
  }

  return [...groups.values()].filter((group) => group.targets.length >= MINIMUM_GROUP_SIZE);
}

function createGroupedNode(
  group: GroupInfo,
  nodesById: Map<string, PortableGraphNode>
): PortableGraphNode {
  const groupedConnections: NonNullable<PortableGraphNode['data']['groupedConnections']> = [];

  for (const targetId of group.targets) {
    const targetNode = nodesById.get(targetId);
    if (!targetNode || !isDependencyGraphNode(targetNode)) {
      continue;
    }

    groupedConnections.push({
      id: targetNode.data.id,
      label: targetNode.data.label,
      spanType: targetNode.data.spanType,
      spanSubtype: targetNode.data.spanSubtype,
    });
  }

  const firstTarget = nodesById.get(group.targets[0] ?? '');
  return {
    id: group.id,
    type: 'groupedResources',
    position: { x: 0, y: 0 },
    data: {
      id: group.id,
      label: `${group.targets.length} resources`,
      isService: false,
      isGrouped: true,
      count: group.targets.length,
      spanType: firstTarget?.data.spanType,
      spanSubtype: firstTarget?.data.spanSubtype,
      groupedConnections,
    },
  };
}

function createIncomingGroupedEdges(group: GroupInfo): PortableGraphEdge[] {
  return group.sources.map((source) => ({
    id: `${source}~>${group.id}`,
    source,
    target: group.id,
    type: 'default',
    style: DEFAULT_EDGE_STYLE,
    markerEnd: DEFAULT_EDGE_MARKER,
    data: {
      isBidirectional: false,
      isGrouped: true,
    },
  }));
}

function createOutgoingGroupedEdges(
  groups: GroupInfo[],
  edges: PortableGraphEdge[],
  groupedNodeIds: Set<string>
): PortableGraphEdge[] {
  const nodeToGroup = new Map<string, string>();
  const createdEdges = new Set<string>();
  const outgoingEdges: PortableGraphEdge[] = [];

  for (const group of groups) {
    for (const target of group.targets) {
      nodeToGroup.set(target, group.id);
    }
  }

  for (const edge of edges) {
    const groupId = nodeToGroup.get(edge.source);
    if (!groupId || groupedNodeIds.has(edge.target)) {
      continue;
    }

    const edgeId = `${groupId}~>${edge.target}`;
    if (createdEdges.has(edgeId)) {
      continue;
    }

    createdEdges.add(edgeId);
    outgoingEdges.push({
      id: edgeId,
      source: groupId,
      target: edge.target,
      type: 'default',
      style: DEFAULT_EDGE_STYLE,
      markerEnd: DEFAULT_EDGE_MARKER,
      data: {
        isBidirectional: false,
        isGrouped: true,
      },
    });
  }

  return outgoingEdges;
}

function groupResourceNodes(
  nodes: PortableGraphNode[],
  edges: PortableGraphEdge[]
): PortableGraphResponse {
  const groups = findGroups(nodes, edges);
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const groupedNodeIds = new Set<string>();
  const groupedEdgeIds = new Set<string>();

  for (const group of groups) {
    for (const target of group.targets) {
      groupedNodeIds.add(target);
      for (const source of group.sources) {
        groupedEdgeIds.add(getEdgeId(source, target));
      }
    }
  }

  const ungroupedNodes = nodes.filter((node) => !groupedNodeIds.has(node.id));
  const ungroupedEdges = edges.filter(
    (edge) =>
      !groupedEdgeIds.has(getEdgeId(edge.source, edge.target)) && !groupedNodeIds.has(edge.source)
  );
  const groupedNodes = groups.map((group) => createGroupedNode(group, nodesById));
  const incomingGroupedEdges = groups.flatMap((group) => createIncomingGroupedEdges(group));
  const outgoingGroupedEdges = createOutgoingGroupedEdges(groups, edges, groupedNodeIds);

  return {
    nodes: [...ungroupedNodes, ...groupedNodes],
    edges: [...ungroupedEdges, ...incomingGroupedEdges, ...outgoingGroupedEdges],
    nodesCount: ungroupedNodes.length,
    tracesCount: 0,
  };
}

function getNormalizedSloStatus(value: string | undefined): string {
  if (!value || value === 'noSLOs') {
    return 'noData';
  }

  return value;
}

function getAlertCountForStatus(node: PortableGraphNode, status: string): number {
  const fromBreakdown = node.data.alertsByStatus?.[status];
  if (typeof fromBreakdown === 'number') {
    return fromBreakdown;
  }

  if (status === 'active' && typeof node.data.alertsCount === 'number') {
    return node.data.alertsCount;
  }

  return 0;
}

function serviceMatchesFilters(
  node: PortableGraphNode,
  filters: PortableGraphViewStateInput['filters']
): boolean {
  if (!node.data.isService) {
    return false;
  }

  if (filters.alertStatusFilter.length > 0) {
    const matchesAlert = filters.alertStatusFilter.some(
      (status) => getAlertCountForStatus(node, status) > 0
    );
    if (!matchesAlert) {
      return false;
    }
  }

  if (filters.sloStatusFilter.length > 0) {
    const sloStatus = getNormalizedSloStatus(node.data.sloStatus);
    if (!filters.sloStatusFilter.includes(sloStatus)) {
      return false;
    }
  }

  if (filters.anomalyStatusFilter.length > 0) {
    const healthStatus = node.data.serviceAnomalyStats?.healthStatus ?? 'unknown';
    if (!filters.anomalyStatusFilter.includes(healthStatus)) {
      return false;
    }
  }

  return true;
}

function applyServiceMapVisibility(
  nodes: PortableGraphNode[],
  edges: PortableGraphEdge[],
  filters: PortableGraphViewStateInput['filters']
): {
  nodes: PortableGraphNode[];
  edges: PortableGraphEdge[];
} {
  const visibleIds = new Set<string>();
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  for (const node of nodes) {
    if (serviceMatchesFilters(node, filters)) {
      visibleIds.add(node.id);
    }
  }

  const adjacency = new Map<string, string[]>();
  const link = (left: string, right: string) => {
    const neighbors = adjacency.get(left) ?? [];
    neighbors.push(right);
    adjacency.set(left, neighbors);
  };

  for (const edge of edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const queue = [...visibleIds];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (!id) {
      continue;
    }

    for (const neighborId of adjacency.get(id) ?? []) {
      if (visibleIds.has(neighborId)) {
        continue;
      }

      const neighbor = nodeById.get(neighborId);
      if (!neighbor || neighbor.data.isService) {
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

function getHandlePositions(orientation: 'horizontal' | 'vertical'): {
  sourcePosition: HandlePosition;
  targetPosition: HandlePosition;
} {
  return orientation === 'vertical'
    ? { sourcePosition: 'bottom', targetPosition: 'top' }
    : { sourcePosition: 'right', targetPosition: 'left' };
}

function applyDagreLayout(
  nodes: PortableGraphNode[],
  edges: PortableGraphEdge[],
  orientation: 'horizontal' | 'vertical'
): PortableGraphNode[] {
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

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  Dagre.layout(graph);
  const handles = getHandlePositions(orientation);

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

function applyServiceMapRelayoutForFilteredView(
  nodes: PortableGraphNode[],
  edges: PortableGraphEdge[],
  viewState: PortableGraphViewStateInput
): {
  nodes: PortableGraphNode[];
  edges: PortableGraphEdge[];
} {
  const visibilityResult = applyServiceMapVisibility(nodes, edges, viewState.filters);
  const hasHiddenNodes = visibilityResult.nodes.some((node) => node.hidden);

  if (!hasHiddenNodes) {
    return visibilityResult;
  }

  const visibleNodes = visibilityResult.nodes.filter((node) => !node.hidden);
  const visibleEdges = visibilityResult.edges.filter((edge) => !edge.hidden);
  if (visibleNodes.length === 0) {
    return visibilityResult;
  }

  const laidOutVisibleNodes = applyDagreLayout(
    visibleNodes,
    visibleEdges,
    viewState.orientation
  );
  const visibleById = new Map(laidOutVisibleNodes.map((node) => [node.id, node] as const));

  return {
    nodes: visibilityResult.nodes.map((node) => visibleById.get(node.id) ?? node),
    edges: visibilityResult.edges,
  };
}

export function buildPortableGraphFromRawResponse(
  response: RawServiceMapResponse | WrappedRawServiceMapResponse
): PortableGraphResponse {
  const rawResponse = unwrapRawServiceMapResponse(response);
  const { connections, exitSpanDestinations } = getPaths(rawResponse.spans);
  const allConnections = addMessagingConnections(connections, exitSpanDestinations);
  const allNodes = getAllNodes(rawResponse.servicesData, allConnections);
  const services = getAllServices(
    allNodes,
    exitSpanDestinations,
    rawResponse.anomalies?.serviceAnomalies ?? []
  );
  const mappedNodes = mapNodes({
    allConnections,
    nodes: allNodes,
    exitSpanDestinations,
    services,
  });
  const mappedEdges = markBidirectionalConnections(
    mapEdges({
      allConnections,
      nodes: mappedNodes,
    }).sort((left, right) => left.id.localeCompare(right.id))
  );

  const uniqueNodes = new Map<string, ConnectionNode>();
  for (const edge of mappedEdges) {
    if (edge.sourceData && !uniqueNodes.has(edge.sourceData.id)) {
      uniqueNodes.set(edge.sourceData.id, edge.sourceData);
    }
    if (edge.targetData && !uniqueNodes.has(edge.targetData.id)) {
      uniqueNodes.set(edge.targetData.id, edge.targetData);
    }
  }
  for (const service of services.values()) {
    if (!uniqueNodes.has(service.id)) {
      uniqueNodes.set(service.id, service);
    }
  }

  const reactFlowNodes = [...uniqueNodes.values()].map((node) => toGraphNode(node));
  const reactFlowEdges = mappedEdges
    .filter((edge) => !edge.isInverseEdge)
    .map((edge) => toGraphEdge(edge));
  const groupedGraph = groupResourceNodes(reactFlowNodes, reactFlowEdges);

  return {
    nodes: groupedGraph.nodes,
    edges: groupedGraph.edges,
    nodesCount: groupedGraph.nodesCount,
    tracesCount: rawResponse.tracesCount,
  };
}

export function getServiceNamesFromGraph(nodes: PortableGraphNode[]): string[] {
  return nodes
    .filter((node) => node.data.isService)
    .map((node) => node.data.label)
    .filter((serviceName, index, values) => values.indexOf(serviceName) === index);
}

export function mergePortableGraphWithBadges(
  nodes: PortableGraphNode[],
  badges: ServiceMapBadgeResponse
): PortableGraphNode[] {
  const alertsByService = new Map(
    badges.alerts.map((alert) => [alert.serviceName, alert.alertsCount] as const)
  );
  const slosByService = new Map(
    badges.slos.map((slo) => [slo.serviceName, slo] as const)
  );

  return nodes.map((node) => {
    if (!node.data.isService) {
      return node;
    }

    const serviceName = node.data.label;
    const alertsCount = alertsByService.get(serviceName);
    const slo = slosByService.get(serviceName);

    return {
      ...node,
      data: {
        ...node.data,
        ...(alertsCount !== undefined ? { alertsCount } : {}),
        ...(slo ? { sloStatus: slo.sloStatus, sloCount: slo.sloCount } : {}),
      },
    };
  });
}

export function applyPortableGraphState(args: {
  nodes: PortableGraphNode[];
  edges: PortableGraphEdge[];
  viewState: PortableGraphViewStateInput;
}): {
  nodes: PortableGraphNode[];
  edges: PortableGraphEdge[];
} {
  const highlightedNodes = args.nodes.map((node) => {
    if (!node.data.isService) {
      return node;
    }

    const contextHighlight =
      args.viewState.highlightedServiceNames.includes(node.data.label) ||
      args.viewState.serviceName === node.data.label;

    return {
      ...node,
      data: {
        ...node.data,
        contextHighlight,
      },
    };
  });
  const laidOutNodes = applyDagreLayout(
    highlightedNodes,
    args.edges,
    args.viewState.orientation
  );

  return applyServiceMapRelayoutForFilteredView(laidOutNodes, args.edges, args.viewState);
}
