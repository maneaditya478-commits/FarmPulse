"""Veterinary professional discovery and assignment."""

import math
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Animal, Farm, HealthCase, Veterinarian


def haversine_km(lat1: float | None, lon1: float | None, lat2: float | None, lon2: float | None) -> float | None:
    if None in (lat1, lon1, lat2, lon2):
        return None
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return round(2 * radius * math.asin(math.sqrt(a)), 1)


def nearby_vets(db: Session, farm: Farm | None, limit: int = 10) -> list[dict]:
    vets = db.scalars(
        select(Veterinarian).options(selectinload(Veterinarian.user)).order_by(Veterinarian.rating.desc().nullslast())
    ).all()
    results: list[dict] = []
    for vet in vets:
        if not vet.user or not vet.user.is_active:
            continue
        distance = haversine_km(
            farm.latitude if farm else None,
            farm.longitude if farm else None,
            vet.latitude,
            vet.longitude,
        )
        same_district = bool(farm and vet.district.lower() == farm.district.lower())
        results.append({"vet": vet, "distance_km": distance, "same_district": same_district})
    results.sort(key=lambda item: (not item["same_district"], item["distance_km"] if item["distance_km"] is not None else 9999, -(item["vet"].rating or 0)))
    return results[:limit]


def select_assignee(db: Session, animal: Animal) -> Veterinarian | None:
    candidates = nearby_vets(db, animal.farm if hasattr(animal, "farm") else None)
    for candidate in candidates:
        vet = candidate["vet"]
        if vet.verified and vet.availability == "available" and candidate["same_district"]:
            return vet
    for candidate in candidates:
        vet = candidate["vet"]
        if vet.verified and vet.availability != "offline":
            return vet
    return None


def assigned_cases(db: Session, vet_id: uuid.UUID) -> list[HealthCase]:
    return list(
        db.scalars(
            select(HealthCase)
            .where(HealthCase.assigned_vet_id == vet_id)
            .order_by(HealthCase.opened_at.desc())
        ).all()
    )
