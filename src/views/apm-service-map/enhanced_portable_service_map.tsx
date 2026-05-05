/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type EdgeProps,
  type EdgeTypes,
  type FitViewOptions,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  findServiceMapSelection,
  getServiceMapSelectedElement,
  isServiceMapGroupedNode,
  isServiceMapServiceNode,
  serviceMapSelectedElementsEqual,
  serviceMapViewportsEqual,
  toServiceMapViewport,
  type PortableServiceMapSelectedElement,
  type PortableServiceMapViewport,
  type ServiceMapEdge,
  type ServiceMapNode,
} from './local_portable_types';

const DEFAULT_HEIGHT = 520;
const DEFAULT_FIT_VIEW_OPTIONS: FitViewOptions<ServiceMapNode> = {
  padding: 0.18,
  duration: 0,
};

const CENTER_ZOOM = 1.2;
const CENTER_DURATION_MS = 200;
const CENTER_NODE_WIDTH = 72;
const CENTER_NODE_HEIGHT = 72;

const PORTABLE_SERVICE_MAP_STYLES = `
  .portableServiceMap {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 32%),
      linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(10, 14, 20, 0.98));
  }

  .portableServiceMap .react-flow__renderer,
  .portableServiceMap .react-flow__pane,
  .portableServiceMap .react-flow__viewport {
    cursor: grab;
  }

  .portableServiceMap .react-flow__renderer.dragging,
  .portableServiceMap .react-flow__renderer.dragging .react-flow__pane {
    cursor: grabbing;
  }

  .portableServiceMap .react-flow__controls {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
  }

  .portableServiceMap .react-flow__controls-button {
    width: 32px;
    height: 32px;
    border: none;
    color: #e5edf9;
    background: rgba(15, 23, 42, 0.92);
  }

  .portableServiceMap .react-flow__controls-button:hover {
    background: rgba(30, 41, 59, 0.98);
  }

  .portableServiceMap .react-flow__controls-button svg {
    fill: currentColor;
  }

  .portableServiceMap .react-flow__minimap {
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
  }

  .portableServiceMap .react-flow__attribution {
    display: none;
  }
`;

const HIDDEN_HANDLE_STYLE: CSSProperties = {
  width: 1,
  height: 1,
  opacity: 0,
  border: 0,
  background: 'transparent',
};

function getHealthColor(healthStatus?: string): string {
  switch (healthStatus) {
    case 'critical':
      return '#ef4444';
    case 'warning':
    case 'major':
      return '#f59e0b';
    case 'healthy':
    case 'ok':
      return '#22c55e';
    default:
      return '#475569';
  }
}

function getServiceNodeBorderColor(node: ServiceMapNode, selected: boolean): string {
  if (selected) {
    return '#60a5fa';
  }

  if (node.data.contextHighlight) {
    return '#38bdf8';
  }

  return getHealthColor(node.data.serviceAnomalyStats?.healthStatus);
}

function getDependencyGlyph(node: ServiceMapNode): string {
  const subtype = node.data.spanSubtype?.trim();
  const type = node.data.spanType?.trim();
  const source = subtype || type || node.data.label;
  return source.slice(0, 2).toUpperCase();
}

function getServiceGlyph(node: ServiceMapNode): string {
  const source = node.data.agentName?.trim() || node.data.label;
  return source.slice(0, 2).toUpperCase();
}

function cloneEdgeMarkerWithColor(
  marker: ServiceMapEdge['markerEnd'] | ServiceMapEdge['markerStart'],
  color: string
): ServiceMapEdge['markerEnd'] | ServiceMapEdge['markerStart'] {
  if (!marker || typeof marker === 'string') {
    return marker;
  }

  return {
    ...marker,
    type: marker.type ?? MarkerType.ArrowClosed,
    color,
  };
}

