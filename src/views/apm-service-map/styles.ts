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
    position: relative;
    padding: 12px;
  }

  .apm-service-map-compact-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .apm-service-map-search-dock {
    flex: 1 1 360px;
    min-width: min(100%, 300px);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-tertiary);
  }

  .apm-service-map-inline-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: rgba(15, 23, 42, 0.88);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast),
      color var(--transition-fast);
  }

  .apm-service-map-inline-icon-btn:hover {
    border-color: var(--border);
    background: rgba(30, 41, 59, 0.94);
  }

  .apm-service-map-inline-icon-btn.is-selected {
    border-color: rgba(56, 189, 248, 0.6);
    background: rgba(56, 189, 248, 0.16);
    color: rgb(186, 230, 253);
  }

  .apm-service-map-control-meta {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    color: var(--text-muted);
    font-size: 11px;
  }

  .apm-service-map-inline-note {
    padding: 0 12px 12px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .apm-service-map-investigation-strip {
    display: flex;
    gap: 10px;
    padding: 0 12px 12px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border-subtle);
    scrollbar-width: thin;
  }

  .apm-service-map-strip-item {
    --apm-service-map-strip-accent: var(--text-secondary);
    flex: 0 0 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px 2px 2px;
    background: transparent;
    border: 0;
    color: var(--text-primary);
    cursor: pointer;
    text-align: center;
  }

  .apm-service-map-strip-item:hover .apm-service-map-strip-orb {
    transform: translateY(-1px);
    border-color: var(--border);
  }

  .apm-service-map-strip-orb {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 999px;
    border: 1.5px solid rgba(148, 163, 184, 0.38);
    background: rgba(15, 23, 42, 0.24);
    transition: transform var(--transition-fast), border-color var(--transition-fast),
      background var(--transition-fast), box-shadow var(--transition-fast);
  }

  .apm-service-map-strip-item.is-selected .apm-service-map-strip-orb {
    border-color: color-mix(
      in srgb,
      var(--apm-service-map-strip-accent) 34%,
      rgba(148, 163, 184, 0.48)
    );
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--apm-service-map-strip-accent) 18%, transparent);
  }

  .apm-service-map-strip-item.is-critical .apm-service-map-strip-orb {
    color: rgb(248, 113, 113);
  }

  .apm-service-map-strip-item.is-warning .apm-service-map-strip-orb {
    color: rgb(245, 158, 11);
  }

  .apm-service-map-strip-item.is-info .apm-service-map-strip-orb {
    color: rgb(56, 189, 248);
  }

  .apm-service-map-strip-item.is-neutral .apm-service-map-strip-orb {
    color: var(--text-secondary);
  }

  .apm-service-map-strip-item.is-critical {
    --apm-service-map-strip-accent: rgb(248, 113, 113);
  }

  .apm-service-map-strip-item.is-warning {
    --apm-service-map-strip-accent: rgb(245, 158, 11);
  }

  .apm-service-map-strip-item.is-info {
    --apm-service-map-strip-accent: rgb(56, 189, 248);
  }

  .apm-service-map-strip-orb-label {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--apm-service-map-strip-accent);
  }

  .apm-service-map-strip-orb-badge {
    position: absolute;
    top: -3px;
    right: -5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.94);
    border: 1px solid
      color-mix(in srgb, var(--apm-service-map-strip-accent) 42%, rgba(148, 163, 184, 0.4));
    color: var(--apm-service-map-strip-accent);
    font-size: 11px;
    font-weight: 700;
  }

  .apm-service-map-strip-item-title,
  .apm-service-map-strip-item-subtitle {
    width: 100%;
    max-width: 92px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .apm-service-map-strip-item-title {
    font-size: 11px;
    font-weight: 700;
  }

  .apm-service-map-strip-item-subtitle {
    font-size: 10px;
    color: var(--text-muted);
  }

  .apm-service-map-strip-empty {
    padding: 8px 4px 4px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .apm-service-map-search-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
  }

  .apm-service-map-search-input:focus {
    outline: none;
  }

  .apm-service-map-search-input::placeholder {
    color: var(--text-muted);
  }

  .apm-service-map-search-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .apm-service-map-search-counter {
    min-width: 34px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .apm-service-map-search-btn {
    padding: 6px 9px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
    background: rgba(15, 23, 42, 0.78);
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
  }

  .apm-service-map-search-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--border);
  }

  .apm-service-map-search-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .apm-service-map-map-overlay {
    position: absolute;
    z-index: 5;
    display: flex;
    gap: 8px;
    pointer-events: none;
  }

  .apm-service-map-map-overlay > * {
    pointer-events: auto;
  }

  .apm-service-map-map-overlay-right {
    top: 18px;
    right: 18px;
    flex-direction: column;
  }

  .apm-service-map-selection-shell {
    border-top: 1px solid var(--border-subtle);
  }

  .apm-service-map-selection-tray {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .apm-service-map-selection-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .apm-service-map-selection-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 4px 0;
  }

  .apm-service-map-selection-subtitle {
    font-size: 11px;
    color: var(--text-muted);
  }

  .apm-service-map-selection-empty {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.6;
  }

  .apm-service-map-selection-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .apm-service-map-selection-chip {
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .apm-service-map-selection-stat-row,
  .apm-service-map-detail-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .apm-service-map-selection-stat {
    min-width: 118px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-subtle);
    font-size: 12px;
  }

  .apm-service-map-selection-stat span {
    color: var(--text-muted);
  }

  .apm-service-map-selection-stat strong {
    color: var(--text-primary);
    font-weight: 700;
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

  .apm-service-map-summary {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  @media (max-width: 980px) {
    .apm-service-map-strip-item {
      flex-basis: 88px;
    }
  }

  @media (max-width: 720px) {
    .apm-service-map-compact-bar {
      align-items: stretch;
    }

    .apm-service-map-search-dock {
      min-width: 0;
    }
  }
`;
