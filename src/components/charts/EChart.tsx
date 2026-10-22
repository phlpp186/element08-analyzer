/**
 * EChart — ReactECharts with the theme's finish (lib/chartStyle). Every chart
 * imports this instead of echarts-for-react, so the look is set in one place.
 */
import { useMemo } from 'react';
import ReactECharts, { type EChartsReactProps } from 'echarts-for-react';
import { useChartTheme } from '../../lib/chartTheme';
import { stylizeOption } from '../../lib/chartStyle';

export default function EChart({ option, ...rest }: EChartsReactProps) {
  const ct = useChartTheme();
  const styled = useMemo(() => stylizeOption(option, ct), [option, ct]);
  return <ReactECharts option={styled} {...rest} />;
}
