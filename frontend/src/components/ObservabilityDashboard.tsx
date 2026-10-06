import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Database,
  Cpu,
  Globe,
  Zap,
  BarChart3,
  TrendingUp,
  Clock,
  ExternalLink,
  Shield,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthResponse {
  status: string;
  uptime: string;
  checks: Record<string, string>;
  timestamp: string;
}

interface ParsedMetric {
  name: string;
  labels: Record<string, string>;
  value: number;
}

interface MetricsSnapshot {
  httpRequestsTotal: number;
  httpRequestsError: number;
  cacheHits: number;
  cacheMisses: number;
  rateLimitRejections: number;
  streamEventsPublished: number;
  streamEventsConsumed: number;
  streamLag: number;
  p99Latency: number | null;
}

// ── Prometheus text format parser ─────────────────────────────────────────────

function parsePrometheusText(text: string): ParsedMetric[] {
  const metrics: ParsedMetric[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const withLabels = trimmed.match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/
    );
    const noLabels = trimmed.match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/
    );
    if (withLabels) {
      const labels: Record<string, string> = {};
      for (const pair of withLabels[2].split(',')) {
        const [k, v] = pair.split('=');
        if (k && v) labels[k.trim()] = v.replace(/"/g, '').trim();
      }
      metrics.push({ name: withLabels[1], labels, value: parseFloat(withLabels[3]) });
    } else if (noLabels) {
      metrics.push({ name: noLabels[1], labels: {}, value: parseFloat(noLabels[2]) });
    }
  }
  return metrics;
}