const ServiceNode = memo(
  ({ data, selected, sourcePosition, targetPosition }: NodeProps<ServiceMapNode>) => {
    const borderColor = getServiceNodeBorderColor(
      {
        id: data.id,
        type: 'service',
        position: { x: 0, y: 0 },
        data,
      },
      selected
    );

    const circleStyle: CSSProperties = {
      position: 'relative',
      width: 72,
      height: 72,
      borderRadius: '999px',
      border: `3px solid ${borderColor}`,
      background: data.contextHighlight ? 'rgba(59, 130, 246, 0.18)' : 'rgba(15, 23, 42, 0.92)',
      boxShadow: selected
        ? '0 0 0 6px rgba(96, 165, 250, 0.14), 0 16px 36px rgba(0, 0, 0, 0.28)'
        : '0 12px 30px rgba(0, 0, 0, 0.22)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#f8fafc',
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: 0.8,
      userSelect: 'none',
    };

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          minWidth: 140,
          pointerEvents: 'all',
        }}
      >
        <Handle
          type="target"
          position={targetPosition ?? Position.Left}
          style={HIDDEN_HANDLE_STYLE}
        />
        <div style={circleStyle} title={data.label} aria-label={data.label}>
          <span>
            {getServiceGlyph({ id: data.id, type: 'service', position: { x: 0, y: 0 }, data })}
          </span>
          {typeof data.alertsCount === 'number' && data.alertsCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                minWidth: 22,
                height: 22,
                padding: '0 6px',
                borderRadius: 999,
                background: '#ef4444',
                border: '2px solid rgba(15, 23, 42, 0.95)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {data.alertsCount > 99 ? '99+' : data.alertsCount}
            </span>
          )}
        </div>
        <Handle
          type="source"
          position={sourcePosition ?? Position.Right}
          style={HIDDEN_HANDLE_STYLE}
        />
        <div
          style={{
            maxWidth: 160,
            textAlign: 'center',
            color: '#e2e8f0',
            fontSize: 13,
            fontWeight: selected ? 700 : 600,
            lineHeight: 1.25,
            wordBreak: 'break-word',
          }}
        >
          {data.label}
        </div>
        {(data.agentName || data.sloStatus) && (
          <div
            style={{
              display: 'inline-flex',
              gap: 6,
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: 180,
            }}
          >
            {data.agentName && (
              <span
                style={{
                  fontSize: 10,
                  lineHeight: 1,
                  color: '#cbd5e1',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 999,
                  padding: '4px 7px',
                }}
              >
                {data.agentName}
              </span>
            )}
            {data.sloStatus && (
              <span
                style={{
                  fontSize: 10,
                  lineHeight: 1,
                  color: '#cbd5e1',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 999,
                  padding: '4px 7px',
                }}
              >
                SLO: {data.sloStatus}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

ServiceNode.displayName = 'EnhancedPortableServiceNode';

const DependencyNode = memo(
  ({ data, selected, sourcePosition, targetPosition }: NodeProps<ServiceMapNode>) => {
    const borderColor = selected ? '#60a5fa' : '#64748b';
    const badgeText = data.isGrouped
      ? String(data.count ?? data.groupedConnections?.length ?? 0)
      : undefined;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          minWidth: 140,
          pointerEvents: 'all',
        }}
      >
        <Handle
          type="target"
          position={targetPosition ?? Position.Left}
          style={HIDDEN_HANDLE_STYLE}
        />
        <div
          style={{
            position: 'relative',
            width: 72,
            height: 72,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              transform: 'rotate(45deg)',
              borderRadius: 10,
              border: `3px solid ${borderColor}`,
              background: 'rgba(15, 23, 42, 0.92)',
              boxShadow: selected
                ? '0 0 0 6px rgba(96, 165, 250, 0.14), 0 14px 30px rgba(0, 0, 0, 0.26)'
                : '0 12px 28px rgba(0, 0, 0, 0.2)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              color: '#f8fafc',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.8,
              userSelect: 'none',
            }}
          >
            {getDependencyGlyph({
              id: data.id,
              type: data.isGrouped ? 'groupedResources' : 'dependency',
              position: { x: 0, y: 0 },
              data,
            })}
          </span>
          {badgeText && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -2,
                minWidth: 22,
                height: 22,
                padding: '0 6px',
                borderRadius: 999,
                background: '#0f172a',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                color: '#e2e8f0',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {badgeText}
            </span>
          )}
        </div>
        <Handle
          type="source"
          position={sourcePosition ?? Position.Right}
          style={HIDDEN_HANDLE_STYLE}
        />
        <div
          style={{
            maxWidth: 160,
            textAlign: 'center',
            color: '#e2e8f0',
            fontSize: 13,
            fontWeight: selected ? 700 : 600,
            lineHeight: 1.25,
            wordBreak: 'break-word',
          }}
        >
          {data.label}
        </div>
      </div>
    );
  }
);

