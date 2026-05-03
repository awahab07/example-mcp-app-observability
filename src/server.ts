/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMlAnomaliesTool } from "./tools/ml-anomalies.js";
import { registerObserveTool } from "./tools/observe.js";
import { registerApmHealthSummaryTool } from "./tools/apm-health-summary.js";
import { registerK8sBlastRadiusTool } from "./tools/k8s-blast-radius.js";
import { registerApmServiceDependenciesTool } from "./tools/apm-service-dependencies.js";
import { registerApmServiceMapTool } from "./tools/apm-service-map.js";
import { registerManageAlertsTool } from "./tools/manage-alerts.js";
import { registerSetupDismissTool } from "./tools/setup-dismiss.js";
import { isKibanaConfigured } from "./elastic/client.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "elastic-o11y",
    version: "0.1.0",
  });

  registerMlAnomaliesTool(server);
  registerObserveTool(server);
  registerApmHealthSummaryTool(server);
  registerK8sBlastRadiusTool(server);
  registerApmServiceDependenciesTool(server);

  // Tools that depend on Kibana APIs are gated on an explicit KIBANA_URL so
  // ES-only deployments never see tools that cannot work.
  if (isKibanaConfigured()) {
    registerApmServiceMapTool(server);
    registerManageAlertsTool(server);
  }

  // Internal tool used by views' setup banner — must register so the UI
  // app.callServerTool path can route to it, regardless of Kibana config.
  registerSetupDismissTool(server);

  return server;
}
