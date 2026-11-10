/**
 * Türkiye's provinces (il) and districts (ilçe), from the vendored
 * turkey-neighbourhoods data (see LICENSE). Client-safe.
 */
import { compareTr } from "../turkish";
import cityNamesByCode from "./cityNamesByCode.json";
import districtsByCityCode from "./districtsByCityCode.json";

const districtsByProvince = new Map<string, readonly string[]>(
  Object.entries(cityNamesByCode as Record<string, string>).map(
    ([code, name]) => [
      name,
      [...((districtsByCityCode as Record<string, string[]>)[code] ?? [])].sort(
        compareTr,
      ),
    ],
  ),
);

/** All 81 provinces in Turkish alphabetical order */
export const PROVINCES: readonly string[] = [
  ...districtsByProvince.keys(),
].sort(compareTr);

const NO_DISTRICTS: readonly string[] = [];

/** The province's districts in Turkish alphabetical order; none if unknown */
export function districtsOf(province: string | null | undefined) {
  return (province && districtsByProvince.get(province)) || NO_DISTRICTS;
}

/**
 * Both empty, a known province, or a known province with one of its
 * districts. A district needs its province.
 */
export function isValidLocation(city: string | null, district: string | null) {
  if (!city) return !district;
  if (!districtsByProvince.has(city)) return false;
  return !district || districtsOf(city).includes(district);
}
