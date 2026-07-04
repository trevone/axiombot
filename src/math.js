export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function mapValue(actualSource, minSource, maxSource, minDestination, maxDestination) {
  if (maxSource - minSource === 0) {
    return maxDestination;
  }

  const mapped =
    minDestination +
    ((actualSource - minSource) / (maxSource - minSource)) *
      (maxDestination - minDestination);

  if (minDestination > maxDestination) {
    return Math.max(Math.min(mapped, minDestination), maxDestination);
  }

  return clamp(mapped, minDestination, maxDestination);
}

export function round2(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}
