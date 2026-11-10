"""Environmental monitoring: weather (Open-Meteo, no key required) and risk rules."""

import time
from datetime import date
from typing import Any

import httpx

from app.models import EnvironmentalRecord, Farm

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_SECONDS = 600

WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    80: "Rain showers",
    81: "Heavy showers",
    95: "Thunderstorm",
}


def _round(value: Any) -> float | None:
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


def get_weather(farm: Farm | None) -> dict[str, Any]:
    if not farm or farm.latitude is None or farm.longitude is None:
        return {
            "available": False,
            "source": "Open-Meteo",
            "location": farm.district if farm else "Unknown",
            "note": "Farm coordinates are not recorded, so no weather estimate is shown.",
            "forecast": [],
        }
    key = f"{farm.latitude:.3f},{farm.longitude:.3f}"
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < _CACHE_SECONDS:
        return cached[1]

    params = {
        "latitude": farm.latitude,
        "longitude": farm.longitude,
        "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum",
        "timezone": "auto",
        "forecast_days": 5,
    }
    try:
        # Public endpoint without credentials: ignore ambient proxy settings that
        # may be malformed on farm/field devices and would otherwise crash the call.
        response = httpx.get("https://api.open-meteo.com/v1/forecast", params=params, timeout=5.0, trust_env=False)
        response.raise_for_status()
        payload = response.json()
        current = payload.get("current", {})
        daily = payload.get("daily", {})
        forecast = []
        for index, day in enumerate(daily.get("time", [])):
            forecast.append(
                {
                    "date": date.fromisoformat(day),
                    "temp_max": _round(daily.get("temperature_2m_max", [None])[index] if index < len(daily.get("temperature_2m_max", [])) else None),
                    "temp_min": _round(daily.get("temperature_2m_min", [None])[index] if index < len(daily.get("temperature_2m_min", [])) else None),
                    "humidity": _round(daily.get("relative_humidity_2m_mean", [None])[index] if index < len(daily.get("relative_humidity_2m_mean", [])) else None),
                    "precipitation_mm": _round(daily.get("precipitation_sum", [None])[index] if index < len(daily.get("precipitation_sum", [])) else None),
                }
            )
        result = {
            "available": True,
            "source": "Open-Meteo (live public API)",
            "location": f"{farm.village}, {farm.district}",
            "temperature_c": _round(current.get("temperature_2m")),
            "humidity_pct": _round(current.get("relative_humidity_2m")),
            "weather": WEATHER_CODES.get(current.get("weather_code"), "Unknown"),
            "wind_kmh": _round(current.get("wind_speed_10m")),
            "forecast": forecast,
            "note": None,
        }
        _cache[key] = (time.monotonic(), result)
        return result
    except Exception as exc:  # noqa: BLE001 - weather is advisory; never fail the request
        return {
            "available": False,
            "source": "Open-Meteo",
            "location": f"{farm.village}, {farm.district}",
            "note": f"Live weather is temporarily unavailable ({type(exc).__name__}). No value has been estimated.",
            "forecast": [],
        }


def assess_environment(record: EnvironmentalRecord | list[EnvironmentalRecord] | None) -> list[dict[str, str]]:
    """Validated threshold checks. Environmental observations never confirm disease.
    Accepts a single record or a list (e.g., latest per farm for admin overview)."""
    if not record:
        return []
    if isinstance(record, EnvironmentalRecord):
        record = [record]
    flags: list[dict[str, str]] = []
    for r in record:
        if r.temperature_c is not None:
            if r.temperature_c >= 40:
                flags.append({"code": "heat_stress", "severity": "high", "message": "High ambient temperature may increase heat stress risk."})
            elif r.temperature_c >= 36:
                flags.append({"code": "heat_watch", "severity": "medium", "message": "Warm conditions — ensure shade and drinking water."})
            elif r.temperature_c <= 5:
                flags.append({"code": "cold_stress", "severity": "medium", "message": "Cold conditions — ensure dry bedding and shelter."})
        if r.humidity_pct is not None and r.humidity_pct >= 85:
            flags.append({"code": "high_humidity", "severity": "medium", "message": "High humidity can reduce shed ventilation quality."})
        if r.shed_cleanliness is not None and r.shed_cleanliness <= 2:
            flags.append({"code": "shed_hygiene", "severity": "high", "message": "Low shed cleanliness — improve cleaning and bedding."})
        if r.water_available is False:
            flags.append({"code": "water_unavailable", "severity": "critical", "message": "Water unavailability is an urgent animal welfare risk."})
    return flags
