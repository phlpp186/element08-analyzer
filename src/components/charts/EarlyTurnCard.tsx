/**
 * Early Turn card — how often the diver turns before target, why, and how
 * many metres short. Mirrors the mobile app's Early Turn dashboard.
 */
import ReactECharts from 'echarts-for-react';
import type { EarlyTurnStats } from '../../lib/analytics/technique';
import { useChartTheme } from '../../lib/chartTheme';
import { useT } from '../../i18n';
import { ChartCard } from './ChartCard';

interface Props {
  stats: EarlyTurnStats;
}

export function EarlyTurnCard({ stats }: Props) {
  const ct = useChartTheme();
  const t = useT();

  if (stats.loggedTotal === 0) {
    return (
      <ChartCard
        title={t('Early Turns')}
        description={t('How often you turn before your target depth, and why.')}
      >
        <p className="py-8 text-center text-sm text-textDim">
          {t('No early-turn data logged yet. Mark dives as early turns in the app to see this.')}
        </p>
      </ChartCard>
    );
  }

  const description =
    `${stats.earlyCount} ${t('of')} ${stats.loggedTotal} ${t('logged dives turned early')} (${stats.earlyPct}%).` +
    (stats.loggedTotal < 5 ? ' ' + t('Log more for stronger trends.') : '');

  const reasonOption = {
    grid: { left: 96, right: 24, top: 8, bottom: 8, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.tooltipBorder,
      textStyle: { color: ct.text, fontFamily: 'Nunito, system-ui' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `${p.name}<br/>${p.value} ${p.value === 1 ? t('early turn') : t('early turns')}`;
      },
    },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ct.splitLine } },
      axisLabel: { color: ct.textDim, fontFamily: 'Nunito, system-ui', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: stats.reasons.map((r) => r.label),
      inverse: true,
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: ct.textDim, fontFamily: 'Nunito, system-ui', fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: stats.reasons.map((r) => ({ value: r.count, itemStyle: { color: r.color } })),
        barWidth: '55%',
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          color: ct.textDim,
          fontFamily: 'Nunito, system-ui',
          fontSize: 10,
        },
      },
    ],
  };

  return (
    <ChartCard title={t('Early Turns')} description={description}>
      {/* Headline stats */}
      <div className="mb-4 flex items-stretch rounded-md border border-border bg-deep">
        <Stat value={String(stats.earlyCount)} label={t('EARLY TURNS')} color="text-accent" />
        <Divider />
        <Stat value={String(stats.hitCount)} label={t('HIT TARGET')} color="text-text" />
        {stats.shortfall.count > 0 && (
          <>
            <Divider />
            <Stat
              value={`${stats.shortfall.avg.toFixed(1)}m`}
              label={t('AVG SHORTFALL')}
              color="text-textDim"
            />
          </>
        )}
      </div>

      {stats.reasons.length > 0 ? (
        <>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-textDim">
            {t('By reason')}
          </p>
          <ReactECharts
            option={reasonOption}
            style={{ height: Math.max(120, stats.reasons.length * 38) }}
            notMerge
          />
        </>
      ) : (
        <p className="text-sm text-textDim">{t('No reason logged on the early turns yet.')}</p>
      )}

      {stats.shortfall.count > 0 && (
        <p className="mt-3 text-sm text-textDim">
          {t('Worst shortfall:')} {stats.shortfall.worst.toFixed(1)} {t('m short of target')}
          {stats.shortfall.count < stats.earlyCount &&
            ` · ${t('target logged on')} ${stats.shortfall.count}/${stats.earlyCount} ${t('early turns')}`}
          .
        </p>
      )}
    </ChartCard>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex-1 px-2 py-3 text-center">
      <div className={`font-mono text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-textDim">{label}</div>
    </div>
  );
}

function Divider() {
  return <div className="w-px self-stretch bg-border" />;
}
