import { getDashboardValue } from '../../lib/firestore.js';

/** Reads every dashboard value the daily report needs, in one go. */
export async function collectRaw() {
  const [
    glasses, hydrationHistory, dailyHistory, pomodoroWeek, pomodoroHistory, pomodoroLogs,
    banks, buckets, gold, thndr, thndrFlows, subscriptions, debts, logs,
  ] = await Promise.all([
    getDashboardValue('hydration_glasses', 0),
    getDashboardValue('hydration_history', {}),
    getDashboardValue('daily_history', {}),
    getDashboardValue('pomodoro_week', null),
    getDashboardValue('pomodoro_history', {}),
    getDashboardValue('pomodoro_logs', []),
    getDashboardValue('finance_banks', {}),
    getDashboardValue('finance_buckets', {}),
    getDashboardValue('finance_gold', []),
    getDashboardValue('finance_thndr', []),
    getDashboardValue('finance_thndr_flows', []),
    getDashboardValue('finance_subscriptions', []),
    getDashboardValue('finance_debts', []),
    getDashboardValue('finance_logs', []),
  ]);
  return { glasses, hydrationHistory, dailyHistory, pomodoroWeek, pomodoroHistory, pomodoroLogs, banks, buckets, gold, thndr, thndrFlows, subscriptions, debts, logs };
}
