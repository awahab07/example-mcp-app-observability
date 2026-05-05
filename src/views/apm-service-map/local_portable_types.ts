/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Edge, Node, Viewport } from '@xyflow/react';
import type {
  PortableServiceMapEdgeData,
  PortableServiceMapNodeData,
  PortableServiceMapSelectedElement,
  PortableServiceMapViewport,
} from '@kibana-apm-service-map-state';

export type ServiceMapNode = Node<PortableServiceMapNodeData>;
export type ServiceMapEdge = Edge<PortableServiceMapEdgeData>;

export type {
  PortableServiceMapEdgeData,
  PortableServiceMapNodeData,
  PortableServiceMapSelectedElement,
  PortableServiceMapViewport,
};

export function isServiceMapServiceNode(
  node: ServiceMapNode
): node is Node<PortableServiceMapNodeData & { isService: true }> {
  return node.data.isService === true;
}

export function isServiceMapGroupedNode(
  node: ServiceMapNode
): node is Node<PortableServiceMapNodeData & { isService: false; isGrouped: true }> {
  return node.data.isService === false && node.data.isGrouped === true;
}

export function getServiceMapSelectedElement(args: {
  selectedNode?: ServiceMapNode;
  selectedEdge?: ServiceMapEdge;
}): PortableServiceMapSelectedElement | undefined {
  const { selectedNode, selectedEdge } = args;

  if (selectedNode) {
    return {
      kind: 'node',
      nodeId: selectedNode.id,
    };
  }

  if (selectedEdge) {
    return {
      kind: 'edge',
      edgeId: selectedEdge.id,
      source: selectedEdge.source,
      target: selectedEdge.target,
    };
  }

  return undefined;
}

export function findServiceMapSelection(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[],
  selectedElement?: PortableServiceMapSelectedElement
): {
  selectedNode?: ServiceMapNode;
  selectedEdge?: ServiceMapEdge;
} {
  if (!selectedElement) {
    return {};
  }

  if (selectedElement.kind === 'node') {
    const selectedNode = nodes.find((node) => node.id === selectedElement.nodeId);
    return selectedNode ? { selectedNode } : {};
  }

  const selectedEdge = edges.find((edge) => {
    if (selectedElement.edgeId && edge.id === selectedElement.edgeId) {
      return true;
    }

    return Boolean(
      selectedElement.source &&
        selectedElement.target &&
        edge.source === selectedElement.source &&
        edge.target === selectedElement.target
    );
  });

  return selectedEdge ? { selectedEdge } : {};
}

export function toServiceMapViewport(
  viewport?: Partial<Viewport> | null
): PortableServiceMapViewport | undefined {
  if (!viewport) {
    return undefined;
  }

  const { x, y, zoom } = viewport;
  if (
    typeof x !== 'number' ||
    Number.isNaN(x) ||
    typeof y !== 'number' ||
    Number.isNaN(y) ||
    typeof zoom !== 'number' ||
    Number.isNaN(zoom)
  ) {
    return undefined;
  }

  return {
    x,
    y,
    zoom,
  };
}

export function serviceMapViewportsEqual(
  left?: PortableServiceMapViewport,
  right?: PortableServiceMapViewport
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

export function serviceMapSelectedElementsEqual(
  left?: PortableServiceMapSelectedElement,
  right?: PortableServiceMapSelectedElement
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right || left.kind !== right.kind) {
    return false;
  }

  if (left.kind === 'node' && right.kind === 'node') {
    return left.nodeId === right.nodeId;
  }

  if (left.kind === 'edge' && right.kind === 'edge') {
    return (
      left.edgeId === right.edgeId && left.source === right.source && left.target === right.target
    );
  }

  return false;
}
