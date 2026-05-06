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
      alertsCount: 1,
      sloStatus: "degrading",
      serviceAnomalyStats: { healthStatus: "warning" },
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
      alertsCount: 2,
      sloStatus: "violated",
      serviceAnomalyStats: { healthStatus: "critical" },
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
      alertsCount: 5,
      sloStatus: "violated",
      serviceAnomalyStats: { healthStatus: "critical" },
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
      sloStatus: "healthy",
      serviceAnomalyStats: { healthStatus: "healthy" },
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

const groupedResourceNodes = [
  {
    id: "checkout",
    type: "service",
    position: { x: 60, y: 170 },
    data: {
      id: "checkout",
      label: "checkout",
      isService: true,
      agentName: "go",
      alertsCount: 2,
      sloStatus: "degrading",
      serviceAnomalyStats: { healthStatus: "warning" },
    },
  },
  {
    id: "inventory",
    type: "service",
    position: { x: 340, y: 170 },
    data: {
      id: "inventory",
      label: "inventory",
      isService: true,
      agentName: "nodejs",
      sloStatus: "healthy",
      serviceAnomalyStats: { healthStatus: "healthy" },
    },
  },
  {
    id: "resourceGroup{checkout;inventory}",
    type: "groupedResources",
    position: { x: 640, y: 170 },
    data: {
      id: "resourceGroup{checkout;inventory}",
      label: "4 resources",
      isService: false,
      isGrouped: true,
      count: 4,
      spanType: "external",
      spanSubtype: "http",
      groupedConnections: [
        { id: "payments-api", label: "payments-api", spanType: "external", spanSubtype: "http" },
        { id: "pricing-api", label: "pricing-api", spanType: "external", spanSubtype: "http" },
        { id: "currency-api", label: "currency-api", spanType: "external", spanSubtype: "http" },
        { id: "profile-api", label: "profile-api", spanType: "external", spanSubtype: "http" },
      ],
    },
  },
];

