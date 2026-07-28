export const LEAD_TIME_UNITS = ["days", "weeks", "months"] as const;

export type LeadTimeUnit = (typeof LEAD_TIME_UNITS)[number];

const UNIT_IN_DAYS: Record<LeadTimeUnit, number> = {
  days: 1,
  weeks: 7,
  months: 30,
};

export const LEAD_TIME_MAX: Record<LeadTimeUnit, number> = {
  days: 365,
  weeks: 52,
  months: 12,
};

/** La base conserve un nombre de jours pour rester compatible avec les tâches existantes. */
export function leadTimeToDays(
  value: number,
  unit: LeadTimeUnit,
): number {
  return Math.round(value * UNIT_IN_DAYS[unit]);
}

export interface ResolvedLeadTime {
  leadTimeDays: number;
  leadTimeValue: number;
  leadTimeUnit: LeadTimeUnit;
}

export function resolveLeadTime(
  input: {
    leadTimeDays?: number;
    leadTimeValue?: number;
    leadTimeUnit?: LeadTimeUnit;
  },
  fallback: ResolvedLeadTime = {
    leadTimeDays: 7,
    leadTimeValue: 7,
    leadTimeUnit: "days",
  },
): ResolvedLeadTime {
  if (input.leadTimeValue !== undefined || input.leadTimeUnit !== undefined) {
    const leadTimeValue = input.leadTimeValue ?? fallback.leadTimeValue;
    const leadTimeUnit = input.leadTimeUnit ?? fallback.leadTimeUnit;
    return {
      leadTimeDays: leadTimeToDays(leadTimeValue, leadTimeUnit),
      leadTimeValue,
      leadTimeUnit,
    };
  }
  if (input.leadTimeDays !== undefined) {
    return {
      leadTimeDays: input.leadTimeDays,
      leadTimeValue: input.leadTimeDays,
      leadTimeUnit: "days",
    };
  }
  return fallback;
}

/** Retrouve l'unité la plus lisible à partir du nombre de jours historique. */
export function splitLeadTimeDays(days: number): {
  value: number;
  unit: LeadTimeUnit;
} {
  if (days > 0 && days % UNIT_IN_DAYS.months === 0) {
    return { value: days / UNIT_IN_DAYS.months, unit: "months" };
  }
  if (days > 0 && days % UNIT_IN_DAYS.weeks === 0) {
    return { value: days / UNIT_IN_DAYS.weeks, unit: "weeks" };
  }
  return { value: days, unit: "days" };
}

export function formatLeadTimeDuration(
  value: number,
  unit: LeadTimeUnit,
): string {
  if (value === 0) return "le jour de l’événement";
  const label =
    unit === "months"
      ? "mois"
      : unit === "weeks"
        ? value > 1
          ? "semaines"
          : "semaine"
        : value > 1
          ? "jours"
          : "jour";
  return `${value} ${label} avant`;
}
