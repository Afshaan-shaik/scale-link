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
      className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
        ok
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : degraded
          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
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
        isOk ? 'text-emerald-400' : isNA ? 'text-slate-400' : 'text-rose-400'
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
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    teal: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  };
  return (
    <div className="glass-card p-5 rounded-2xl border border-slate-800 flex flex-col gap-2">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${cls[color] ?? cls['emerald']}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-extrabold font-mono text-white leading-none">{value}</div>
      <div className="text-xs text-slate-400 font-medium">{label}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function CacheRatioBar({ hits, misses }: { hits: number; misses: number }) {
  const total = hits + misses;
  const ratio = total > 0 ? (hits / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Cache Hit Ratio</span>
        <span className="font-mono font-bold text-emerald-400">{ratio.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
          style={{ width: `${Math.max(ratio, 0)}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 font-mono">
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
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Banner */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Production Observability</h2>
              <p className="text-xs text-slate-400">
                Live telemetry from{' '}
                <span className="font-mono text-slate-300">{PROD_BASE}</span>
                {' · '}auto-refreshes every 15s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {health && <StatusBadge status={health.status} />}
            <button
              onClick={fetchAll}
              disabled={refreshing}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 bg-slate-900/60 hover:bg-slate-800 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>
        </div>
        {lastRefresh && (
          <p className="mt-3 flex items-center space-x-1.5 text-[11px] text-slate-500 font-mono">
            <Clock className="w-3 h-3" />
            <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
          </p>
        )}
      </div>

      {/* Health Panel */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Health Check — GET /health</span>
          </h3>
          {healthError && <span className="text-xs text-rose-400 font-mono">⚠ {healthError}</span>}
        </div>
        {health ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">Overall</div>
              <StatusBadge status={health.status} />
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">Uptime</div>
              <div className="text-sm font-mono font-bold text-white">{health.uptime}</div>
            </div>
            {Object.entries(health.checks).map(([name, value]) => (
              <div key={name} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">{name}</div>
                <CheckStatus value={value} />
              </div>
            ))}
          </div>
        ) : healthError ? (
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 text-rose-400 text-sm flex items-center space-x-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              Health endpoint unavailable.{' '}
              <span className="text-xs text-rose-400/70">({healthError})</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-3 text-slate-400 text-xs font-mono p-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Polling /health…</span>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      {metrics ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total HTTP Requests" value={metrics.httpRequestsTotal.toLocaleString()} sub="Across all endpoints" icon={Globe} color="emerald" />
            <MetricCard label="Cache Hit Ratio" value={cacheHitRatio} sub={`${metrics.cacheHits.toLocaleString()} hits`} icon={Cpu} color="purple" />
            <MetricCard label="Stream Events Published" value={metrics.streamEventsPublished.toLocaleString()} sub="Click events → Redis" icon={Zap} color="teal" />
            <MetricCard label="Rate Limit 429s" value={metrics.rateLimitRejections.toLocaleString()} sub="Token bucket rejections" icon={AlertTriangle} color={metrics.rateLimitRejections > 0 ? 'amber' : 'emerald'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="P99 Latency" value={metrics.p99Latency !== null ? `${metrics.p99Latency.toFixed(1)}ms` : '—'} sub="HTTP request duration" icon={Clock} color="sky" />
            <MetricCard label="Consumer Lag" value={String(metrics.streamLag)} sub={metrics.streamLag === 0 ? 'Worker fully caught up' : 'Unprocessed PEL events'} icon={Database} color={metrics.streamLag > 50 ? 'amber' : 'emerald'} />
            <MetricCard label="5xx Errors" value={metrics.httpRequestsError.toLocaleString()} sub="Server-side errors" icon={XCircle} color={metrics.httpRequestsError > 0 ? 'rose' : 'emerald'} />
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>Redis Cache &amp; Stream Analytics</span>
            </h3>
            <CacheRatioBar hits={metrics.cacheHits} misses={metrics.cacheMisses} />
            <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-center">
              <div>
                <div className="text-xs text-slate-400">Events Consumed</div>
                <div className="text-lg font-mono font-bold text-emerald-400">{metrics.streamEventsConsumed.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Events Published</div>
                <div className="text-lg font-mono font-bold text-teal-400">{metrics.streamEventsPublished.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Consumer Lag</div>
                <div className={`text-lg font-mono font-bold ${metrics.streamLag > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{metrics.streamLag}</div>
              </div>
            </div>
          </div>
        </>
      ) : metricsError ? (
        <div className="glass-card p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start space-x-3 text-amber-400 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Metrics endpoint unreachable</div>
              <div className="text-xs text-amber-400/70 mt-1">
                The /metrics endpoint is available when the Go backend is deployed. Error: {metricsError}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-3 text-slate-400 text-xs font-mono p-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Fetching metrics…</span>
        </div>
      )}

      {/* External Links */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
          <ExternalLink className="w-4 h-4 text-sky-400" />
          <span>Observability Endpoints</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {obsLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start space-x-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/30 hover:bg-slate-900 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 group-hover:border-sky-500/30 transition-colors">
                  <Icon className="w-4 h-4 text-sky-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white group-hover:text-sky-400 transition-colors">{link.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{link.desc}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">{link.url}</div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-sky-400 flex-shrink-0 transition-colors mt-0.5" />
              </a>
            );
          })}
        </div>
        {!GRAFANA_URL && (
          <div className="mt-4 p-3 rounded-lg bg-slate-900/40 border border-slate-800/60 text-[11px] text-slate-500 flex items-start space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500/60 flex-shrink-0 mt-0.5" />
            <span>
              Set <span className="font-mono text-slate-400">VITE_GRAFANA_URL</span> in Vercel
              environment variables to enable the Grafana Cloud dashboard link.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