DependencyNode.displayName = 'EnhancedPortableDependencyNode';

const ServiceMapEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    markerStart,
  }: EdgeProps<ServiceMapEdge>) => {
    const [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    return (
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
    );
  }
);

ServiceMapEdge.displayName = 'EnhancedPortableServiceMapEdge';

const nodeTypes: NodeTypes = {
  service: ServiceNode,
  dependency: DependencyNode,
  groupedResources: DependencyNode,
};

const edgeTypes: EdgeTypes = {
  default: ServiceMapEdge,
};

function getSelectedNodeId(
  selectedElement?: PortableServiceMapSelectedElement
): string | undefined {
  return selectedElement?.kind === 'node' ? selectedElement.nodeId : undefined;
}

function getSelectedEdgeId(
  selectedElement?: PortableServiceMapSelectedElement
): string | undefined {
  return selectedElement?.kind === 'edge' ? selectedElement.edgeId : undefined;
}

function styleGraphForSelection(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[],
  selectedElement?: PortableServiceMapSelectedElement
): {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
} {
  const selectedNodeId = getSelectedNodeId(selectedElement);
  const selectedEdgeId = getSelectedEdgeId(selectedElement);

  const styledNodes = nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
  }));

  const hasSelection = Boolean(selectedElement);

  const styledEdges = edges.map((edge) => {
    const isSelectedEdge = selectedEdgeId ? edge.id === selectedEdgeId : false;
    const isConnectedToSelectedNode = selectedNodeId
      ? edge.source === selectedNodeId || edge.target === selectedNodeId
      : false;
    const isHighlighted = isSelectedEdge || isConnectedToSelectedNode;
    const baseStroke =
      typeof edge.style?.stroke === 'string' && edge.style.stroke ? edge.style.stroke : '#64748b';
    const baseStrokeWidth =
      typeof edge.style?.strokeWidth === 'number' ? edge.style.strokeWidth : 1.5;
    const stroke = isHighlighted ? '#60a5fa' : baseStroke;
    const opacity = hasSelection && !isHighlighted ? 0.38 : 1;

    return {
      ...edge,
      selected: isSelectedEdge,
      animated: isSelectedEdge,
      style: {
        ...edge.style,
        stroke,
        strokeWidth: isHighlighted ? Math.max(baseStrokeWidth + 1.5, 2.5) : baseStrokeWidth,
        opacity,
      },
      markerEnd: cloneEdgeMarkerWithColor(edge.markerEnd, stroke),
      markerStart: cloneEdgeMarkerWithColor(edge.markerStart, stroke),
    };
  });

  return {
    nodes: styledNodes,
    edges: styledEdges,
  };
}

export interface FocusNodeRequest {
  nodeId: string;
  nonce: number;
}

interface EnhancedPortableServiceMapInnerProps {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  height: number | string;
  initialViewport?: PortableServiceMapViewport;
  initialSelectedElement?: PortableServiceMapSelectedElement;
  onSelectionChange?: (selection?: PortableServiceMapSelectedElement) => void;
  onViewportChange?: (viewport?: PortableServiceMapViewport) => void;
  onNodeSelect?: (node?: ServiceMapNode) => void;
  onEdgeSelect?: (edge?: ServiceMapEdge) => void;
  showBackground?: boolean;
  showControls?: boolean;
  showMinimap?: boolean;
  minZoom?: number;
  maxZoom?: number;
  focusRequest?: FocusNodeRequest;
}

