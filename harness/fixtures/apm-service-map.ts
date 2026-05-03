/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type FixtureSet, fixture } from "./types";

const edgeStyle = { stroke: "#64748b", strokeWidth: 1.5 };
const edgeMarker = { type: "arrowclosed", width: 18, height: 18, color: "#64748b" };
const incidentEdgeStyle = { stroke: "#8E9FBC", strokeWidth: 1 };
const incidentEdgeMarker = { type: "arrowclosed", width: 12, height: 12, color: "#8E9FBC" };

const incidentBaseNodes = [
  {
    id: "frontend-web",
    type: "service",
    position: { x: 50, y: 210 },
    data: {
      id: "frontend-web",
      label: "frontend-web",
      isService: true,
      agentName: "rum-js",
    },
  },
  {
    id: "product-recommendation",
    type: "service",
    position: { x: 370, y: 210 },
    data: {
      id: "product-recommendation",
      label: "product-recommendation",
      isService: true,
      agentName: "go",
    },
  },
  {
    id: "inventory-service",
    type: "service",
    position: { x: 690, y: 130 },
    data: {
      id: "inventory-service",
      label: "inventory-service",
      isService: true,
      agentName: "nodejs",
    },
  },
  {
    id: ">elasticsearch",
    type: "dependency",
    position: { x: 1010, y: 50 },
    data: {
      id: ">elasticsearch",
      label: "elasticsearch",
      isService: false,
      spanType: "db",
      spanSubtype: "elasticsearch",
    },
  },
  {
    id: ">postgres",
    type: "dependency",
    position: { x: 1010, y: 210 },
    data: {
      id: ">postgres",
      label: "postgres",
      isService: false,
      spanType: "db",
      spanSubtype: "sql",
    },
  },
  {
    id: "user-preference-service",
    type: "service",
    position: { x: 690, y: 370 },
    data: {
      id: "user-preference-service",
      label: "user-preference-service",
      isService: true,
      agentName: "python",
    },
  },
  {
    id: ">redis",
    type: "dependency",
    position: { x: 1010, y: 370 },
    data: {
      id: ">redis",
      label: "redis",
      isService: false,
      spanType: "db",
      spanSubtype: "redis",
    },
  },
];

const incidentEdges = [
  {
    id: "frontend-web~product-recommendation",
    source: "frontend-web",
    target: "product-recommendation",
    type: "default",
    style: incidentEdgeStyle,
    markerEnd: incidentEdgeMarker,
    data: {
      sourceLabel: "frontend-web",
      targetLabel: "product-recommendation-service",
      resources: ["product-recommendation-service"],
    },
  },
  {
    id: "product-recommendation~inventory-service",
    source: "product-recommendation",
    target: "inventory-service",
    type: "default",
    style: incidentEdgeStyle,
    markerEnd: incidentEdgeMarker,
    data: {
      sourceLabel: "product-recommendation",
      targetLabel: "inventory-service",
      resources: ["inventory-service"],
    },
  },
  {
    id: "product-recommendation~user-preference-service",
    source: "product-recommendation",
    target: "user-preference-service",
    type: "default",
    style: incidentEdgeStyle,
    markerEnd: incidentEdgeMarker,
    data: {
      sourceLabel: "product-recommendation",
      targetLabel: "user-preference-service",
      resources: ["user-preference-service"],
    },
  },
  {
    id: "inventory-service~>elasticsearch",
    source: "inventory-service",
    target: ">elasticsearch",
    type: "default",
    style: incidentEdgeStyle,
    markerEnd: incidentEdgeMarker,
    data: {
      sourceLabel: "inventory-service",
      targetLabel: "elasticsearch",
      resources: ["elasticsearch"],
    },
  },
  {
    id: "inventory-service~>postgres",
    source: "inventory-service",
    target: ">postgres",
    type: "default",
    style: incidentEdgeStyle,
    markerEnd: incidentEdgeMarker,
    data: {
      sourceLabel: "inventory-service",
      targetLabel: "postgres",
      resources: ["postgres"],
    },
  },
  {
    id: "user-preference-service~>redis",
    source: "user-preference-service",
    target: ">redis",
    type: "default",
    style: incidentEdgeStyle,
    markerEnd: incidentEdgeMarker,
    data: {
      sourceLabel: "user-preference-service",
      targetLabel: "redis",
      resources: ["redis"],
    },
  },
];

