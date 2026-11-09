"""Role-aware data isolation helpers.

Farmers only ever see their own farms and animals. Veterinarians see animals tied to
cases assigned to them. Cooperatives see their registered members. Admins see everything.
"""

import uuid

from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import Role
from app.core.errors import AppError
from app.models import Animal, CooperativeMembership, Farm, HealthCase, User, Veterinarian


def get_vet_profile(db: Session, user: User) -> Veterinarian | None:
    return db.scalar(select(Veterinarian).where(Veterinarian.user_id == user.id))


def require_vet_profile(db: Session, user: User) -> Veterinarian:
    vet = get_vet_profile(db, user)
    if not vet:
        raise AppError(status.HTTP_403_FORBIDDEN, "vet_profile_missing", "Veterinary profile not configured")
    return vet


def require_verified_professional(db: Session, user: User) -> Veterinarian:
    """Clinical approvals, assessments and verifications need an admin-verified professional."""
    vet = require_vet_profile(db, user)
    if not vet.verified:
        raise AppError(
            status.HTTP_403_FORBIDDEN,
            "professional_not_verified",
            "This professional account is not verified yet; clinical approvals require administrator verification",
        )
    return vet


def farmer_farm_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(db.scalars(select(Farm.id).where(Farm.owner_id == user.id)).all())


def cooperative_farmer_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(CooperativeMembership.farmer_id).where(
                CooperativeMembership.cooperative_id == user.id, CooperativeMembership.status == "active"
            )
        ).all()
    )


def accessible_farm_ids(db: Session, user: User) -> list[uuid.UUID] | None:
    """Return farm ids visible to the user, or None when unrestricted (admin)."""
    if user.role == Role.ADMIN:
        return None
    if user.role == Role.FARMER:
        return farmer_farm_ids(db, user)
    if user.role == Role.COOPERATIVE:
        farmer_ids = cooperative_farmer_ids(db, user)
        if not farmer_ids:
            return []
        return list(db.scalars(select(Farm.id).where(Farm.owner_id.in_(farmer_ids))).all())
    if user.role in (Role.VETERINARIAN, Role.PARAVET):
        vet = get_vet_profile(db, user)
        if not vet:
            return []
        animal_ids = select(HealthCase.animal_id).where(HealthCase.assigned_vet_id == vet.id)
        return list(db.scalars(select(Animal.farm_id).where(Animal.id.in_(animal_ids)).distinct()).all())
    return []


def animal_query(db: Session, user: User):
    stmt = select(Animal).options(
        selectinload(Animal.species),
        selectinload(Animal.breed),
        selectinload(Animal.identifiers),
    )
    if user.role != Role.ADMIN:
        if user.role in (Role.VETERINARIAN, Role.PARAVET):
            vet = get_vet_profile(db, user)
            if not vet:
                return stmt.where(False)
            allowed = select(HealthCase.animal_id).where(HealthCase.assigned_vet_id == vet.id)
            return stmt.where(Animal.id.in_(allowed))
        farm_ids = accessible_farm_ids(db, user) or []
        stmt = stmt.where(Animal.farm_id.in_(farm_ids))
    return stmt


def get_animal_for_user(db: Session, user: User, animal_id: uuid.UUID) -> Animal:
    stmt = animal_query(db, user).where(Animal.id == animal_id)
    animal = db.scalar(stmt)
    if not animal:
        raise AppError(status.HTTP_404_NOT_FOUND, "animal_not_found", "Animal not found")
    return animal


def ensure_farm_owner(db: Session, user: User, farm_id: uuid.UUID) -> Farm:
    farm = db.get(Farm, farm_id)
    if not farm:
        raise AppError(status.HTTP_404_NOT_FOUND, "farm_not_found", "Farm not found")
    if user.role != Role.ADMIN and farm.owner_id != user.id:
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "You cannot access this farm")
    return farm


def primary_farm(db: Session, user: User) -> Farm | None:
    return db.scalar(select(Farm).where(Farm.owner_id == user.id).order_by(Farm.created_at))


def case_query(db: Session, user: User):
    stmt = select(HealthCase)
    if user.role == Role.ADMIN:
        return stmt
    if user.role in (Role.VETERINARIAN, Role.PARAVET):
        vet = get_vet_profile(db, user)
        if not vet:
            return stmt.where(False)
        return stmt.where(HealthCase.assigned_vet_id == vet.id)
    if user.role == Role.FARMER:
        return stmt.where(HealthCase.farmer_id == user.id)
    if user.role == Role.COOPERATIVE:
        farmer_ids = cooperative_farmer_ids(db, user)
        return stmt.where(HealthCase.farmer_id.in_(farmer_ids)) if farmer_ids else stmt.where(False)
    return stmt.where(False)


def get_case_for_user(db: Session, user: User, case_id: uuid.UUID) -> HealthCase:
    case = db.scalar(case_query(db, user).where(HealthCase.id == case_id))
    if not case:
        raise AppError(status.HTTP_404_NOT_FOUND, "case_not_found", "Health case not found")
    return case


def get_farm_for_user(db: Session, user: User, farm_id: uuid.UUID) -> Farm:
    farm = db.get(Farm, farm_id)
    if not farm:
        raise AppError(status.HTTP_404_NOT_FOUND, "farm_not_found", "Farm not found")
    if user.role != Role.ADMIN:
        allowed = accessible_farm_ids(db, user) or []
        if farm.id not in allowed:
            raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "You cannot access this farm")
    return farm