function EnhancedPortableServiceMapInner({
  nodes: inputNodes,
  edges: inputEdges,
  height,
  initialViewport,
  initialSelectedElement,
  onSelectionChange,
  onViewportChange,
  onNodeSelect,
  onEdgeSelect,
  showBackground = true,
  showControls = true,
  showMinimap = true,
  minZoom = 0.1,
  maxZoom = 3,
  focusRequest,
}: EnhancedPortableServiceMapInnerProps) {
  const { fitView, getViewport, setViewport, setCenter } = useReactFlow<ServiceMapNode, ServiceMapEdge>();
  const selectedElementRef = useRef<PortableServiceMapSelectedElement | undefined>(
    initialSelectedElement
  );
  const lastViewportRef = useRef<PortableServiceMapViewport | undefined>(undefined);
  const [selectedElement, setSelectedElement] = useState<
    PortableServiceMapSelectedElement | undefined
  >(initialSelectedElement);

  const styledGraph = useMemo(
    () => styleGraphForSelection(inputNodes, inputEdges, selectedElement),
    [inputNodes, inputEdges, selectedElement]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<ServiceMapNode>(styledGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ServiceMapEdge>(styledGraph.edges);

  useEffect(() => {
    setNodes(styledGraph.nodes);
    setEdges(styledGraph.edges);
  }, [setEdges, setNodes, styledGraph]);

  const publishSelection = useCallback(
    (nextSelection?: PortableServiceMapSelectedElement) => {
      selectedElementRef.current = nextSelection;
      setSelectedElement(nextSelection);
      onSelectionChange?.(nextSelection);

      const resolvedSelection = findServiceMapSelection(
        inputNodes,
        inputEdges,
        nextSelection
      );
      onNodeSelect?.(resolvedSelection.selectedNode);
      onEdgeSelect?.(resolvedSelection.selectedEdge);
    },
    [inputEdges, inputNodes, onEdgeSelect, onNodeSelect, onSelectionChange]
  );

  useEffect(() => {
    const resolvedInitialSelection = findServiceMapSelection(
      inputNodes,
      inputEdges,
      initialSelectedElement
    );
    const normalizedInitialSelection = getServiceMapSelectedElement(resolvedInitialSelection);

    if (
      !serviceMapSelectedElementsEqual(selectedElementRef.current, normalizedInitialSelection)
    ) {
      publishSelection(normalizedInitialSelection);
    }
  }, [initialSelectedElement, inputEdges, inputNodes, publishSelection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentViewport = toServiceMapViewport(getViewport());

      if (initialViewport) {
        if (
          serviceMapViewportsEqual(initialViewport, lastViewportRef.current) ||
          serviceMapViewportsEqual(initialViewport, currentViewport)
        ) {
          return;
        }

        void setViewport(initialViewport, { duration: 0 });
        lastViewportRef.current = initialViewport;
        onViewportChange?.(initialViewport);
        return;
      }

      if (inputNodes.length > 0) {
        void fitView(DEFAULT_FIT_VIEW_OPTIONS);
        const fittedViewport = toServiceMapViewport(getViewport());
        lastViewportRef.current = fittedViewport;
        onViewportChange?.(fittedViewport);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fitView, getViewport, initialViewport, inputEdges, inputNodes, onViewportChange, setViewport]);

  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    const targetNode = inputNodes.find((node) => node.id === focusRequest.nodeId && !node.hidden);
    if (!targetNode) {
      return;
    }

    const centerX = targetNode.position.x + CENTER_NODE_WIDTH / 2;
    const centerY = targetNode.position.y + CENTER_NODE_HEIGHT / 2;
    const nextZoom = Math.max(getViewport().zoom, CENTER_ZOOM);
    void setCenter(centerX, centerY, { zoom: nextZoom, duration: CENTER_DURATION_MS });

    const timer = window.setTimeout(() => {
      const viewport = toServiceMapViewport(getViewport());
      if (!serviceMapViewportsEqual(lastViewportRef.current, viewport)) {
        lastViewportRef.current = viewport;
        onViewportChange?.(viewport);
      }
    }, CENTER_DURATION_MS + 20);

    return () => window.clearTimeout(timer);
  }, [focusRequest, getViewport, inputNodes, onViewportChange, setCenter]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: ServiceMapNode) => {
      const nextSelection = serviceMapSelectedElementsEqual(selectedElementRef.current, {
        kind: 'node',
        nodeId: node.id,
      })
        ? undefined
        : {
            kind: 'node' as const,
            nodeId: node.id,
          };

      publishSelection(nextSelection);
    },
    [publishSelection]
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: ServiceMapEdge) => {
      const nextSelection = serviceMapSelectedElementsEqual(selectedElementRef.current, {
        kind: 'edge',
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
      })
        ? undefined
        : {
            kind: 'edge' as const,
            edgeId: edge.id,
            source: edge.source,
            target: edge.target,
          };

      publishSelection(nextSelection);
    },
    [publishSelection]
  );

  const handlePaneClick = useCallback(() => {
    publishSelection(undefined);
  }, [publishSelection]);

  const handleMoveEnd = useCallback(() => {
    const viewport = toServiceMapViewport(getViewport());

    if (!serviceMapViewportsEqual(lastViewportRef.current, viewport)) {
      lastViewportRef.current = viewport;
      onViewportChange?.(viewport);
    }
  }, [getViewport, onViewportChange]);

  const minimapNodeColor = useCallback((node: ServiceMapNode) => {
    if (isServiceMapServiceNode(node)) {
      const health = node.data.serviceAnomalyStats?.healthStatus;
      return health ? getHealthColor(health) : '#60a5fa';
    }

    if (isServiceMapGroupedNode(node)) {
      return '#94a3b8';
    }

    return '#64748b';
  }, []);

  return (
    <div style={{ width: '100%', height }}>
      <style>{PORTABLE_SERVICE_MAP_STYLES}</style>
      <div className="portableServiceMap">
        <ReactFlow<ServiceMapNode, ServiceMapEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          onMoveEnd={handleMoveEnd}
          fitView={false}
          minZoom={minZoom}
          maxZoom={maxZoom}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent' }}
        >
          {showBackground && <Background gap={28} size={1} color="rgba(148, 163, 184, 0.18)" />}
          {showControls && <Controls showInteractive={false} />}
          {showMinimap && (
            <MiniMap
              nodeColor={minimapNodeColor}
              nodeStrokeWidth={0}
              nodeBorderRadius={2}
              maskColor="rgba(15, 23, 42, 0.7)"
              bgColor="rgba(15, 23, 42, 0.95)"
              position="bottom-right"
              pannable
              zoomable
              ariaLabel="Service map minimap"
            />
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export interface EnhancedPortableServiceMapProps {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  height?: number | string;
  initialViewport?: PortableServiceMapViewport;
  initialSelectedElement?: PortableServiceMapSelectedElement;
  onSelectionChange?: (selection?: PortableServiceMapSelectedElement) => void;
  onViewportChange?: (viewport?: PortableServiceMapViewport) => void;
  onNodeSelect?: (node?: ServiceMapNode) => void;
  onEdgeSelect?: (edge?: ServiceMapEdge) => void;
  showBackground?: boolean;
  showControls?: boolean;
  showMinimap?: boolean;
  minZoom?: number;
  maxZoom?: number;
  focusRequest?: FocusNodeRequest;
}

export function EnhancedPortableServiceMap({
  nodes,
  edges,
  height = DEFAULT_HEIGHT,
  initialViewport,
  initialSelectedElement,
  onSelectionChange,
  onViewportChange,
  onNodeSelect,
  onEdgeSelect,
  showBackground,
  showControls,
  showMinimap,
  minZoom,
  maxZoom,
  focusRequest,
}: EnhancedPortableServiceMapProps) {
  return (
    <ReactFlowProvider>
      <EnhancedPortableServiceMapInner
        nodes={nodes}
        edges={edges}
        height={height}
        initialViewport={initialViewport}
        initialSelectedElement={initialSelectedElement}
        onSelectionChange={onSelectionChange}
        onViewportChange={onViewportChange}
        onNodeSelect={onNodeSelect}
        onEdgeSelect={onEdgeSelect}
        showBackground={showBackground}
        showControls={showControls}
        showMinimap={showMinimap}
        minZoom={minZoom}
        maxZoom={maxZoom}
        focusRequest={focusRequest}
      />
    </ReactFlowProvider>
  );
}