const groupedResourceEdges = [
  {
    id: "checkout~grouped-resources",
    source: "checkout",
    target: "resourceGroup{checkout;inventory}",
    type: "default",
    style: edgeStyle,
    markerEnd: edgeMarker,
    data: {
      sourceLabel: "checkout",
      targetLabel: "4 resources",
      isGrouped: true,
      resources: ["payments-api", "pricing-api"],
    },
  },
  {
    id: "inventory~grouped-resources",
    source: "inventory",
    target: "resourceGroup{checkout;inventory}",
    type: "default",
    style: edgeStyle,
    markerEnd: edgeMarker,
    data: {
      sourceLabel: "inventory",
      targetLabel: "4 resources",
      isGrouped: true,
      resources: ["currency-api", "profile-api"],
    },
  },
];

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
  groupedResources: fixture(
    "Grouped external resources",
    {
      summary: "Service map with 2 services, 1 grouped dependency cluster, and 2 relationships.",
      request_context: {
        intent: "global",
        environment: "production",
        range_from: "now-30m",
        range_to: "now",
      },
      derived_scope: null,
      view_state: {
        version: "1",
        rangeFrom: "now-30m",
        rangeTo: "now",
        environment: "production",
        kuery: "",
        highlightedServiceNames: [],
        filters: {
          alertStatusFilter: [],
          sloStatusFilter: [],
          anomalyStatusFilter: [],
        },
        orientation: "horizontal",
      },
      graph: {
        nodes: groupedResourceNodes,
        edges: groupedResourceEdges,
        nodesCount: 3,
        tracesCount: 918,
        service_count: 2,
        edge_count: 2,
        full_map_url:
          "https://localhost:5601/app/apm#/service-map?rangeFrom=now-30m&rangeTo=now&environment=production",
      },
      investigation_actions: [
        {
          label: "Inspect grouped resources",
          prompt: 'Show me the dependencies for checkout and inventory that are being grouped together.',
        },
      ],
    },
    "Show me grouped external resources on the service map."
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
        selectedElement: {
          kind: "edge",
          edgeId: "product-recommendation~inventory-service",
          source: "product-recommendation",
          target: "inventory-service",
        },
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
      rca_candidates: [
        {
          id: "edge:product-recommendation~inventory-service",
          kind: "edge",
          title: "product-recommendation -> inventory-service",
          subtitle: "96% failing · 48/50 spans",
          summary:
            "The product-recommendation to inventory-service dependency is failing 96% of spans in this window.",
          shortLabel: "RC",
          tone: "critical",
          score: 1480,
          focusServiceName: "product-recommendation",
          highlightedServiceNames: ["product-recommendation", "inventory-service"],
          selectedElement: {
            kind: "edge",
            edgeId: "product-recommendation~inventory-service",
            source: "product-recommendation",
            target: "inventory-service",
          },
          kibanaUrl:
            "http://localhost:5601/app/apm#/services/product-recommendation/service-map?rangeFrom=now-45m&rangeTo=now&environment=Synthtrace%3A+cascading_failure",
          serviceName: "product-recommendation",
          targetLabel: "inventory-service",
          failures: 48,
          total: 50,
          failureRate: 0.96,
        },
        {
          id: "service:product-recommendation:GET /recommendations",
          kind: "service",
          title: "product-recommendation",
          subtitle: "96% failing · GET /recommendations",
          summary:
            "GET /recommendations on product-recommendation is failing with the same map focus as the inventory dependency.",
          shortLabel: "RS",
          tone: "critical",
          score: 1440,
          focusServiceName: "product-recommendation",
          highlightedServiceNames: ["inventory-service", "product-recommendation"],
          selectedElement: {
            kind: "edge",
            edgeId: "product-recommendation~inventory-service",
            source: "product-recommendation",
            target: "inventory-service",
          },
          kibanaUrl:
            "http://localhost:5601/app/apm#/services/product-recommendation/service-map?rangeFrom=now-45m&rangeTo=now&environment=Synthtrace%3A+cascading_failure",
          serviceName: "product-recommendation",
          transactionName: "GET /recommendations",
          failures: 48,
          total: 50,
          failureRate: 0.96,
        },
        {
          id: "service:frontend-web:GET /",
          kind: "service",
          title: "frontend-web",
          subtitle: "65% failing · GET /",
          summary: "GET / on frontend-web is failing 65% of transactions.",
          shortLabel: "RS",
          tone: "warning",
          score: 1080,
          focusServiceName: "frontend-web",
          highlightedServiceNames: ["frontend-web"],
          selectedElement: {
            kind: "node",
            nodeId: "frontend-web",
          },
          kibanaUrl:
            "http://localhost:5601/app/apm#/services/frontend-web/service-map?rangeFrom=now-45m&rangeTo=now&environment=Synthtrace%3A+cascading_failure",
          serviceName: "frontend-web",
          transactionName: "GET /",
          failures: 13,
          total: 20,
          failureRate: 0.65,
        },
      ],
      investigation_objects: [
        {
          id: "alert:frontend-web-latency:cluster:search-demo",
          kind: "alert",
          title: "Frontend latency spike",
          subtitle: "Active · search-demo",
          summary: "User-facing latency is spiking across the recommendation path.",
          shortLabel: "AL",
          badge: 2,
          tone: "critical",
          score: 560,
          status: "active",
          focusServiceName: "product-recommendation",
          highlightedServiceNames: ["product-recommendation", "inventory-service", "frontend-web"],
          clusterName: "search-demo",
          kibanaUrl:
            "http://localhost:5601/app/observability/alerts/frontend-latency-spike",
        },
        {
          id: "slo:recommendation-burn-rate:cluster:search-demo",
          kind: "slo",
          title: "Recommendation availability burn rate",
          subtitle: "Active · search-demo",
          summary: "The recommendation SLO is degrading and points toward the inventory dependency.",
          shortLabel: "SL",
          badge: 1,
          tone: "warning",
          score: 520,
          status: "active",
          focusServiceName: "inventory-service",
          highlightedServiceNames: ["inventory-service", "product-recommendation", "frontend-web"],
          clusterName: "search-demo",
          kibanaUrl:
            "http://localhost:5601/app/observability/alerts/recommendation-burn-rate",
        },
      ],
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