function incidentNodes(highlightedServiceNames: string[]) {
  const highlighted = new Set(highlightedServiceNames);

  return incidentBaseNodes.map((node) =>
    node.data.isService
      ? {
          ...node,
          data: {
            ...node.data,
            contextHighlight: highlighted.has(node.id),
          },
        }
      : node
  );
}

export const apmServiceMapFixtures: FixtureSet = {
  focusedCheckout: fixture(
    "Focused checkout map",
    {
      summary: "Service map for checkout with 4 services and 4 relationships.",
      request_context: {
        intent: "service",
        service: "checkout",
        environment: "production",
        range_from: "now-1h",
        range_to: "now",
      },
      derived_scope: null,
      view_state: {
        version: "1",
        rangeFrom: "now-1h",
        rangeTo: "now",
        environment: "production",
        kuery: "",
        serviceName: "checkout",
        highlightedServiceNames: ["checkout"],
        filters: {
          alertStatusFilter: [],
          sloStatusFilter: [],
          anomalyStatusFilter: [],
        },
        orientation: "horizontal",
      },
      graph: {
        nodes: [
          {
            id: "frontend",
            type: "service",
            position: { x: 40, y: 160 },
            data: {
              id: "frontend",
              label: "frontend",
              isService: true,
              agentName: "nodejs",
              serviceAnomalyStats: { healthStatus: "healthy" },
            },
          },
          {
            id: "checkout",
            type: "service",
            position: { x: 290, y: 160 },
            data: {
              id: "checkout",
              label: "checkout",
              isService: true,
              agentName: "go",
              contextHighlight: true,
              serviceAnomalyStats: { healthStatus: "warning" },
            },
          },
          {
            id: "payments",
            type: "service",
            position: { x: 560, y: 40 },
            data: {
              id: "payments",
              label: "payments",
              isService: true,
              agentName: "java",
              alertsCount: 3,
              serviceAnomalyStats: { healthStatus: "warning" },
            },
          },
          {
            id: "inventory",
            type: "service",
            position: { x: 560, y: 290 },
            data: {
              id: "inventory",
              label: "inventory",
              isService: true,
              agentName: "python",
              serviceAnomalyStats: { healthStatus: "healthy" },
            },
          },
          {
            id: ">redis",
            type: "dependency",
            position: { x: 820, y: 160 },
            data: {
              id: ">redis",
              label: "redis",
              isService: false,
              spanType: "cache",
              spanSubtype: "redis",
            },
          },
        ],
        edges: [
          {
            id: "frontend~checkout",
            source: "frontend",
            target: "checkout",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "frontend",
              targetLabel: "checkout",
              resources: ["checkout"],
            },
          },
          {
            id: "checkout~payments",
            source: "checkout",
            target: "payments",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "checkout",
              targetLabel: "payments",
              resources: ["payments"],
            },
          },
          {
            id: "checkout~inventory",
            source: "checkout",
            target: "inventory",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "checkout",
              targetLabel: "inventory",
              resources: ["inventory"],
            },
          },
          {
            id: "checkout~redis",
            source: "checkout",
            target: ">redis",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "checkout",
              targetLabel: "redis",
              resources: ["redis"],
            },
          },
        ],
        nodesCount: 5,
        tracesCount: 12450,
        service_count: 4,
        edge_count: 4,
        full_map_url:
          "https://localhost:5601/app/apm#/services/checkout/service-map?rangeFrom=now-1h&rangeTo=now&environment=production",
      },
      investigation_actions: [
        {
          label: "Investigate checkout",
          prompt:
            'Use ml-anomalies with entity "checkout" and lookback "1h" to explain what changed around this service.',
        },
      ],
    },
    "Show me the service map for checkout."
  ),
  erroringScope: fixture(
    "Erroring services scope",
    {
      summary: "Service map with 5 services and 5 relationships.",
      request_context: {
        intent: "erroring",
        environment: "production",
        range_from: "now-2h",
        range_to: "now",
      },
      derived_scope: {
        kind: "erroring",
        services: ["checkout", "payments"],
        explanation:
          "Highlighting 2 services with recent errors. Highest error pressure: checkout.",
      },
      view_state: {
        version: "1",
        rangeFrom: "now-2h",
        rangeTo: "now",
        environment: "production",
        kuery: "",
        highlightedServiceNames: ["checkout", "payments"],
        filters: {
          alertStatusFilter: [],
          sloStatusFilter: [],
          anomalyStatusFilter: [],
        },
        orientation: "horizontal",
      },
      graph: {
        nodes: [
          {
            id: "frontend",
            type: "service",
            position: { x: 40, y: 160 },
            data: {
              id: "frontend",
              label: "frontend",
              isService: true,
              agentName: "nodejs",
              serviceAnomalyStats: { healthStatus: "healthy" },
            },
          },
          {
            id: "checkout",
            type: "service",
            position: { x: 290, y: 160 },
            data: {
              id: "checkout",
              label: "checkout",
              isService: true,
              agentName: "go",
              contextHighlight: true,
              alertsCount: 2,
              serviceAnomalyStats: { healthStatus: "warning" },
            },
          },
          {
            id: "payments",
            type: "service",
            position: { x: 560, y: 40 },
            data: {
              id: "payments",
              label: "payments",
              isService: true,
              agentName: "java",
              contextHighlight: true,
              alertsCount: 4,
              serviceAnomalyStats: { healthStatus: "critical" },
            },
          },
          {
            id: "shipping",
            type: "service",
            position: { x: 560, y: 290 },
            data: {
              id: "shipping",
              label: "shipping",
              isService: true,
              agentName: "rust",
              serviceAnomalyStats: { healthStatus: "warning" },
            },
          },
          {
            id: ">stripe",
            type: "dependency",
            position: { x: 820, y: 40 },
            data: {
              id: ">stripe",
              label: "stripe",
              isService: false,
              spanType: "external",
              spanSubtype: "https",
            },
          },
        ],
        edges: [
          {
            id: "frontend~checkout",
            source: "frontend",
            target: "checkout",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "frontend",
              targetLabel: "checkout",
              resources: ["checkout"],
            },
          },
          {
            id: "checkout~payments",
            source: "checkout",
            target: "payments",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "checkout",
              targetLabel: "payments",
              resources: ["payments"],
            },
          },
          {
            id: "checkout~shipping",
            source: "checkout",
            target: "shipping",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "checkout",
              targetLabel: "shipping",
              resources: ["shipping"],
            },
          },
          {
            id: "payments~stripe",
            source: "payments",
            target: ">stripe",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "payments",
              targetLabel: "stripe",
              resources: ["stripe"],
            },
          },
          {
            id: "shipping~payments",
            source: "shipping",
            target: "payments",
            type: "default",
            style: edgeStyle,
            markerEnd: edgeMarker,
            data: {
              sourceLabel: "shipping",
              targetLabel: "payments",
              resources: ["payments"],
            },
          },
        ],
        nodesCount: 5,
        tracesCount: 41890,
        service_count: 4,
        edge_count: 5,
        full_map_url:
          "https://localhost:5601/app/apm#/service-map?rangeFrom=now-2h&rangeTo=now&environment=production",
      },
      investigation_actions: [
        {
          label: "Investigate checkout",
          prompt:
            'Use ml-anomalies with entity "checkout" and lookback "2h" to explain what changed around this service.',
        },
        {
          label: "Compare payments",
          prompt:
            'Use apm-health-summary and lookback "2h" to compare payments with the rest of the environment.',
        },
      ],
    },
    "Show me the service map for services that are erroring."
  ),
  incidentFrontendWeb: fixture(
    "Incident: frontend symptom",
    {
      summary: "Service map for frontend-web with 4 services and 6 relationships.",
      request_context: {
        intent: "service",
        service: "frontend-web",
        environment: "Synthtrace: cascading_failure",
        range_from: "now-45m",
        range_to: "now",
      },
      derived_scope: null,
      view_state: {
        version: "1",
        rangeFrom: "now-45m",
        rangeTo: "now",
        environment: "Synthtrace: cascading_failure",
        kuery: "",
        serviceName: "frontend-web",
        highlightedServiceNames: ["frontend-web"],
        filters: {
          alertStatusFilter: [],
          sloStatusFilter: [],
          anomalyStatusFilter: [],
        },
        orientation: "horizontal",
      },
      graph: {
        nodes: incidentNodes(["frontend-web"]),
        edges: incidentEdges,
        nodesCount: 7,
        tracesCount: 65,
        service_count: 4,
        edge_count: 6,
        full_map_url:
          "http://localhost:5601/app/apm#/services/frontend-web/service-map?rangeFrom=now-45m&rangeTo=now&environment=Synthtrace%3A+cascading_failure",
      },
      investigation_actions: [
        {
          label: "Investigate frontend-web",
          prompt:
            'Use ml-anomalies with entity "frontend-web" and lookback "45m" to explain what changed around this service.',
        },
        {
          label: "Review focused service health",
          prompt:
            'Use apm-health-summary and lookback "45m" to review health for "frontend-web".',
        },
      ],
    },
    'Show me the service map for the service behind the error "Failed to load product recommendations".'
  ),
  incidentErroringServices: fixture(
    "Incident: erroring services",
    {
      summary: "Service map with 4 services and 6 relationships.",
      request_context: {
        intent: "erroring",
        environment: "Synthtrace: cascading_failure",
        range_from: "now-45m",
        range_to: "now",
      },
      derived_scope: {
        kind: "erroring",
        services: ["frontend-web", "product-recommendation", "inventory-service"],
        explanation:
          "Highlighting 3 services with recent errors. Highest error pressure: frontend-web.",
      },
      view_state: {
        version: "1",
        rangeFrom: "now-45m",
        rangeTo: "now",
        environment: "Synthtrace: cascading_failure",
        kuery: "",
        highlightedServiceNames: [
          "frontend-web",
          "product-recommendation",
          "inventory-service",
        ],
        filters: {
          alertStatusFilter: [],
          sloStatusFilter: [],
          anomalyStatusFilter: [],
        },
        orientation: "horizontal",
      },
      graph: {
        nodes: incidentNodes([
          "frontend-web",
          "product-recommendation",
          "inventory-service",
        ]),
        edges: incidentEdges,
        nodesCount: 7,
        tracesCount: 8,
        service_count: 4,
        edge_count: 6,
        full_map_url:
          "http://localhost:5601/app/apm#/service-map?rangeFrom=now-45m&rangeTo=now&environment=Synthtrace%3A+cascading_failure",
      },
      investigation_actions: [
        {
          label: "Investigate frontend-web",
          prompt:
            'Use ml-anomalies with entity "frontend-web" and lookback "45m" to explain what changed around this service.',
        },
        {
          label: "Compare product-recommendation",
          prompt:
            'Use apm-health-summary and lookback "45m" to compare product-recommendation with the rest of the environment.',
        },
      ],
    },
    "Show me the services that are recently erroring on the service map."
  ),
};