function buildSnapshot(metrics: ParsedMetric[]): MetricsSnapshot {
  const sum = (name: string) =>
    metrics.filter((m) => m.name === name).reduce((a, m) => a + m.value, 0);

  const get = (name: string, labelFilter?: Record<string, string>) => {
    const found = metrics.find((m) => {
      if (m.name !== name) return false;
      if (!labelFilter) return true;
      return Object.entries(labelFilter).every(([k, v]) => m.labels[k] === v);
    });
    return found?.value ?? 0;
  };

  const httpErrors = metrics
    .filter(
      (m) =>
        m.name === 'scalelink_http_requests_total' &&
        parseInt(m.labels['status'] ?? '200') >= 500
    )
    .reduce((a, m) => a + m.value, 0);

  // p99 latency approximation from histogram buckets
  const buckets = metrics
    .filter((m) => m.name === 'scalelink_http_request_duration_seconds_bucket')
    .sort((a, b) => parseFloat(a.labels['le'] ?? '0') - parseFloat(b.labels['le'] ?? '0'));
  let p99: number | null = null;
  if (buckets.length > 0) {
    const totalCount = get('scalelink_http_request_duration_seconds_count');
    const target = totalCount * 0.99;
    let prev = { le: 0, count: 0 };
    for (const b of buckets) {
      const le = parseFloat(b.labels['le'] ?? '0');
      if (!isFinite(le)) continue;
      if (b.value >= target && prev.count < target) {
        const frac = (target - prev.count) / (b.value - prev.count || 1);
        p99 = (prev.le + frac * (le - prev.le)) * 1000;
        break;
      }
      prev = { le, count: b.value };
    }
  }

  return {
    httpRequestsTotal: sum('scalelink_http_requests_total'),
    httpRequestsError: httpErrors,
    cacheHits: sum('scalelink_cache_hits_total'),
    cacheMisses: sum('scalelink_cache_misses_total'),
    rateLimitRejections: sum('scalelink_ratelimit_rejections_total'),
    streamEventsPublished: get('scalelink_stream_events_published_total'),
    streamEventsConsumed: get('scalelink_stream_events_consumed_total'),
    streamLag: get('scalelink_stream_consumer_lag'),
    p99Latency: p99,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const ok = status === 'ok';
  const degraded = status === 'degraded';
  return (
    <span
      className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border font-mono ${
        ok
          ? 'bg-[#34d6a018] text-[var(--em)] border-[#34d6a033]'
          : degraded
          ? 'bg-[#f0b44c18] text-[var(--amber)] border-[#f0b44c33]'
          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      }`}
    >
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : degraded ? (
        <AlertTriangle className="w-3.5 h-3.5" />
      ) : (
        <XCircle className="w-3.5 h-3.5" />
      )}
      <span>{status.toUpperCase()}</span>
    </span>
  );
}

function CheckStatus({ value }: { value: string }) {
  const isOk = value === 'ok';
  const isNA = value === 'not configured';
  return (
    <span
      className={`text-xs font-mono font-semibold ${
        isOk ? 'text-[var(--em)]' : isNA ? 'text-[var(--mut)]' : 'text-rose-400'
      }`}
    >
      {isOk ? '✓ OK' : isNA ? '– N/A' : '✗ ' + value.replace(/^unhealthy: /, '')}
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'emerald',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}) {
  const cls: Record<string, string> = {
    emerald: 'text-[var(--em)] bg-[#34d6a018] border-[#34d6a033]',
    sky: 'text-[var(--sky)] bg-[#6cc8f018] border-[#6cc8f033]',
    purple: 'text-[var(--gold)] bg-[#e3c38318] border-[#e3c38333]',
    amber: 'text-[var(--amber)] bg-[#f0b44c18] border-[#f0b44c33]',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    teal: 'text-[var(--em)] bg-[#34d6a018] border-[#34d6a033]',
  };
  return (
    <div className="luxe-inner-card p-6 flex flex-col gap-2.5">
      <div className={`w-10 h-10 rounded-[14px] flex items-center justify-center border ${cls[color] ?? cls['emerald']}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-3xl font-extrabold font-mono text-white leading-none mt-1">{value}</div>
      <div className="text-xs text-[var(--tx)] font-semibold">{label}</div>
      {sub && <div className="text-[11px] text-[var(--mut)] font-mono">{sub}</div>}
    </div>
  );
}

function CacheRatioBar({ hits, misses }: { hits: number; misses: number }) {
  const total = hits + misses;
  const ratio = total > 0 ? (hits / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-[var(--mut)]">
        <span>Cache Hit Ratio</span>
        <span className="font-mono font-bold text-[var(--em)]">{ratio.toFixed(1)}%</span>
      </div>
      <div className="w-full h-3 rounded-full bg-[var(--bg)] border border-[var(--line)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--em)] to-[var(--gold)] transition-all duration-700"
          style={{ width: `${Math.max(ratio, 0)}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-[var(--mut)] font-mono">
        <span>{hits.toLocaleString()} hits</span>
        <span>{misses.toLocaleString()} misses</span>
      </div>
    </div>
  );
}

// ── Observability links configuration ────────────────────────────────────────

const PROD_BASE =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'https://scale-link-six.vercel.app';

const GRAFANA_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GRAFANA_URL) || '';

const obsLinks = [
  {
    id: 'health',
    label: 'Health Check',
    url: PROD_BASE + '/health',
    desc: 'Liveness + readiness probe (JSON)',
    icon: Shield,
  },
  {
    id: 'metrics',
    label: 'Prometheus Metrics',
    url: PROD_BASE + '/metrics',
    desc: 'Raw OpenMetrics text format',
    icon: BarChart3,
  },
  ...(GRAFANA_URL
    ? [
        {
          id: 'grafana',
          label: 'Grafana Dashboard',
          url: GRAFANA_URL,
          desc: 'Cloud-hosted production dashboards',
          icon: TrendingUp,
        },
      ]
    : []),
];

// ── Main Component ────────────────────────────────────────────────────────────

export const ObservabilityDashboard: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/health', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        setHealth(await res.json());
        setHealthError(null);
      } else {
        setHealthError(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      setHealthError(e?.message ?? 'Unreachable');
    }

    try {
      const res = await fetch('/metrics', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const text = await res.text();
        setMetrics(buildSnapshot(parsePrometheusText(text)));
        setMetricsError(null);
      } else {
        setMetricsError(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      setMetricsError(e?.message ?? 'Unreachable');
    }

    setLastRefresh(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 15_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const cacheHitRatio =
    metrics && metrics.cacheHits + metrics.cacheMisses > 0
      ? ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(1) + '%'
      : '—';

  return (
    <div className="w-full space-y-8 animate-fadeIn">
      {/* Banner Hero */}
      <div className="luxe-hero flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[16px] bg-[#6cc8f018] border border-[#6cc8f033] flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6 text-[var(--sky)]" />
          </div>
          <div>
            <h2 className="text-white text-[28px] sm:text-[32px]">Production Observability</h2>
            <p className="text-[var(--mut)] text-xs sm:text-sm">
              Live telemetry from{' '}
              <span className="font-mono text-white">{PROD_BASE}</span>
              {' · '}auto-refreshes every 15s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {health && <StatusBadge status={health.status} />}
          <button
            onClick={fetchAll}
            disabled={refreshing}
            className="luxe-btn py-2 px-4 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {lastRefresh && (
        <p className="flex items-center gap-1.5 text-[12px] text-[var(--mut)] font-mono px-2">
          <Clock className="w-3.5 h-3.5" />
          <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
        </p>
      )}

      {/* Health Panel */}
      <div className="luxe-card p-7 sm:p-9 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--em)]" />
            <span>Health Check — GET /health</span>
          </h3>
          {healthError && <span className="text-xs text-rose-400 font-mono">⚠ {healthError}</span>}
        </div>
        {health ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-[20px] bg-[var(--bg)] border border-[var(--line)] space-y-2">
              <div className="text-[11px] text-[var(--mut)] uppercase tracking-wider font-mono">Overall</div>
              <StatusBadge status={health.status} />
            </div>
            <div className="p-5 rounded-[20px] bg-[var(--bg)] border border-[var(--line)] space-y-2">
              <div className="text-[11px] text-[var(--mut)] uppercase tracking-wider font-mono">Uptime</div>
              <div className="text-sm font-mono font-bold text-white">{health.uptime}</div>
            </div>
            {Object.entries(health.checks).map(([name, value]) => (
              <div key={name} className="p-5 rounded-[20px] bg-[var(--bg)] border border-[var(--line)] space-y-2">
                <div className="text-[11px] text-[var(--mut)] uppercase tracking-wider font-mono">{name}</div>
                <CheckStatus value={value} />
              </div>
            ))}
          </div>
        ) : healthError ? (
          <div className="p-5 rounded-[20px] bg-rose-500/5 border border-rose-500/20 text-rose-400 text-sm flex items-center space-x-2">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <span>
              Health endpoint unavailable.{' '}
              <span className="text-xs text-rose-400/70">({healthError})</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-3 text-[var(--mut)] text-xs font-mono p-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[var(--em)]" />
            <span>Polling /health…</span>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      {metrics ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <MetricCard label="Total HTTP Requests" value={metrics.httpRequestsTotal.toLocaleString()} sub="Across all endpoints" icon={Globe} color="emerald" />
            <MetricCard label="Cache Hit Ratio" value={cacheHitRatio} sub={`${metrics.cacheHits.toLocaleString()} hits`} icon={Cpu} color="purple" />
            <MetricCard label="Stream Events Published" value={metrics.streamEventsPublished.toLocaleString()} sub="Click events → Redis" icon={Zap} color="teal" />
            <MetricCard label="Rate Limit 429s" value={metrics.rateLimitRejections.toLocaleString()} sub="Token bucket rejections" icon={AlertTriangle} color={metrics.rateLimitRejections > 0 ? 'amber' : 'emerald'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <MetricCard label="P99 Latency" value={metrics.p99Latency !== null ? `${metrics.p99Latency.toFixed(1)}ms` : '—'} sub="HTTP request duration" icon={Clock} color="sky" />
            <MetricCard label="Consumer Lag" value={String(metrics.streamLag)} sub={metrics.streamLag === 0 ? 'Worker fully caught up' : 'Unprocessed PEL events'} icon={Database} color={metrics.streamLag > 50 ? 'amber' : 'emerald'} />
            <MetricCard label="5xx Errors" value={metrics.httpRequestsError.toLocaleString()} sub="Server-side errors" icon={XCircle} color={metrics.httpRequestsError > 0 ? 'rose' : 'emerald'} />
          </div>

          <div className="luxe-card p-7 sm:p-9 shadow-xl">
            <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-[var(--gold)]" />
              <span>Redis Cache &amp; Stream Analytics</span>
            </h3>
            <CacheRatioBar hits={metrics.cacheHits} misses={metrics.cacheMisses} />
            <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-[var(--line)] text-center">
              <div>
                <div className="text-xs text-[var(--mut)]">Events Consumed</div>
                <div className="text-xl font-mono font-bold text-[var(--em)] mt-1">{metrics.streamEventsConsumed.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--mut)]">Events Published</div>
                <div className="text-xl font-mono font-bold text-[var(--gold)] mt-1">{metrics.streamEventsPublished.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--mut)]">Consumer Lag</div>
                <div className={`text-xl font-mono font-bold mt-1 ${metrics.streamLag > 0 ? 'text-[var(--amber)]' : 'text-[var(--em)]'}`}>{metrics.streamLag}</div>
              </div>
            </div>
          </div>
        </>
      ) : metricsError ? (
        <div className="luxe-card p-7 border border-[#f0b44c44] bg-[#f0b44c10]">
          <div className="flex items-start space-x-3 text-[var(--amber)] text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Metrics endpoint unreachable</div>
              <div className="text-xs text-[var(--mut)] mt-1">
                The /metrics endpoint is available when the Go backend is deployed. Error: {metricsError}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-3 text-[var(--mut)] text-xs font-mono p-4">
          <RefreshCw className="w-4 h-4 animate-spin text-[var(--em)]" />
          <span>Fetching metrics…</span>
        </div>
      )}

      {/* External Links */}
      <div className="luxe-card p-7 sm:p-9 shadow-xl">
        <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2.5">
          <ExternalLink className="w-5 h-5 text-[var(--sky)]" />
          <span>Observability Endpoints</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {obsLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3.5 p-5 rounded-[20px] bg-[var(--bg)] border border-[var(--line)] hover:border-[var(--sky)] transition-all group"
              >
                <div className="w-10 h-10 rounded-[14px] bg-[var(--bg2)] border border-[var(--line)] flex items-center justify-center shrink-0 group-hover:border-[var(--sky)] transition-colors">
                  <Icon className="w-5 h-5 text-[var(--sky)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white group-hover:text-[var(--sky)] transition-colors">{link.label}</div>
                  <div className="text-[12px] text-[var(--mut)] mt-0.5">{link.desc}</div>
                  <div className="text-[11px] font-mono text-[var(--mut)] mt-1.5 truncate">{link.url}</div>
                </div>
                <ExternalLink className="w-4 h-4 text-[var(--mut)] group-hover:text-[var(--sky)] shrink-0 transition-colors mt-0.5" />
              </a>
            );
          })}
        </div>
        {!GRAFANA_URL && (
          <div className="mt-5 p-4 rounded-[16px] bg-[var(--bg)] border border-[var(--line)] text-xs text-[var(--mut)] flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--gold)] shrink-0 mt-0.5" />
            <span>
              Set <span className="font-mono text-white">VITE_GRAFANA_URL</span> in Vercel
              environment variables to enable the Grafana Cloud dashboard link.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
