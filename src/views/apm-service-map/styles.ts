/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const viewStyles = `
  .apm-service-map-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .apm-service-map-toolbar-left,
  .apm-service-map-toolbar-right {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .apm-service-map-toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 12px;
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .apm-service-map-toolbar-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }

  .apm-service-map-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
    gap: 14px;
    align-items: start;
  }

  .apm-service-map-panel {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .apm-service-map-panel-body {
    padding: 12px;
  }

  .apm-service-map-warning {
    padding: 10px 12px;
    margin-bottom: 10px;
    border-radius: var(--radius-sm);
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.28);
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  .apm-service-map-warning strong {
    color: var(--severity-major-text);
    font-weight: 700;
    margin-right: 6px;
  }

  .apm-service-map-graph-shell {
    padding: 12px;
  }

  .apm-service-map-detail-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 4px 0;
  }

  .apm-service-map-detail-subtitle {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .apm-service-map-detail-empty {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.6;
    min-height: 120px;
    display: flex;
    align-items: center;
  }

  .apm-service-map-stat-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .apm-service-map-stat-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .apm-service-map-stat-row span:first-child {
    color: var(--text-muted);
  }

  .apm-service-map-stat-row span:last-child {
    color: var(--text-primary);
    font-weight: 600;
    text-align: right;
  }

  .apm-service-map-detail-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .apm-service-map-detail-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
  }

  .apm-service-map-detail-action:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }

  .apm-service-map-group-list {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .apm-service-map-group-item {
    padding: 8px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 12px;
  }

  .apm-service-map-summary {
    margin-bottom: 12px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  @media (max-width: 980px) {
    .apm-service-map-layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;
